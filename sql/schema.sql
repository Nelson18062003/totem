-- ---------------------------------------------------------------------------
-- TOTEM — structure de la base Supabase
--
-- À coller dans l'éditeur SQL de Supabase (menu « SQL Editor » → « New query »),
-- puis exécuter. Le script est rejouable : le relancer ne casse rien.
--
-- Vérifié sur PostgreSQL 16, et pas à la main : « tests/test_sql_execute.py »
-- monte une base jetable à chaque passage de la batterie, y déroule ce fichier
-- trois fois de suite, puis applique la migration à une base qui contient déjà
-- des données et vérifie qu'aucune ligne n'a disparu.
--
-- Une réserve à connaître : ce fichier vise le rôle « authenticated », qui est
-- une construction de Supabase et n'existe pas dans un PostgreSQL nu. Sur une
-- base ordinaire il faut le créer d'abord, sans quoi la section « sécurité »
-- s'arrête sur « role "authenticated" does not exist ». Le test le crée, comme
-- Supabase le fournit.
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
  -- Qui a envoyé le SMS, tel que le téléphone l'affiche : « OrangeMoney »,
  -- « Orange », « MTN »… C'est le nom que la liste des SMS met en avant.
  expediteur   text,
  -- La catégorie devinée du SMS, pour la boîte de réception : encaissement,
  -- envoi, transfert, depot, retrait, solde, code, publicite, message.
  categorie    text,
  -- La nature CHOISIE par le propriétaire (depot/retrait/transfert/solde),
  -- qui l'emporte sur la catégorie devinée et déclenche le reçu.
  nature       text,
  texte        text not null,            -- le SMS d'origine : il fait foi
  -- Heure RÉSEAU du SMS (TP-SCTS) quand le PDU la donne : l'heure vraie de
  -- l'opération. « recu_le » est l'heure de relève du Pi ; les deux divergent
  -- après une coupure, et c'est « emis_le » qui fait foi pour l'ordre.
  emis_le      timestamptz,
  recu_le      timestamptz not null,
  -- L'heure retenue pour l'ordre d'affichage : réseau si connue, sinon relève.
  -- Colonne calculée, indexée : le tri ne balaie jamais la table.
  moment       timestamptz generated always as (coalesce(emis_le, recu_le)) stored,
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
alter table paiements add column if not exists expediteur   text;
alter table paiements add column if not exists commission   numeric;
alter table paiements add column if not exists montant_brut numeric;
alter table paiements add column if not exists categorie    text;
alter table paiements add column if not exists nature       text;
alter table paiements add column if not exists emis_le      timestamptz;
-- La colonne calculée « moment » vient APRÈS emis_le (elle en dépend).
alter table paiements add column if not exists moment       timestamptz
  generated always as (coalesce(emis_le, recu_le)) stored;

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

-- Le grand livre ne doit pas s'effacer par accident. Les tables financières
-- (paiements, reçus) étaient en « on delete cascade » sur le terminal :
-- supprimer par erreur la ligne « douala » aurait effacé, en silence et sans
-- retour, tous les encaissements et tous les reçus. On bascule ces deux clés
-- en « restrict » : tant qu'il reste de l'argent tracé, la base REFUSE de
-- supprimer le terminal. Les tables d'état (cartes, comptes, événements,
-- commandes) gardent la cascade — elles n'ont pas la même valeur de preuve.
--
-- Rejouable : on retire la clé existante (quel que soit son nom) puis on pose
-- la version « restrict ». Sur une base déjà migrée, on repose la même.
do $$
declare tbl text; nom text;
begin
  foreach tbl in array array['paiements','recus']
  loop
    for nom in
      select conname from pg_constraint
      where conrelid = tbl::regclass and contype = 'f'
        and confrelid = 'terminaux'::regclass
    loop
      execute format('alter table %I drop constraint %I', tbl, nom);
    end loop;
    execute format(
      'alter table %I add constraint %I foreign key (terminal) '
      'references terminaux(id) on delete restrict',
      tbl, tbl || '_terminal_restrict_fkey');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Index — après la migration, donc toutes les colonnes existent
