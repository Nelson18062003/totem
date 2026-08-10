-- ---------------------------------------------------------------------------
-- TOTEM — migration « le code à six chiffres »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui porte les codes d'entrée. Un seul objet, mais qui
-- resservira cinq fois : à l'acceptation d'une invitation, à chaque nouvel
-- appareil, après un changement d'adresse, au retour d'un téléphone perdu, et
-- pour confirmer un geste qui engage.
--
-- LE CODE PART PAR COURRIEL, PAS PAR SMS
-- L'adresse est le point fixe : elle suit la personne quand elle change de
-- téléphone, de puce et d'opérateur. Un numéro camerounais inutilisé est
-- recyclé et réattribué — s'y accrocher, c'est donner un jour à un inconnu la
-- clé d'un commerce. Le premier code sert d'ailleurs autant à ouvrir la porte
-- qu'à PROUVER que l'adresse existe et qu'elle est bien à cette personne.
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

-- Le premier jet de cette table visait un numéro de téléphone. Elle vise une
-- adresse. Sur une base où l'ancienne colonne existe déjà, on la renomme au
-- lieu d'en créer une seconde — deux colonnes pour une même chose finissent
-- toujours par diverger.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'codes_entree' and column_name = 'telephone') then
    alter table codes_entree rename column telephone to courriel;
  end if;
end $$;

create table if not exists codes_entree (
  id          bigint generated always as identity primary key,

  -- L'empreinte du code, jamais le code. Salée par l'adresse visée, pour que
  -- deux codes identiques tirés le même jour n'aient pas la même empreinte :
  -- sans cela, qui lit la base saurait que deux personnes ont reçu les mêmes
  -- six chiffres.
  empreinte   text not null,

  -- À qui il est destiné. « personne » est nul avant l'acceptation d'une
  -- invitation : le compte n'existe pas encore.
  personne    bigint references personnes(id) on delete restrict,
  invitation  bigint references invitations(id) on delete restrict,

  -- L'adresse visée, telle qu'elle était AU MOMENT de l'envoi. On ne la relit
  -- pas depuis « personnes » à la vérification : entre l'envoi et la saisie,
  -- quelqu'un pourrait avoir changé l'adresse de destination.
  courriel    text not null,

  -- « invitation » | « entree » | « appareil » | « adresse » | « geste »
  motif       text not null,

  -- Dix minutes. Assez pour aller chercher le message dans une autre
  -- application, sur une connexion qui traîne ; trop court pour qu'un code
  -- resté dans une boîte mail ouverte serve encore le lendemain.
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
-- Et par destinataire, pour compter les demandes récentes d'une même adresse :
-- c'est ce qui empêche de noyer la boîte mail de quelqu'un en appuyant cent
-- fois sur « renvoyer » — et, accessoirement, de faire classer nos messages
-- comme indésirables pour tout le monde.
create index if not exists codes_entree_courriel_idx
  on codes_entree (courriel, cree_le desc);
drop index if exists codes_entree_telephone_idx;

-- Le code est-il VRAIMENT parti ? Nul tant que le service de courrier ne l'a
-- pas accepté. C'est cette date qui fait entrer la demande dans le compte des
-- cinq par demi-heure — et pas la création de la ligne.
--
-- La nuance vient d'un cas réel : la ligne était créée avant l'envoi, donc
-- cinq pannes de notre côté enfermaient la personne dehors une demi-heure,
-- pour une avarie qui n'était pas la sienne. Un code qui n'a jamais quitté
-- nos murs n'a dérangé aucune boîte mail.
alter table codes_entree add column if not exists envoye_le timestamptz;


comment on table codes_entree is
  'Les codes à six chiffres, sous forme d''empreinte. Un code appartient à une '
  'TENTATIVE, pas à une personne : deux demandes concurrentes ne s''écrasent pas.';

alter table codes_entree enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table d'empreintes de
-- secrets et d'adresses personnelles.
