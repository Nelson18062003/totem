-- ---------------------------------------------------------------------------
-- TOTEM — structure de la base Supabase
--
-- À coller dans l'éditeur SQL de Supabase (menu « SQL Editor » → « New query »),
-- puis exécuter. Le script est rejouable : le relancer ne casse rien.
--
-- Vérifié sur PostgreSQL 16 : trois exécutions de suite sur une base neuve,
-- sans erreur, puis une exécution sur une base créée avec la version
-- précédente du schéma — données conservées, colonnes ajoutées, contrainte
-- d'unicité basculée du libellé vers l'ICCID.
--
-- Principe : le Raspberry Pi reste la source de vérité. Il écrit ici une copie
-- de ce qu'il a vu, quand il a du réseau. Le cloud sert à consulter depuis
-- n'importe où et à survivre à la mort d'une carte mémoire — pas à décider.
-- ---------------------------------------------------------------------------

-- --- Terminaux : un Raspberry Pi, quelque part -----------------------------
create table if not exists terminaux (
  id          text primary key,          -- « douala », « atelier »…
  nom         text,
  vu_le       timestamptz,               -- dernier signe de vie
  sante       jsonb,                     -- température, tension, disque…
  version     text,                      -- code réellement en service
  cree_le     timestamptz not null default now()
);

comment on table terminaux is
  'Un boîtier TOTEM. « vu_le » permet de détecter un terminal devenu muet, '
  '« version » de vérifier qu''un correctif est bien déployé.';

-- --- Cartes : le registre des SIM, présentes ou retirées --------------------
-- L'ICCID est le numéro de série gravé sur la puce. Contrairement à
-- l'opérateur, il est unique au monde : deux SIM MTN achetées le même jour ne
-- le partagent pas. C'est donc lui qui sépare les historiques quand on change
-- de carte dans le berceau — l'opérateur seul les mélangerait.
--
-- De l'IMSI, on ne garde que les cinq premiers chiffres (pays + opérateur) :
-- ils expliquent le nom du compte, le reste identifie l'abonné et n'a rien à
-- faire ici.
create table if not exists cartes (
  id            bigint generated always as identity primary key,
  terminal      text not null references terminaux(id) on delete cascade,
  iccid         text not null,
  imsi_prefixe  text,                    -- « 62401 » = MTN Cameroun
  operateur     text,                    -- « MTN », « Orange »
  libelle       text,                    -- « MTN ·8901 », déduit de l'ICCID
  -- Nom commercial du compte (« WONDER PHONE »), déclaré depuis Telegram.
  -- Ni la puce ni le réseau ne le connaissent : seul le propriétaire le sait.
  nom           text,
  -- MSISDN. La puce ne le déclare presque jamais ; c'est donc le propriétaire
  -- qui l'inscrit, et sans lui un reçu ne sait pas de quel côté d'un
  -- transfert se trouve le terminal.
  numero        text,
  imei          text,                    -- dernier modem qui l'a hébergée
  premiere_vue  timestamptz,
  derniere_vue  timestamptz,
  cree_le       timestamptz not null default now(),
  unique (terminal, iccid)
);

comment on table cartes is
  'Toutes les SIM vues par un terminal. « derniere_vue » dit depuis quand une carte a été retirée.';

-- --- Comptes : l'état courant d'une SIM en place ----------------------------
create table if not exists comptes (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  iccid       text,                      -- la carte : clé réelle du compte
  libelle     text not null,             -- « MTN ·8901 »
  operateur   text,                      -- opérateur d'origine, lu sur l'IMSI
  reseau      text,                      -- réseau visité (itinérance)
  itinerance  boolean not null default false,
  numero      text,
  -- numeric, pas bigint : Orange annonce des soldes à la décimale
  -- (« 2784137.6 FCFA »). En bigint, PostgreSQL arrondit SANS RIEN DIRE, et
  -- la plateforme afficherait un solde que l'opérateur n'a jamais annoncé.
  solde       numeric,                   -- en FCFA, tel que l'opérateur l'annonce
  signal      int,                       -- 0..31
  maj         timestamptz not null default now(),
  unique (terminal, iccid)
);

