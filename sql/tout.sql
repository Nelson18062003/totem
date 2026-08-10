-- ===========================================================================
-- TOTEM — TOUTE LA BASE, D'UN SEUL COUP
--
-- CE FICHIER NE S'ÉDITE PAS. Il est assemblé par « sql/assembler.py » à
-- partir de « sql/schema.sql » et des migrations, dans l'ordre qui fait foi.
-- Le modifier à la main serait perdu au prochain assemblage, et
-- « tests/test_sql_execute.py » le refuserait.
--
-- ---------------------------------------------------------------------------
-- COMMENT S'EN SERVIR
--
--   1. Supabase → votre projet → « SQL Editor » → « New query ».
--   2. Coller TOUT ce fichier.
--   3. « Run ».
--   4. Relancer une seconde fois. Il ne doit y avoir AUCUNE erreur rouge.
--      C'est cette seconde exécution qui prouve que le fichier est rejouable —
--      et donc qu'il pourra être relancé sans crainte le jour d'un doute.
--
-- Des lignes « NOTICE » jaunes apparaîtront (« column already exists,
-- skipping »). Ce ne sont pas des erreurs : c'est le fichier qui constate que
-- le travail est déjà fait et passe au suivant.
--
-- ---------------------------------------------------------------------------
-- CE QUE ÇA FAIT À VOS DONNÉES
--
-- RIEN NE S'EFFACE. Aucune ligne n'est supprimée, aucune table n'est vidée,
-- aucune colonne existante n'est retirée. Le fichier ajoute des tables et des
-- colonnes, et renomme deux colonnes qui visaient un numéro de téléphone là
-- où elles visent maintenant une adresse mail — un renommage garde ce qu'il y
-- avait dedans.
--
-- Vérifié, et pas à la main : « tests/test_sql_execute.py » monte un
-- PostgreSQL 16 jetable, y met un terminal, une carte et une commande, déroule
-- ce fichier deux fois par-dessus, et vérifie que les trois lignes sont
-- toujours là.
--
-- ---------------------------------------------------------------------------
-- SI VOUS PARTEZ D'UNE BASE NEUVE, c'est le seul fichier à lancer.
-- SI VOTRE BASE EST DÉJÀ EN SERVICE, c'est aussi le seul fichier à lancer.
-- ===========================================================================



-- ===========================================================================
-- ⟨ LA STRUCTURE COMPLÈTE — pour une base neuve ⟩
-- ===========================================================================

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
  -- L'ADRESSE est le point fixe d'un compte. Elle suit la personne quand elle
  -- change de téléphone, de puce et d'opérateur, et c'est par elle qu'arrive
  -- le code des six chiffres.
  courriel   text,
  courriel_prouve_le timestamptz,        -- quand un code y est arrivé et a marché
  -- Le numéro reste, mais comme un CANAL : on appelle quelqu'un, on ne
  -- l'identifie pas par sa ligne. Au Cameroun une ligne inutilisée est
  -- recyclée et réattribuée — un compte qui serait « le numéro 6xx… »
  -- donnerait un jour à un inconnu l'accès aux encaissements d'un commerce.
  telephone  text,
  telephone_lie_le timestamptz,          -- depuis quand ce numéro est le sien
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

comment on column personnes.courriel is
  'Le point fixe du compte : c''est par là qu''arrive le code des six chiffres, '
  'et « courriel_prouve_le » dit le jour où l''adresse a répondu.';
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
  -- L'invitation est LIÉE à l'adresse dès l'émission : le code part sur CETTE
  -- adresse, pas sur celle qu'on tape à l'ouverture. C'est ce qui la protège
  -- du lien qui traîne dans un groupe WhatsApp de quarante personnes.
  courriel    text not null,
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
-- tables qui portent des empreintes de secrets et des coordonnées privées.

-- ===========================================================================
-- LE CODE À SIX CHIFFRES
--
-- Ajouté en août 2026. Le chemin depuis une base déjà en service est décrit
-- dans « sql/migration-code-entree.sql ». Les deux fichiers disent la même
-- chose, et « tests/test_schema_identite.py » vérifie qu'ils ne divergent pas.
-- ===========================================================================
create table if not exists codes_entree (
  id          bigint generated always as identity primary key,

  -- L'empreinte du code, jamais le code. Salée par l'adresse visée, pour que
  -- deux codes identiques tirés le même jour n'aient pas la même empreinte :
  -- sans cela, qui lit la base saurait que deux personnes ont reçu les mêmes
  -- six chiffres.
  empreinte   text not null,

  -- À qui il est destiné. « personne » est nul avant l'acceptation d'une
  -- invitation : le compte n'existe pas encore.
  personne    bigint references personnes(id) on delete restrict,
  invitation  bigint references invitations(id) on delete restrict,

  -- L'adresse visée, telle qu'elle était AU MOMENT de l'envoi. On ne la relit
  -- pas depuis « personnes » à la vérification : entre l'envoi et la saisie,
  -- quelqu'un pourrait avoir changé l'adresse de destination.
  courriel    text not null,

  -- « invitation » | « entree » | « appareil » | « adresse » | « geste »
  motif       text not null,

  -- Dix minutes. Assez pour aller chercher le message dans une autre
  -- application, sur une connexion qui traîne ; trop court pour qu'un code
  -- resté dans une boîte mail ouverte serve encore le lendemain.
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
-- Et par destinataire, pour compter les demandes récentes d'une même adresse :
-- c'est ce qui empêche de noyer la boîte mail de quelqu'un en appuyant cent
-- fois sur « renvoyer » — et, accessoirement, de faire classer nos messages
-- comme indésirables pour tout le monde.
create index if not exists codes_entree_courriel_idx
  on codes_entree (courriel, cree_le desc);

-- Le code est-il VRAIMENT parti ? Nul tant que le service de courrier ne l'a
-- pas accepté. C'est cette date qui fait entrer la demande dans le compte des
-- cinq par demi-heure — et pas la création de la ligne.
--
-- La nuance vient d'un cas réel : la ligne était créée avant l'envoi, donc
-- cinq pannes de notre côté enfermaient la personne dehors une demi-heure,
-- pour une avarie qui n'était pas la sienne. Un code qui n'a jamais quitté
-- nos murs n'a dérangé aucune boîte mail.
alter table codes_entree add column if not exists envoye_le timestamptz;


comment on table codes_entree is
  'Les codes à six chiffres, sous forme d''empreinte. Un code appartient à une '
  'TENTATIVE, pas à une personne : deux demandes concurrentes ne s''écrasent pas.';

alter table codes_entree enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table d'empreintes de
-- secrets et d'adresses personnelles.

-- ===========================================================================
-- LE VERROUILLAGE DU TÉLÉPHONE — entrer avec son doigt
-- ===========================================================================
-- Détaillé dans « sql/migration-cles.sql » et « docs/COMMENT-ON-ENTRE.md ».
-- Une clé est un accord entre UN appareil et TOTEM : l'appareil garde un
-- secret qui ne le quitte jamais, nous n'avons que la moitié publique.
--
-- La limite qui gouverne tout le reste : une clé reconnaît un APPAREIL, pas
-- une personne. Elle n'est donc jamais proposée sur un combiné partagé.

-- --- Les clés : un appareil, un accord -------------------------------------
create table if not exists cles (
  id          bigint generated always as identity primary key,
  personne    bigint not null references personnes(id) on delete restrict,

  -- L'identifiant que l'appareil s'est donné. Unique au monde, et sans intérêt
  -- pour qui le lit : il ne sert qu'à retrouver la bonne ligne.
  identifiant text not null unique,

  -- La moitié PUBLIQUE de la clé. Elle ne déverrouille rien : elle permet
  -- seulement de vérifier une signature. C'est pourquoi elle peut être ici en
  -- clair alors que rien d'autre ne l'est.
  cle_publique text not null,

  -- Le compteur que l'appareil incrémente à chaque signature. Il ne sert qu'à
  -- une chose : repérer une clé COPIÉE. Si un compteur recule, deux objets
  -- portent la même clé. Beaucoup d'appareils renvoient toujours zéro — on ne
  -- s'alarme donc que si le compteur a déjà bougé une fois.
  compteur    bigint not null default 0,

  -- « appareil » : le téléphone ou l'ordinateur lui-même.
  -- « objet »   : une clé physique qu'on branche, pour qui en a une.
  genre       text not null default 'appareil'
                check (genre in ('appareil', 'objet')),

  -- Vraie quand la clé est recopiée dans le compte du fabricant (iCloud,
  -- Google). Elle survit alors au téléphone perdu — et c'est une information
  -- que la personne doit voir, parce qu'elle change entièrement ce qu'il faut
  -- faire le jour de la perte.
  sauvegardee boolean not null default false,

  -- « Chrome sur Android ». Pour que la personne reconnaisse SON téléphone
  -- dans la liste, et sache lequel retirer.
  appareil    text,
  lieu        text,

  cree_le     timestamptz not null default now(),
  vue_le      timestamptz,

  -- Retirer, c'est dater. Une clé retirée reste : c'est elle qui explique,
  -- trois mois plus tard, pourquoi une entrée a eu lieu ce jour-là.
  retiree_le  timestamptz,
  retiree_par bigint references personnes(id),
  retiree_motif text
);

create index if not exists cles_personne_idx on cles (personne) where retiree_le is null;

comment on table cles is
  'Un accord entre un appareil et TOTEM. La table ne contient que la moitié '
  'publique : elle vérifie une signature, elle n''en produit aucune.';

alter table cles enable row level security;

-- --- Les défis : la phrase qu'on demande de signer -------------------------
-- À chaque entrée, TOTEM invente une phrase et demande à l'appareil de la
-- signer. Elle doit être NEUVE et à USAGE UNIQUE, sinon quelqu'un qui a
-- entendu une vieille signature la rejouerait pour entrer.
--
-- La garder en base plutôt que dans un biscuit signé n'est pas gratuit : c'est
-- ce qui permet de vérifier qu'elle n'a pas DÉJÀ servi. Un biscuit, même
-- parfaitement signé, ne sait pas dire cela.
create table if not exists defis (
  id          bigint generated always as identity primary key,
  valeur      text not null unique,      -- publique par nature : c'est une phrase à signer
  -- « enregistrer » : la personne installe une clé sur cet appareil.
  -- « entrer »      : elle s'en sert.
  usage       text not null check (usage in ('enregistrer', 'entrer')),
  -- Nul pour « entrer » : au moment où on invente la phrase, on ne sait pas
  -- encore qui va la signer. C'est justement l'intérêt — la personne n'a rien
  -- à taper avant de poser son doigt.
  personne    bigint references personnes(id) on delete restrict,
  -- Cinq minutes. La fenêtre du navigateur s'ouvre tout de suite ; au-delà,
  -- la personne a fermé l'onglet et recommencera.
  expire_le   timestamptz not null,
  utilise_le  timestamptz,
  cree_le     timestamptz not null default now()
);

create index if not exists defis_vivants_idx on defis (valeur) where utilise_le is null;
-- Les défis périmés n'ont aucune valeur et s'accumulent. On les efface — et
-- c'est la SEULE table de TOTEM où effacer est permis, parce qu'une phrase
-- expirée n'a jamais rien raconté sur personne.
create index if not exists defis_age_idx on defis (expire_le);

comment on table defis is
  'La phrase à signer, à usage unique. Seule table de TOTEM dont on efface '
  'les lignes : une phrase expirée ne raconte rien sur personne.';

alter table defis enable row level security;

-- Aucune politique de lecture sur ni l'une ni l'autre, volontairement : sans
-- politique, une clé publique ne lit RIEN.

-- ===========================================================================
-- LE PAPIER DE DIX CODES — le chemin qui ne demande rien
-- ===========================================================================
-- Détaillé dans « sql/migration-papier.sql » et « docs/COMMENT-ON-ENTRE.md ».
-- C'est le seul chemin qui reste le jour où la boîte mail ET le téléphone sont
-- hors de portée en même temps. Ni réseau, ni batterie, ni électricité.
--
-- La table ne contient PAS les codes : une empreinte salée par la personne
-- permet de reconnaître celui qu'on nous présente, jamais de le dire. Les dix
-- codes sont montrés une seule fois, à la fabrication.

-- --- Les codes du papier : dix par série, chacun bon une fois ---------------
create table if not exists codes_papier (
  id          bigint generated always as identity primary key,

  -- À qui est ce papier. « on delete restrict » : supprimer une personne
  -- emporterait ses codes, et avec eux l'explication de ses entrées passées.
  personne    bigint not null references personnes(id) on delete restrict,

  -- L'EMPREINTE, jamais le code. SHA-256 de « totem:papier:<personne>:<code> ».
  -- Le sel par personne n'est pas un ornement : sans lui, deux commerçants qui
  -- tirent le même code auraient la même ligne en base, et qui la lit saurait
  -- qu'ils partagent un secret.
  empreinte   text not null unique,

  -- Le numéro imprimé en face du code, de 1 à 10. Il ne sert qu'à une chose,
  -- et elle compte : pouvoir dire « le quatrième » au téléphone, et cocher au
  -- crayon celui qu'on vient d'utiliser sans avoir à écrire le code à côté.
  rang        int not null check (rang between 1 and 10),

  -- Le numéro du papier. La première série est la 1. Il permet de dire « votre
  -- deuxième papier, fabriqué en mars » plutôt que de confondre deux feuilles
  -- qui se ressemblent.
  serie       int not null default 1,

  -- Le jour où la feuille est sortie de l'imprimante. C'est la date écrite en
  -- haut du papier : c'est elle qui permet de reconnaître la bonne feuille
  -- quand deux traînent dans le même tiroir.
  cree_le     timestamptz not null default now(),

  -- Usage unique, et la date le prouve. Un code servi ne resert jamais : c'est
  -- la base qui l'arbitre, par un filtre « pas encore utilisé » au moment de
  -- le consommer — deux onglets qui valident au même instant ne peuvent pas
  -- ouvrir deux fois.
  utilise_le  timestamptz,

  -- Ce que le journal doit pouvoir dire trois mois plus tard : où et depuis
  -- quel appareil ce code de secours a servi.
  appareil    text,
  lieu        text,

  -- Une nouvelle série remplace l'ancienne : on date, on n'efface pas. Une
  -- ligne annulée reste — c'est elle qui explique, plus tard, pourquoi un code
  -- recopié de la vieille feuille n'ouvre plus rien.
  annulee_le  timestamptz
);

create index if not exists codes_papier_vivants_idx
  on codes_papier (empreinte) where utilise_le is null and annulee_le is null;
create index if not exists codes_papier_personne_idx
  on codes_papier (personne, serie desc);

comment on table codes_papier is
  'Les dix codes d''un papier de secours, sous forme d''empreinte. La table ne '
  'sait pas les dire : elle sait seulement reconnaître celui qu''on lui '
  'présente. Une nouvelle série annule la précédente, en la datant.';

comment on column codes_papier.empreinte is
  'SHA-256 de « totem:papier:<personne>:<code> ». Le code en clair n''existe '
  'qu''une fois, sur l''écran de fabrication, et jamais ici.';
comment on column codes_papier.annulee_le is
  'Le jour où une nouvelle série a remplacé celle-ci. Deux papiers valables en '
  'circulation, c''est une feuille oubliée qui ouvre encore le commerce '
  'trois ans plus tard.';

alter table codes_papier enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN.

-- --- Les courriels : ce qui est parti, et ce qui n'est pas parti ------------
-- Ce journal n'existe que pour répondre à une phrase qu'on entend tous les
-- mois : « mon opérateur dit qu'il n'a rien reçu ». Sans lui, elle n'a pas de
-- réponse — on ne sait pas si le message est parti, s'il a été refusé, ou si
-- TOTEM n'était pas configuré ce jour-là, et ces trois situations appellent
-- trois gestes différents.
--
-- IL NE CONTIENT PAS LE CONTENU, ET N'AURA JAMAIS DE COLONNE POUR LE METTRE.
-- Ni les six chiffres, ni le jeton d'une invitation, ni l'objet, ni le corps.
-- Une colonne « message » finirait remplie « pour déboguer », et une copie de
-- la base ouvrirait alors des boutiques.
--
-- L'adresse, elle, est en clair : la base la connaît déjà (« personnes.
-- courriel », « codes_entree.courriel »), donc la hacher ici ne protégerait
-- rien et rendrait le journal muet sur la seule question qu'on lui pose.
create table if not exists courriels (
  id          bigint generated always as identity primary key,

  -- L'adresse visée AU MOMENT de l'envoi, normalisée. On ne la relit pas
  -- depuis « personnes » : entre l'envoi et la question posée trois semaines
  -- plus tard, l'adresse du compte a pu changer.
  destinataire text not null,

  -- Nul avant l'acceptation d'une invitation : le compte n'existe pas encore
  -- au moment où part le tout premier message.
  personne    bigint references personnes(id) on delete restrict,

  -- Le genre, jamais le contenu. C'est lui qui permet de dire « trois codes
  -- sont partis vers cette boîte hier soir » sans savoir lesquels.
  genre       text not null
                check (genre in ('code', 'invitation', 'bienvenue',
                                 'alerte_appareil', 'cle_retiree')),

  -- « partie »         : le fournisseur l'a accepté — accepté n'est pas lu.
  -- « refusee »        : il a dit non. Réessayer ne sert à rien en l'état.
  -- « injoignable »    : le réseau a coupé. Réessayer a du sens.
  -- « sans_cle »       : TOTEM n'était pas configuré. Cette ligne est la seule
  --                      façon de s'en apercevoir avant un coup de téléphone.
  -- « sans_expediteur »: l'autre moitié de la configuration.
  -- « adresse »        : l'adresse n'avait pas la forme d'une adresse.
  issue       text not null
                check (issue in ('partie', 'refusee', 'injoignable',
                                 'sans_cle', 'sans_expediteur', 'adresse')),

  -- Le motif technique d'un refus : « 422 validation_error ». Court, borné, et
  -- jamais le corps de la réponse du fournisseur.
  detail      text,

  -- L'identifiant donné par le fournisseur, pour retrouver CE message-là chez
  -- lui le jour où quelqu'un dit qu'il n'a rien reçu.
  reference   text,

  cree_le     timestamptz not null default now()
);