-- ---------------------------------------------------------------------------
create index if not exists paiements_recu_le_idx on paiements (recu_le desc);
-- L'affichage est trié par « moment » (heure réseau si connue, sinon relève).
create index if not exists paiements_moment_idx on paiements (terminal, moment desc);
create index if not exists paiements_compte_idx  on paiements (terminal, compte);
create index if not exists paiements_carte_idx   on paiements (terminal, carte);
create index if not exists paiements_tiers_idx   on paiements (tiers);
create index if not exists cartes_derniere_vue_idx on cartes (terminal, derniere_vue desc);
-- Le web trie les reçus par date d'établissement (recus?order=etabli_le.desc) :
-- sans index, c'est un tri complet de la table à chaque page.
create index if not exists recus_etabli_le_idx on recus (terminal, etabli_le desc);
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

-- ===========================================================================
-- L'IDENTITÉ — commerces, personnes, accès, invitations, sessions
--
-- Ajouté en août 2026. Jusque-là, la plateforme n'avait qu'un mot de passe
-- unique : trois personnes au même comptoir partageaient une seule clé, et le
-- journal ne pouvait dire que « quelqu'un ».
--
-- Le chemin depuis une base déjà en service est décrit dans
-- « sql/migration-identite.sql ». Les deux fichiers disent la même chose, et
-- « tests/test_schema_identite.py » vérifie qu'ils ne divergent pas.
-- ===========================================================================
-- --- Les commerces ---------------------------------------------------------
-- Un commerce n'est pas un terminal. Le terminal est l'objet posé sur le
-- comptoir ; le commerce est ce que la personne possède. Les séparer permet
-- les deux cas que le terrain impose : deux commerçants sur un terminal
-- (chacun ses cartes), et un commerçant sur deux terminaux.
create table if not exists commerces (
  id        text primary key,            -- « marche-bafoussam »
  nom       text not null,               -- « Marché · Bafoussam »
  ville     text,
  -- La langue du commerce sert de défaut aux invitations : la personne qui
  -- reçoit un lien n'a pas encore choisi, et personne n'a choisi pour elle.
  langue    text not null default 'fr' check (langue in ('fr', 'en')),
  -- « Si vous n'êtes plus joignable, qui prévient-on ? » Posée à la création
  -- du commerce, cette question coûte trente secondes ; ne pas l'avoir posée
  -- coûte une boutique le jour d'une succession.
  contact_secours       text,
  telephone_secours     text,
  -- « ouvert » | « succession » | « litige » | « ferme ». Les trois derniers
  -- gèlent les SORTIES et les ACCÈS — jamais l'enregistrement, jamais les
  -- reçus : l'argent qui entre n'obéit pas à TOTEM, et un gel qui arrête
  -- d'enregistrer perd de l'argent en silence.
  etat      text not null default 'ouvert'
              check (etat in ('ouvert', 'succession', 'litige', 'ferme')),
  etat_depuis timestamptz,
  etat_motif  text,
  cree_le   timestamptz not null default now()
);

comment on table commerces is
  'La boutique, telle que les gens la nomment. Un terminal peut en porter '
  'deux ; un commerce peut vivre sur deux terminaux.';

-- Chaque carte appartient à un commerce. C'est ce rattachement qui cloisonne
-- réellement les caisses : deux SIM du même terminal peuvent être à deux
-- personnes différentes.
alter table cartes add column if not exists commerce text references commerces(id);
create index if not exists cartes_commerce_idx on cartes (commerce);

-- --- Les personnes ---------------------------------------------------------
create table if not exists personnes (
  id         bigint generated always as identity primary key,
  nom        text not null,              -- « J. Eyenga », tel qu'on l'appelle
  -- Le numéro est un CANAL, jamais une preuve d'identité : au Cameroun une
  -- ligne inutilisée est recyclée et réattribuée. Un compte ne peut donc pas
  -- être « le numéro 6xx… » — sinon le recyclage d'un numéro donne un jour à
  -- un inconnu l'accès aux encaissements d'un commerce.
  telephone  text,
  telephone_lie_le timestamptz,          -- depuis quand ce numéro est le sien
  courriel   text,                       -- le super-admin en a un ; pas les autres
  langue     text not null default 'fr' check (langue in ('fr', 'en')),
  -- « actif » | « suspendu » | « parti ». « parti » n'efface rien : la
  -- personne revient parfois six mois plus tard, et on la RÉACTIVE au lieu de
  -- la recréer — sinon son historique se coupe en deux, et deux « J. Eyenga »
  -- apparaissent dans la liste.
  etat       text not null default 'actif'
               check (etat in ('actif', 'suspendu', 'parti')),
  cree_le    timestamptz not null default now(),
  vue_le     timestamptz
);

