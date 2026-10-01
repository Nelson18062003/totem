-- ---------------------------------------------------------------------------
-- TOTEM — migration du 1er octobre 2026 : l'entrée par code, et les cartes
-- de chacun
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service.
--
-- LE SCRIPT EST REJOUABLE. Le relancer ne casse rien, ne duplique rien et ne
-- perd rien. En cas de doute, relancez.
--
-- IL SE VÉRIFIE LUI-MÊME. Chaque section finit par un bloc qui ESSAIE la
-- chose interdite et exige un refus.
--
-- CE QU'ELLE APPORTE :
--
--   1. LES CARTES DE CHACUN. Le propriétaire attribue une ou plusieurs SIM
--      à une personne ; cette personne ne voit plus QUE celles-là. Avant,
--      un compte créé voyait tout — chaque carte, chaque SMS, chaque montant.
--   2. L'ENTRÉE PAR CODE. Plus de mot de passe : on donne son courriel, on
--      reçoit un code à six chiffres, on le tape. Le code vaut dix minutes,
--      sert UNE fois, et se refuse après cinq essais faux.
--   3. LES EMPREINTES DE MOT DE PASSE S'EN VONT. Ce qui n'est plus gardé ne
--      peut plus fuir.
--
-- NB : `sql/schema.sql` reste le script COMPLET et rejouable de la base ; il
-- contient déjà ces blocs. Ce fichier-ci est le chemin COURT pour une base
-- déjà en service.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. LES CARTES DE CHACUN
-- ===========================================================================
--
-- Une ligne = « cette personne voit cette carte ». Une carte peut être
-- confiée à plusieurs personnes (deux vendeurs sur la même caisse), une
-- personne peut tenir plusieurs cartes.
--
-- La carte est désignée par son ICCID — le seul nom d'une puce qui ne change
-- jamais — et pas par la ligne de « cartes » : une puce changée de boîtier a
-- deux lignes là-bas, et reste la même caisse pour la personne qui la tient.
--
-- Le propriétaire n'a pas besoin de ligne ici : il voit tout, toujours.
-- Supprimer un compte efface ses attributions avec lui (« on delete
-- cascade ») : une attribution orpheline rouvrirait un jour la carte à
-- quelqu'un qui reprendrait le même numéro de compte.

create table if not exists attributions (
  utilisateur  bigint not null references utilisateurs(id) on delete cascade,
  iccid        text not null,
  attribuee_le timestamptz not null default now(),
  primary key (utilisateur, iccid)
);

alter table attributions add column if not exists attribuee_le timestamptz
  not null default now();

-- La forme d'un ICCID, rien d'autre : la plateforme le recopie dans ses
-- requêtes, et la base est le dernier endroit où l'on peut l'exiger.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attributions_iccid_forme') then
    alter table attributions add constraint attributions_iccid_forme
      check (iccid ~ '^[A-Za-z0-9]{1,32}$');
  end if;
end $$;

create index if not exists attributions_iccid on attributions (iccid);

comment on table attributions is
  'Quelle personne voit quelle carte SIM. Le propriétaire voit tout et n''a '
  'pas de ligne ici ; un invité sans ligne ne voit rien.';

alter table attributions enable row level security;


-- ===========================================================================
-- 2. L'ENTRÉE PAR CODE
-- ===========================================================================
--
-- UNE ligne par compte, au plus : demander un nouveau code remplace l'ancien.
-- Le code lui-même n'est JAMAIS rangé — seulement son empreinte, calculée par
-- la plateforme avec son secret de signature. Une base volée ne donne donc
-- aucun code utilisable, même valide.

create table if not exists codes_de_connexion (
  utilisateur bigint primary key references utilisateurs(id) on delete cascade,
  empreinte   text not null,
  expire_le   timestamptz not null,
  essais      integer not null default 0,
  emis_le     timestamptz not null default now()
);

alter table codes_de_connexion add column if not exists essais  integer not null default 0;
alter table codes_de_connexion add column if not exists emis_le timestamptz not null default now();

comment on table codes_de_connexion is
  'Le code d''entrée en cours de chaque compte — son empreinte, jamais le '
  'code. Une seule ligne par compte, effacée dès que le code a servi.';

alter table codes_de_connexion enable row level security;

-- POSER UN CODE. Rend « true » si le code est posé, NULL sinon.
--
-- Un nouveau code ne remplace l'ancien que si celui-ci a plus de `delai_s`
-- secondes : sans cette borne, n'importe qui pourrait, en boucle, remplir la
-- boîte de quelqu'un — et, à chaque nouveau code, remettre à zéro le compte
-- des essais faux. La condition vit DANS l'écriture : lire puis écrire
-- laisserait passer une rafale (la leçon du frein).
create or replace function poser_un_code(
  le_compte bigint, l_empreinte text, duree_s integer, delai_s integer)
returns boolean
language sql
set search_path = public
as $$
  insert into public.codes_de_connexion (utilisateur, empreinte, expire_le, essais, emis_le)
  values (le_compte, l_empreinte, now() + make_interval(secs => duree_s), 0, now())
  on conflict (utilisateur) do update
    set empreinte = excluded.empreinte,
        expire_le = excluded.expire_le,
        essais    = 0,
        emis_le   = now()
    where codes_de_connexion.emis_le <= now() - make_interval(secs => delai_s)
  returning true;