create index if not exists courriels_destinataire_idx
  on courriels (destinataire, cree_le desc);
create index if not exists courriels_personne_idx
  on courriels (personne, cree_le desc) where personne is not null;
-- Les échecs se lisent seuls : c'est la liste qu'on regarde quand quelque
-- chose cloche, et elle doit rester rapide même quand tout va bien.
create index if not exists courriels_rates_idx
  on courriels (cree_le desc) where issue <> 'partie';

comment on table courriels is
  'Ce qui est parti par courriel, et ce qui n''est pas parti. Le genre, le '
  'destinataire, le moment, l''issue — jamais le contenu : ni code, ni jeton, '
  'ni objet, ni corps. Il n''y a aucune colonne pour cela, exprès.';

comment on column courriels.destinataire is
  'L''adresse visée au moment de l''envoi, normalisée. En clair, parce que la '
  'base la connaît déjà ailleurs et qu''une empreinte ne répondrait pas à la '
  'seule question posée : vers quelle boîte ?';

comment on column courriels.detail is
  'Le motif technique d''un refus, borné. Jamais un morceau du message.';

alter table courriels enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table qui aligne les
-- adresses personnelles de tout le monde.

-- ===========================================================================
-- CE QUI ARRIVE SUR VOTRE TÉLÉPHONE, ET LE RETOUR
--
-- Ajouté en août 2026, avec les écrans C8 (« je n'arrive plus à entrer ») et
-- C10 (« ce qui arrive sur votre téléphone »). Le chemin depuis une base déjà
-- en service est décrit dans « sql/migration-preferences.sql ». Les deux
-- fichiers disent la même chose, et « tests/test_retour_messages.py » vérifie
-- qu'ils ne divergent pas.
--
-- LA RÈGLE QUE CES TABLES GRAVENT DANS LA BASE
-- Ce qui protège ne se débraye pas, et le défaut est « on reçoit ».
-- ===========================================================================

-- --- Ce qu'on accepte de recevoir ------------------------------------------
create table if not exists preferences_messages (
  id        bigint generated always as identity primary key,
  personne  bigint not null references personnes(id) on delete restrict,

  -- Les huit genres, et rien d'autre. Un genre inconnu écrit ici serait une
  -- préférence que personne ne relit jamais — donc un réglage qui ment.
  genre     text not null check (genre in (
              'code', 'invitation', 'bienvenue', 'alerte_appareil',
              'cle_retiree', 'encaissement', 'rapport', 'terminal')),

  -- Vrai par défaut, et l'ABSENCE de ligne vaut vrai elle aussi. Les deux
  -- chemins mènent à « on reçoit » : c'est le seul défaut qui ne prive
  -- personne d'une nouvelle par accident.
  recevoir  boolean not null default true,

  change_le timestamptz not null default now(),
  unique (personne, genre)
);

create index if not exists preferences_messages_personne_idx
  on preferences_messages (personne);

-- La règle, tenue par la base et pas seulement par l'écran. Quatre genres
-- protègent : les six chiffres sont la porte elle-même, l'invitation ouvre un
-- compte, l'entrée depuis un appareil jamais vu est ce qui prévient d'une
-- intrusion, et le retrait d'un téléphone est ce qui la confirme. Aucun ne
-- s'éteint. Un écran mal écrit, une route oubliée, une main dans l'éditeur
-- SQL : la ligne est refusée dans les trois cas.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'preferences_messages_protege_chk') then
    alter table preferences_messages
      add constraint preferences_messages_protege_chk
      check (recevoir or genre not in
             ('code', 'invitation', 'alerte_appareil', 'cle_retiree'));
  end if;
end $$;

comment on table preferences_messages is
  'Ce que la personne accepte de recevoir. L''absence de ligne vaut « on '
  'reçoit », et ce qui protège ne s''éteint pas : la contrainte le refuse.';

alter table preferences_messages enable row level security;

-- --- Le lien qui ferme tout ------------------------------------------------
-- Il part sur l'adresse mail, il vaut une heure, et il ne sert qu'une fois.
-- Une heure : le temps d'emprunter un téléphone, d'ouvrir sa boîte et de
-- revenir. Au-delà, la personne en redemandera un — cela ne coûte qu'un geste,
-- alors qu'un lien qui traîne une semaine dans une boîte ouverte sur un
-- téléphone volé est exactement ce qu'on cherche à éviter.
create table if not exists demandes_fermeture (
  id        bigint generated always as identity primary key,

  -- L'empreinte du jeton, JAMAIS le jeton. Il n'existe en clair que dans le
  -- courriel envoyé. Qui lit cette table ne peut fermer aucun compte ; il peut
  -- seulement vérifier le lien qu'on lui présente.
  jeton_empreinte text not null unique,

  personne  bigint not null references personnes(id) on delete restrict,

  -- Ce qu'on savait de celui qui a demandé. Approximatif par construction : il
  -- sert à raconter « la demande est partie d'un téléphone à Douala », pas à
  -- faire une preuve.
  appareil  text,
  lieu      text,

  demande_le timestamptz not null default now(),
  expire_le  timestamptz not null,

  -- Usage unique : c'est cette colonne, et le filtre « is null » qui va avec,
  -- qui empêche de rejouer un lien retrouvé dans une boîte mail.
  utilise_le timestamptz
);

create index if not exists demandes_fermeture_personne_idx
  on demandes_fermeture (personne);
create index if not exists demandes_fermeture_vivantes_idx
  on demandes_fermeture (expire_le) where utilise_le is null;

comment on table demandes_fermeture is
  'Le lien à usage unique qui ferme toutes les sessions d''une personne. La '
  'table ne contient que l''empreinte : elle vérifie un lien, elle n''en '
  'fabrique aucun.';

alter table demandes_fermeture enable row level security;

-- Aucune politique de lecture sur ni l'une ni l'autre, volontairement : sans
-- politique, une clé publique ne lit RIEN.

-- ===========================================================================
-- LA CONSOLE DE LA PLATEFORME — à qui, où, et ce qui va mal
--
-- Ajoutée en août 2026. Le chemin depuis une base déjà en service est décrit
-- dans « sql/migration-console.sql ». Les deux fichiers disent la même chose.
--
-- Ce que la base ne savait pas dire, et que l'écran de flotte exige :
--  · à QUI appartient un boîtier — le cloisonnement de l'argent passe par
--    « cartes.commerce », mais un terminal sans carte n'appartenait alors à
--    personne, et la console ne pouvait pas nommer le commerce qu'il dessert ;
--  · OÙ il est posé — « douala-akwa-01 » est un identifiant, pas une adresse ;
--  · s'il est ENCORE EN SERVICE — un boîtier débranché pour de bon serait muet
--    pour l'éternité et squatterait la tête d'un écran trié par ce qui va mal ;
--  · CE QUI VA MAL, et qui est encore ouvert.
--
-- Ce qu'elle n'ajoute pas, volontairement : aucune colonne de mesure physique.
-- Le robot ne publie qu'un résumé en toutes lettres dans « terminaux.sante » ;
-- des colonnes que personne ne remplit donneraient des zéros qui ressemblent à
-- des mesures. Et aucune colonne « carte retirée » : l'absence d'une puce se
-- déduit de « cartes.derniere_vue », mais seulement quand le terminal parle
-- encore — « on ne sait pas » n'a pas le droit de ressembler à « retirée ».
-- ===========================================================================