comment on column personnes.telephone is
  'Un canal de contact, pas une identité : les numéros inactifs sont recyclés.';

-- --- Les accès : qui peut quoi, et où --------------------------------------
create table if not exists acces (
  id         bigint generated always as identity primary key,
  personne   bigint not null references personnes(id) on delete restrict,
  commerce   text   not null references commerces(id) on delete restrict,
  -- proprietaire : possède l'argent, invite, retire, et lui seul fait sortir.
  -- operateur    : tient le comptoir, lit les soldes, remet les reçus.
  -- lecteur      : lit, télécharge, et rien d'autre.
  -- admin        : le super-admin de la plateforme. Il voit et il administre,
  --                et il ne peut déclencher AUCUN mouvement d'argent — la
  --                séparation est structurelle, pas contractuelle.
  role       text not null check (role in ('proprietaire', 'operateur', 'lecteur', 'admin')),
  -- Une assistance déclarée vaut mieux qu'une captation qu'on découvre trop
  -- tard : « Mme Ngo, assistée de Paul ». Révocable par elle seule.
  assiste    bigint references personnes(id),
  invite_par bigint references personnes(id),
  cree_le    timestamptz not null default now(),
  -- Retirer, c'est dater — jamais supprimer. Ce que la personne a fait reste
  -- au journal avec son nom.
  retire_le  timestamptz,
  retire_par bigint references personnes(id),
  unique (personne, commerce)
);

create index if not exists acces_commerce_idx on acces (commerce) where retire_le is null;
create index if not exists acces_personne_idx on acces (personne) where retire_le is null;

comment on table acces is
  'Le rôle d''une personne dans UN commerce. La même personne peut être '
  'opératrice ici et lectrice ailleurs.';

-- --- Les invitations : rien n'existe avant ---------------------------------
create table if not exists invitations (
  id          bigint generated always as identity primary key,
  -- L'empreinte du jeton, jamais le jeton. Qui lit la base ne peut ouvrir
  -- aucune invitation ; il peut seulement vérifier celle qu'on lui présente.
  jeton_empreinte text not null unique,
  commerce    text not null references commerces(id) on delete restrict,
  role        text not null check (role in ('proprietaire', 'operateur', 'lecteur', 'admin')),
  nom         text not null,             -- le nom lisible que le propriétaire a saisi
  -- L'invitation est LIÉE au numéro dès l'émission : le code part sur CE
  -- numéro, pas sur celui qu'on tape. C'est ce qui la protège du lien qui
  -- traîne dans un groupe WhatsApp de quarante personnes.
  telephone   text not null,
  langue      text not null default 'fr' check (langue in ('fr', 'en')),
  creee_par   bigint references personnes(id),
  creee_le    timestamptz not null default now(),
  -- Plusieurs jours, pas quinze minutes : le lien passe par WhatsApp, se fait
  -- suivre, et s'ouvre parfois le surlendemain — après un délestage de douze
  -- heures ou un forfait épuisé le 28.
  expire_le   timestamptz not null,
  -- Usage unique. La seconde ouverture n'ouvre rien ET prévient.
  consommee_le  timestamptz,
  consommee_par bigint references personnes(id),
  annulee_le    timestamptz,
  -- La première ouverture par quelqu'un d'autre est un signal, pas une erreur.
  premiere_vue_le timestamptz
);

create index if not exists invitations_ouvertes_idx on invitations (commerce)
  where consommee_le is null and annulee_le is null;

