-- ---------------------------------------------------------------------------
-- TOTEM — migration « la console de la plateforme »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il donne à la console d'administration les quatre choses que la base ne
-- savait pas encore dire : à QUI appartient un boîtier, OÙ il est posé, s'il
-- est encore en service, et CE QUI VA MAL sur la flotte.
--
-- POURQUOI « À QUI » MANQUAIT
-- Le cloisonnement de l'argent passe par « cartes.commerce » : c'est la carte
-- SIM qui porte la caisse, et deux commerçants peuvent partager un même
-- boîtier. Mais un terminal sans carte — un boîtier neuf, un boîtier dont la
-- puce vient d'être retirée — n'appartenait alors à personne, et l'écran de
-- flotte ne pouvait pas nommer le commerce qu'il dessert. Un écran de
-- supervision qui montre une machine sans dire chez qui elle est posée oblige
-- à deviner, et deviner sur la boutique de quelqu'un d'autre est exactement ce
-- qu'on ne veut pas.
--
-- POURQUOI « ENCORE EN SERVICE » MANQUAIT
-- La console trie par ce qui va mal : un terminal muet remonte en tête. Un
-- boîtier débranché pour de bon serait donc muet POUR TOUJOURS, et occuperait
-- la première ligne de l'écran pendant des mois — jusqu'à ce que plus personne
-- ne regarde cet écran. Rien ne s'efface dans TOTEM : on date la sortie de
-- service, et la ligne descend au lieu de disparaître.
--
-- POURQUOI UNE TABLE D'ALERTES
-- Le terminal SAIT déjà ce qui ne va pas — « totem/sante.py » calcule la
-- sous-tension, le bridage thermique, le disque plein, et n'annonce que les
-- changements d'état. Mais il ne le disait qu'à Telegram, au fil de l'eau. Un
-- message qui a défilé n'est pas une alerte : personne ne peut dire ce qui est
-- ENCORE ouvert. Cette table est l'endroit où une alerte reste tant qu'elle
-- n'est pas close, avec la date à laquelle elle a été levée et par qui.
--
-- CE QUE CE FICHIER N'AJOUTE PAS, ET C'EST VOLONTAIRE
-- Aucune colonne de mesure physique (processeur, température, mémoire). Le
-- robot ne publie qu'un RÉSUMÉ en toutes lettres dans « terminaux.sante » ;
-- créer des colonnes que personne ne remplit produirait des zéros qui
-- ressemblent à des mesures, ce qui est pire que rien. Le jour où le robot
-- publiera des chiffres, ces colonnes s'ajouteront avec lui.
--
-- Aucune colonne « carte retirée » non plus. Qu'une SIM soit absente se déduit
-- de « cartes.derniere_vue » — mais SEULEMENT quand le terminal parle encore.
-- Un terminal muet ne permet de rien conclure sur ses puces, et la console
-- l'écrit ainsi : « on ne sait pas » n'a pas le droit de ressembler à
-- « retirée ».
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée : uniquement des ajouts de
-- colonnes et une table neuve. Rejouable.
--
-- CE QU'IL FAUT AVANT
-- « sql/migration-identite.sql ». Ce fichier-ci renvoie vers « commerces » et
-- « personnes » : sans elles, il s'arrête sur « relation does not exist ».
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Le boîtier : chez qui, où, et jusqu'à quand ---------------------------

-- Le commerce qui HÉBERGE le boîtier. À ne pas confondre avec
-- « cartes.commerce », qui dit à qui appartient l'ARGENT : un terminal peut
-- porter les puces de deux commerçants, et c'est le cloisonnement par carte
-- qui fait foi pour les soldes. Cette colonne-ci répond à une autre question,
-- celle que pose l'écran de flotte : « ce boîtier-là, il est chez qui ? »
alter table terminaux add column if not exists commerce text references commerces(id);

-- L'endroit tel qu'on le nomme au téléphone : « Douala · Akwa ». Le nom du
-- terminal est un identifiant technique (« douala-akwa-01 ») ; celui qui doit
-- envoyer quelqu'un sur place a besoin d'un lieu, pas d'un identifiant.
alter table terminaux add column if not exists lieu text;

-- Retiré du service, et la date le prouve. Sans elle, un boîtier débranché
-- reste « muet » pour l'éternité et squatte la tête d'un écran trié par ce qui
-- va mal — jusqu'à ce que l'écran devienne illisible et que plus personne ne
-- le regarde. Un terminal retiré garde tout son journal : on le sort de la
-- surveillance, jamais de l'histoire.
alter table terminaux add column if not exists retire_le timestamptz;
alter table terminaux add column if not exists retire_motif text;