-- Le commerce qui HÉBERGE le boîtier. À ne pas confondre avec
-- « cartes.commerce », qui dit à qui appartient l'ARGENT : un terminal peut
-- porter les puces de deux commerçants, et c'est le cloisonnement par carte
-- qui fait foi pour les soldes.
alter table terminaux add column if not exists commerce text references commerces(id);

-- L'endroit tel qu'on le nomme au téléphone : « Douala · Akwa ». Celui qui
-- doit envoyer quelqu'un sur place a besoin d'un lieu, pas d'un identifiant.
alter table terminaux add column if not exists lieu text;

-- Retiré du service, et la date le prouve. Un terminal retiré garde tout son
-- journal : on le sort de la surveillance, jamais de l'histoire.
alter table terminaux add column if not exists retire_le timestamptz;
alter table terminaux add column if not exists retire_motif text;

comment on column terminaux.commerce is
  'Le commerce chez qui le boîtier est posé. Le cloisonnement de l''argent, '
  'lui, passe par « cartes.commerce » : un terminal peut porter deux caisses.';
comment on column terminaux.retire_le is
  'Sorti du service. La ligne descend de l''écran de surveillance ; son '
  'journal, ses reçus et ses paiements restent entiers.';

create index if not exists terminaux_commerce_idx on terminaux (commerce);
create index if not exists terminaux_en_service_idx
  on terminaux (vu_le asc nulls first) where retire_le is null;

-- --- Les alertes : ce qui est ENCORE ouvert --------------------------------
-- Une alerte n'est pas un message. Un message défile ; une alerte reste tant
-- que personne ne l'a levée, et c'est cette persistance qui permet de dire
-- « trois choses vont mal en ce moment » plutôt que « trois choses sont allées
-- mal un jour ».
create table if not exists alertes (
  id         bigint generated always as identity primary key,

  -- Nul pour une alerte qui vise la plateforme entière (le cloud injoignable) :
  -- elle n'appartient à aucune machine.
  terminal   text references terminaux(id) on delete cascade,

  -- Le commerce touché, quand il est connu. C'est ce qui permet à l'écran de
  -- NOMMER à qui appartient ce qu'il montre.
  commerce   text references commerces(id),

  -- Nommé par l'objet : « silence », « tension », « temperature », « disque »,
  -- « itinerance », « carte_retiree », « retard_synchro ». Pas de contrainte
  -- fermée : une alerte inconnue doit pouvoir REMONTER quitte à s'afficher
  -- telle quelle, plutôt que d'être rejetée en silence.
  genre      text not null,

  -- « grave » est réservé à ce qui fait perdre de l'argent ou détruit du
  -- matériel.
  gravite    text not null default 'attention'
               check (gravite in ('information', 'attention', 'grave')),

  -- Écrits pour quelqu'un qui n'est pas informaticien : « Le boîtier de
  -- Bafoussam ne parle plus depuis six heures », pas « heartbeat timeout ».
  titre      text not null,
  detail     text,

  ouverte_le timestamptz not null default now(),
  -- Voir n'est pas résoudre : confondre les deux ferait disparaître de l'écran
  -- des choses que personne n'a réparées.
  vue_le     timestamptz,

  close_le   timestamptz,
  close_par  bigint references personnes(id),
  close_motif text
);

comment on table alertes is
  'Ce qui va mal en ce moment sur la flotte. Une alerte reste ouverte tant '
  'que personne ne la lève ; c''est ce qui la distingue d''un message.';

-- Une seule alerte ouverte par boîtier et par genre : un terminal qui bascule
-- vingt fois en sous-tension pendant un délestage ne produit pas vingt lignes.
create unique index if not exists alertes_ouverte_unique
  on alertes (terminal, genre) where close_le is null;

create index if not exists alertes_ouvertes_idx
  on alertes (ouverte_le desc) where close_le is null;
create index if not exists alertes_commerce_idx on alertes (commerce);

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. Une alerte nomme un commerce et raconte ce qui se
-- passe chez lui ; c'est le bon défaut. La console lit avec la clé de service,
-- depuis le serveur, après « exigerPouvoir("administrer") ».
alter table alertes enable row level security;

-- ===========================================================================
-- QUI A LE DROIT D'ÊTRE ADMINISTRATEUR DE LA PLATEFORME
--
-- Ajouté en août 2026, avec la porte du super-administrateur (planches A1 à
-- A7). Le chemin depuis une base déjà en service est décrit dans
-- « sql/migration-plateforme.sql » ; les deux fichiers disent la même chose.
--
-- POURQUOI UNE TABLE DE PLUS, ALORS QU'« acces » EXISTE DÉJÀ
-- « acces » attache une personne à UN commerce : sa colonne « commerce » est
-- « not null », et c'est juste — un rôle sans commerce ne veut rien dire pour
-- une propriétaire, une opératrice ou une lectrice. Le super-administrateur,
-- lui, n'a pas de commerce : il les regarde tous et n'en possède aucun. Rendre
-- la colonne facultative aurait ouvert dans TOUTE l'application la possibilité
-- d'un accès qui ne nomme aucune boutique — une ligne oubliée quelque part, et
-- une opératrice se retrouve avec un droit qui vaut partout.
-- ===========================================================================

-- --- Qui a le droit d'être administrateur de la plateforme ------------------
create table if not exists acces_plateforme (
  id            bigint generated always as identity primary key,

  -- « on delete restrict » : supprimer une personne emporterait la trace de ce
  -- qu'elle a eu le droit de voir, et c'est précisément ce à quoi un journal
  -- doit survivre.
  personne      bigint not null references personnes(id) on delete restrict,

  -- La demande. Elle existe AVANT le droit : quelqu'un demande, quelqu'un
  -- accorde, et les deux moments sont datés séparément. Une table où le droit
  -- apparaît d'un coup ne sait pas dire qui l'a voulu.
  demande_le    timestamptz not null default now(),

  -- Ce que la personne a écrit pour justifier sa demande, dans ses mots. Six
  -- mois plus tard, c'est la seule phrase qui explique pourquoi on a dit oui.
  demande_motif text,

  accorde_le    timestamptz,
  accorde_par   bigint references personnes(id),

  -- Un refus n'efface pas la demande : la même personne peut redemander plus
  -- tard, et celui qui décide doit voir qu'on a déjà dit non une fois.
  refuse_le     timestamptz,
  refuse_par    bigint references personnes(id),

  -- Le motif est écrit pour être relu par quelqu'un qui n'était pas là :
  -- « a quitté la société », pas « révocation ».
  retire_le     timestamptz,
  retire_par    bigint references personnes(id),
  retire_motif  text
);

-- Un seul dossier vivant par personne. Sans cet index, deux demandes en
-- attente pour la même personne se retrouvent dans la liste de celui qui
-- décide, il en accorde une, et l'autre reste ouverte pour toujours.
create unique index if not exists acces_plateforme_vivant_idx
  on acces_plateforme (personne)
  where retire_le is null and refuse_le is null;

create index if not exists acces_plateforme_a_examiner_idx
  on acces_plateforme (demande_le)
  where accorde_le is null and refuse_le is null and retire_le is null;

create index if not exists acces_plateforme_accordes_idx
  on acces_plateforme (accorde_le desc)
  where accorde_le is not null and retire_le is null;

comment on table acces_plateforme is
  'Qui a le droit d''entrer dans la console de la plateforme. Séparée de '
  '« acces », qui attache toujours un rôle à UN commerce : un administrateur '
  'de plateforme n''en possède aucun, il les regarde tous.';

comment on column acces_plateforme.demande_motif is
  'Ce que la personne a écrit pour demander, dans ses mots. C''est la seule '
  'phrase qui explique, plus tard, pourquoi on a dit oui.';

comment on column acces_plateforme.retire_motif is
  'Écrit pour quelqu''un qui n''était pas là : « a quitté la société », pas '
  '« révocation ».';

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. Cette table dit qui peut tout voir — c'est la dernière
-- que l'on ouvrirait. La console la lit avec la clé de service, depuis le
-- serveur, après « exigerPouvoir("administrer") ».
alter table acces_plateforme enable row level security;

-- ===========================================================================
-- LES VERSIONS, ET QUI A VU UNE ALERTE
--
-- Ajoutée en août 2026. Le chemin depuis une base déjà en service est décrit
-- dans « sql/migration-journal.sql ». Les deux fichiers disent la même chose.
--
-- Deux manques, tous deux découverts en construisant la seconde moitié de la
-- console :
--  · « terminaux.version » dit ce qu'un boîtier PORTE, et rien ne disait ce
--    qu'il DEVRAIT porter. Le retard ne se déduit pas des retardataires : une
--    flotte entière restée deux mois en arrière paraît parfaitement homogène.
--  · « alertes » savait qui avait CLOS et pas qui avait VU. Or ce sont deux
--    gestes différents, et c'est tout l'intérêt de la table.
--
-- Ce qu'elle n'ajoute pas, volontairement : aucune date « prise le » sur
-- « terminaux » — le robot ne la publie pas, et une colonne que personne ne
-- remplit donne une date vide qui ressemble à une mesure.
-- ===========================================================================

-- Le nom EXACT que le boîtier annonce dans « terminaux.version ». Une version
-- écrite ici autrement que là-bas ne rapproche rien, et l'écran dira
-- « logiciel inconnu du registre » — ce qui est la vérité.
create table if not exists versions (
  version    text primary key,
  publiee_le timestamptz not null default now(),
  -- Nul tant que la version n'est qu'à l'essai : une version qu'on essaie sur
  -- un seul boîtier ne met personne en retard.
  envoyee_le timestamptz,
  -- Ce qu'elle change, écrit pour quelqu'un qui n'est pas informaticien.
  resume     text,
  -- Vraie quand elle bouche un trou. Le boîtier qui ne l'a pas reçue n'est
  -- pas en retard, il est exposé — et sa ligne ne se range plus avec les
  -- autres.
  correctif_securite boolean not null default false,
  -- Rien ne s'efface : une version retirée explique, six mois plus tard,
  -- pourquoi un boîtier porte ce qu'il porte.
  retiree_le timestamptz,
  retiree_motif text
);

comment on table versions is
  'Ce qui a été publié, et ce qui a été envoyé à la flotte. Sans elle, le '
  'retard d''un boîtier ne se mesure qu''aux autres boîtiers — et une flotte '
  'entière restée en arrière paraît à jour.';

comment on column versions.envoyee_le is
  'Nul tant que la version n''est qu''à l''essai. Une version publiée ne met '
  'personne en retard ; une version envoyée, oui.';

comment on column versions.correctif_securite is
  'Vraie quand la version bouche un trou. Le boîtier qui ne l''a pas reçue '
  'n''est pas en retard, il est exposé.';

create index if not exists versions_envoyees_idx
  on versions (envoyee_le desc) where envoyee_le is not null and retiree_le is null;

-- « close_par » existait, « vue_par » manquait. Voir n'est pas résoudre, et un
-- accusé de réception anonyme ne répond pas à la seule question qui se pose
-- ensuite : qui devait y aller.
alter table alertes add column if not exists vue_par bigint references personnes(id);

comment on column alertes.vue_par is
  'Qui a accusé réception. Distinct de « close_par » : « je l''ai vue » n''est '
  'pas « c''est réglé », et confondre les deux fait disparaître de l''écran '
  'des choses que personne n''a réparées.';

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. La console lit avec la clé de service, depuis le
-- serveur, après « exigerPouvoir("administrer") ».
alter table versions enable row level security;


-- ===========================================================================
-- ⟨ LES MIGRATIONS — pour une base déjà en service ⟩
-- ===========================================================================



