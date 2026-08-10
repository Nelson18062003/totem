-- ---------------------------------------------------------------------------
-- TOTEM — migration « le journal des courriels »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui note qu'un message est parti — ou qu'il n'est pas
-- parti. Une seule table, et elle n'existe que pour répondre à une phrase
-- qu'on entend tous les mois : « mon opérateur dit qu'il n'a rien reçu ».
--
-- POURQUOI CE JOURNAL EXISTE
-- Sans lui, cette phrase n'a pas de réponse. On ne sait pas si le message est
-- parti, s'il a été refusé, ou si TOTEM n'était tout simplement pas configuré
-- ce jour-là. Chacune de ces trois situations appelle un geste différent, et
-- aucune ne se devine. Avec ce journal, on répond : « il est parti à 9 h 04,
-- le fournisseur l'a accepté sous la référence 4ef… ; regardez vos
-- indésirables » — ou bien « il n'est jamais parti, en voici un autre ».
--
-- CE QUE LA TABLE NE CONTIENT PAS, ET NE CONTIENDRA JAMAIS
-- Le contenu. Ni les six chiffres, ni le jeton d'une invitation, ni l'objet,
-- ni le corps du message. Il n'y a AUCUNE colonne pour cela, et c'est
-- délibéré : une colonne « message » finirait par être remplie « pour
-- déboguer », et une copie de la base ouvrirait alors des boutiques. Le
-- journal dit à qui, quel genre, quand, et ce qui s'est passé. Rien d'autre.
--
-- POURQUOI L'ADRESSE EN CLAIR, ET PAS UNE EMPREINTE
-- La question s'est posée. La base connaît DÉJÀ l'adresse — « personnes.
-- courriel », « codes_entree.courriel » — donc la hacher ici ne protégerait
-- rien du tout, et rendrait illisible la seule chose que ce journal doit
-- savoir dire : vers QUELLE boîte le message est parti. Une empreinte
-- répondrait « oui, quelque chose est parti quelque part », ce qui n'aide
-- personne au comptoir.
--
-- POURQUOI ON NOTE AUSSI LES ÉCHECS
-- Un journal qui ne garde que les succès raconte que tout va bien. Les lignes
-- « refusee » d'affilée sur un même domaine sont le signal qu'on cherche : le
-- domaine d'expédition n'est plus vérifié, ou l'hébergeur du destinataire nous
-- classe en indésirables.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

create table if not exists courriels (
  id          bigint generated always as identity primary key,

  -- L'adresse visée, telle qu'elle était AU MOMENT de l'envoi, normalisée
  -- (domaine en minuscules). On ne la relit pas depuis « personnes » : entre
  -- l'envoi et la question posée trois semaines plus tard, quelqu'un a pu
  -- changer l'adresse du compte, et le journal doit dire où c'est VRAIMENT
  -- parti.
  destinataire text not null,

  -- Nul avant l'acceptation d'une invitation : le compte n'existe pas encore
  -- au moment où part le tout premier message.
  personne    bigint references personnes(id) on delete restrict,

  -- « code » | « invitation » | « bienvenue » | « alerte_appareil » | « cle_retiree »
  -- Le genre, jamais le contenu. C'est lui qui permet de dire « trois codes
  -- sont partis vers cette boîte hier soir » sans jamais savoir lesquels.
  genre       text not null
                check (genre in ('code', 'invitation', 'bienvenue',
                                 'alerte_appareil', 'cle_retiree')),

  -- Ce qui s'est passé, et chaque valeur appelle une conduite différente :
  -- « partie »         : le fournisseur l'a accepté. Il peut encore finir en
  --                      indésirables — accepté n'est pas lu.
  -- « refusee »        : le fournisseur a dit non. Réessayer ne servira à rien
  --                      tant que rien n'a changé.
  -- « injoignable »    : le réseau a coupé. Réessayer a du sens.
  -- « sans_cle »       : TOTEM n'était pas configuré. Ce n'est pas une panne
  --                      du jour, c'est un déploiement incomplet — et cette
  --                      ligne-là est la seule façon de s'en apercevoir avant
  --                      qu'une propriétaire ne téléphone.
  -- « sans_expediteur »: l'autre moitié de la configuration.
  -- « adresse »        : l'adresse n'avait pas la forme d'une adresse. On n'a
  --                      pas appelé le fournisseur.
  issue       text not null
                check (issue in ('partie', 'refusee', 'injoignable',
                                 'sans_cle', 'sans_expediteur', 'adresse')),

  -- Le motif technique d'un refus : « 422 validation_error ». Court, borné, et
  -- jamais le corps de la réponse du fournisseur — rien ne garantit qu'il n'y
  -- recopie pas un morceau du message qu'on vient de lui donner.
  detail      text,

  -- L'identifiant que le fournisseur a donné au message. Il ne sert qu'à une
  -- chose, et elle compte : retrouver CE message-là chez lui le jour où
  -- quelqu'un dit qu'il n'a rien reçu. Sans lui, la conversation s'arrête à
  -- « pourtant on l'a envoyé ».
  reference   text,

  cree_le     timestamptz not null default now()
);

-- La question se pose toujours dans le même sens : « qu'est-ce qui est parti
-- vers cette boîte, et quand ? »
create index if not exists courriels_destinataire_idx
  on courriels (destinataire, cree_le desc);
-- Et, pour la fiche d'une personne, la même chose vue depuis son compte.
create index if not exists courriels_personne_idx
  on courriels (personne, cree_le desc) where personne is not null;
-- Les échecs se lisent seuls : c'est la liste qu'on regarde quand quelque
-- chose cloche, et elle doit rester rapide même quand tout va bien.
create index if not exists courriels_rates_idx
  on courriels (cree_le desc) where issue <> 'partie';

comment on table courriels is
  'Ce qui est parti par courriel, et ce qui n''est pas parti. Le genre, le '
  'destinataire, le moment, l''issue — jamais le contenu : ni code, ni jeton, '
  'ni objet, ni corps. Il n''y a aucune colonne pour cela, exprès.';

comment on column courriels.destinataire is
  'L''adresse visée au moment de l''envoi, normalisée. En clair, parce que la '
  'base la connaît déjà ailleurs et qu''une empreinte ne répondrait pas à la '
  'seule question posée : vers quelle boîte ?';

comment on column courriels.detail is
  'Le motif technique d''un refus, borné. Jamais un morceau du message.';

alter table courriels enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. C'est le bon défaut pour une table qui aligne les
-- adresses personnelles de tout le monde.
