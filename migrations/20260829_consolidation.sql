-- ---------------------------------------------------------------------------
-- TOTEM — migration consolidée du 29 août 2026
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service.
--
-- LE SCRIPT EST REJOUABLE. Le relancer ne casse rien, ne duplique rien et ne
-- perd rien : chaque création est gardée par un « if not exists », et les
-- règles d'accès se réécrivent à l'identique. En cas de doute, relancez —
-- c'est sans risque, et c'est plus sûr que de se demander si c'est passé.
--
-- CE QU'ELLE APPORTE — deux tables, pour deux chantiers :
--
--   1. « appareils »    les téléphones à qui le robot fait sonner une
--                       notification quand de l'argent arrive ;
--   2. « utilisateurs » les comptes qui ouvrent la plateforme : un courriel,
--                       un mot de passe, une porte par personne.
--
-- Rien n'est supprimé, aucune colonne existante n'est touchée, aucune donnée
-- n'est déplacée. Les tables du robot (paiements, cartes, comptes…) sont
-- exactement dans l'état où elles étaient.
--
-- NB : `sql/schema.sql` reste le script COMPLET et rejouable de la base ; il
-- contient déjà ces deux blocs. Ce fichier-ci est le chemin COURT pour une
-- base déjà en service, sans rien rejouer d'autre.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. LES APPAREILS — à qui faire sonner
-- ===========================================================================
--
-- Le robot de Douala envoie lui-même les notifications (voir
-- `totem/notification.py`), plutôt qu'une fonction posée dans le nuage. La
-- raison qui tranche : le robot est le SEUL à savoir ce qu'il n'a PAS
-- compris. `analyse_sms` rend `None` dans le doute, et cette ignorance est la
-- matière première d'une notification honnête — une fonction du nuage ne
-- verrait que la ligne écrite en base, sans savoir ce qui s'est perdu.
--
-- Il lui faut donc savoir À QUI téléphoner : c'est cette table. Les appareils
-- s'y inscrivent en passant par la plateforme (`/api/appareil`, derrière le
-- verrou), jamais en écrivant ici directement — le téléphone n'a aucune clé.
--
-- CE QU'ON Y RANGE, ET CE QU'ON N'Y RANGE PAS. Le jeton d'Expo identifie un
-- APPAREIL, pas une personne. Il ne dit rien du propriétaire, ne permet pas
-- de le localiser, et n'ouvre l'accès à rien : il autorise seulement à faire
-- sonner ce téléphone-là. S'il fuitait, le pire serait une notification
-- indésirable — jamais un accès aux comptes.

create table if not exists appareils (
  -- Le jeton rendu par Expo : « ExpoPushToken[xxxxxxxx] ». C'est LUI la clé —
  -- réinstaller l'application en donne un neuf, et l'ancien s'éteint tout
  -- seul chez Expo. Pas d'identifiant à nous : ce serait un numéro de plus à
  -- garder sans rien apporter.
  jeton       text primary key,

  -- « android » ou « ios ». Utile le jour où une notification devra se
  -- formuler différemment selon le système.
  plateforme  text,

  -- De quoi reconnaître l'appareil dans une liste (« Pixel 8 »), quand il
  -- faudra en retirer un. Jamais un identifiant matériel : le modèle suffit.
  nom         text,

  -- Dernière fois que l'application s'est signalée. Un appareil qui ne
  -- reparaît plus a été perdu, vendu ou désinstallé : on pourra le retirer
  -- sans se demander lequel c'était.
  vu_le       timestamptz not null default now(),
  cree_le     timestamptz not null default now()
);

comment on table appareils is
  'Les téléphones à qui le robot fait sonner une notification. Le jeton '
  'identifie un appareil, jamais une personne, et n''ouvre l''accès à rien.';

-- Le robot lit « les appareils encore vivants » : un index sur la date rend
-- cette lecture immédiate même avec des années d'appareils oubliés.
create index if not exists appareils_vu_le on appareils (vu_le desc);


