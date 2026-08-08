-- ---------------------------------------------------------------------------
-- TOTEM — migration « une identité par personne »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il donne un nom à qui appuie. Jusqu'ici, la plateforme n'avait qu'un mot de
-- passe unique et un jeton signé sur le mot « proprietaire » écrit en dur :
-- trois personnes au même comptoir partageaient une seule clé, et retirer
-- l'accès d'un employé voulait dire changer le mot de passe de tout le monde.
--
-- POURQUOI MAINTENANT, ET AVANT TOUT LE RESTE
-- Le jour où 300 000 F manquent, le journal doit pouvoir dire QUI a appuyé —
-- pour confondre, et tout autant pour disculper. Aucune règle de rôle ne peut
-- s'écrire tant que la base ne sait répondre que « quelqu'un ». C'est pour
-- cela que cette migration passe avant le moindre écran neuf.
--
-- LES CINQ OBJETS QU'ELLE INTRODUIT
--   commerces    — la boutique. Elle manquait, et c'est elle que les gens
--                  nomment : « Marché · Bafoussam », pas « douala-akwa-01 ».
--                  Deux commerçants peuvent partager un terminal, un
--                  commerçant peut tenir deux boutiques : ni l'un ni l'autre
--                  n'est représentable quand l'accès se donne par terminal.
--   personnes    — un être humain, une fois. Pas un compte par boutique.
--   acces        — ce qu'une personne peut faire DANS un commerce. Une même
--                  personne peut être opératrice ici et lectrice là.
--   invitations  — rien n'existe avant qu'une invitation soit acceptée.
--   sessions     — pour pouvoir en fermer une. C'est tout l'objet.
--
-- DEUX RÈGLES QUI TRAVERSENT TOUT LE FICHIER
--   1. On ne stocke JAMAIS un secret en clair. Ni le jeton d'invitation, ni
--      le jeton de session, ni un code à six chiffres, ni un code de secours.
--      La base ne garde que leur empreinte : elle peut vérifier, elle ne peut
--      pas révéler. Une copie de la base ne rouvre aucune porte.
--   2. Rien ne s'efface. Retirer un accès pose une date dans « retire_le » ;
--      fermer une session pose « revoquee_le ». Un employé qui part fâché est
--      exactement le moment où l'historique doit rester entier.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée, sauf « commandes » qui reçoit
-- une colonne « demandee_par » (nullable : les commandes déjà là restent
-- valides, simplement sans auteur connu). Chaque instruction est rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Ouvrir Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ».
--  3. Le relancer une seconde fois ne doit produire aucune erreur.
-- ---------------------------------------------------------------------------

-- --- Les commerces ---------------------------------------------------------
-- Un commerce n'est pas un terminal. Le terminal est l'objet posé sur le
-- comptoir ; le commerce est ce que la personne possède. Les séparer permet
-- les deux cas que le terrain impose : deux commerçants sur un terminal
-- (chacun ses cartes), et un commerçant sur deux terminaux.
create table if not exists commerces (
  id        text primary key,            -- « marche-bafoussam »
  nom       text not null,               -- « Marché · Bafoussam »
  ville     text,
  -- La langue du commerce sert de défaut aux invitations : la personne qui
  -- reçoit un lien n'a pas encore choisi, et personne n'a choisi pour elle.
  langue    text not null default 'fr' check (langue in ('fr', 'en')),
  -- « Si vous n'êtes plus joignable, qui prévient-on ? » Posée à la création
  -- du commerce, cette question coûte trente secondes ; ne pas l'avoir posée
  -- coûte une boutique le jour d'une succession.
  contact_secours       text,
  telephone_secours     text,
  -- « ouvert » | « succession » | « litige » | « ferme ». Les trois derniers
  -- gèlent les SORTIES et les ACCÈS — jamais l'enregistrement, jamais les
  -- reçus : l'argent qui entre n'obéit pas à TOTEM, et un gel qui arrête
  -- d'enregistrer perd de l'argent en silence.
  etat      text not null default 'ouvert'
              check (etat in ('ouvert', 'succession', 'litige', 'ferme')),
  etat_depuis timestamptz,
  etat_motif  text,
  cree_le   timestamptz not null default now()
);