-- ===========================================================================
-- ⟨ migration-refonte-sms-et-audit.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « refonte SMS + correctifs d'audit »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il amène une base Supabase DÉJÀ EN SERVICE au niveau du code actuel. C'est
-- le chemin, pas la structure : il ne crée aucune table, il ajoute seulement
-- ce qui manque et corrige ce qui doit l'être. La structure complète, elle,
-- reste décrite une seule fois dans « sql/schema.sql » (à utiliser pour une
-- base NEUVE). Les deux disent la même chose ; ce fichier-ci est le raccourci
-- pour une base qui contient déjà des données.
--
-- POURQUOI CETTE MIGRATION
--  - Les SMS avaient cessé de remonter : la colonne « expediteur » manquait,
--    et la base refusait chaque insertion sans le dire clairement. Elle est
--    ajoutée ici, en tout premier.
--  - La refonte « un SMS n'est pas un paiement » a besoin de trois colonnes de
--    plus (categorie, nature, emis_le) et d'une colonne calculée (moment).
--  - L'audit a demandé de protéger le grand livre de l'effacement (clés en
--    « restrict ») et d'ajouter deux index manquants.
--
-- EST-CE SANS RISQUE
-- Oui. Chaque instruction est rejouable : la relancer ne casse rien et ne
-- touche à aucune donnée existante. On peut l'exécuter deux fois de suite sans
-- effet la seconde. Aucune colonne n'est supprimée, aucune ligne n'est
-- effacée.
--
-- COMMENT L'EXÉCUTER
--  1. Ouvrir Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier.
--  3. « Run ». Quelques secondes.
--  4. Descendre jusqu'au bloc « VÉRIFICATION » en bas et lancer ces requêtes :
--     elles confirment que tout est en place.
--
-- Si la base est VIDE (nouveau projet Supabase), n'utilisez pas ce fichier :
-- lancez « sql/schema.sql », qui crée les tables d'abord.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. La refonte SMS — les colonnes qui manquaient
-- ===========================================================================

-- « expediteur » EN PREMIER : c'est son absence qui faisait disparaître les
-- SMS en silence. Qui a envoyé le message (« OrangeMoney », « MTN »…), tel que
-- le téléphone l'afficherait — c'est le nom que la boîte de réception met en
-- avant.
alter table paiements add column if not exists expediteur text;

-- La catégorie DEVINÉE par le robot, pour ranger la boîte de réception :
-- encaissement, envoi, transfert, depot, retrait, solde, code, publicite,
-- message.
alter table paiements add column if not exists categorie text;

-- La nature CHOISIE par le propriétaire (depot / retrait / transfert / solde).
-- Elle l'emporte sur la catégorie devinée et c'est elle qui déclenche le reçu.
alter table paiements add column if not exists nature text;

-- L'heure RÉSEAU du SMS (TP-SCTS), l'heure vraie de l'opération telle que
-- l'opérateur l'a datée. « recu_le » n'est que l'heure de relève du Pi ; après
-- une coupure, les deux divergent, et c'est « emis_le » qui fait foi pour
-- l'ordre d'affichage.
alter table paiements add column if not exists emis_le timestamptz;

-- « moment » : l'heure retenue pour trier — réseau si connue, sinon relève.
-- Colonne CALCULÉE (elle se remplit seule) et indexée plus bas. Elle vient
-- APRÈS « emis_le », dont elle dépend : l'ordre de ce fichier n'est pas
-- décoratif.
alter table paiements add column if not exists moment timestamptz
  generated always as (coalesce(emis_le, recu_le)) stored;

-- ===========================================================================
-- 2. Rattrapage des colonnes plus anciennes
--
-- Au cas où la base serait en retard de plus d'une version. Si elles sont déjà
-- là, ces lignes ne font rien.
-- ===========================================================================
alter table terminaux add column if not exists version    text;
alter table comptes   add column if not exists iccid      text;
alter table comptes   add column if not exists reseau     text;
alter table comptes   add column if not exists itinerance boolean not null default false;
alter table cartes    add column if not exists nom        text;
alter table paiements add column if not exists carte        text;
alter table paiements add column if not exists commission   numeric;
alter table paiements add column if not exists montant_brut numeric;

-- ===========================================================================
-- 3. Les montants à la décimale
--
-- Orange annonce ses soldes avec une virgule (« Nouveau Solde : 2784137.6
-- FCFA »). En entier (bigint), PostgreSQL ARRONDIT sans rien signaler, et la
-- plateforme afficherait un solde que l'opérateur n'a jamais annoncé. On passe
-- ces colonnes en numeric. Rejouer sur des colonnes déjà en numeric ne fait
-- rien.
-- ===========================================================================
alter table comptes   alter column solde       type numeric;
alter table paiements alter column montant     type numeric;
alter table paiements alter column solde_apres type numeric;
alter table paiements alter column frais       type numeric;

-- ===========================================================================
-- 4. La clé d'un compte : l'ICCID, pas le libellé
--
-- La clé d'unicité d'un compte était son libellé (« MTN »). Deux SIM MTN qui
-- se succèdent dans le berceau s'écrasaient donc l'une l'autre — une seule
-- ligne pour deux caisses. La clé devient l'ICCID, gravé sur la puce, qui
-- distingue physiquement les cartes. Le filtre sur « conrelid » vise la bonne
-- table : un nom de contrainte n'est unique que par table.
-- ===========================================================================
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

-- ===========================================================================
-- 5. Le grand livre protégé de l'effacement
--
-- Les tables financières (paiements, reçus) étaient rattachées au terminal en
-- « on delete cascade » : supprimer par erreur la ligne « douala » aurait
-- effacé, en silence et sans retour, tous les encaissements et tous les reçus.
-- On bascule ces deux clés en « restrict » : tant qu'il reste de l'argent
-- tracé, la base REFUSE de supprimer le terminal. Les tables d'état (cartes,
-- comptes, événements, commandes) gardent la cascade — elles n'ont pas la même
-- valeur de preuve. Rejouable : on retire la clé existante (quel que soit son
-- nom) puis on pose la version « restrict ».
-- ===========================================================================
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

-- ===========================================================================
-- 6. Les index — après les colonnes, donc elles existent toutes
-- ===========================================================================
-- Le tri d'affichage se fait sur « moment » (heure réseau si connue). Sans cet
-- index, chaque page balaierait toute la table.
create index if not exists paiements_moment_idx on paiements (terminal, moment desc);
-- Le web trie les reçus par date d'établissement : même raison.
create index if not exists recus_etabli_le_idx  on recus (terminal, etabli_le desc);
-- Les autres, s'ils manquaient encore.
create index if not exists paiements_recu_le_idx on paiements (recu_le desc);
create index if not exists paiements_compte_idx  on paiements (terminal, compte);
create index if not exists paiements_carte_idx   on paiements (terminal, carte);
create index if not exists paiements_tiers_idx   on paiements (tiers);
create index if not exists cartes_derniere_vue_idx on cartes (terminal, derniere_vue desc);
create index if not exists commandes_attente_idx
  on commandes (terminal, etat) where etat = 'en_attente';

-- ===========================================================================
-- 7. Sécurité : personne ne lit sans être connecté
--
-- Le Pi écrit avec la clé « service_role », qui contourne ces règles — c'est
-- pourquoi elle ne doit jamais quitter le fichier de configuration du Pi.
-- L'application web lit avec la clé publique et n'obtient rien sans session.
-- ===========================================================================
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

-- Seule écriture permise à un utilisateur connecté : demander une commande
-- (appuyer sur un bouton). Il ne peut jamais modifier l'historique.
drop policy if exists "demander une commande" on commandes;
create policy "demander une commande" on commandes
  for insert to authenticated with check (true);

-- ===========================================================================
-- 8. Le compartiment de stockage des reçus
--
-- Les PDF ne s'accumulent pas sur la carte SD du Pi : le terminal les fabrique
-- en mémoire, les envoie sur Telegram, puis les dépose ici. Compartiment
-- privé — accès en étant connecté, ou avec la clé de service. Le bloc ne fait
-- rien là où le schéma « storage » n'existe pas (PostgreSQL ordinaire).
-- ===========================================================================
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
-- VÉRIFICATION — à lancer après la migration
--
-- Chaque requête doit renvoyer ce qui est annoncé. Si l'une ne renvoie rien,
-- la migration n'a pas abouti pour cette partie.
-- ===========================================================================

-- (a) Les cinq colonnes de la refonte SMS sont là ? → 5 lignes attendues.
select column_name
from information_schema.columns
where table_name = 'paiements'
  and column_name in ('expediteur', 'categorie', 'nature', 'emis_le', 'moment')
order by column_name;

-- (b) Le grand livre est-il protégé ? → « paiements » et « recus » en « r »
--     (restrict), les tables d'état en « c » (cascade).
select conrelid::regclass as table_liee, confdeltype as a_la_suppression
from pg_constraint
where contype = 'f' and confrelid = 'terminaux'::regclass
order by table_liee;

-- (c) Les deux index clés existent ? → 2 lignes attendues.
select indexname
from pg_indexes
where indexname in ('paiements_moment_idx', 'recus_etabli_le_idx')
order by indexname;


-- ===========================================================================
-- ⟨ migration-lus-et-badge.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « lu / non-lu » (août 2026)
--
-- Une seule colonne : quand le propriétaire a-t-il OUVERT ce SMS sur la
-- plateforme ? Vide = pas encore regardé. C'est elle qui alimente la pastille
-- « N nouveaux » du menu et le point des lignes non lues.
--
-- À coller dans Supabase → « SQL Editor » → « Run ». Rejouable : la relancer
-- ne casse rien ; sa seule conséquence serait de remettre le compteur de
-- non-lus à zéro (les messages non encore ouverts seraient considérés vus).
-- ---------------------------------------------------------------------------

alter table paiements add column if not exists lu_le timestamptz;

-- Les messages déjà présents datent d'avant cette notion : on les considère
-- vus, sinon la plateforme s'ouvrirait sur des centaines de « nouveaux »
-- qui n'en sont pas.
update paiements set lu_le = coalesce(lu_le, recu_le, now()) where lu_le is null;

-- Vérification : la colonne existe, et tout l'existant est marqué vu.
select
  count(*)                          as sms_au_total,
  count(*) filter (where lu_le is null) as non_lus_restants   -- doit être 0
from paiements;


-- ===========================================================================
-- ⟨ migration-identite.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « une identité par personne »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il donne un nom à qui appuie. Jusqu'ici, la plateforme n'avait qu'un mot de
-- passe unique et un jeton signé sur le mot « proprietaire » écrit en dur :
-- trois personnes au même comptoir partageaient une seule clé, et retirer
-- l'accès d'un employé voulait dire changer le mot de passe de tout le monde.
--
-- POURQUOI MAINTENANT, ET AVANT TOUT LE RESTE
-- Le jour où 300 000 F manquent, le journal doit pouvoir dire QUI a appuyé —
-- pour confondre, et tout autant pour disculper. Aucune règle de rôle ne peut
-- s'écrire tant que la base ne sait répondre que « quelqu'un ». C'est pour
-- cela que cette migration passe avant le moindre écran neuf.
--
-- LES CINQ OBJETS QU'ELLE INTRODUIT
--   commerces    — la boutique. Elle manquait, et c'est elle que les gens
--                  nomment : « Marché · Bafoussam », pas « douala-akwa-01 ».
--                  Deux commerçants peuvent partager un terminal, un
--                  commerçant peut tenir deux boutiques : ni l'un ni l'autre
--                  n'est représentable quand l'accès se donne par terminal.
--   personnes    — un être humain, une fois. Pas un compte par boutique.
--   acces        — ce qu'une personne peut faire DANS un commerce. Une même
--                  personne peut être opératrice ici et lectrice là.
--   invitations  — rien n'existe avant qu'une invitation soit acceptée.
--   sessions     — pour pouvoir en fermer une. C'est tout l'objet.
--
-- DEUX RÈGLES QUI TRAVERSENT TOUT LE FICHIER
--   1. On ne stocke JAMAIS un secret en clair. Ni le jeton d'invitation, ni
--      le jeton de session, ni un code à six chiffres, ni un code de secours.
--      La base ne garde que leur empreinte : elle peut vérifier, elle ne peut
--      pas révéler. Une copie de la base ne rouvre aucune porte.
--   2. Rien ne s'efface. Retirer un accès pose une date dans « retire_le » ;
--      fermer une session pose « revoquee_le ». Un employé qui part fâché est
--      exactement le moment où l'historique doit rester entier.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée, sauf « commandes » qui reçoit
-- une colonne « demandee_par » (nullable : les commandes déjà là restent
-- valides, simplement sans auteur connu). Chaque instruction est rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Ouvrir Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ».
--  3. Le relancer une seconde fois ne doit produire aucune erreur.
-- ---------------------------------------------------------------------------

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
  -- L'ADRESSE est le point fixe d'un compte. Elle suit la personne quand elle
  -- change de téléphone, de puce et d'opérateur, et c'est par elle qu'arrive
  -- le code des six chiffres.
  courriel   text,
  courriel_prouve_le timestamptz,        -- quand un code y est arrivé et a marché
  -- Le numéro reste, mais comme un CANAL : on appelle quelqu'un, on ne
  -- l'identifie pas par sa ligne. Au Cameroun une ligne inutilisée est
  -- recyclée et réattribuée — un compte qui serait « le numéro 6xx… »
  -- donnerait un jour à un inconnu l'accès aux encaissements d'un commerce.
  telephone  text,
  telephone_lie_le timestamptz,          -- depuis quand ce numéro est le sien
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

