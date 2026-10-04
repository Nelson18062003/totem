-- ===========================================================================
-- 4 OCTOBRE 2026 — TOTEM S'OUVRE À TOUT LE MONDE
-- ===========================================================================
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Une seule fois suffit ; rejouable sans risque : chaque instruction vérifie
-- ce qui est déjà en place (colonnes « if not exists », règles posées
-- seulement si elles manquent).
--
-- CE QUI CHANGE. TOTEM devient une application grand public, publiée sur
-- l'App Store et le Play Store : n'importe qui la télécharge, crée son
-- compte, et entre aussitôt. Ses cartes lui sont ensuite attribuées par
-- TOTEM ; tant qu'il n'en a aucune, il ne voit RIEN de ce qui est en base.
--
-- Le compte demande désormais : prénom, nom, adresse, courriel, téléphone,
-- mot de passe. Le prénom et le nom existent déjà (migration du 1er
-- octobre) ; cette migration ajoute l'ADRESSE et le TÉLÉPHONE, et pose des
-- bornes que la base fait respecter elle-même — une plateforme ouverte au
-- monde entier reçoit tôt ou tard ce que l'écran n'a pas prévu.
--
-- CE QUI NE CHANGE PAS, ET C'EST VOULU :
--   · il n'y a toujours qu'UN propriétaire (index
--     « utilisateurs_un_seul_proprietaire ») : une inscription publique ne
--     peut pas en fabriquer un second, même en courant plus vite qu'une
--     autre ;
--   · le propriétaire ne s'efface pas (déclencheur « un_proprietaire_reste ») ;
--   · effacer un compte efface ses cartes et ses téléphones avec lui
--     (« on delete cascade » sur « attributions » et « appareils ») — c'est
--     ce qui rend la suppression de son compte depuis l'application
--     complète, comme Apple l'exige.
--
-- Aucun compte existant n'est modifié. Les colonnes neuves sont vides pour
-- les comptes d'avant, et le restent.

-- ===========================================================================
-- 1. L'ADRESSE ET LE TÉLÉPHONE
-- ===========================================================================
--
-- Facultatifs EN BASE : les comptes d'avant n'en ont pas, et le propriétaire
-- qui crée un compte pour quelqu'un ne les connaît pas forcément. C'est la
-- plateforme qui les exige à l'inscription publique.

alter table utilisateurs add column if not exists prenom    text;
alter table utilisateurs add column if not exists nom       text;
alter table utilisateurs add column if not exists adresse   text;
alter table utilisateurs add column if not exists telephone text;

-- ===========================================================================
-- 2. DES BORNES QUE LA BASE TIENT ELLE-MÊME
-- ===========================================================================
--
-- La plateforme borne déjà chaque champ. La base le refait : une règle qui
-- ne vit que dans le code tient jusqu'au jour où un autre chemin écrit dans
-- la table.
--
--   · le téléphone : un « + » facultatif, puis 6 à 15 chiffres — la longueur
--     maximale d'un numéro international (norme E.164). Rien d'autre : ni
--     espace, ni tiret, ni lettre. La plateforme le range sous cette forme ;
--   · l'adresse : pas vide, et pas un roman (200 caractères) ;
--   · le prénom et le nom : 80 caractères au plus (la plateforme coupe à 60).

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'utilisateurs_telephone_forme') then
    alter table utilisateurs add constraint utilisateurs_telephone_forme
      check (telephone is null or telephone ~ '^\+?[0-9]{6,15}$');
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'utilisateurs_adresse_forme') then
    alter table utilisateurs add constraint utilisateurs_adresse_forme
      check (adresse is null
             or (char_length(btrim(adresse)) between 1 and 200));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'utilisateurs_nom_forme') then
    alter table utilisateurs add constraint utilisateurs_nom_forme
      check ((prenom is null or char_length(prenom) <= 80)
             and (nom is null or char_length(nom) <= 80));
  end if;
end $$;

-- ===========================================================================
-- LA VÉRIFICATION — elle ESSAIE ce qui est interdit, et exige un refus.
-- ===========================================================================
do $$
declare
  essai bigint;
begin
  delete from utilisateurs where courriel = 'verification-20261004@essai.invalid';

  -- Une inscription publique ordinaire passe.
  insert into utilisateurs (courriel, empreinte, role, approuve,
                            prenom, nom, adresse, telephone)
    values ('verification-20261004@essai.invalid', 'x', 'invite', true,
            'Essai', 'Vérification', 'Rue de l''Essai, Douala', '+237677123456')
    returning id into essai;

  -- Un téléphone qui n'en est pas un : refusé.
  begin
    update utilisateurs set telephone = '677 12 34 56' where id = essai;
    raise exception 'VÉRIFICATION ÉCHOUÉE : un téléphone avec des espaces a été accepté.';
  exception when check_violation then null;
  end;

  -- Une adresse vide : refusée.
  begin
    update utilisateurs set adresse = '   ' where id = essai;
    raise exception 'VÉRIFICATION ÉCHOUÉE : une adresse vide a été acceptée.';
  exception when check_violation then null;
  end;

  -- Une inscription ne fabrique pas un second propriétaire — s'il y en a
  -- déjà un. (Sur une base neuve, le premier compte EST le propriétaire.)
  if exists (select 1 from utilisateurs where role = 'proprietaire') then
    begin
      update utilisateurs set role = 'proprietaire' where id = essai;
      raise exception 'VÉRIFICATION ÉCHOUÉE : un second propriétaire a été accepté.';
    exception when unique_violation then null;
    end;
  end if;

  delete from utilisateurs where id = essai;
end $$;
