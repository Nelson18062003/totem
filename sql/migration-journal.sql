-- ---------------------------------------------------------------------------
-- TOTEM — migration « les versions, et qui a vu une alerte »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute les deux choses que la seconde moitié de la console réclame et que
-- la base ne savait pas dire : QUEL LOGICIEL la flotte est censée porter, et
-- QUI a regardé une alerte.
--
-- POURQUOI UN REGISTRE DES VERSIONS
-- « terminaux.version » dit ce qu'un boîtier porte. Elle ne dit pas ce qu'il
-- DEVRAIT porter, et surtout pas si ce qui lui manque est une correction de
-- confort ou un trou de sécurité. Sans cette table, un écran ne peut que
-- comparer les boîtiers entre eux — et conclure « tout le monde porte la même
-- chose » sur une flotte entière restée deux mois en arrière. Le retard ne se
-- déduit pas des retardataires : il se mesure à ce qui a été publié.
--
-- POURQUOI « ENVOYÉE » N'EST PAS « PUBLIÉE »
-- Une version part d'abord sur le boîtier d'essai, et n'atteint le Cameroun
-- que lorsqu'on le décide. Une version publiée hier ne rend donc PAS les sept
-- terminaux en retard : ils portent exactement ce qu'on leur a envoyé. Sans
-- cette distinction, l'écran crierait au retard tous les lundis matin, et au
-- bout de trois semaines plus personne ne le regarderait — c'est ainsi qu'une
-- surveillance meurt.
--
-- POURQUOI « QUI A VU »
-- « alertes » sait déjà qui a CLOS (« close_par ») et ne sait pas qui a VU.
-- Or ce sont deux gestes différents et c'est tout l'intérêt de la table : « je
-- l'ai vue » n'est pas « c'est réglé ». Un accusé de réception anonyme ne vaut
-- rien le jour où l'on demande pourquoi personne n'est allé voir : la ligne
-- dirait « quelqu'un ».
--
-- CE QUE CE FICHIER N'AJOUTE PAS, ET C'EST VOLONTAIRE
-- Aucune colonne « prise le » sur « terminaux » : le robot ne publie pas
-- l'heure à laquelle il a pris son logiciel. Une colonne que personne ne
-- remplit donne une date vide qui ressemble à une mesure, ce qui est pire que
-- rien — même règle que « sql/migration-console.sql ».
--
-- Aucune table de déploiements, aucun compte-rendu de vague. Tant qu'aucun
-- outil n'écrit ces lignes, elles n'existeraient qu'à l'écran.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée : une colonne ajoutée et une table
-- neuve. Rejouable.
--
-- CE QU'IL FAUT AVANT
-- « sql/migration-console.sql » (la table « alertes ») et
-- « sql/migration-identite.sql » (la table « personnes »).
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Le registre des versions ----------------------------------------------
create table if not exists versions (
  -- Le nom EXACT que le boîtier annonce dans « terminaux.version ». C'est la
  -- clé du rapprochement : une version écrite ici autrement que là-bas ne
  -- rapproche rien, et l'écran dira « logiciel inconnu du registre » — ce qui
  -- est la vérité, et vaut mieux qu'un « à jour » faux.
  version    text primary key,

  publiee_le timestamptz not null default now(),

  -- Le jour où on l'a envoyée à la flotte. Nul tant qu'elle n'est qu'à
  -- l'essai : une version qu'on essaie sur un seul boîtier ne met personne en
  -- retard.
  envoyee_le timestamptz,

  -- Ce qu'elle change, écrit pour quelqu'un qui n'est pas informaticien :
  -- « le nom commercial de la boutique apparaît sur les reçus », pas
  -- « feat(recus): trading name ».
  resume     text,

  -- Vraie quand cette version bouche un trou. Un boîtier resté en arrière
  -- n'est alors pas « en retard » : il est EXPOSÉ, et sa ligne ne se range
  -- plus avec les autres.
  correctif_securite boolean not null default false,

  -- Retirée : on ne l'envoie plus, on ne la compte plus comme attendue. Rien
  -- ne s'efface — une version retirée explique, six mois plus tard, pourquoi
  -- un boîtier porte ce qu'il porte.
  retiree_le timestamptz,
  retiree_motif text
);

comment on table versions is
  'Ce qui a été publié, et ce qui a été envoyé à la flotte. Sans elle, le '
  'retard d''un boîtier ne se mesure qu''aux autres boîtiers — et une flotte '
  'entière restée en arrière paraît à jour.';

comment on column versions.envoyee_le is
  'Nul tant que la version n''est qu''à l''essai. Une version publiée ne met '
  'personne en retard ; une version envoyée, oui.';

comment on column versions.correctif_securite is
  'Vraie quand la version bouche un trou. Le boîtier qui ne l''a pas reçue '
  'n''est pas en retard, il est exposé.';

-- La question posée à chaque ouverture de l'écran : « quelle est la dernière
-- version réellement envoyée à la flotte ? »
create index if not exists versions_envoyees_idx
  on versions (envoyee_le desc) where envoyee_le is not null and retiree_le is null;

-- --- Qui a vu une alerte ---------------------------------------------------
-- « close_par » existait, « vue_par » manquait. Les deux gestes sont
-- distincts : voir n'est pas résoudre, et un accusé de réception anonyme ne
-- répond pas à la seule question qui se pose ensuite — qui devait y aller.
alter table alertes add column if not exists vue_par bigint references personnes(id);

comment on column alertes.vue_par is
  'Qui a accusé réception. Distinct de « close_par » : « je l''ai vue » n''est '
  'pas « c''est réglé », et confondre les deux fait disparaître de l''écran '
  'des choses que personne n''a réparées.';

-- --- Sécurité : fermée, comme les autres -----------------------------------
-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. La console lit avec la clé de service, depuis le
-- serveur, après « exigerPouvoir("administrer") ».
alter table versions enable row level security;