comment on column terminaux.commerce is
  'Le commerce chez qui le boîtier est posé. Le cloisonnement de l''argent, '
  'lui, passe par « cartes.commerce » : un terminal peut porter deux caisses.';
comment on column terminaux.retire_le is
  'Sorti du service. La ligne descend de l''écran de surveillance ; son '
  'journal, ses reçus et ses paiements restent entiers.';

create index if not exists terminaux_commerce_idx on terminaux (commerce);
-- La flotte ne s'intéresse qu'aux boîtiers encore en service, et les trie par
-- leur dernier signe de vie : le plus silencieux d'abord.
create index if not exists terminaux_en_service_idx
  on terminaux (vu_le asc nulls first) where retire_le is null;

-- --- Les alertes : ce qui est ENCORE ouvert --------------------------------
-- Une alerte n'est pas un message. Un message défile ; une alerte reste tant
-- que personne ne l'a levée, et c'est cette persistance qui permet de dire
-- « trois choses vont mal en ce moment » plutôt que « trois choses sont allées
-- mal un jour ».
create table if not exists alertes (
  id         bigint generated always as identity primary key,

  -- Le boîtier concerné. Nul pour une alerte qui vise la plateforme entière
  -- (le cloud injoignable, par exemple) : elle n'appartient à aucune machine.
  terminal   text references terminaux(id) on delete cascade,

  -- Le commerce touché, quand il est connu. C'est ce qui permet à l'écran de
  -- NOMMER à qui appartient ce qu'il montre — un administrateur voit tout,
  -- mais il ne doit jamais avoir à deviner de quelle boutique il parle.
  commerce   text references commerces(id),

  -- Ce qui ne va pas, nommé par l'objet et non par le mécanisme :
  -- « silence », « tension », « temperature », « disque », « itinerance »,
  -- « carte_retiree », « retard_synchro ». La liste n'est pas fermée par une
  -- contrainte : une alerte inconnue doit pouvoir REMONTER, quitte à
  -- s'afficher telle quelle. Une contrainte la ferait rejeter en silence par
  -- le robot, et le jour où une machine chauffe on préfère un libellé laid à
  -- un écran vide.
  genre      text not null,

  -- Trois niveaux, et la couleur de l'écran en découle. « grave » est réservé
  -- à ce qui fait perdre de l'argent ou détruit du matériel.
  gravite    text not null default 'attention'
               check (gravite in ('information', 'attention', 'grave')),

  -- Écrits pour quelqu'un qui n'est pas informaticien : « Le boîtier de
  -- Bafoussam ne parle plus depuis six heures », pas « heartbeat timeout ».
  titre      text not null,
  detail     text,

  ouverte_le timestamptz not null default now(),
  -- Quand un humain l'a regardée. Différent de « close_le » : voir n'est pas
  -- résoudre, et confondre les deux fait disparaître de l'écran des choses que
  -- personne n'a réparées.
  vue_le     timestamptz,

  -- Levée, et par qui. Rien ne s'efface : on date.
  close_le   timestamptz,
  close_par  bigint references personnes(id),
  close_motif text
);

comment on table alertes is
  'Ce qui va mal en ce moment sur la flotte. Une alerte reste ouverte tant '
  'que personne ne la lève ; c''est ce qui la distingue d''un message.';

-- Une seule alerte ouverte par boîtier et par genre. Sans cette règle, un
-- terminal qui bascule vingt fois en sous-tension pendant un délestage
-- produirait vingt lignes identiques, et l'écran des alertes deviendrait
-- illisible le jour exact où il sert le plus.
create unique index if not exists alertes_ouverte_unique
  on alertes (terminal, genre) where close_le is null;

create index if not exists alertes_ouvertes_idx
  on alertes (ouverte_le desc) where close_le is null;
create index if not exists alertes_commerce_idx on alertes (commerce);

-- --- Sécurité : fermée, comme les tables d'identité ------------------------
-- Aucune politique de lecture n'est posée, volontairement : sans politique,
-- une clé publique ne lit RIEN. Une alerte nomme un commerce et raconte ce qui
-- se passe chez lui ; c'est le bon défaut. La console lit avec la clé de
-- service, depuis le serveur, après « exigerPouvoir("administrer") ».
alter table alertes enable row level security;