-- ===========================================================================
-- 2. LES UTILISATEURS — qui peut ouvrir la plateforme
-- ===========================================================================
--
-- Jusqu'ici, la plateforme avait UN mot de passe, rangé dans une variable
-- d'environnement. Cela marche pour une personne seule, et ne sait rien faire
-- d'autre : ni dire qui s'est connecté, ni ouvrir à quelqu'un sans lui donner
-- la clé de la maison, ni la lui retirer sans la changer pour tout le monde.
--
-- LE PREMIER COMPTE CRÉÉ EST CELUI DU PROPRIÉTAIRE, et il entre tout de
-- suite : personne n'est là pour l'approuver, et c'est celui qui installe la
-- plateforme. Tous les suivants sont créés et ATTENDENT son accord.
--
-- CE QUI N'EST PAS ENCORE CONSTRUIT : rattacher une carte SIM à une personne
-- (« l'administrateur te donne les comptes qui sont à toi »). Tant que ça ne
-- l'est pas, un compte approuvé voit TOUT ce que voit le propriétaire. C'est
-- pour cela que l'approbation compte. Voir `docs/COMPTES.md`.

create table if not exists utilisateurs (
  id          bigint generated always as identity primary key,

  -- Rangé en MINUSCULES, sans espaces : « Nelson@X.com » et « nelson@x.com »
  -- sont la même personne, et deux lignes en feraient deux comptes qu'on
  -- croirait un seul. La plateforme normalise avant d'écrire.
  courriel    text not null unique,

  -- L'EMPREINTE du mot de passe — jamais le mot de passe.
  -- « pbkdf2$sha256$210000$<sel>$<empreinte> » : la méthode, le nombre de
  -- tours et le sel voyagent avec elle, si bien qu'une empreinte se vérifie
  -- sans rien connaître d'autre qu'elle-même. Une base restaurée d'il y a
  -- trois ans se relit telle quelle. Voir `web/lib/motdepasse.ts`.
  empreinte   text not null,

  -- « proprietaire » ou « invite ».
  role        text not null default 'invite',

  -- Un compte non approuvé est créé mais n'ouvre RIEN. C'est le propriétaire
  -- qui approuve, depuis Réglages → « Qui peut se connecter ».
  approuve    boolean not null default false,

  cree_le     timestamptz not null default now(),
  -- Dernière connexion réussie. De quoi repérer un compte oublié.
  vu_le       timestamptz
);

comment on table utilisateurs is
  'Les comptes qui ouvrent la plateforme. Le mot de passe n''y est jamais : '
  'seulement son empreinte PBKDF2, qui ne se remonte pas.';

-- La connexion cherche par courriel, à chaque tentative.
create index if not exists utilisateurs_courriel on utilisateurs (lower(courriel));


-- ===========================================================================
-- 3. LES RÈGLES D'ACCÈS
-- ===========================================================================
--
-- Ces deux tables sont VERROUILLÉES, et plus fermement que les autres.
--
-- Ailleurs dans le schéma, une politique « lecture connectée » laisse un
-- navigateur authentifié lire les paiements, les cartes, les reçus. Ici,
-- AUCUNE POLITIQUE N'EST CRÉÉE — et sans politique, personne ne passe :
--
--   · la liste des téléphones à faire sonner n'intéresse aucun écran ;
--   · une table d'empreintes de mots de passe n'a rien à faire à portée d'un
--     navigateur, fût-il connecté.
--
-- Seules la plateforme (côté serveur) et le robot y touchent, avec la clé de
-- service — qui contourne ces règles par nature. C'est aussi pourquoi cette
-- clé ne doit jamais quitter Vercel ni le Pi.
--
-- « enable row level security » est idempotent : le rejouer ne fait rien.

alter table appareils    enable row level security;
alter table utilisateurs enable row level security;
