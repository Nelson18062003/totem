-- Les comptes qui ouvrent la plateforme.
--
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script est REJOUABLE : le relancer ne casse rien et ne perd rien.
--
-- CE QUI CHANGE. Jusqu'ici, la plateforme avait UN mot de passe, rangé dans
-- une variable d'environnement sur Vercel. Cela marche pour une personne
-- seule, mais cela ne sait rien faire d'autre : impossible de savoir qui
-- s'est connecté, impossible d'ouvrir à quelqu'un sans lui donner la clé de
-- la maison, impossible de la lui retirer sans la changer pour tout le monde.
--
-- Des comptes règlent les trois d'un coup.
--
-- CE QUI N'EST PAS ICI. Le rattachement d'une carte SIM à une personne
-- (« l'administrateur te donne les comptes qui sont à toi ») n'existe pas
-- encore. En attendant, un compte qui n'est pas celui du propriétaire
-- n'entre pas : il est créé, il attend, et le propriétaire l'approuve. Mieux
-- vaut une porte fermée qu'une porte qui laisse tout voir à tout le monde.

create table if not exists utilisateurs (
  id          bigint generated always as identity primary key,

  -- Rangé en MINUSCULES, sans espaces : « Nelson@X.com » et « nelson@x.com »
  -- sont la même personne, et deux lignes pour une personne seraient deux
  -- comptes qu'on croirait un seul.
  courriel    text not null unique,

  -- L'empreinte du mot de passe, jamais le mot de passe.
  -- « pbkdf2$sha256$210000$<sel>$<empreinte> » — tout s'y trouve, y compris
  -- le nombre de tours, pour qu'une empreinte se vérifie sans rien connaître
  -- d'autre qu'elle-même. Voir web/lib/motdepasse.ts.
  empreinte   text not null,

  -- « proprietaire » ou « invite ». Le PREMIER compte créé est le
  -- propriétaire : il n'y a personne pour l'approuver, et c'est celui qui
  -- installe la plateforme.
  role        text not null default 'invite',

  -- Un compte non approuvé est créé mais n'ouvre rien. C'est le
  -- propriétaire qui approuve, depuis les Réglages.
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

-- --------------------------------------------------------------------------
-- Les règles d'accès. Comme pour « appareils » : AUCUNE politique, donc
-- personne ne passe. Seule la plateforme y touche, côté serveur, avec la clé
-- de service. Une table d'empreintes de mots de passe n'a rien à faire à
-- portée d'un navigateur, fût-il connecté.
-- --------------------------------------------------------------------------

alter table utilisateurs enable row level security;