-- « create table if not exists » ne fait RIEN sur une table déjà là : sur une
-- base qui a déroulé une version antérieure de ce fichier, les colonnes
-- ajoutées depuis manqueraient en silence, et chaque insertion échouerait sans
-- que personne comprenne pourquoi. On les redemande donc explicitement.
alter table personnes add column if not exists courriel text;
alter table personnes add column if not exists courriel_prouve_le timestamptz;

comment on column personnes.courriel is
  'Le point fixe du compte : c''est par là qu''arrive le code des six chiffres, '
  'et « courriel_prouve_le » dit le jour où l''adresse a répondu.';
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
-- L'invitation visait un numéro dans son premier jet ; elle vise une adresse.
-- Sur une base où l'ancienne colonne existe, on la renomme plutôt que d'en
-- ajouter une seconde.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'invitations' and column_name = 'telephone') then
    alter table invitations rename column telephone to courriel;
  end if;
end $$;

create table if not exists invitations (
  id          bigint generated always as identity primary key,
  -- L'empreinte du jeton, jamais le jeton. Qui lit la base ne peut ouvrir
  -- aucune invitation ; il peut seulement vérifier celle qu'on lui présente.
  jeton_empreinte text not null unique,
  commerce    text not null references commerces(id) on delete restrict,
  role        text not null check (role in ('proprietaire', 'operateur', 'lecteur', 'admin')),
  nom         text not null,             -- le nom lisible que le propriétaire a saisi
  -- L'invitation est LIÉE à l'adresse dès l'émission : le code part sur CETTE
  -- adresse, pas sur celle qu'on tape à l'ouverture. C'est ce qui la protège
  -- du lien qui traîne dans un groupe WhatsApp de quarante personnes.
  courriel    text not null,
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
-- tables qui portent des empreintes de secrets et des coordonnées privées.


-- ===========================================================================
-- ⟨ migration-code-entree.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « le code à six chiffres »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui porte les codes d'entrée. Un seul objet, mais qui
-- resservira cinq fois : à l'acceptation d'une invitation, à chaque nouvel
-- appareil, après un changement d'adresse, au retour d'un téléphone perdu, et
-- pour confirmer un geste qui engage.
--
-- LE CODE PART PAR COURRIEL, PAS PAR SMS
-- L'adresse est le point fixe : elle suit la personne quand elle change de
-- téléphone, de puce et d'opérateur. Un numéro camerounais inutilisé est
-- recyclé et réattribué — s'y accrocher, c'est donner un jour à un inconnu la
-- clé d'un commerce. Le premier code sert d'ailleurs autant à ouvrir la porte
-- qu'à PROUVER que l'adresse existe et qu'elle est bien à cette personne.
--
-- POURQUOI UNE TABLE À PART, ET PAS UNE COLONNE
-- Un code n'appartient ni à une personne ni à une invitation : il appartient à
-- une TENTATIVE. La même personne peut en avoir demandé un il y a deux minutes
-- sur son téléphone et un autre à l'instant sur l'ordinateur du comptoir ;
-- l'ancien doit mourir sans emporter le neuf. Une colonne sur « personnes »
-- écraserait l'un par l'autre en silence.
--
-- CE QUE LA TABLE NE CONTIENT PAS
-- Le code. Jamais. Elle garde son empreinte : elle peut vérifier ce qu'on lui
-- présente, elle ne peut pas révéler ce qu'elle attend. Une copie de la base
-- — une sauvegarde qui traîne, un accès de trop — n'ouvre aucune porte.
--
-- LA RÈGLE QUI COMPTE : ON RALENTIT, ON N'ENFERME JAMAIS
-- Le compteur d'essais fait attendre. Il ne verrouille pas. Verrouiller le
-- propriétaire, c'est le couper de son propre argent — et personne chez TOTEM
-- ne doit pouvoir faire cela, pas même pour le protéger.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- Le premier jet de cette table visait un numéro de téléphone. Elle vise une
-- adresse. Sur une base où l'ancienne colonne existe déjà, on la renomme au
-- lieu d'en créer une seconde — deux colonnes pour une même chose finissent
-- toujours par diverger.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'codes_entree' and column_name = 'telephone') then
    alter table codes_entree rename column telephone to courriel;
  end if;
end $$;

