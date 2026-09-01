-- ---------------------------------------------------------------------------
-- TOTEM — migration du 1er septembre 2026 : la console de la plateforme
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service.
--
-- LE SCRIPT EST REJOUABLE. Le relancer ne casse rien, ne duplique rien et ne
-- perd rien. En cas de doute, relancez.
--
-- IL SE VÉRIFIE LUI-MÊME. Chaque section finit par un bloc qui ESSAIE la
-- chose interdite et exige un refus. « L'index est créé » ne dit rien de ce
-- qu'il fait.
--
-- CE QU'ELLE APPORTE :
--
--   1. LE LIEU ET LE RETRAIT D'UN BOÎTIER. « Douala · Akwa » se lit sur
--      l'écran de la flotte, et un terminal sorti du service se date au lieu
--      de s'effacer.
--   2. LES ALERTES. Ce qui va mal, avec ses trois heures — ouverte, vue,
--      close — et une règle que la base fait respecter : une seule alerte
--      ouverte par (terminal, genre). Une nuit de délestage sans cette règle,
--      c'est vingt lignes identiques au matin.
--   3. LE REGISTRE DES VERSIONS. Sans lui, l'écran des versions ne peut
--      comparer les boîtiers qu'entre eux — et une flotte entière en retard
--      a l'air à jour.
--
-- NB : `sql/schema.sql` reste le script COMPLET et rejouable de la base ; il
-- contient déjà ces blocs. Ce fichier-ci est le chemin COURT pour une base
-- déjà en service.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. LE LIEU ET LE RETRAIT D'UN BOÎTIER
-- ===========================================================================

alter table terminaux add column if not exists lieu         text;
alter table terminaux add column if not exists retire_le    timestamptz;
alter table terminaux add column if not exists retire_motif text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'terminaux' and column_name = 'retire_le'
  ) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : terminaux.retire_le n''existe pas.';
  end if;
end $$;


-- ===========================================================================
-- 2. LES ALERTES
-- ===========================================================================
--
-- « Vue » n'est pas « close » : le premier regard laisse la ligne à l'écran,
-- la clôture la fait descendre. Fondre les deux ferait disparaître des
-- choses que personne n'a réparées. Rien ne s'efface : on date.

create table if not exists alertes (
  id          bigint generated always as identity primary key,
  terminal    text references terminaux(id) on delete cascade,
  genre       text not null,
  gravite     text not null default 'attention'
              check (gravite in ('information', 'attention', 'grave')),
  titre       text not null,
  detail      text,
  ouverte_le  timestamptz not null default now(),
  vue_le      timestamptz,
  vue_par     bigint references utilisateurs(id) on delete set null,
  close_le    timestamptz,
  close_par   bigint references utilisateurs(id) on delete set null,
  close_motif text
);

comment on table alertes is
  'Ce qui va mal sur la flotte, et ce qu''on en a fait. Rien ne s''efface : '
  'une alerte close garde ses trois heures — ouverte, vue, close.';

-- « create table if not exists » ne vérifie que le NOM d'une table, jamais sa
-- FORME (la leçon de la migration du 31 août) : on rattrape les colonnes une
-- à une, au cas où une table homonyme vivrait déjà là.
alter table alertes add column if not exists vue_par     bigint;
alter table alertes add column if not exists close_par   bigint;
alter table alertes add column if not exists close_motif text;

create unique index if not exists alertes_ouverte_unique
  on alertes (terminal, genre) where close_le is null;

create index if not exists alertes_ouvertes_idx
  on alertes (ouverte_le desc) where close_le is null;

alter table alertes enable row level security;

-- LA VÉRIFICATION : deux alertes ouvertes du même genre sur le même boîtier
-- doivent être refusées ; en clore une doit rouvrir le droit.
do $$
declare
  boitier text;
  invente boolean := false;
begin
  select id into boitier from terminaux limit 1;
  if boitier is null then
    insert into terminaux (id, nom) values ('verification-console', 'essai')
      on conflict (id) do nothing;
    boitier := 'verification-console';
    invente := true;
  end if;

  -- Nettoyer les restes d'une exécution précédente de CE bloc.
  delete from alertes where terminal = boitier and genre = 'verification-migration';

  insert into alertes (terminal, genre, gravite, titre)
    values (boitier, 'verification-migration', 'information', 'essai un');
  begin
    insert into alertes (terminal, genre, gravite, titre)
      values (boitier, 'verification-migration', 'information', 'essai deux');
    raise exception
      'VÉRIFICATION ÉCHOUÉE : deux alertes ouvertes du même genre sur le même boîtier.';
  exception
    when unique_violation then null;  -- le refus attendu
  end;

  update alertes set close_le = now()
    where terminal = boitier and genre = 'verification-migration';
  insert into alertes (terminal, genre, gravite, titre)
    values (boitier, 'verification-migration', 'information', 'essai trois');

  -- Le ménage : ces lignes d'essai n'ont rien à faire dans un registre réel.
  delete from alertes where terminal = boitier and genre = 'verification-migration';
  if invente then
    delete from terminaux where id = 'verification-console';
  end if;
end $$;


-- ===========================================================================
-- 3. LE REGISTRE DES VERSIONS
-- ===========================================================================
--
-- « Publiée » n'est pas « envoyée » : une version à l'essai (« envoyee_le »
-- nul) ne met aucun boîtier en retard.

create table if not exists versions (
  version            text primary key,
  publiee_le         timestamptz not null default now(),
  envoyee_le         timestamptz,
  resume             text,
  correctif_securite boolean not null default false,
  retiree_le         timestamptz,
  retiree_motif      text
);

comment on table versions is
  'Le registre du logiciel du terminal. « envoyee_le » nul = à l''essai : '
  'elle ne met aucun boîtier en retard.';

alter table versions add column if not exists correctif_securite boolean not null default false;
alter table versions add column if not exists retiree_le    timestamptz;
alter table versions add column if not exists retiree_motif text;

create index if not exists versions_envoyees_idx
  on versions (envoyee_le) where envoyee_le is not null;

alter table versions enable row level security;

-- LA VÉRIFICATION : les deux tables neuves refusent la clé publique.
-- « Row level security » active et zéro politique = seul le serveur passe.
do $$
begin
  if not exists (
    select 1 from pg_tables
    where tablename = 'alertes' and rowsecurity
  ) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : alertes ne porte pas la règle par ligne.';
  end if;
  if not exists (
    select 1 from pg_tables
    where tablename = 'versions' and rowsecurity
  ) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : versions ne porte pas la règle par ligne.';
  end if;
end $$;
