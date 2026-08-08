-- ---------------------------------------------------------------------------
-- TOTEM — migration « le code à six chiffres »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui porte les codes d'entrée. Un seul objet, mais qui
-- resservira cinq fois : à l'acceptation d'une invitation, à chaque nouvel
-- appareil, après un changement de numéro, au retour d'un téléphone perdu, et
-- pour confirmer un geste qui engage.
--
-- POURQUOI UNE TABLE À PART, ET PAS UNE COLONNE
-- Un code n'appartient ni à une personne ni à une invitation : il appartient à
-- une TENTATIVE. La même personne peut en avoir demandé un il y a deux minutes
-- sur son téléphone et un autre à l'instant sur l'ordinateur du comptoir ;
-- l'ancien doit mourir sans emporter le neuf. Une colonne sur « personnes »
-- écraserait l'un par l'autre en silence.
--
-- CE QUE LA TABLE NE CONTIENT PAS
-- Le code. Jamais. Elle garde son empreinte : elle peut vérifier ce qu'on lui
-- présente, elle ne peut pas révéler ce qu'elle attend. Une copie de la base
-- — une sauvegarde qui traîne, un accès de trop — n'ouvre aucune porte.
--
-- LA RÈGLE QUI COMPTE : ON RALENTIT, ON N'ENFERME JAMAIS
-- Le compteur d'essais fait attendre. Il ne verrouille pas. Verrouiller le
-- propriétaire, c'est le couper de son propre argent — et personne chez TOTEM
-- ne doit pouvoir faire cela, pas même pour le protéger.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

create table if not exists codes_entree (
  id          bigint generated always as identity primary key,

  -- L'empreinte du code, jamais le code. Salée par l'identifiant de la
  -- tentative, pour que deux codes identiques tirés le même jour n'aient pas
  -- la même empreinte : sans cela, qui lit la base saurait que deux personnes
  -- ont reçu les mêmes six chiffres.
  empreinte   text not null,

  -- À qui il est destiné. « personne » est nul avant l'acceptation d'une
  -- invitation : le compte n'existe pas encore.
  personne    bigint references personnes(id) on delete restrict,
  invitation  bigint references invitations(id) on delete restrict,

  -- Le numéro visé, tel qu'il était AU MOMENT de l'envoi. On ne le relit pas
  -- depuis « personnes » à la vérification : entre l'envoi et la saisie,
  -- quelqu'un pourrait avoir changé le numéro de destination.
  telephone   text not null,

  -- « invitation » | « entree » | « appareil » | « numero » | « geste »
  motif       text not null,

  -- Dix minutes. C'est le plafond du NIST (SP 800-63B-4 §3.1.3.1) et c'est
  -- déjà court pour un SMS qui traverse un réseau chargé à Douala. En dessous,
  -- on ferait échouer des gens honnêtes plus souvent qu'on ne gênerait
  -- quiconque.
  expire_le   timestamptz not null,

  -- Usage unique, et la date le prouve.
  utilise_le  timestamptz,

  -- Les essais ratés. On RALENTIT à partir du troisième, on n'enferme jamais.
  essais      int not null default 0,
  -- Jusqu'à quand la porte est lente. Nul la plupart du temps.
  lent_jusqu_a timestamptz,

  -- Ce que l'écran affichera pour que la personne reconnaisse SA tentative :
  -- « Chrome sur Android, Douala ». Sans cela, quelqu'un qui a deux codes en
  -- attente ne sait pas lequel il tape.
  appareil    text,
  lieu        text,

  cree_le     timestamptz not null default now()
);

-- La recherche se fait toujours par empreinte, sur les codes encore vivants.
create index if not exists codes_entree_vivants_idx
  on codes_entree (empreinte) where utilise_le is null;
-- Et par destinataire, pour compter les demandes récentes d'un même numéro :
-- c'est ce qui empêche d'user le forfait de quelqu'un en redemandant un code
-- cent fois.
create index if not exists codes_entree_telephone_idx
  on codes_entree (telephone, cree_le desc);

comment on table codes_entree is
  'Les codes à six chiffres, sous forme d''empreinte. Un code appartient à une '
  'TENTATIVE, pas à une personne : deux demandes concurrentes ne s''écrasent pas.';

alter table codes_entree enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table d'empreintes de
-- secrets et de numéros de téléphone.