-- --- Paiements : ce que les SMS racontent, une fois compris -----------------
create table if not exists paiements (
  id           bigint generated always as identity primary key,
  terminal     text not null references terminaux(id) on delete cascade,
  -- Identifiant de la ligne dans le journal local du Pi. Couplé au terminal,
  -- il garantit qu'un même paiement renvoyé deux fois (reprise après coupure)
  -- n'apparaisse qu'une seule fois ici.
  source_id    bigint not null,
  compte       text,                     -- libellé du compte (« MTN ·8901 »)
  -- ICCID de la carte qui a reçu ce paiement. C'est lui qui rattache la somme
  -- au bon solde : deux SIM du même opérateur ne partagent pas leur caisse.
  carte        text,
  -- Nul quand le SMS nomme les deux parties sans dire laquelle est la nôtre
  -- (forme d'Orange Money) et que la SIM ne déclare pas son propre numéro.
  -- Mieux vaut un sens inconnu qu'un sens inversé.
  sens         text check (sens in ('entree', 'sortie')),
  -- numeric, pas bigint : Orange annonce des soldes à la décimale
  -- (« 2784137.6 FCFA »). Un entier les aurait tronqués ou refusés.
  montant      numeric,
  tiers        text,                     -- nom si connu, sinon numéro
  numero       text,
  reference    text,                     -- référence de transaction opérateur
  solde_apres  numeric,
  frais        numeric,
  commission   numeric,                  -- Orange la détaille à part des frais
  montant_brut numeric,                  -- « Montant Transaction », avant frais
  texte        text not null,            -- le SMS d'origine : il fait foi
  recu_le      timestamptz not null,
  cree_le      timestamptz not null default now(),
  unique (terminal, source_id)
);

comment on column paiements.texte is
  'Message d''origine, jamais modifié : c''est lui qui fait foi en cas de litige.';

-- --- Événements : la vie du terminal ---------------------------------------
create table if not exists evenements (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  source_id   bigint not null,
  texte       text not null,
  survenu_le  timestamptz not null,
  cree_le     timestamptz not null default now(),
  unique (terminal, source_id)
);

-- --- Reçus : les PDF joints aux notifications ------------------------------
-- Le document lui-même vit dans le stockage (compartiment « recus ») ; cette
-- table dit ce qu'il contient et où le trouver. La carte SD du Pi n'en garde
-- aucune copie : un reçu se refabrique à l'identique depuis son SMS, qui est
-- dans « paiements ».
create table if not exists recus (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  numero      text not null,             -- « TM-2026-0731-0042 »
  genre       text not null check (genre in ('transfert', 'solde')),
  reference   text,                      -- ID de transaction de l'opérateur
  montant     numeric,
  chemin      text not null,             -- objet de stockage : « totem/xxx.pdf »
  etabli_le   timestamptz not null,
  cree_le     timestamptz not null default now(),
  unique (terminal, numero)
);

-- --- Commandes : le canal descendant (phase 6) -----------------------------
-- Déclaré maintenant pour éviter une migration plus tard. Inutilisé tant que
-- l'application web ne pilote pas encore le terminal.
create table if not exists commandes (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  type        text not null,             -- « solde », « ussd »…
  parametres  jsonb not null default '{}'::jsonb,
  etat        text not null default 'en_attente'
                check (etat in ('en_attente', 'en_cours', 'faite', 'echouee')),
  resultat    text,
  demandee_le timestamptz not null default now(),
  traitee_le  timestamptz
);

-- ---------------------------------------------------------------------------
-- Mise à niveau des bases créées avant le cloisonnement par carte
--
-- « create table if not exists » ne touche pas une table déjà là : sur un
-- projet Supabase créé avec la version précédente du schéma, les nouvelles
-- colonnes n'apparaîtraient jamais. Ce bloc les rattrape.
--
-- Il vient AVANT les index, et ce n'est pas un détail : un index sur la
-- colonne « carte » écrit plus haut échouerait sur une base existante, où
-- cette colonne n'a pas encore été ajoutée.
--
-- Sur une base neuve, ce bloc ne fait rien de plus. Le relancer n'a aucun
-- effet — c'est ce qui rend ce fichier rejouable tel quel, autant de fois
-- qu'on veut.
-- ---------------------------------------------------------------------------
alter table terminaux add column if not exists version    text;
alter table comptes   add column if not exists iccid      text;
alter table comptes   add column if not exists reseau     text;
alter table comptes   add column if not exists itinerance boolean not null default false;
alter table cartes    add column if not exists nom        text;
alter table paiements add column if not exists carte      text;
alter table paiements add column if not exists commission   numeric;
alter table paiements add column if not exists montant_brut numeric;

-- Les montants étaient des entiers. Orange annonce ses soldes à la décimale
-- (« Nouveau Solde: 2784137.6 FCFA ») : en bigint, PostgreSQL les ARRONDIT
-- sans rien signaler, et la plateforme afficherait un solde que l'opérateur
-- n'a jamais annoncé. Relancer ces lignes sur des colonnes déjà en numeric ne
-- fait rien.
alter table comptes   alter column solde       type numeric;
alter table paiements alter column montant     type numeric;
alter table paiements alter column solde_apres type numeric;
alter table paiements alter column frais       type numeric;

-- La clé d'un compte était son libellé (« MTN »). Deux SIM MTN successives
-- s'écrasaient donc l'une l'autre : une seule ligne pour deux caisses. La clé
-- devient l'ICCID, qui distingue physiquement les puces.
--
-- Le filtre sur « conrelid » est nécessaire : un nom de contrainte n'est
-- unique que par table, et sans lui on risquerait d'en viser une autre.
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'comptes_terminal_libelle_key'
               and conrelid = 'comptes'::regclass) then
    alter table comptes drop constraint comptes_terminal_libelle_key;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'comptes_terminal_iccid_key'
                   and conrelid = 'comptes'::regclass) then
    alter table comptes add constraint comptes_terminal_iccid_key
      unique (terminal, iccid);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Index — après la migration, donc toutes les colonnes existent
