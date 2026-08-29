-- Les appareils qui reçoivent les notifications.
--
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script est REJOUABLE : le relancer ne casse rien et ne perd rien.
--
-- Pourquoi une table : le robot de Douala envoie lui-même les notifications
-- (voir totem/notification.py), et il lui faut donc savoir À QUI. Les
-- téléphones s'inscrivent ici en passant par la plateforme ; le robot lit
-- cette table comme il lit déjà « commandes ».
--
-- Ce qu'on y range, et surtout ce qu'on n'y range PAS : le jeton d'Expo
-- identifie un APPAREIL, pas une personne. Il ne dit rien du propriétaire,
-- ne permet pas de le localiser, et n'ouvre l'accès à rien : il autorise
-- seulement à faire sonner ce téléphone-là. S'il fuitait, le pire serait une
-- notification indésirable — jamais un accès aux comptes.

create table if not exists appareils (
  -- Le jeton rendu par Expo : « ExpoPushToken[xxxxxxxx] ». C'est LUI la clé —
  -- réinstaller l'application en donne un neuf, et l'ancien s'éteint tout
  -- seul chez Expo. Pas d'identifiant à nous : ce serait un numéro de plus à
  -- garder sans rien apporter.
  jeton       text primary key,

  -- « android » ou « ios ». Utile le jour où une notification devra se
  -- formuler différemment selon le système.
  plateforme  text,

  -- De quoi reconnaître l'appareil dans une liste (« Pixel 8 »), quand il
  -- faudra en retirer un. Jamais un identifiant matériel : le modèle suffit.
  nom         text,

  -- Dernière fois que l'application s'est signalée. Un appareil qui ne
  -- reparaît plus a été perdu, vendu ou désinstallé : on pourra le retirer
  -- sans se demander lequel c'était.
  vu_le       timestamptz not null default now(),
  cree_le     timestamptz not null default now()
);

comment on table appareils is
  'Les téléphones à qui le robot fait sonner une notification. Le jeton '
  'identifie un appareil, jamais une personne, et n''ouvre l''accès à rien.';

-- Le robot lit « les appareils encore vivants » : un index sur la date rend
-- cette lecture immédiate même avec des années d'appareils oubliés.
create index if not exists appareils_vu_le on appareils (vu_le desc);

-- --------------------------------------------------------------------------
-- Les règles d'accès, comme pour le reste du schéma : rien ne se lit ni ne
-- s'écrit sans passer par une clé de service. La plateforme (Vercel) et le
-- robot en ont une ; le téléphone, lui, n'en a AUCUNE — il inscrit son jeton
-- en passant par `/api/appareil`, jamais en écrivant ici directement.
-- --------------------------------------------------------------------------

alter table appareils enable row level security;

-- Aucune politique n'est créée : sans politique, personne ne passe. La clé de
-- service, elle, contourne RLS par nature — c'est exactement ce qu'on veut.