-- --- Les sessions : pour pouvoir en fermer une -----------------------------
-- C'est tout l'objet de cette table. Sans elle, « retirer l'accès » ne ferme
-- rien : le jeton déjà signé reste valable jusqu'à son expiration, et le
-- téléphone de quelqu'un qui vient d'être licencié continue d'ouvrir la
-- boutique. Une case cochée n'est pas une sécurité.
create table if not exists sessions (
  id          text primary key,          -- identifiant aléatoire porté par le jeton
  personne    bigint not null references personnes(id) on delete restrict,
  commerce    text references commerces(id) on delete restrict,
  role        text not null,
  -- Ce que la personne reconnaîtra dans la liste de ses appareils :
  -- « Chrome sur Android », « Safari sur iPhone ». Jamais une empreinte
  -- technique qu'elle ne saurait pas relier à un objet de sa poche.
  appareil    text,
  lieu        text,                      -- « Douala, Cameroun », approximatif
  -- Un téléphone de comptoir ne porte jamais de clé liée à l'appareil, et sa
  -- session se ferme en fin de journée. La distinction se fait ici.
  partage     boolean not null default false,
  ouverte_le  timestamptz not null default now(),
  vue_le      timestamptz not null default now(),
  expire_le   timestamptz not null,
  revoquee_le timestamptz,
  -- « sortie » | « retrait_acces » | « tout_fermer » | « expiree » | « sms_stop »
  -- Le dernier : quelqu'un dont le téléphone vient d'être arraché n'a pas
  -- d'appareil pour ouvrir un écran. Il peut emprunter un combiné et envoyer
  -- un mot.
  revoquee_motif text
);

create index if not exists sessions_vivantes_idx on sessions (personne)
  where revoquee_le is null;
create index if not exists sessions_commerce_idx on sessions (commerce)
  where revoquee_le is null;

comment on table sessions is
  'Une session ouverte quelque part. Sa raison d''être : pouvoir la fermer '
  'à la seconde, et non à la prochaine entrée.';

-- --- Les preuves d'entrée : ce qu'une personne possède ---------------------
-- Codes de secours sur papier, clés d'accès, numéro pour le SMS. Une ligne
-- par preuve, pour pouvoir en retirer une sans toucher aux autres.
create table if not exists preuves (
  id         bigint generated always as identity primary key,
  personne   bigint not null references personnes(id) on delete restrict,
  -- « papier » : un code de secours à usage unique. Le NIST les qualifie
  --              formellement de « quelque chose que l'on a » (SP 800-63B-4
  --              §3.1.2) — et c'est la seule voie qui ne demande ni téléphone,
  --              ni réseau, ni électricité.
  -- « appareil » : une clé d'accès. Elle prouve le TÉLÉPHONE, pas la personne :
  --              interdite sur un combiné de comptoir.
  -- « sms »     : le canal « restreint » de SP 800-63B-4 §3.2.9. Permis, mais
  --              jamais seul, et la personne doit être prévenue du risque.
  genre      text not null check (genre in ('papier', 'appareil', 'sms')),
  -- Empreinte, jamais le secret. Pour une clé d'accès, la clé publique.
  empreinte  text not null,
  etiquette  text,                       -- « Samsung de Mme Fotso »
  cree_le    timestamptz not null default now(),
  -- Un code de secours sert une fois. La date dit quand, et le propriétaire
  -- est prévenu à chaque usage : un code consommé, c'est soit une panne, soit
  -- quelqu'un.
  utilise_le timestamptz,
  retire_le  timestamptz
);

create index if not exists preuves_personne_idx on preuves (personne, genre)
  where retire_le is null;

-- --- Le journal des entrées ------------------------------------------------
-- Ce qui se passe à la porte, gardé même quand rien n'a été ouvert. C'est ce
-- journal qui permet de dire à une propriétaire « cinq codes ont été essayés
-- sur la clé de J. Eyenga hier soir » — et de le lui dire, plutôt que de le
-- laisser dans un fichier technique que personne ne lit.
create table if not exists entrees (
  id         bigint generated always as identity primary key,
  personne   bigint references personnes(id),     -- nul si l'adresse est inconnue
  commerce   text references commerces(id),
  -- « ouverte » | « refusee » | « expiree » | « ralentie » | « invitation »
  issue      text not null,
  -- « papier » | « appareil » | « sms » | « invitation »
  moyen      text,
  appareil   text,
  lieu       text,
  survenu_le timestamptz not null default now()
);

create index if not exists entrees_personne_idx on entrees (personne, survenu_le desc);
create index if not exists entrees_commerce_idx on entrees (commerce, survenu_le desc);

