-- ---------------------------------------------------------------------------
-- TOTEM — migration consolidée du 24 août 2026 (chantier multi-cartes)
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service. Le script est rejouable :
-- le relancer ne casse rien et ne duplique rien.
--
-- Ce que ce chantier change en base — et rien d'autre :
--   · une seule table nouvelle, « raccourcis » (les boutons USSD appris) ;
--   · sa règle de lecture (mêmes règles que les autres tables).
-- Tout le reste du multi-cartes (ciblage par ICCID, filtres par carte,
-- bilan par caisse) vit dans le code : la base était déjà rangée par ICCID.
--
-- NB : sql/schema.sql reste le script complet et rejouable de la base ;
-- il contient déjà ce bloc. Ce fichier est le chemin COURT pour une base
-- déjà en service, sans rien rejouer d'autre.
-- ---------------------------------------------------------------------------

-- --- 1. La table des raccourcis appris, par opérateur -----------------------
-- Les codes USSD appartiennent au réseau, pas à une carte : « *126# puis 5 »
-- vaut pour toute puce MTN. Le robot apprend un parcours en regardant le
-- propriétaire le faire une fois (💾 sur Telegram), le range dans son journal
-- local, et pousse ici une copie du carnet entier — c'est ce qui permet à la
-- plateforme d'afficher les mêmes boutons que Telegram, y compris pour un
-- opérateur dont aucun code n'est écrit dans le code source.
-- Le code secret n'apparaît JAMAIS dans un parcours : l'apprentissage
-- s'arrête juste avant.
create table if not exists raccourcis (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  operateur   text not null,             -- « MTN », « Orange »
  nom         text not null,             -- clé stable (« solde », « depot »)
  libelle     text not null,             -- ce que le bouton affiche
  -- Le parcours, tel que le journal local le range : le code d'entrée puis
  -- les réponses, séparés par des virgules (« *126#,5,1 »).
  etapes      text not null,
  -- L'heure de la dernière poussée : c'est elle qui permet au robot de faire
  -- le ménage (un bouton supprimé sur Telegram disparaît aussi d'ici).
  maj         timestamptz not null default now(),
  cree_le     timestamptz not null default now(),
  unique (terminal, operateur, nom)
);

comment on table raccourcis is
  'Les boutons USSD appris par le robot, par opérateur. Copie du journal '
  'local du terminal : c''est lui qui écrit, la plateforme ne fait que lire.';

-- --- 2. La règle de lecture -------------------------------------------------
-- Même politique que le reste de la base : personne ne lit sans être
-- connecté ; le robot écrit avec la clé de service, qui contourne ces règles
-- et ne quitte jamais le Raspberry Pi.
alter table raccourcis enable row level security;

drop policy if exists "lecture connectee" on raccourcis;
create policy "lecture connectee" on raccourcis
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Fin. Aucune autre table, colonne ou contrainte ne change dans ce chantier.
-- ---------------------------------------------------------------------------
