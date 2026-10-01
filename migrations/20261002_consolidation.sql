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
-- Elle ajoute aussi le carnet des BÉNÉFICIAIRES de chaque carte.
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
-- 2. LES BÉNÉFICIAIRES DE CHAQUE CARTE
-- ===========================================================================
--
-- Les gens à qui l'on envoie de l'argent, avec le nom qu'on leur donne. Ils
-- appartiennent à la CARTE, pas à une personne : celui qui tient la carte
-- les retrouve, le propriétaire aussi — et si la carte change de main, son
-- carnet la suit.
--
-- Une carte ne connaît un numéro qu'une fois : l'enregistrer de nouveau
-- remplace son nom. La forme du numéro est tenue ICI, dans la base : des
-- chiffres, de 8 à 15 — un numéro mal recopié ne s'enregistre pas.

create table if not exists beneficiaires (
  id         bigint generated always as identity primary key,
  carte      text not null,
  numero     text not null,
  nom        text not null,
  cree_par   bigint,
  cree_le    timestamptz not null default now(),
  maj_le     timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'beneficiaires_carte_forme') then
    alter table beneficiaires add constraint beneficiaires_carte_forme
      check (carte ~ '^[A-Za-z0-9]{1,32}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'beneficiaires_numero_forme') then
    alter table beneficiaires add constraint beneficiaires_numero_forme
      check (numero ~ '^[0-9]{8,15}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'beneficiaires_nom_forme') then
    alter table beneficiaires add constraint beneficiaires_nom_forme
      check (length(btrim(nom)) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'beneficiaires_cree_par_fk') then
    alter table beneficiaires add constraint beneficiaires_cree_par_fk
      foreign key (cree_par) references utilisateurs(id) on delete set null;
  end if;
end $$;

create unique index if not exists beneficiaires_un_numero_par_carte
  on beneficiaires (carte, numero);

comment on table beneficiaires is
  'Les bénéficiaires enregistrés de chaque carte SIM : un nom pour un numéro. '
  'Ils suivent la carte, et se voient avec elle.';

alter table beneficiaires enable row level security;


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

  -- Un bénéficiaire : un numéro par carte, et un numéro qui en est un.
  insert into beneficiaires (carte, numero, nom)
    values ('89237010000000099999', '677998877', 'Vérification');
  begin
    insert into beneficiaires (carte, numero, nom)
      values ('89237010000000099999', '677998877', 'Doublon');
    raise exception 'VÉRIFICATION ÉCHOUÉE : un numéro enregistré deux fois sur la même carte.';
  exception when unique_violation then null;
  end;
  begin
    insert into beneficiaires (carte, numero, nom)
      values ('89237010000000099999', '6779-abc', 'Faux');
    raise exception 'VÉRIFICATION ÉCHOUÉE : un numéro mal formé a été enregistré.';
  exception when check_violation then null;
  end;
  delete from beneficiaires where carte = '89237010000000099999';

  -- Un téléphone ne peut pas appartenir à un compte qui n'existe pas.
  begin
    insert into appareils (jeton, utilisateur)
      values ('ExponentPushToken[verification-20261002-b]', -1);
    raise exception 'VÉRIFICATION ÉCHOUÉE : un téléphone inscrit au nom de personne.';
  exception when foreign_key_violation then null;
  end;
end $$;
