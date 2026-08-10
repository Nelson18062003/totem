-- ---------------------------------------------------------------------------
-- TOTEM — migration « l'accès à la plateforme »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute la table qui dit QUI a le droit d'entrer dans la console de la
-- plateforme — celle qui voit les sept boîtiers, les douze puces et les quatre
-- commerces à la fois.
--
-- POURQUOI UNE TABLE DE PLUS, ALORS QU'« acces » EXISTE DÉJÀ
-- « acces » attache une personne à UN commerce : sa colonne « commerce » est
-- « not null », et c'est juste — un rôle sans commerce ne veut rien dire pour
-- une propriétaire, une opératrice ou une lectrice. Le super-administrateur,
-- lui, n'a pas de commerce : il les regarde tous et n'en possède aucun. Écrire
-- son droit dans « acces » aurait demandé de rendre la colonne facultative,
-- c'est-à-dire d'ouvrir dans TOUTE l'application la possibilité d'un accès qui
-- ne nomme aucune boutique. Une seule ligne de code oubliée quelque part, et
-- une opératrice se retrouve avec un accès qui vaut partout.
--
-- Le droit de la plateforme vit donc ailleurs, dans sa propre table, avec sa
-- propre porte. C'est la même raison qui fait que le rôle « admin » ne porte
-- pas « sortir_argent » dans « web/lib/roles.ts » : la séparation est
-- structurelle, pas contractuelle.
--
-- CE QUE LA TABLE RACONTE, ET PAS SEULEMENT CE QU'ELLE AUTORISE
-- Une ligne suit une demande de bout en bout : quand elle a été faite, ce que
-- la personne a écrit pour la justifier, qui l'a accordée, qui l'a refusée,
-- qui l'a reprise et pourquoi. Un droit qui apparaît sans qu'on sache qui l'a
-- donné est exactement ce qu'on découvre trop tard.
--
-- RIEN NE S'EFFACE : ON DATE
-- « accorde_le », « refuse_le », « retire_le ». Une ligne retirée reste — c'est
-- elle qui explique, six mois plus tard, pourquoi quelqu'un a vu la flotte le
-- 3 mars.
--
-- LE PREMIER ADMINISTRATEUR, ET L'ŒUF QUI PRÉCÈDE LA POULE
-- Personne ne peut accorder le premier droit, puisqu'il n'y a encore personne
-- pour l'accorder. La variable d'environnement « TOTEM_ADMIN » porte l'adresse
-- du fondateur : la personne qui entre avec cette adresse-là est administratrice
-- de plein droit, et sa ligne s'écrit ici à sa première entrée. C'est le même
-- procédé que « TOTEM_PROPRIETAIRE » pour le commerçant fondateur, et il
-- disparaîtra le jour où un second administrateur existera.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée, aucune colonne n'est modifiée.
-- Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Qui a le droit d'être administrateur de la plateforme ------------------
create table if not exists acces_plateforme (
  id            bigint generated always as identity primary key,

  -- « on delete restrict » : supprimer une personne emporterait la trace de ce
  -- qu'elle a eu le droit de voir, et c'est précisément ce qu'un journal doit
  -- survivre à.
  personne      bigint not null references personnes(id) on delete restrict,

  -- La demande. Elle existe AVANT le droit : quelqu'un demande, quelqu'un
  -- accorde, et les deux moments sont datés séparément. Une table où le droit
  -- apparaît d'un coup ne sait pas dire qui l'a voulu.
  demande_le    timestamptz not null default now(),

  -- Ce que la personne a écrit pour justifier sa demande, dans ses mots. Court
  -- par nature ; il n'est lu que par celui qui accorde, et il vaut mieux que
  -- « nouvelle demande » — six mois plus tard, c'est la seule phrase qui
  -- explique pourquoi on a dit oui.
  demande_motif text,

  -- Accordé : la date, et par qui. Les deux ou aucun.
  accorde_le    timestamptz,
  accorde_par   bigint references personnes(id),

  -- Refusé. Un refus n'efface pas la demande : la même personne peut redemander
  -- plus tard, et celui qui décide doit voir qu'on a déjà dit non une fois.
  refuse_le     timestamptz,
  refuse_par    bigint references personnes(id),

  -- Repris. Le motif est écrit pour être relu par quelqu'un qui n'était pas là :
  -- « a quitté la société », pas « révocation ».
  retire_le     timestamptz,
  retire_par    bigint references personnes(id),
  retire_motif  text
);

-- Un seul dossier vivant par personne. Sans cet index, deux demandes en
-- attente pour la même personne se retrouvent dans la liste de celui qui
-- décide, il en accorde une, et l'autre reste ouverte pour toujours.
create unique index if not exists acces_plateforme_vivant_idx
  on acces_plateforme (personne)
  where retire_le is null and refuse_le is null;

-- La liste qu'on regarde : ce qui attend une décision. Elle doit rester rapide
-- même quand la table aura dix ans de dossiers refermés.
create index if not exists acces_plateforme_a_examiner_idx
  on acces_plateforme (demande_le)
  where accorde_le is null and refuse_le is null and retire_le is null;

create index if not exists acces_plateforme_accordes_idx
  on acces_plateforme (accorde_le desc)
  where accorde_le is not null and retire_le is null;

comment on table acces_plateforme is
  'Qui a le droit d''entrer dans la console de la plateforme. Séparée de '
  '« acces », qui attache toujours un rôle à UN commerce : un administrateur '
  'de plateforme n''en possède aucun, il les regarde tous.';

comment on column acces_plateforme.demande_motif is
  'Ce que la personne a écrit pour demander, dans ses mots. C''est la seule '
  'phrase qui explique, plus tard, pourquoi on a dit oui.';

comment on column acces_plateforme.retire_motif is
  'Écrit pour quelqu''un qui n''était pas là : « a quitté la société », pas '
  '« révocation ».';

alter table acces_plateforme enable row level security;

-- Aucune politique de lecture, volontairement : sans politique, une clé
-- publique ne lit RIEN. Cette table dit qui peut tout voir — c'est la dernière
-- que l'on ouvrirait. La console la lit avec la clé de service, depuis le
-- serveur, après « exigerPouvoir("administrer") ».