$$;

-- ESSAYER UN CODE. Rend « true » une fois, et une seule.
--
-- Tout se joue sur UNE ligne verrouillée : l'essai est COMPTÉ avant d'être
-- jugé, si bien que cinquante essais lancés ensemble ne lisent pas tous
-- « zéro essai » ; et le bon code EFFACE la ligne sous le même verrou, si
-- bien que deux entrées simultanées avec le même code n'ouvrent qu'une porte.
create or replace function essayer_un_code(
  le_compte bigint, l_empreinte text, max_essais integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  attendue text;
begin
  update public.codes_de_connexion
     set essais = essais + 1
   where utilisateur = le_compte
     and expire_le > now()
     and essais < max_essais
  returning empreinte into attendue;

  if attendue is null then
    return false;
  end if;
  if attendue = l_empreinte then
    delete from public.codes_de_connexion where utilisateur = le_compte;
    return true;
  end if;
  return false;
end $$;


-- ===========================================================================
-- 3. LES EMPREINTES DE MOT DE PASSE S'EN VONT
-- ===========================================================================
--
-- On n'entre plus par mot de passe : l'empreinte n'a plus d'usage, et une
-- empreinte gardée sans usage est une chose de plus à voler. Le compte reste,
-- son courriel reste, ses cartes restent — il entrera par code.
--
-- (La clé de secours, elle, ne vit pas en base : elle reste dans les
-- variables d'environnement de l'hébergeur, et ouvre toujours.)

alter table utilisateurs alter column empreinte drop not null;
update utilisateurs set empreinte = null where empreinte is not null;


-- ===========================================================================
-- LA VÉRIFICATION
-- ===========================================================================
do $$
declare
  essai bigint;
  posee boolean;
  rendu boolean;
  restants integer;
begin
  -- Un compte d'essai, effacé en partant.
  delete from utilisateurs where courriel = 'verification-20261001@essai.invalid';
  insert into utilisateurs (courriel, role, approuve)
    values ('verification-20261001@essai.invalid', 'invite', true)
    returning id into essai;

  -- Une attribution d'une forme impossible est refusée.
  begin
    insert into attributions (utilisateur, iccid) values (essai, '89/../x');
    raise exception 'VÉRIFICATION ÉCHOUÉE : un ICCID mal formé a été accepté.';
  exception when check_violation then null;
  end;

  -- La même carte deux fois pour la même personne : refusée.
  insert into attributions (utilisateur, iccid) values (essai, '89237010000000008901');
  begin
    insert into attributions (utilisateur, iccid) values (essai, '89237010000000008901');
    raise exception 'VÉRIFICATION ÉCHOUÉE : une carte attribuée deux fois à la même personne.';
  exception when unique_violation then null;
  end;

  -- Un code posé ; un second, aussitôt, ne le remplace pas.
  select poser_un_code(essai, 'empreinte-un', 600, 60) into posee;
  if posee is not true then
    raise exception 'VÉRIFICATION ÉCHOUÉE : le premier code n''a pas été posé.';
  end if;
  select poser_un_code(essai, 'empreinte-deux', 600, 60) into posee;
  if posee is not null then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un second code a remplacé le premier aussitôt.';
  end if;

  -- Un code faux est refusé, et compté.
  if essayer_un_code(essai, 'empreinte-deux', 5) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un code faux a ouvert.';
  end if;
  select essais into restants from codes_de_connexion where utilisateur = essai;
  if restants <> 1 then
    raise exception 'VÉRIFICATION ÉCHOUÉE : l''essai faux n''a pas été compté.';
  end if;

  -- Le bon code ouvre UNE fois.
  if not essayer_un_code(essai, 'empreinte-un', 5) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : le bon code n''a pas ouvert.';
  end if;
  if essayer_un_code(essai, 'empreinte-un', 5) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : le même code a ouvert deux fois.';
  end if;

  -- Un code épuisé ne s'ouvre plus, même juste.
  update codes_de_connexion set emis_le = now() - interval '1 hour' where utilisateur = essai;
  perform poser_un_code(essai, 'empreinte-trois', 600, 60);
  update codes_de_connexion set essais = 5 where utilisateur = essai;
  select essayer_un_code(essai, 'empreinte-trois', 5) into rendu;
  if rendu then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un code épuisé a encore ouvert.';
  end if;

  -- Un code expiré ne s'ouvre plus, même juste.
  update codes_de_connexion set essais = 0, expire_le = now() - interval '1 second'
   where utilisateur = essai;
  if essayer_un_code(essai, 'empreinte-trois', 5) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un code expiré a encore ouvert.';
  end if;

  -- Effacer le compte efface ses cartes et son code.
  delete from utilisateurs where id = essai;
  if exists (select 1 from attributions where utilisateur = essai)
     or exists (select 1 from codes_de_connexion where utilisateur = essai) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un compte effacé a laissé ses cartes ou son code.';
  end if;

  if exists (select 1 from utilisateurs where empreinte is not null) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : une empreinte de mot de passe est restée en base.';
  end if;
end $$;