create table if not exists codes_entree (
  id          bigint generated always as identity primary key,

  -- L'empreinte du code, jamais le code. Salée par l'adresse visée, pour que
  -- deux codes identiques tirés le même jour n'aient pas la même empreinte :
  -- sans cela, qui lit la base saurait que deux personnes ont reçu les mêmes
  -- six chiffres.
  empreinte   text not null,

  -- À qui il est destiné. « personne » est nul avant l'acceptation d'une
  -- invitation : le compte n'existe pas encore.
  personne    bigint references personnes(id) on delete restrict,
  invitation  bigint references invitations(id) on delete restrict,

  -- L'adresse visée, telle qu'elle était AU MOMENT de l'envoi. On ne la relit
  -- pas depuis « personnes » à la vérification : entre l'envoi et la saisie,
  -- quelqu'un pourrait avoir changé l'adresse de destination.
  courriel    text not null,

  -- « invitation » | « entree » | « appareil » | « adresse » | « geste »
  motif       text not null,

  -- Dix minutes. Assez pour aller chercher le message dans une autre
  -- application, sur une connexion qui traîne ; trop court pour qu'un code
  -- resté dans une boîte mail ouverte serve encore le lendemain.
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
-- Et par destinataire, pour compter les demandes récentes d'une même adresse :
-- c'est ce qui empêche de noyer la boîte mail de quelqu'un en appuyant cent
-- fois sur « renvoyer » — et, accessoirement, de faire classer nos messages
-- comme indésirables pour tout le monde.
create index if not exists codes_entree_courriel_idx
  on codes_entree (courriel, cree_le desc);
drop index if exists codes_entree_telephone_idx;

-- Le code est-il VRAIMENT parti ? Nul tant que le service de courrier ne l'a
-- pas accepté. C'est cette date qui fait entrer la demande dans le compte des
-- cinq par demi-heure — et pas la création de la ligne.
--
-- La nuance vient d'un cas réel : la ligne était créée avant l'envoi, donc
-- cinq pannes de notre côté enfermaient la personne dehors une demi-heure,
-- pour une avarie qui n'était pas la sienne. Un code qui n'a jamais quitté
-- nos murs n'a dérangé aucune boîte mail.
alter table codes_entree add column if not exists envoye_le timestamptz;


comment on table codes_entree is
  'Les codes à six chiffres, sous forme d''empreinte. Un code appartient à une '
  'TENTATIVE, pas à une personne : deux demandes concurrentes ne s''écrasent pas.';

alter table codes_entree enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table d'empreintes de
-- secrets et d'adresses personnelles.


-- ===========================================================================
-- ⟨ migration-cles.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « le verrouillage du téléphone »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute les deux tables qui permettent d'entrer dans TOTEM avec le
-- verrouillage de son propre téléphone — l'empreinte, le visage, le schéma —
-- au lieu d'un code reçu par courriel.
--
-- CE QU'EST UNE « CLÉ » ICI
-- Un accord entre UN téléphone et TOTEM. Le téléphone garde un secret qui ne
-- le quitte jamais ; il nous donne seulement la moitié publique, celle qui ne
-- déverrouille rien. À chaque entrée, il signe une phrase que nous venons
-- d'inventer, et nous vérifions la signature.
--
-- CE QUE ÇA CHANGE POUR LA PERSONNE
-- Rien à retenir, rien à recopier, rien à attendre. Et un faux site qui
-- imiterait TOTEM ne peut pas s'en servir : le téléphone refuse de signer pour
-- une autre adresse que la nôtre. C'est la seule protection de cette liste qui
-- tienne quand la personne, elle, s'est fait avoir.
--
-- LA LIMITE, ET ELLE EST SÉRIEUSE
-- Une clé reconnaît un APPAREIL, pas une personne. Sur un téléphone de
-- comptoir que trois personnes se passent, elle ne prouve rien du tout. TOTEM
-- ne la proposera donc jamais sur un appareil déclaré partagé — sur celui-là
-- on entre par le courriel, et la session se ferme le soir même.
--
-- CE QUE CES TABLES NE REMPLACENT PAS
-- Le courriel. Une clé se perd avec le téléphone, et le jour où c'est arrivé
-- il faut un autre chemin. Les deux coexistent, exprès et pour toujours.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Les clés : un appareil, un accord -------------------------------------
create table if not exists cles (
  id          bigint generated always as identity primary key,
  personne    bigint not null references personnes(id) on delete restrict,

  -- L'identifiant que l'appareil s'est donné. Unique au monde, et sans intérêt
  -- pour qui le lit : il ne sert qu'à retrouver la bonne ligne.
  identifiant text not null unique,

  -- La moitié PUBLIQUE de la clé. Elle ne déverrouille rien : elle permet
  -- seulement de vérifier une signature. C'est pourquoi elle peut être ici en
  -- clair alors que rien d'autre ne l'est.
  cle_publique text not null,

  -- Le compteur que l'appareil incrémente à chaque signature. Il ne sert qu'à
  -- une chose : repérer une clé COPIÉE. Si un compteur recule, deux objets
  -- portent la même clé. Beaucoup d'appareils renvoient toujours zéro — on ne
  -- s'alarme donc que si le compteur a déjà bougé une fois.
  compteur    bigint not null default 0,

  -- « appareil » : le téléphone ou l'ordinateur lui-même.
  -- « objet »   : une clé physique qu'on branche, pour qui en a une.
  genre       text not null default 'appareil'
                check (genre in ('appareil', 'objet')),

  -- Vraie quand la clé est recopiée dans le compte du fabricant (iCloud,
  -- Google). Elle survit alors au téléphone perdu — et c'est une information
  -- que la personne doit voir, parce qu'elle change entièrement ce qu'il faut
  -- faire le jour de la perte.
  sauvegardee boolean not null default false,

  -- « Chrome sur Android ». Pour que la personne reconnaisse SON téléphone
  -- dans la liste, et sache lequel retirer.
  appareil    text,
  lieu        text,

  cree_le     timestamptz not null default now(),
  vue_le      timestamptz,

  -- Retirer, c'est dater. Une clé retirée reste : c'est elle qui explique,
  -- trois mois plus tard, pourquoi une entrée a eu lieu ce jour-là.
  retiree_le  timestamptz,
  retiree_par bigint references personnes(id),
  retiree_motif text
);

create index if not exists cles_personne_idx on cles (personne) where retiree_le is null;

comment on table cles is
  'Un accord entre un appareil et TOTEM. La table ne contient que la moitié '
  'publique : elle vérifie une signature, elle n''en produit aucune.';

alter table cles enable row level security;

-- --- Les défis : la phrase qu'on demande de signer -------------------------
-- À chaque entrée, TOTEM invente une phrase et demande à l'appareil de la
-- signer. Elle doit être NEUVE et à USAGE UNIQUE, sinon quelqu'un qui a
-- entendu une vieille signature la rejouerait pour entrer.
--
-- La garder en base plutôt que dans un biscuit signé n'est pas gratuit : c'est
-- ce qui permet de vérifier qu'elle n'a pas DÉJÀ servi. Un biscuit, même
-- parfaitement signé, ne sait pas dire cela.
create table if not exists defis (
  id          bigint generated always as identity primary key,
  valeur      text not null unique,      -- publique par nature : c'est une phrase à signer
  -- « enregistrer » : la personne installe une clé sur cet appareil.
  -- « entrer »      : elle s'en sert.
  usage       text not null check (usage in ('enregistrer', 'entrer')),
  -- Nul pour « entrer » : au moment où on invente la phrase, on ne sait pas
  -- encore qui va la signer. C'est justement l'intérêt — la personne n'a rien
  -- à taper avant de poser son doigt.
  personne    bigint references personnes(id) on delete restrict,
  -- Cinq minutes. La fenêtre du navigateur s'ouvre tout de suite ; au-delà,
  -- la personne a fermé l'onglet et recommencera.
  expire_le   timestamptz not null,
  utilise_le  timestamptz,
  cree_le     timestamptz not null default now()
);

create index if not exists defis_vivants_idx on defis (valeur) where utilise_le is null;
-- Les défis périmés n'ont aucune valeur et s'accumulent. On les efface — et
-- c'est la SEULE table de TOTEM où effacer est permis, parce qu'une phrase
-- expirée n'a jamais rien raconté sur personne.
create index if not exists defis_age_idx on defis (expire_le);

comment on table defis is
  'La phrase à signer, à usage unique. Seule table de TOTEM dont on efface '
  'les lignes : une phrase expirée ne raconte rien sur personne.';

alter table defis enable row level security;

-- Aucune politique de lecture sur ni l'une ni l'autre, volontairement : sans
-- politique, une clé publique ne lit RIEN.


-- ===========================================================================
-- ⟨ migration-courriels.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « le journal des courriels »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui note qu'un message est parti — ou qu'il n'est pas
-- parti. Une seule table, et elle n'existe que pour répondre à une phrase
-- qu'on entend tous les mois : « mon opérateur dit qu'il n'a rien reçu ».
--
-- POURQUOI CE JOURNAL EXISTE
-- Sans lui, cette phrase n'a pas de réponse. On ne sait pas si le message est
-- parti, s'il a été refusé, ou si TOTEM n'était tout simplement pas configuré
-- ce jour-là. Chacune de ces trois situations appelle un geste différent, et
-- aucune ne se devine. Avec ce journal, on répond : « il est parti à 9 h 04,
-- le fournisseur l'a accepté sous la référence 4ef… ; regardez vos
-- indésirables » — ou bien « il n'est jamais parti, en voici un autre ».
--
-- CE QUE LA TABLE NE CONTIENT PAS, ET NE CONTIENDRA JAMAIS
-- Le contenu. Ni les six chiffres, ni le jeton d'une invitation, ni l'objet,
-- ni le corps du message. Il n'y a AUCUNE colonne pour cela, et c'est
-- délibéré : une colonne « message » finirait par être remplie « pour
-- déboguer », et une copie de la base ouvrirait alors des boutiques. Le
-- journal dit à qui, quel genre, quand, et ce qui s'est passé. Rien d'autre.
--
-- POURQUOI L'ADRESSE EN CLAIR, ET PAS UNE EMPREINTE
-- La question s'est posée. La base connaît DÉJÀ l'adresse — « personnes.
-- courriel », « codes_entree.courriel » — donc la hacher ici ne protégerait
-- rien du tout, et rendrait illisible la seule chose que ce journal doit
-- savoir dire : vers QUELLE boîte le message est parti. Une empreinte
-- répondrait « oui, quelque chose est parti quelque part », ce qui n'aide
-- personne au comptoir.
--
-- POURQUOI ON NOTE AUSSI LES ÉCHECS
-- Un journal qui ne garde que les succès raconte que tout va bien. Les lignes
-- « refusee » d'affilée sur un même domaine sont le signal qu'on cherche : le
-- domaine d'expédition n'est plus vérifié, ou l'hébergeur du destinataire nous
-- classe en indésirables.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

create table if not exists courriels (
  id          bigint generated always as identity primary key,

  -- L'adresse visée, telle qu'elle était AU MOMENT de l'envoi, normalisée
  -- (domaine en minuscules). On ne la relit pas depuis « personnes » : entre
  -- l'envoi et la question posée trois semaines plus tard, quelqu'un a pu
  -- changer l'adresse du compte, et le journal doit dire où c'est VRAIMENT
  -- parti.
  destinataire text not null,

  -- Nul avant l'acceptation d'une invitation : le compte n'existe pas encore
  -- au moment où part le tout premier message.
  personne    bigint references personnes(id) on delete restrict,

  -- « code » | « invitation » | « bienvenue » | « alerte_appareil » | « cle_retiree »
  -- Le genre, jamais le contenu. C'est lui qui permet de dire « trois codes
  -- sont partis vers cette boîte hier soir » sans jamais savoir lesquels.
  genre       text not null
                check (genre in ('code', 'invitation', 'bienvenue',
                                 'alerte_appareil', 'cle_retiree')),

  -- Ce qui s'est passé, et chaque valeur appelle une conduite différente :
  -- « partie »         : le fournisseur l'a accepté. Il peut encore finir en
  --                      indésirables — accepté n'est pas lu.
  -- « refusee »        : le fournisseur a dit non. Réessayer ne servira à rien
  --                      tant que rien n'a changé.
  -- « injoignable »    : le réseau a coupé. Réessayer a du sens.
  -- « sans_cle »       : TOTEM n'était pas configuré. Ce n'est pas une panne
  --                      du jour, c'est un déploiement incomplet — et cette
  --                      ligne-là est la seule façon de s'en apercevoir avant
  --                      qu'une propriétaire ne téléphone.
  -- « sans_expediteur »: l'autre moitié de la configuration.
  -- « adresse »        : l'adresse n'avait pas la forme d'une adresse. On n'a
  --                      pas appelé le fournisseur.
  issue       text not null
                check (issue in ('partie', 'refusee', 'injoignable',
                                 'sans_cle', 'sans_expediteur', 'adresse')),

  -- Le motif technique d'un refus : « 422 validation_error ». Court, borné, et
  -- jamais le corps de la réponse du fournisseur — rien ne garantit qu'il n'y
  -- recopie pas un morceau du message qu'on vient de lui donner.
  detail      text,

  -- L'identifiant que le fournisseur a donné au message. Il ne sert qu'à une
  -- chose, et elle compte : retrouver CE message-là chez lui le jour où
  -- quelqu'un dit qu'il n'a rien reçu. Sans lui, la conversation s'arrête à
  -- « pourtant on l'a envoyé ».
  reference   text,

  cree_le     timestamptz not null default now()
);

-- La question se pose toujours dans le même sens : « qu'est-ce qui est parti
-- vers cette boîte, et quand ? »
create index if not exists courriels_destinataire_idx
  on courriels (destinataire, cree_le desc);
-- Et, pour la fiche d'une personne, la même chose vue depuis son compte.
create index if not exists courriels_personne_idx
  on courriels (personne, cree_le desc) where personne is not null;
-- Les échecs se lisent seuls : c'est la liste qu'on regarde quand quelque
-- chose cloche, et elle doit rester rapide même quand tout va bien.
create index if not exists courriels_rates_idx
  on courriels (cree_le desc) where issue <> 'partie';

comment on table courriels is
  'Ce qui est parti par courriel, et ce qui n''est pas parti. Le genre, le '
  'destinataire, le moment, l''issue — jamais le contenu : ni code, ni jeton, '
  'ni objet, ni corps. Il n''y a aucune colonne pour cela, exprès.';

comment on column courriels.destinataire is
  'L''adresse visée au moment de l''envoi, normalisée. En clair, parce que la '
  'base la connaît déjà ailleurs et qu''une empreinte ne répondrait pas à la '
  'seule question posée : vers quelle boîte ?';

comment on column courriels.detail is
  'Le motif technique d''un refus, borné. Jamais un morceau du message.';

alter table courriels enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table qui aligne les
-- adresses personnelles de tout le monde.


-- ===========================================================================
-- ⟨ migration-papier.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « le papier de dix codes »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui garde la trace des dix codes imprimés sur un papier —
-- pas les codes eux-mêmes, seulement leur empreinte.
--
-- POURQUOI CE PAPIER EXISTE
-- C'est le seul chemin qui reste le jour où la boîte mail ET le téléphone sont
-- hors de portée en même temps : un téléphone volé avec la session mail
-- ouverte dedans, par exemple. Sans lui, la seule issue serait d'appeler
-- quelqu'un — et une plateforme où l'argent d'un commerçant dépend d'un coup
-- de fil à une seule personne n'est pas une plateforme.
-- Il ne demande NI réseau, NI batterie, NI électricité.
--
-- CE QUE LA TABLE NE CONTIENT PAS
-- Les codes. Jamais. Une empreinte SHA-256, salée par la personne, permet de
-- reconnaître un code qu'on nous présente ; elle ne permet pas de le dire.
-- C'est pourquoi les dix codes sont montrés UNE FOIS, à la fabrication, et
-- pourquoi personne chez TOTEM ne peut les remontrer — pas même sur demande.
--
-- CE QU'EST UNE « SÉRIE »
-- Les dix codes d'un même papier. Fabriquer une nouvelle série ANNULE
-- l'ancienne : deux papiers valables en circulation, c'est un papier oublié
-- dans un tiroir qui ouvre encore le commerce trois ans plus tard. L'ancienne
-- série n'est pas effacée pour autant — elle est datée, comme tout ici, parce
-- que c'est elle qui expliquera un jour pourquoi une entrée a eu lieu.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Les codes du papier : dix par série, chacun bon une fois ---------------
create table if not exists codes_papier (
  id          bigint generated always as identity primary key,

  -- À qui est ce papier. « on delete restrict » : supprimer une personne
  -- emporterait ses codes, et avec eux l'explication de ses entrées passées.
  personne    bigint not null references personnes(id) on delete restrict,

  -- L'EMPREINTE, jamais le code. SHA-256 de « totem:papier:<personne>:<code> ».
  -- Le sel par personne n'est pas un ornement : sans lui, deux commerçants qui
  -- tirent le même code auraient la même ligne en base, et qui la lit saurait
  -- qu'ils partagent un secret.
  empreinte   text not null unique,

  -- Le numéro imprimé en face du code, de 1 à 10. Il ne sert qu'à une chose,
  -- et elle compte : pouvoir dire « le quatrième » au téléphone, et cocher au
  -- crayon celui qu'on vient d'utiliser sans avoir à écrire le code à côté.
  rang        int not null check (rang between 1 and 10),

  -- Le numéro du papier. La première série est la 1. Il permet de dire « votre
  -- deuxième papier, fabriqué en mars » plutôt que de confondre deux feuilles
  -- qui se ressemblent.
  serie       int not null default 1,

  -- Le jour où la feuille est sortie de l'imprimante. C'est la date écrite en
  -- haut du papier : c'est elle qui permet de reconnaître la bonne feuille
  -- quand deux traînent dans le même tiroir.
  cree_le     timestamptz not null default now(),

  -- Usage unique, et la date le prouve. Un code servi ne resert jamais : c'est
  -- la base qui l'arbitre, par un filtre « pas encore utilisé » au moment de
  -- le consommer — deux onglets qui valident au même instant ne peuvent pas
  -- ouvrir deux fois.
  utilise_le  timestamptz,

  -- Ce que le journal doit pouvoir dire trois mois plus tard : où et depuis
  -- quel appareil ce code de secours a servi. Un code de secours utilisé
  -- depuis un endroit inattendu est exactement le genre de ligne qu'on relit.
  appareil    text,
  lieu        text,

  -- Une nouvelle série remplace l'ancienne : on date, on n'efface pas. Une
  -- ligne annulée reste — c'est elle qui explique, plus tard, pourquoi un code
  -- recopié de la vieille feuille n'ouvre plus rien.
  annulee_le  timestamptz
);

-- On cherche toujours par empreinte, et seulement parmi les codes VIVANTS :
-- ni servis, ni annulés par une série plus récente.
create index if not exists codes_papier_vivants_idx
  on codes_papier (empreinte) where utilise_le is null and annulee_le is null;

-- Et par personne, pour dire « il vous en reste quatre » sans lire la table
-- entière.
create index if not exists codes_papier_personne_idx
  on codes_papier (personne, serie desc);

comment on table codes_papier is
  'Les dix codes d''un papier de secours, sous forme d''empreinte. La table ne '
  'sait pas les dire : elle sait seulement reconnaître celui qu''on lui '
  'présente. Une nouvelle série annule la précédente, en la datant.';

comment on column codes_papier.empreinte is
  'SHA-256 de « totem:papier:<personne>:<code> ». Le code en clair n''existe '
  'qu''une fois, sur l''écran de fabrication, et jamais ici.';
comment on column codes_papier.annulee_le is
  'Le jour où une nouvelle série a remplacé celle-ci. Deux papiers valables en '
  'circulation, c''est une feuille oubliée qui ouvre encore le commerce '
  'trois ans plus tard.';

alter table codes_papier enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table d'empreintes de
-- secrets.


-- ===========================================================================
-- ⟨ migration-preferences.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « ce qui arrive sur votre téléphone », et le retour
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute les deux tables des écrans C8 et C10 :
--   · « preferences_messages » — ce que la personne accepte de recevoir ;
--   · « demandes_fermeture »   — le lien à usage unique qui ferme tout, envoyé
--     par courriel à quelqu'un qui n'arrive plus à entrer.
--
-- LA RÈGLE QUE CETTE MIGRATION GRAVE DANS LA BASE
-- Ce qui protège ne se débraye pas. Un message qu'on peut éteindre est un
-- message qui n'aurait pas prévenu le jour où il fallait : le code des six
-- chiffres, l'invitation, l'entrée depuis un appareil jamais vu et le retrait
-- d'un téléphone restent branchés, quoi qu'on coche. Ce n'est pas une consigne
-- écrite dans un écran — c'est une contrainte de la base, qui refuse la ligne.
--
-- ET SON PENDANT : LE DÉFAUT EST « ON REÇOIT »
-- L'absence de ligne vaut « on reçoit ». Une personne dont on n'a jamais lu la
-- préférence est prévenue ; on ne fabrique pas un silence par oubli.
--
-- POURQUOI LA FERMETURE PASSE PAR UN COURRIEL, ET PAS PAR UN BOUTON
-- Fermer n'exige aucune preuve — fermer une porte n'a jamais nui à personne,
-- et exiger un mot de passe de quelqu'un dont le téléphone vient d'être
-- arraché revient à lui refuser le seul geste utile. Mais un bouton anonyme
-- couperait n'importe qui : il suffirait de connaître un nom. On demande donc
-- l'adresse, on envoie le lien SUR cette adresse, et l'écran ne dit jamais si
-- le compte existe. Une fermeture abusive ne coûte qu'une reconnexion ; une
-- entrée abusive coûte une caisse.
--
-- LA BASE NE GARDE QUE L'EMPREINTE DU JETON, comme pour les invitations. Une
-- copie de la base — une sauvegarde qui traîne, un accès de trop — ne permet
-- de fermer aucun compte.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Ce qu'on accepte de recevoir ------------------------------------------
create table if not exists preferences_messages (
  id        bigint generated always as identity primary key,
  personne  bigint not null references personnes(id) on delete restrict,

  -- Les huit genres, et rien d'autre. Un genre inconnu écrit ici serait une
  -- préférence que personne ne relit jamais — donc un réglage qui ment.
  genre     text not null check (genre in (
              'code', 'invitation', 'bienvenue', 'alerte_appareil',
              'cle_retiree', 'encaissement', 'rapport', 'terminal')),

  -- Vrai par défaut, et l'ABSENCE de ligne vaut vrai elle aussi. Les deux
  -- chemins mènent à « on reçoit » : c'est le seul défaut qui ne prive
  -- personne d'une nouvelle par accident.
  recevoir  boolean not null default true,

  change_le timestamptz not null default now(),
  unique (personne, genre)
);

create index if not exists preferences_messages_personne_idx
  on preferences_messages (personne);

-- La règle, tenue par la base et pas seulement par l'écran. Quatre genres
-- protègent : les six chiffres sont la porte elle-même, l'invitation ouvre un
-- compte, l'entrée depuis un appareil jamais vu est ce qui prévient d'une
-- intrusion, et le retrait d'un téléphone est ce qui la confirme. Aucun ne
-- s'éteint. Un écran mal écrit, une route oubliée, une main dans l'éditeur
-- SQL : la ligne est refusée dans les trois cas.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'preferences_messages_protege_chk') then
    alter table preferences_messages
      add constraint preferences_messages_protege_chk
      check (recevoir or genre not in
             ('code', 'invitation', 'alerte_appareil', 'cle_retiree'));
  end if;