comment on table commerces is
  'La boutique, telle que les gens la nomment. Un terminal peut en porter '
  'deux ; un commerce peut vivre sur deux terminaux.';

-- Chaque carte appartient à un commerce. C'est ce rattachement qui cloisonne
-- réellement les caisses : deux SIM du même terminal peuvent être à deux
-- personnes différentes.
alter table cartes add column if not exists commerce text references commerces(id);
create index if not exists cartes_commerce_idx on cartes (commerce);

-- --- Les personnes ---------------------------------------------------------
create table if not exists personnes (
  id         bigint generated always as identity primary key,
  nom        text not null,              -- « J. Eyenga », tel qu'on l'appelle
  -- L'ADRESSE est le point fixe d'un compte. Elle suit la personne quand elle
  -- change de téléphone, de puce et d'opérateur, et c'est par elle qu'arrive
  -- le code des six chiffres.
  courriel   text,
  courriel_prouve_le timestamptz,        -- quand un code y est arrivé et a marché
  -- Le numéro reste, mais comme un CANAL : on appelle quelqu'un, on ne
  -- l'identifie pas par sa ligne. Au Cameroun une ligne inutilisée est
  -- recyclée et réattribuée — un compte qui serait « le numéro 6xx… »
  -- donnerait un jour à un inconnu l'accès aux encaissements d'un commerce.
  telephone  text,
  telephone_lie_le timestamptz,          -- depuis quand ce numéro est le sien
  langue     text not null default 'fr' check (langue in ('fr', 'en')),
  -- « actif » | « suspendu » | « parti ». « parti » n'efface rien : la
  -- personne revient parfois six mois plus tard, et on la RÉACTIVE au lieu de
  -- la recréer — sinon son historique se coupe en deux, et deux « J. Eyenga »
  -- apparaissent dans la liste.
  etat       text not null default 'actif'
               check (etat in ('actif', 'suspendu', 'parti')),
  cree_le    timestamptz not null default now(),
  vue_le     timestamptz
);

-- « create table if not exists » ne fait RIEN sur une table déjà là : sur une
-- base qui a déroulé une version antérieure de ce fichier, les colonnes
-- ajoutées depuis manqueraient en silence, et chaque insertion échouerait sans
-- que personne comprenne pourquoi. On les redemande donc explicitement.
alter table personnes add column if not exists courriel text;
alter table personnes add column if not exists courriel_prouve_le timestamptz;

comment on column personnes.courriel is
  'Le point fixe du compte : c''est par là qu''arrive le code des six chiffres, '
  'et « courriel_prouve_le » dit le jour où l''adresse a répondu.';
comment on column personnes.telephone is
  'Un canal de contact, pas une identité : les numéros inactifs sont recyclés.';

-- --- Les accès : qui peut quoi, et où --------------------------------------
create table if not exists acces (
  id         bigint generated always as identity primary key,
  personne   bigint not null references personnes(id) on delete restrict,
  commerce   text   not null references commerces(id) on delete restrict,
  -- proprietaire : possède l'argent, invite, retire, et lui seul fait sortir.
  -- operateur    : tient le comptoir, lit les soldes, remet les reçus.
  -- lecteur      : lit, télécharge, et rien d'autre.
  -- admin        : le super-admin de la plateforme. Il voit et il administre,
  --                et il ne peut déclencher AUCUN mouvement d'argent — la
  --                séparation est structurelle, pas contractuelle.
  role       text not null check (role in ('proprietaire', 'operateur', 'lecteur', 'admin')),
  -- Une assistance déclarée vaut mieux qu'une captation qu'on découvre trop
  -- tard : « Mme Ngo, assistée de Paul ». Révocable par elle seule.
  assiste    bigint references personnes(id),
  invite_par bigint references personnes(id),
  cree_le    timestamptz not null default now(),
  -- Retirer, c'est dater — jamais supprimer. Ce que la personne a fait reste
  -- au journal avec son nom.
  retire_le  timestamptz,
  retire_par bigint references personnes(id),
  unique (personne, commerce)
);

