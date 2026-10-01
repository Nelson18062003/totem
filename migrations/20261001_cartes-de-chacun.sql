-- ---------------------------------------------------------------------------
-- TOTEM — migration du 1er octobre 2026 : les cartes de chacun
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service.
--
-- LE SCRIPT EST REJOUABLE. Le relancer ne casse rien, ne duplique rien et ne
-- perd rien. En cas de doute, relancez.
--
-- IL SE VÉRIFIE LUI-MÊME. Le bloc final ESSAIE la chose interdite et exige
-- un refus.
--
-- CE QU'ELLE APPORTE :
--
--   1. LES CARTES DE CHACUN. Le propriétaire attribue une ou plusieurs SIM
--      à une personne ; cette personne ne voit plus QUE celles-là. Avant,
--      un compte créé voyait tout — chaque carte, chaque SMS, chaque montant.
--   2. LE PRÉNOM ET LE NOM d'un compte, saisis par le propriétaire quand il
--      le crée : « vendeur2@gmail.com » ne dit pas qui c'est.
--
-- Elle ne touche à AUCUN mot de passe : chacun entre comme avant.
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
-- 2. LE PRÉNOM ET LE NOM
-- ===========================================================================
--
-- Facultatifs en base : les comptes d'avant n'en ont pas, et le tout premier
-- compte (celui du propriétaire) se crée sans. C'est l'écran du propriétaire
-- qui les exige quand il crée quelqu'un.

alter table utilisateurs add column if not exists prenom text;
alter table utilisateurs add column if not exists nom    text;


-- ===========================================================================
-- LA VÉRIFICATION
-- ===========================================================================
do $$
declare
  essai bigint;
begin
  -- Un compte d'essai, effacé en partant.
  delete from utilisateurs where courriel = 'verification-20261001@essai.invalid';
  insert into utilisateurs (courriel, empreinte, role, approuve, prenom, nom)
    values ('verification-20261001@essai.invalid', 'x', 'invite', true, 'Essai', 'Vérification')
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

  -- Effacer le compte efface ses cartes.
  delete from utilisateurs where id = essai;
  if exists (select 1 from attributions where utilisateur = essai) then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un compte effacé a laissé ses cartes.';
  end if;
end $$;