end $$;

comment on table preferences_messages is
  'Ce que la personne accepte de recevoir. L''absence de ligne vaut « on '
  'reçoit », et ce qui protège ne s''éteint pas : la contrainte le refuse.';

alter table preferences_messages enable row level security;

-- --- Le lien qui ferme tout ------------------------------------------------
-- Il part sur l'adresse mail, il vaut une heure, et il ne sert qu'une fois.
-- Une heure : le temps d'emprunter un téléphone, d'ouvrir sa boîte et de
-- revenir. Au-delà, la personne en redemandera un — cela ne coûte qu'un geste,
-- alors qu'un lien qui traîne une semaine dans une boîte ouverte sur un
-- téléphone volé est exactement ce qu'on cherche à éviter.
create table if not exists demandes_fermeture (
  id        bigint generated always as identity primary key,

  -- L'empreinte du jeton, JAMAIS le jeton. Il n'existe en clair que dans le
  -- courriel envoyé. Qui lit cette table ne peut fermer aucun compte ; il peut
  -- seulement vérifier le lien qu'on lui présente.
  jeton_empreinte text not null unique,

  personne  bigint not null references personnes(id) on delete restrict,

  -- Ce qu'on savait de celui qui a demandé. Approximatif par construction : il
  -- sert à raconter « la demande est partie d'un téléphone à Douala », pas à
  -- faire une preuve.
  appareil  text,
  lieu      text,

  demande_le timestamptz not null default now(),
  expire_le  timestamptz not null,

  -- Usage unique : c'est cette colonne, et le filtre « is null » qui va avec,
  -- qui empêche de rejouer un lien retrouvé dans une boîte mail.
  utilise_le timestamptz
);

create index if not exists demandes_fermeture_personne_idx
  on demandes_fermeture (personne);
create index if not exists demandes_fermeture_vivantes_idx
  on demandes_fermeture (expire_le) where utilise_le is null;

comment on table demandes_fermeture is
  'Le lien à usage unique qui ferme toutes les sessions d''une personne. La '
  'table ne contient que l''empreinte : elle vérifie un lien, elle n''en '
  'fabrique aucun.';

alter table demandes_fermeture enable row level security;

-- Aucune politique de lecture sur ni l'une ni l'autre, volontairement : sans
-- politique, une clé publique ne lit RIEN.


-- ===========================================================================
-- ⟨ migration-console.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « la console de la plateforme »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il donne à la console d'administration les quatre choses que la base ne
-- savait pas encore dire : à QUI appartient un boîtier, OÙ il est posé, s'il
-- est encore en service, et CE QUI VA MAL sur la flotte.
--
-- POURQUOI « À QUI » MANQUAIT
-- Le cloisonnement de l'argent passe par « cartes.commerce » : c'est la carte
-- SIM qui porte la caisse, et deux commerçants peuvent partager un même
-- boîtier. Mais un terminal sans carte — un boîtier neuf, un boîtier dont la
-- puce vient d'être retirée — n'appartenait alors à personne, et l'écran de
-- flotte ne pouvait pas nommer le commerce qu'il dessert. Un écran de
-- supervision qui montre une machine sans dire chez qui elle est posée oblige
-- à deviner, et deviner sur la boutique de quelqu'un d'autre est exactement ce
-- qu'on ne veut pas.
--
-- POURQUOI « ENCORE EN SERVICE » MANQUAIT
-- La console trie par ce qui va mal : un terminal muet remonte en tête. Un
-- boîtier débranché pour de bon serait donc muet POUR TOUJOURS, et occuperait
-- la première ligne de l'écran pendant des mois — jusqu'à ce que plus personne
-- ne regarde cet écran. Rien ne s'efface dans TOTEM : on date la sortie de
-- service, et la ligne descend au lieu de disparaître.
--
-- POURQUOI UNE TABLE D'ALERTES
-- Le terminal SAIT déjà ce qui ne va pas — « totem/sante.py » calcule la
-- sous-tension, le bridage thermique, le disque plein, et n'annonce que les
-- changements d'état. Mais il ne le disait qu'à Telegram, au fil de l'eau. Un
-- message qui a défilé n'est pas une alerte : personne ne peut dire ce qui est
-- ENCORE ouvert. Cette table est l'endroit où une alerte reste tant qu'elle
-- n'est pas close, avec la date à laquelle elle a été levée et par qui.
--
-- CE QUE CE FICHIER N'AJOUTE PAS, ET C'EST VOLONTAIRE
-- Aucune colonne de mesure physique (processeur, température, mémoire). Le
-- robot ne publie qu'un RÉSUMÉ en toutes lettres dans « terminaux.sante » ;
-- créer des colonnes que personne ne remplit produirait des zéros qui
-- ressemblent à des mesures, ce qui est pire que rien. Le jour où le robot
-- publiera des chiffres, ces colonnes s'ajouteront avec lui.
--
-- Aucune colonne « carte retirée » non plus. Qu'une SIM soit absente se déduit
-- de « cartes.derniere_vue » — mais SEULEMENT quand le terminal parle encore.
-- Un terminal muet ne permet de rien conclure sur ses puces, et la console
-- l'écrit ainsi : « on ne sait pas » n'a pas le droit de ressembler à
-- « retirée ».
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée : uniquement des ajouts de
-- colonnes et une table neuve. Rejouable.
--
-- CE QU'IL FAUT AVANT
-- « sql/migration-identite.sql ». Ce fichier-ci renvoie vers « commerces » et
-- « personnes » : sans elles, il s'arrête sur « relation does not exist ».
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Le boîtier : chez qui, où, et jusqu'à quand ---------------------------

-- Le commerce qui HÉBERGE le boîtier. À ne pas confondre avec
-- « cartes.commerce », qui dit à qui appartient l'ARGENT : un terminal peut
-- porter les puces de deux commerçants, et c'est le cloisonnement par carte
-- qui fait foi pour les soldes. Cette colonne-ci répond à une autre question,
-- celle que pose l'écran de flotte : « ce boîtier-là, il est chez qui ? »
alter table terminaux add column if not exists commerce text references commerces(id);

-- L'endroit tel qu'on le nomme au téléphone : « Douala · Akwa ». Le nom du
-- terminal est un identifiant technique (« douala-akwa-01 ») ; celui qui doit
-- envoyer quelqu'un sur place a besoin d'un lieu, pas d'un identifiant.
alter table terminaux add column if not exists lieu text;

-- Retiré du service, et la date le prouve. Sans elle, un boîtier débranché
-- reste « muet » pour l'éternité et squatte la tête d'un écran trié par ce qui
-- va mal — jusqu'à ce que l'écran devienne illisible et que plus personne ne
-- le regarde. Un terminal retiré garde tout son journal : on le sort de la
-- surveillance, jamais de l'histoire.
alter table terminaux add column if not exists retire_le timestamptz;
alter table terminaux add column if not exists retire_motif text;

comment on column terminaux.commerce is
  'Le commerce chez qui le boîtier est posé. Le cloisonnement de l''argent, '
  'lui, passe par « cartes.commerce » : un terminal peut porter deux caisses.';
comment on column terminaux.retire_le is
  'Sorti du service. La ligne descend de l''écran de surveillance ; son '
  'journal, ses reçus et ses paiements restent entiers.';

create index if not exists terminaux_commerce_idx on terminaux (commerce);
-- La flotte ne s'intéresse qu'aux boîtiers encore en service, et les trie par
-- leur dernier signe de vie : le plus silencieux d'abord.
create index if not exists terminaux_en_service_idx
  on terminaux (vu_le asc nulls first) where retire_le is null;

-- --- Les alertes : ce qui est ENCORE ouvert --------------------------------
-- Une alerte n'est pas un message. Un message défile ; une alerte reste tant
-- que personne ne l'a levée, et c'est cette persistance qui permet de dire
-- « trois choses vont mal en ce moment » plutôt que « trois choses sont allées
-- mal un jour ».
create table if not exists alertes (
  id         bigint generated always as identity primary key,

  -- Le boîtier concerné. Nul pour une alerte qui vise la plateforme entière
  -- (le cloud injoignable, par exemple) : elle n'appartient à aucune machine.
  terminal   text references terminaux(id) on delete cascade,

  -- Le commerce touché, quand il est connu. C'est ce qui permet à l'écran de
  -- NOMMER à qui appartient ce qu'il montre — un administrateur voit tout,
  -- mais il ne doit jamais avoir à deviner de quelle boutique il parle.
  commerce   text references commerces(id),

  -- Ce qui ne va pas, nommé par l'objet et non par le mécanisme :
  -- « silence », « tension », « temperature », « disque », « itinerance »,
  -- « carte_retiree », « retard_synchro ». La liste n'est pas fermée par une
  -- contrainte : une alerte inconnue doit pouvoir REMONTER, quitte à
  -- s'afficher telle quelle. Une contrainte la ferait rejeter en silence par
  -- le robot, et le jour où une machine chauffe on préfère un libellé laid à
  -- un écran vide.
  genre      text not null,

  -- Trois niveaux, et la couleur de l'écran en découle. « grave » est réservé
  -- à ce qui fait perdre de l'argent ou détruit du matériel.
  gravite    text not null default 'attention'
               check (gravite in ('information', 'attention', 'grave')),

  -- Écrits pour quelqu'un qui n'est pas informaticien : « Le boîtier de
  -- Bafoussam ne parle plus depuis six heures », pas « heartbeat timeout ».
  titre      text not null,
  detail     text,

  ouverte_le timestamptz not null default now(),
  -- Quand un humain l'a regardée. Différent de « close_le » : voir n'est pas
  -- résoudre, et confondre les deux fait disparaître de l'écran des choses que
  -- personne n'a réparées.
  vue_le     timestamptz,

  -- Levée, et par qui. Rien ne s'efface : on date.
  close_le   timestamptz,
  close_par  bigint references personnes(id),
  close_motif text
);

comment on table alertes is
  'Ce qui va mal en ce moment sur la flotte. Une alerte reste ouverte tant '
  'que personne ne la lève ; c''est ce qui la distingue d''un message.';

-- Une seule alerte ouverte par boîtier et par genre. Sans cette règle, un
-- terminal qui bascule vingt fois en sous-tension pendant un délestage
-- produirait vingt lignes identiques, et l'écran des alertes deviendrait
-- illisible le jour exact où il sert le plus.
create unique index if not exists alertes_ouverte_unique
  on alertes (terminal, genre) where close_le is null;