create index if not exists acces_commerce_idx on acces (commerce) where retire_le is null;
create index if not exists acces_personne_idx on acces (personne) where retire_le is null;

comment on table acces is
  'Le rôle d''une personne dans UN commerce. La même personne peut être '
  'opératrice ici et lectrice ailleurs.';

-- --- Les invitations : rien n'existe avant ---------------------------------
-- L'invitation visait un numéro dans son premier jet ; elle vise une adresse.
-- Sur une base où l'ancienne colonne existe, on la renomme plutôt que d'en
-- ajouter une seconde.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'invitations' and column_name = 'telephone') then
    alter table invitations rename column telephone to courriel;
  end if;
end $$;

create table if not exists invitations (
  id          bigint generated always as identity primary key,
  -- L'empreinte du jeton, jamais le jeton. Qui lit la base ne peut ouvrir
  -- aucune invitation ; il peut seulement vérifier celle qu'on lui présente.
  jeton_empreinte text not null unique,
  commerce    text not null references commerces(id) on delete restrict,
  role        text not null check (role in ('proprietaire', 'operateur', 'lecteur', 'admin')),
  nom         text not null,             -- le nom lisible que le propriétaire a saisi
  -- L'invitation est LIÉE à l'adresse dès l'émission : le code part sur CETTE
  -- adresse, pas sur celle qu'on tape à l'ouverture. C'est ce qui la protège
  -- du lien qui traîne dans un groupe WhatsApp de quarante personnes.
  courriel    text not null,
  langue      text not null default 'fr' check (langue in ('fr', 'en')),
  creee_par   bigint references personnes(id),
  creee_le    timestamptz not null default now(),
  -- Plusieurs jours, pas quinze minutes : le lien passe par WhatsApp, se fait
  -- suivre, et s'ouvre parfois le surlendemain — après un délestage de douze
  -- heures ou un forfait épuisé le 28.
  expire_le   timestamptz not null,
  -- Usage unique. La seconde ouverture n'ouvre rien ET prévient.
  consommee_le  timestamptz,
  consommee_par bigint references personnes(id),
  annulee_le    timestamptz,
  -- La première ouverture par quelqu'un d'autre est un signal, pas une erreur.
  premiere_vue_le timestamptz
);

create index if not exists invitations_ouvertes_idx on invitations (commerce)
  where consommee_le is null and annulee_le is null;

-- --- Les sessions : pour pouvoir en fermer une -----------------------------
-- C'est tout l'objet de cette table. Sans elle, « retirer l'accès » ne ferme
-- rien : le jeton déjà signé reste valable jusqu'à son expiration, et le
-- téléphone de quelqu'un qui vient d'être licencié continue d'ouvrir la
-- boutique. Une case cochée n'est pas une sécurité.
create table if not exists sessions (
  id          text primary key,          -- identifiant aléatoire porté par le jeton
  personne    bigint not null references personnes(id) on delete restrict,
  commerce    text references commerces(id) on delete restrict,
  role        text not null,
  -- Ce que la personne reconnaîtra dans la liste de ses appareils :
  -- « Chrome sur Android », « Safari sur iPhone ». Jamais une empreinte
  -- technique qu'elle ne saurait pas relier à un objet de sa poche.
  appareil    text,
  lieu        text,                      -- « Douala, Cameroun », approximatif
  -- Un téléphone de comptoir ne porte jamais de clé liée à l'appareil, et sa
  -- session se ferme en fin de journée. La distinction se fait ici.
  partage     boolean not null default false,
  ouverte_le  timestamptz not null default now(),
  vue_le      timestamptz not null default now(),
  expire_le   timestamptz not null,
  revoquee_le timestamptz,
  -- « sortie » | « retrait_acces » | « tout_fermer » | « expiree » | « sms_stop »
  -- Le dernier : quelqu'un dont le téléphone vient d'être arraché n'a pas
  -- d'appareil pour ouvrir un écran. Il peut emprunter un combiné et envoyer
  -- un mot.
  revoquee_motif text
);

create index if not exists sessions_vivantes_idx on sessions (personne)
  where revoquee_le is null;