-- ---------------------------------------------------------------------------
create index if not exists paiements_recu_le_idx on paiements (recu_le desc);
create index if not exists paiements_compte_idx  on paiements (terminal, compte);
create index if not exists paiements_carte_idx   on paiements (terminal, carte);
create index if not exists paiements_tiers_idx   on paiements (tiers);
create index if not exists cartes_derniere_vue_idx on cartes (terminal, derniere_vue desc);
create index if not exists commandes_attente_idx
  on commandes (terminal, etat) where etat = 'en_attente';

-- ---------------------------------------------------------------------------
-- Sécurité : personne ne lit sans être connecté.
--
-- Le Pi écrit avec la clé « service_role », qui contourne ces règles — c'est
-- pour cela qu'elle ne doit jamais quitter le fichier de configuration du Pi.
-- L'application web lit avec la clé publique, et n'obtient rien sans session.
-- ---------------------------------------------------------------------------
alter table terminaux  enable row level security;
alter table cartes     enable row level security;
alter table comptes    enable row level security;
alter table paiements  enable row level security;
alter table evenements enable row level security;
alter table commandes  enable row level security;
alter table recus      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['terminaux','cartes','comptes','paiements','evenements','commandes','recus']
  loop
    execute format(
      'drop policy if exists "lecture connectee" on %I; '
      'create policy "lecture connectee" on %I for select to authenticated using (true);',
      t, t);
  end loop;
end $$;

-- Seule exception en écriture : un utilisateur connecté peut demander une
-- commande (appuyer sur un bouton). Il ne peut pas modifier l'historique.
drop policy if exists "demander une commande" on commandes;
create policy "demander une commande" on commandes
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Le compartiment de stockage des reçus
--
-- Les PDF n'ont pas à s'accumuler sur la carte SD du Pi : le terminal les
-- fabrique en mémoire, les envoie sur Telegram, puis les dépose ici. Le
-- compartiment est privé — on y accède en étant connecté, ou avec la clé de
-- service, qui ne quitte jamais le Pi.
--
-- Le bloc ne fait rien sur une base PostgreSQL ordinaire, où le schéma
-- « storage » n'existe pas : ce fichier doit rester exécutable partout.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('recus', 'recus', false)
    on conflict (id) do nothing;

    execute $p$drop policy if exists "recus lecture connectee" on storage.objects$p$;
    execute $p$create policy "recus lecture connectee" on storage.objects
              for select to authenticated using (bucket_id = 'recus')$p$;
  end if;
end $$;