create index if not exists alertes_ouvertes_idx
  on alertes (ouverte_le desc) where close_le is null;
create index if not exists alertes_commerce_idx on alertes (commerce);

-- --- Sécurité : fermée, comme les tables d'identité ------------------------
-- Aucune politique de lecture n'est posée, volontairement : sans politique,
-- une clé publique ne lit RIEN. Une alerte nomme un commerce et raconte ce qui
-- se passe chez lui ; c'est le bon défaut. La console lit avec la clé de
-- service, depuis le serveur, après « exigerPouvoir("administrer") ».
alter table alertes enable row level security;


-- ===========================================================================
-- ⟨ migration-journal.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « les versions, et qui a vu une alerte »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute les deux choses que la seconde moitié de la console réclame et que
-- la base ne savait pas dire : QUEL LOGICIEL la flotte est censée porter, et
-- QUI a regardé une alerte.
--
-- POURQUOI UN REGISTRE DES VERSIONS
-- « terminaux.version » dit ce qu'un boîtier porte. Elle ne dit pas ce qu'il
-- DEVRAIT porter, et surtout pas si ce qui lui manque est une correction de
-- confort ou un trou de sécurité. Sans cette table, un écran ne peut que
-- comparer les boîtiers entre eux — et conclure « tout le monde porte la même
-- chose » sur une flotte entière restée deux mois en arrière. Le retard ne se
-- déduit pas des retardataires : il se mesure à ce qui a été publié.
--
-- POURQUOI « ENVOYÉE » N'EST PAS « PUBLIÉE »
-- Une version part d'abord sur le boîtier d'essai, et n'atteint le Cameroun
-- que lorsqu'on le décide. Une version publiée hier ne rend donc PAS les sept
-- terminaux en retard : ils portent exactement ce qu'on leur a envoyé. Sans
-- cette distinction, l'écran crierait au retard tous les lundis matin, et au
-- bout de trois semaines plus personne ne le regarderait — c'est ainsi qu'une
-- surveillance meurt.
--
-- POURQUOI « QUI A VU »
-- « alertes » sait déjà qui a CLOS (« close_par ») et ne sait pas qui a VU.
-- Or ce sont deux gestes différents et c'est tout l'intérêt de la table : « je
-- l'ai vue » n'est pas « c'est réglé ». Un accusé de réception anonyme ne vaut
-- rien le jour où l'on demande pourquoi personne n'est allé voir : la ligne
-- dirait « quelqu'un ».
--
-- CE QUE CE FICHIER N'AJOUTE PAS, ET C'EST VOLONTAIRE
-- Aucune colonne « prise le » sur « terminaux » : le robot ne publie pas
-- l'heure à laquelle il a pris son logiciel. Une colonne que personne ne
-- remplit donne une date vide qui ressemble à une mesure, ce qui est pire que
-- rien — même règle que « sql/migration-console.sql ».
--
-- Aucune table de déploiements, aucun compte-rendu de vague. Tant qu'aucun
-- outil n'écrit ces lignes, elles n'existeraient qu'à l'écran.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée : une colonne ajoutée et une table
-- neuve. Rejouable.
--
-- CE QU'IL FAUT AVANT
-- « sql/migration-console.sql » (la table « alertes ») et
-- « sql/migration-identite.sql » (la table « personnes »).
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Le registre des versions ----------------------------------------------
create table if not exists versions (
  -- Le nom EXACT que le boîtier annonce dans « terminaux.version ». C'est la
  -- clé du rapprochement : une version écrite ici autrement que là-bas ne
  -- rapproche rien, et l'écran dira « logiciel inconnu du registre » — ce qui
  -- est la vérité, et vaut mieux qu'un « à jour » faux.
  version    text primary key,

  publiee_le timestamptz not null default now(),

  -- Le jour où on l'a envoyée à la flotte. Nul tant qu'elle n'est qu'à
  -- l'essai : une version qu'on essaie sur un seul boîtier ne met personne en
  -- retard.
  envoyee_le timestamptz,

  -- Ce qu'elle change, écrit pour quelqu'un qui n'est pas informaticien :
  -- « le nom commercial de la boutique apparaît sur les reçus », pas
  -- « feat(recus): trading name ».
  resume     text,

  -- Vraie quand cette version bouche un trou. Un boîtier resté en arrière
  -- n'est alors pas « en retard » : il est EXPOSÉ, et sa ligne ne se range
  -- plus avec les autres.
  correctif_securite boolean not null default false,

  -- Retirée : on ne l'envoie plus, on ne la compte plus comme attendue. Rien
  -- ne s'efface — une version retirée explique, six mois plus tard, pourquoi
  -- un boîtier porte ce qu'il porte.
  retiree_le timestamptz,
  retiree_motif text
);

comment on table versions is
  'Ce qui a été publié, et ce qui a été envoyé à la flotte. Sans elle, le '
  'retard d''un boîtier ne se mesure qu''aux autres boîtiers — et une flotte '
  'entière restée en arrière paraît à jour.';

comment on column versions.envoyee_le is
  'Nul tant que la version n''est qu''à l''essai. Une version publiée ne met '
  'personne en retard ; une version envoyée, oui.';

comment on column versions.correctif_securite is
  'Vraie quand la version bouche un trou. Le boîtier qui ne l''a pas reçue '
  'n''est pas en retard, il est exposé.';

-- La question posée à chaque ouverture de l'écran : « quelle est la dernière
-- version réellement envoyée à la flotte ? »
create index if not exists versions_envoyees_idx
  on versions (envoyee_le desc) where envoyee_le is not null and retiree_le is null;

-- --- Qui a vu une alerte ---------------------------------------------------
-- « close_par » existait, « vue_par » manquait. Les deux gestes sont
-- distincts : voir n'est pas résoudre, et un accusé de réception anonyme ne
-- répond pas à la seule question qui se pose ensuite — qui devait y aller.
alter table alertes add column if not exists vue_par bigint references personnes(id);

comment on column alertes.vue_par is
  'Qui a accusé réception. Distinct de « close_par » : « je l''ai vue » n''est '
  'pas « c''est réglé », et confondre les deux fait disparaître de l''écran '
  'des choses que personne n''a réparées.';

-- --- Sécurité : fermée, comme les autres -----------------------------------
-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. La console lit avec la clé de service, depuis le
-- serveur, après « exigerPouvoir("administrer") ».
alter table versions enable row level security;


-- ===========================================================================
-- ⟨ migration-plateforme.sql ⟩
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TOTEM — migration « l'accès à la plateforme »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui dit QUI a le droit d'entrer dans la console de la
-- plateforme — celle qui voit les sept boîtiers, les douze puces et les quatre
-- commerces à la fois.
--
-- POURQUOI UNE TABLE DE PLUS, ALORS QU'« acces » EXISTE DÉJÀ
-- « acces » attache une personne à UN commerce : sa colonne « commerce » est
-- « not null », et c'est juste — un rôle sans commerce ne veut rien dire pour
-- une propriétaire, une opératrice ou une lectrice. Le super-administrateur,
-- lui, n'a pas de commerce : il les regarde tous et n'en possède aucun. Écrire
-- son droit dans « acces » aurait demandé de rendre la colonne facultative,
-- c'est-à-dire d'ouvrir dans TOUTE l'application la possibilité d'un accès qui
-- ne nomme aucune boutique. Une seule ligne de code oubliée quelque part, et
-- une opératrice se retrouve avec un accès qui vaut partout.
--
-- Le droit de la plateforme vit donc ailleurs, dans sa propre table, avec sa
-- propre porte. C'est la même raison qui fait que le rôle « admin » ne porte
-- pas « sortir_argent » dans « web/lib/roles.ts » : la séparation est
-- structurelle, pas contractuelle.
--
-- CE QUE LA TABLE RACONTE, ET PAS SEULEMENT CE QU'ELLE AUTORISE
-- Une ligne suit une demande de bout en bout : quand elle a été faite, ce que
-- la personne a écrit pour la justifier, qui l'a accordée, qui l'a refusée,
-- qui l'a reprise et pourquoi. Un droit qui apparaît sans qu'on sache qui l'a
-- donné est exactement ce qu'on découvre trop tard.
--
-- RIEN NE S'EFFACE : ON DATE
-- « accorde_le », « refuse_le », « retire_le ». Une ligne retirée reste — c'est
-- elle qui explique, six mois plus tard, pourquoi quelqu'un a vu la flotte le
-- 3 mars.
--
-- LE PREMIER ADMINISTRATEUR, ET L'ŒUF QUI PRÉCÈDE LA POULE
-- Personne ne peut accorder le premier droit, puisqu'il n'y a encore personne
-- pour l'accorder. La variable d'environnement « TOTEM_ADMIN » porte l'adresse
-- du fondateur : la personne qui entre avec cette adresse-là est administratrice
-- de plein droit, et sa ligne s'écrit ici à sa première entrée. C'est le même
-- procédé que « TOTEM_PROPRIETAIRE » pour le commerçant fondateur, et il
-- disparaîtra le jour où un second administrateur existera.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée, aucune colonne n'est modifiée.
-- Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Qui a le droit d'être administrateur de la plateforme ------------------
create table if not exists acces_plateforme (
  id            bigint generated always as identity primary key,

  -- « on delete restrict » : supprimer une personne emporterait la trace de ce
  -- qu'elle a eu le droit de voir, et c'est précisément ce qu'un journal doit
  -- survivre à.
  personne      bigint not null references personnes(id) on delete restrict,

  -- La demande. Elle existe AVANT le droit : quelqu'un demande, quelqu'un
  -- accorde, et les deux moments sont datés séparément. Une table où le droit
  -- apparaît d'un coup ne sait pas dire qui l'a voulu.
  demande_le    timestamptz not null default now(),

  -- Ce que la personne a écrit pour justifier sa demande, dans ses mots. Court
  -- par nature ; il n'est lu que par celui qui accorde, et il vaut mieux que
  -- « nouvelle demande » — six mois plus tard, c'est la seule phrase qui
  -- explique pourquoi on a dit oui.
  demande_motif text,

  -- Accordé : la date, et par qui. Les deux ou aucun.
  accorde_le    timestamptz,
  accorde_par   bigint references personnes(id),

  -- Refusé. Un refus n'efface pas la demande : la même personne peut redemander
  -- plus tard, et celui qui décide doit voir qu'on a déjà dit non une fois.
  refuse_le     timestamptz,
  refuse_par    bigint references personnes(id),

  -- Repris. Le motif est écrit pour être relu par quelqu'un qui n'était pas là :
  -- « a quitté la société », pas « révocation ».
  retire_le     timestamptz,
  retire_par    bigint references personnes(id),
  retire_motif  text
);

-- Un seul dossier vivant par personne. Sans cet index, deux demandes en
-- attente pour la même personne se retrouvent dans la liste de celui qui
-- décide, il en accorde une, et l'autre reste ouverte pour toujours.
create unique index if not exists acces_plateforme_vivant_idx
  on acces_plateforme (personne)
  where retire_le is null and refuse_le is null;

-- La liste qu'on regarde : ce qui attend une décision. Elle doit rester rapide
-- même quand la table aura dix ans de dossiers refermés.
create index if not exists acces_plateforme_a_examiner_idx
  on acces_plateforme (demande_le)
  where accorde_le is null and refuse_le is null and retire_le is null;

create index if not exists acces_plateforme_accordes_idx
  on acces_plateforme (accorde_le desc)
  where accorde_le is not null and retire_le is null;

comment on table acces_plateforme is
  'Qui a le droit d''entrer dans la console de la plateforme. Séparée de '
  '« acces », qui attache toujours un rôle à UN commerce : un administrateur '
  'de plateforme n''en possède aucun, il les regarde tous.';

comment on column acces_plateforme.demande_motif is
  'Ce que la personne a écrit pour demander, dans ses mots. C''est la seule '
  'phrase qui explique, plus tard, pourquoi on a dit oui.';

comment on column acces_plateforme.retire_motif is
  'Écrit pour quelqu''un qui n''était pas là : « a quitté la société », pas '
  '« révocation ».';

alter table acces_plateforme enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. Cette table dit qui peut tout voir — c'est la dernière
-- que l'on ouvrirait. La console la lit avec la clé de service, depuis le
-- serveur, après « exigerPouvoir("administrer") ».


-- ===========================================================================
-- C'EST FINI.
--
-- Relancez ce fichier une seconde fois : aucune erreur ne doit apparaître.
-- Ensuite, posez les variables d'environnement — elles sont listées dans
-- « docs/CLOUD.md », et sans elles le site répond 503 en nommant celle qui
-- manque.
-- ===========================================================================