-- --- Qui a demandé ---------------------------------------------------------
-- La colonne qui manquait, et la plus importante du fichier. Sans elle, le
-- journal des commandes ne peut désigner personne, et le contrôle d'accès
-- n'est qu'un décor : on ne peut ni confondre, ni disculper.
alter table commandes add column if not exists demandee_par bigint references personnes(id);
alter table commandes add column if not exists commerce text references commerces(id);
create index if not exists commandes_auteur_idx on commandes (demandee_par, demandee_le desc);

-- --- Sécurité : ces tables aussi sont fermées ------------------------------
-- Comme les autres. Le Pi écrit avec la clé de service, qui contourne ces
-- règles ; l'application web lit avec la clé publique et n'obtient rien sans
-- session. Les politiques fines par rôle viennent avec le verrou (phase 0.3) :
-- ici on ferme d'abord, on ouvrira ensuite, jamais l'inverse.
do $$
declare t text;
begin
  foreach t in array array['commerces','personnes','acces','invitations',
                           'sessions','preuves','entrees']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Aucune politique de lecture n'est posée ici, volontairement : sans
-- politique, une clé publique ne lit RIEN. C'est le bon défaut pour des
-- tables qui portent des empreintes de secrets et des numéros de téléphone.

-- ===========================================================================
-- LE CODE À SIX CHIFFRES
--
-- Ajouté en août 2026. Le chemin depuis une base déjà en service est décrit
-- dans « sql/migration-code-entree.sql ». Les deux fichiers disent la même
-- chose, et « tests/test_schema_identite.py » vérifie qu'ils ne divergent pas.
-- ===========================================================================
create table if not exists codes_entree (
  id          bigint generated always as identity primary key,

  -- L'empreinte du code, jamais le code. Salée par l'identifiant de la
  -- tentative, pour que deux codes identiques tirés le même jour n'aient pas
  -- la même empreinte : sans cela, qui lit la base saurait que deux personnes
  -- ont reçu les mêmes six chiffres.
  empreinte   text not null,

  -- À qui il est destiné. « personne » est nul avant l'acceptation d'une
  -- invitation : le compte n'existe pas encore.
  personne    bigint references personnes(id) on delete restrict,
  invitation  bigint references invitations(id) on delete restrict,

  -- Le numéro visé, tel qu'il était AU MOMENT de l'envoi. On ne le relit pas
  -- depuis « personnes » à la vérification : entre l'envoi et la saisie,
  -- quelqu'un pourrait avoir changé le numéro de destination.
  telephone   text not null,

  -- « invitation » | « entree » | « appareil » | « numero » | « geste »
  motif       text not null,

  -- Dix minutes. C'est le plafond du NIST (SP 800-63B-4 §3.1.3.1) et c'est
  -- déjà court pour un SMS qui traverse un réseau chargé à Douala. En dessous,
  -- on ferait échouer des gens honnêtes plus souvent qu'on ne gênerait
  -- quiconque.
  expire_le   timestamptz not null,

  -- Usage unique, et la date le prouve.
  utilise_le  timestamptz,

  -- Les essais ratés. On RALENTIT à partir du troisième, on n'enferme jamais.
  essais      int not null default 0,
  -- Jusqu'à quand la porte est lente. Nul la plupart du temps.
  lent_jusqu_a timestamptz,

  -- Ce que l'écran affichera pour que la personne reconnaisse SA tentative :
  -- « Chrome sur Android, Douala ». Sans cela, quelqu'un qui a deux codes en
  -- attente ne sait pas lequel il tape.
  appareil    text,
  lieu        text,

  cree_le     timestamptz not null default now()
);

-- La recherche se fait toujours par empreinte, sur les codes encore vivants.
create index if not exists codes_entree_vivants_idx
  on codes_entree (empreinte) where utilise_le is null;
-- Et par destinataire, pour compter les demandes récentes d'un même numéro :
-- c'est ce qui empêche d'user le forfait de quelqu'un en redemandant un code
-- cent fois.
create index if not exists codes_entree_telephone_idx
  on codes_entree (telephone, cree_le desc);

comment on table codes_entree is
  'Les codes à six chiffres, sous forme d''empreinte. Un code appartient à une '
  'TENTATIVE, pas à une personne : deux demandes concurrentes ne s''écrasent pas.';

alter table codes_entree enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table d'empreintes de
-- secrets et de numéros de téléphone.
