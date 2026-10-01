-- ===========================================================================
-- 2 OCTOBRE 2026 — UNE CARTE CONFIÉE EST UNE CARTE DONNÉE
-- ===========================================================================
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Rejouable : chaque instruction vérifie ce qui est déjà en place.
--
-- Celui à qui le propriétaire confie une carte y travaille désormais comme
-- sur la sienne : il compose, il établit les reçus, il la renomme. Il doit
-- donc aussi ENTENDRE ses SMS — son téléphone sonne quand l'argent arrive
-- sur SA carte, et sur aucune autre.
--
-- La table des téléphones ne disait pas à qui était chacun : le robot les
-- faisait tous sonner pour chaque SMS. Elle le dit maintenant.
--
-- Rien n'est effacé, aucun mot de passe n'est touché. Les téléphones déjà
-- inscrits restent ceux du propriétaire (colonne vide).

-- ===========================================================================
-- 1. À QUI SONNE CHAQUE TÉLÉPHONE
-- ===========================================================================
--
-- Vide : au propriétaire (inscrit avant les comptes, ou par la clé de
-- secours). Un numéro : à ce compte, qui ne reçoit que les SMS des cartes
-- qu'on lui a confiées. Effacer le compte efface ses téléphones — un compte
-- supprimé ne doit plus rien entendre.

alter table appareils add column if not exists utilisateur bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appareils_utilisateur_fk') then
    alter table appareils add constraint appareils_utilisateur_fk
      foreign key (utilisateur) references utilisateurs(id) on delete cascade;
  end if;
end $$;

create index if not exists appareils_utilisateur on appareils (utilisateur);

comment on column appareils.utilisateur is
  'Le compte à qui sonne ce téléphone. Vide : le propriétaire. Le robot ne '
  'fait sonner un compte que pour les SMS des cartes qui lui sont confiées.';


-- ===========================================================================
-- LA VÉRIFICATION
-- ===========================================================================
do $$
declare
  essai bigint;
begin
  delete from utilisateurs where courriel = 'verification-20261002@essai.invalid';
  insert into utilisateurs (courriel, empreinte, role, approuve)
    values ('verification-20261002@essai.invalid', 'x', 'invite', true)
    returning id into essai;
  insert into appareils (jeton, plateforme, nom, utilisateur)
    values ('ExponentPushToken[verification-20261002]', 'ios', 'Essai', essai);

  -- Effacer le compte efface son téléphone.
  delete from utilisateurs where id = essai;
  if exists (select 1 from appareils where jeton = 'ExponentPushToken[verification-20261002]') then
    raise exception 'VÉRIFICATION ÉCHOUÉE : un compte effacé garde un téléphone qui sonne.';
  end if;

  -- Un téléphone ne peut pas appartenir à un compte qui n'existe pas.
  begin
    insert into appareils (jeton, utilisateur)
      values ('ExponentPushToken[verification-20261002-b]', -1);
    raise exception 'VÉRIFICATION ÉCHOUÉE : un téléphone inscrit au nom de personne.';
  exception when foreign_key_violation then null;
  end;
end $$;
