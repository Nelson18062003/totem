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
