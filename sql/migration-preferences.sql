-- ---------------------------------------------------------------------------
-- TOTEM — migration « ce qui arrive sur votre téléphone », et le retour
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute les deux tables des écrans C8 et C10 :
--   · « preferences_messages » — ce que la personne accepte de recevoir ;
--   · « demandes_fermeture »   — le lien à usage unique qui ferme tout, envoyé
--     par courriel à quelqu'un qui n'arrive plus à entrer.
--
-- LA RÈGLE QUE CETTE MIGRATION GRAVE DANS LA BASE
-- Ce qui protège ne se débraye pas. Un message qu'on peut éteindre est un
-- message qui n'aurait pas prévenu le jour où il fallait : le code des six
-- chiffres, l'invitation, l'entrée depuis un appareil jamais vu et le retrait
-- d'un téléphone restent branchés, quoi qu'on coche. Ce n'est pas une consigne
-- écrite dans un écran — c'est une contrainte de la base, qui refuse la ligne.
--
-- ET SON PENDANT : LE DÉFAUT EST « ON REÇOIT »
-- L'absence de ligne vaut « on reçoit ». Une personne dont on n'a jamais lu la
-- préférence est prévenue ; on ne fabrique pas un silence par oubli.
--
-- POURQUOI LA FERMETURE PASSE PAR UN COURRIEL, ET PAS PAR UN BOUTON
-- Fermer n'exige aucune preuve — fermer une porte n'a jamais nui à personne,
-- et exiger un mot de passe de quelqu'un dont le téléphone vient d'être
-- arraché revient à lui refuser le seul geste utile. Mais un bouton anonyme
-- couperait n'importe qui : il suffirait de connaître un nom. On demande donc
-- l'adresse, on envoie le lien SUR cette adresse, et l'écran ne dit jamais si
-- le compte existe. Une fermeture abusive ne coûte qu'une reconnexion ; une
-- entrée abusive coûte une caisse.
--
-- LA BASE NE GARDE QUE L'EMPREINTE DU JETON, comme pour les invitations. Une
-- copie de la base — une sauvegarde qui traîne, un accès de trop — ne permet
-- de fermer aucun compte.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Ce qu'on accepte de recevoir ------------------------------------------
create table if not exists preferences_messages (
  id        bigint generated always as identity primary key,
  personne  bigint not null references personnes(id) on delete restrict,

  -- Les huit genres, et rien d'autre. Un genre inconnu écrit ici serait une
  -- préférence que personne ne relit jamais — donc un réglage qui ment.
  genre     text not null check (genre in (
              'code', 'invitation', 'bienvenue', 'alerte_appareil',
              'cle_retiree', 'encaissement', 'rapport', 'terminal')),

  -- Vrai par défaut, et l'ABSENCE de ligne vaut vrai elle aussi. Les deux
  -- chemins mènent à « on reçoit » : c'est le seul défaut qui ne prive
  -- personne d'une nouvelle par accident.
  recevoir  boolean not null default true,

  change_le timestamptz not null default now(),
  unique (personne, genre)
);

create index if not exists preferences_messages_personne_idx
  on preferences_messages (personne);

-- La règle, tenue par la base et pas seulement par l'écran. Quatre genres
-- protègent : les six chiffres sont la porte elle-même, l'invitation ouvre un
-- compte, l'entrée depuis un appareil jamais vu est ce qui prévient d'une
-- intrusion, et le retrait d'un téléphone est ce qui la confirme. Aucun ne
-- s'éteint. Un écran mal écrit, une route oubliée, une main dans l'éditeur
-- SQL : la ligne est refusée dans les trois cas.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'preferences_messages_protege_chk') then
    alter table preferences_messages
      add constraint preferences_messages_protege_chk
      check (recevoir or genre not in
             ('code', 'invitation', 'alerte_appareil', 'cle_retiree'));
  end if;
end $$;

comment on table preferences_messages is
  'Ce que la personne accepte de recevoir. L''absence de ligne vaut « on '
  'reçoit », et ce qui protège ne s''éteint pas : la contrainte le refuse.';

alter table preferences_messages enable row level security;

-- --- Le lien qui ferme tout ------------------------------------------------
-- Il part sur l'adresse mail, il vaut une heure, et il ne sert qu'une fois.
-- Une heure : le temps d'emprunter un téléphone, d'ouvrir sa boîte et de
-- revenir. Au-delà, la personne en redemandera un — cela ne coûte qu'un geste,
-- alors qu'un lien qui traîne une semaine dans une boîte ouverte sur un
-- téléphone volé est exactement ce qu'on cherche à éviter.
create table if not exists demandes_fermeture (
  id        bigint generated always as identity primary key,

  -- L'empreinte du jeton, JAMAIS le jeton. Il n'existe en clair que dans le
  -- courriel envoyé. Qui lit cette table ne peut fermer aucun compte ; il peut
  -- seulement vérifier le lien qu'on lui présente.
  jeton_empreinte text not null unique,

  personne  bigint not null references personnes(id) on delete restrict,

  -- Ce qu'on savait de celui qui a demandé. Approximatif par construction : il
  -- sert à raconter « la demande est partie d'un téléphone à Douala », pas à
  -- faire une preuve.
  appareil  text,
  lieu      text,

  demande_le timestamptz not null default now(),
  expire_le  timestamptz not null,

  -- Usage unique : c'est cette colonne, et le filtre « is null » qui va avec,
  -- qui empêche de rejouer un lien retrouvé dans une boîte mail.
  utilise_le timestamptz
);

create index if not exists demandes_fermeture_personne_idx
  on demandes_fermeture (personne);
create index if not exists demandes_fermeture_vivantes_idx
  on demandes_fermeture (expire_le) where utilise_le is null;

comment on table demandes_fermeture is
  'Le lien à usage unique qui ferme toutes les sessions d''une personne. La '
  'table ne contient que l''empreinte : elle vérifie un lien, elle n''en '
  'fabrique aucun.';

alter table demandes_fermeture enable row level security;

-- Aucune politique de lecture sur ni l'une ni l'autre, volontairement : sans
-- politique, une clé publique ne lit RIEN.