create index if not exists sessions_commerce_idx on sessions (commerce)
  where revoquee_le is null;

comment on table sessions is
  'Une session ouverte quelque part. Sa raison d''être : pouvoir la fermer '
  'à la seconde, et non à la prochaine entrée.';

-- --- Les preuves d'entrée : ce qu'une personne possède ---------------------
-- Codes de secours sur papier, clés d'accès, numéro pour le SMS. Une ligne
-- par preuve, pour pouvoir en retirer une sans toucher aux autres.
create table if not exists preuves (
  id         bigint generated always as identity primary key,
  personne   bigint not null references personnes(id) on delete restrict,
  -- « papier » : un code de secours à usage unique. Le NIST les qualifie
  --              formellement de « quelque chose que l'on a » (SP 800-63B-4
  --              §3.1.2) — et c'est la seule voie qui ne demande ni téléphone,
  --              ni réseau, ni électricité.
  -- « appareil » : une clé d'accès. Elle prouve le TÉLÉPHONE, pas la personne :
  --              interdite sur un combiné de comptoir.
  -- « sms »     : le canal « restreint » de SP 800-63B-4 §3.2.9. Permis, mais
  --              jamais seul, et la personne doit être prévenue du risque.
  genre      text not null check (genre in ('papier', 'appareil', 'sms')),
  -- Empreinte, jamais le secret. Pour une clé d'accès, la clé publique.
  empreinte  text not null,
  etiquette  text,                       -- « Samsung de Mme Fotso »
  cree_le    timestamptz not null default now(),
  -- Un code de secours sert une fois. La date dit quand, et le propriétaire
  -- est prévenu à chaque usage : un code consommé, c'est soit une panne, soit
  -- quelqu'un.
  utilise_le timestamptz,
  retire_le  timestamptz
);

create index if not exists preuves_personne_idx on preuves (personne, genre)
  where retire_le is null;

-- --- Le journal des entrées ------------------------------------------------
-- Ce qui se passe à la porte, gardé même quand rien n'a été ouvert. C'est ce
-- journal qui permet de dire à une propriétaire « cinq codes ont été essayés
-- sur la clé de J. Eyenga hier soir » — et de le lui dire, plutôt que de le
-- laisser dans un fichier technique que personne ne lit.
create table if not exists entrees (
  id         bigint generated always as identity primary key,
  personne   bigint references personnes(id),     -- nul si l'adresse est inconnue
  commerce   text references commerces(id),
  -- « ouverte » | « refusee » | « expiree » | « ralentie » | « invitation »
  issue      text not null,
  -- « papier » | « appareil » | « sms » | « invitation »
  moyen      text,
  appareil   text,
  lieu       text,
  survenu_le timestamptz not null default now()
);

create index if not exists entrees_personne_idx on entrees (personne, survenu_le desc);
create index if not exists entrees_commerce_idx on entrees (commerce, survenu_le desc);

-- --- Qui a demandé ---------------------------------------------------------
-- La colonne qui manquait, et la plus importante du fichier. Sans elle, le
-- journal des commandes ne peut désigner personne, et le contrôle d'accès
-- n'est qu'un décor : on ne peut ni confondre, ni disculper.
alter table commandes add column if not exists demandee_par bigint references personnes(id);
alter table commandes add column if not exists commerce text references commerces(id);
create index if not exists commandes_auteur_idx on commandes (demandee_par, demandee_le desc);

-- --- Sécurité : ces tables aussi sont fermées ------------------------------
-- Comme les autres. Le Pi écrit avec la clé de service, qui contourne ces
-- règles ; l'application web lit avec la clé publique et n'obtient rien sans
-- session. Les politiques fines par rôle viennent avec le verrou (phase 0.3) :
-- ici on ferme d'abord, on ouvrira ensuite, jamais l'inverse.
do $$
declare t text;
begin
  foreach t in array array['commerces','personnes','acces','invitations',
                           'sessions','preuves','entrees']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Aucune politique de lecture n'est posée ici, volontairement : sans
-- politique, une clé publique ne lit RIEN. C'est le bon défaut pour des
-- tables qui portent des empreintes de secrets et des coordonnées privées.
