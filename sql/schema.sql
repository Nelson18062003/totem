-- ---------------------------------------------------------------------------
-- TOTEM — structure de la base Supabase
--
-- À coller dans l'éditeur SQL de Supabase (menu « SQL Editor » → « New query »),
-- puis exécuter. Le script est rejouable : le relancer ne casse rien.
--
-- Vérifié sur PostgreSQL 16 : trois exécutions de suite sur une base neuve,
-- sans erreur, puis une exécution sur une base créée avec la version
-- précédente du schéma — données conservées, colonnes ajoutées, contrainte
-- d'unicité basculée du libellé vers l'ICCID.
--
-- Principe : le Raspberry Pi reste la source de vérité. Il écrit ici une copie
-- de ce qu'il a vu, quand il a du réseau. Le cloud sert à consulter depuis
-- n'importe où et à survivre à la mort d'une carte mémoire — pas à décider.
-- ---------------------------------------------------------------------------

-- --- Terminaux : un Raspberry Pi, quelque part -----------------------------
create table if not exists terminaux (
  id          text primary key,          -- « douala », « atelier »…
  nom         text,
  vu_le       timestamptz,               -- dernier signe de vie
  sante       jsonb,                     -- température, tension, disque…
  version     text,                      -- code réellement en service
  cree_le     timestamptz not null default now()
);

comment on table terminaux is
  'Un boîtier TOTEM. « vu_le » permet de détecter un terminal devenu muet, '
  '« version » de vérifier qu''un correctif est bien déployé.';

-- --- Cartes : le registre des SIM, présentes ou retirées --------------------
-- L'ICCID est le numéro de série gravé sur la puce. Contrairement à
-- l'opérateur, il est unique au monde : deux SIM MTN achetées le même jour ne
-- le partagent pas. C'est donc lui qui sépare les historiques quand on change
-- de carte dans le berceau — l'opérateur seul les mélangerait.
--
-- De l'IMSI, on ne garde que les cinq premiers chiffres (pays + opérateur) :
-- ils expliquent le nom du compte, le reste identifie l'abonné et n'a rien à
-- faire ici.
create table if not exists cartes (
  id            bigint generated always as identity primary key,
  terminal      text not null references terminaux(id) on delete cascade,
  iccid         text not null,
  imsi_prefixe  text,                    -- « 62401 » = MTN Cameroun
  operateur     text,                    -- « MTN », « Orange »
  libelle       text,                    -- « MTN ·8901 », déduit de l'ICCID
  -- Nom commercial du compte (« WONDER PHONE »), déclaré depuis Telegram.
  -- Ni la puce ni le réseau ne le connaissent : seul le propriétaire le sait.
  nom           text,
  -- MSISDN. La puce ne le déclare presque jamais ; c'est donc le propriétaire
  -- qui l'inscrit, et sans lui un reçu ne sait pas de quel côté d'un
  -- transfert se trouve le terminal.
  numero        text,
  imei          text,                    -- dernier modem qui l'a hébergée
  premiere_vue  timestamptz,
  derniere_vue  timestamptz,
  cree_le       timestamptz not null default now(),
  unique (terminal, iccid)
);

comment on table cartes is
  'Toutes les SIM vues par un terminal. « derniere_vue » dit depuis quand une carte a été retirée.';

-- --- Comptes : l'état courant d'une SIM en place ----------------------------
create table if not exists comptes (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  iccid       text,                      -- la carte : clé réelle du compte
  libelle     text not null,             -- « MTN ·8901 »
  operateur   text,                      -- opérateur d'origine, lu sur l'IMSI
  reseau      text,                      -- réseau visité (itinérance)
  itinerance  boolean not null default false,
  numero      text,
  -- numeric, pas bigint : Orange annonce des soldes à la décimale
  -- (« 2784137.6 FCFA »). En bigint, PostgreSQL arrondit SANS RIEN DIRE, et
  -- la plateforme afficherait un solde que l'opérateur n'a jamais annoncé.
  solde       numeric,                   -- en FCFA, tel que l'opérateur l'annonce
  signal      int,                       -- 0..31
  maj         timestamptz not null default now(),
  unique (terminal, iccid)
);

-- --- Paiements : ce que les SMS racontent, une fois compris -----------------
create table if not exists paiements (
  id           bigint generated always as identity primary key,
  terminal     text not null references terminaux(id) on delete cascade,
  -- Identifiant de la ligne dans le journal local du Pi. Couplé au terminal,
  -- il garantit qu'un même paiement renvoyé deux fois (reprise après coupure)
  -- n'apparaisse qu'une seule fois ici.
  source_id    bigint not null,
  compte       text,                     -- libellé du compte (« MTN ·8901 »)
  -- ICCID de la carte qui a reçu ce paiement. C'est lui qui rattache la somme
  -- au bon solde : deux SIM du même opérateur ne partagent pas leur caisse.
  carte        text,
  -- Nul quand le SMS nomme les deux parties sans dire laquelle est la nôtre
  -- (forme d'Orange Money) et que la SIM ne déclare pas son propre numéro.
  -- Mieux vaut un sens inconnu qu'un sens inversé.
  sens         text check (sens in ('entree', 'sortie')),
  -- numeric, pas bigint : Orange annonce des soldes à la décimale
  -- (« 2784137.6 FCFA »). Un entier les aurait tronqués ou refusés.
  montant      numeric,
  tiers        text,                     -- nom si connu, sinon numéro
  numero       text,
  reference    text,                     -- référence de transaction opérateur
  solde_apres  numeric,
  frais        numeric,
  commission   numeric,                  -- Orange la détaille à part des frais
  montant_brut numeric,                  -- « Montant Transaction », avant frais
  -- Qui a envoyé le SMS, tel que le téléphone l'affiche : « OrangeMoney »,
  -- « Orange », « MTN »… C'est le nom que la liste des SMS met en avant.
  expediteur   text,
  -- La catégorie devinée du SMS, pour la boîte de réception : encaissement,
  -- envoi, transfert, depot, retrait, solde, echec, code, publicite,
  -- illisible, message. « echec » : une opération annulée ou échouée — rien
  -- ne s'est passé. « illisible » : le message parle d'argent mais le robot
  -- n'a pas su le lire en entier — il le dit, plutôt que de se déguiser.
  categorie    text,
  -- La nature CHOISIE par le propriétaire (depot/retrait/transfert/solde),
  -- qui l'emporte sur la catégorie devinée et déclenche le reçu.
  nature       text,
  texte        text not null,            -- le SMS d'origine : il fait foi
  -- Heure RÉSEAU du SMS (TP-SCTS) quand le PDU la donne : l'heure vraie de
  -- l'opération. « recu_le » est l'heure de relève du Pi ; les deux divergent
  -- après une coupure, et c'est « emis_le » qui fait foi pour l'ordre.
  emis_le      timestamptz,
  recu_le      timestamptz not null,
  -- L'heure retenue pour l'ordre d'affichage : réseau si connue, sinon relève.
  -- Colonne calculée, indexée : le tri ne balaie jamais la table.
  moment       timestamptz generated always as (coalesce(emis_le, recu_le)) stored,
  cree_le      timestamptz not null default now(),
  unique (terminal, source_id)
);

comment on column paiements.texte is
  'Message d''origine, jamais modifié : c''est lui qui fait foi en cas de litige.';

-- --- Événements : la vie du terminal ---------------------------------------
create table if not exists evenements (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  source_id   bigint not null,
  texte       text not null,
  survenu_le  timestamptz not null,
  cree_le     timestamptz not null default now(),
  unique (terminal, source_id)
);

-- --- Reçus : les PDF joints aux notifications ------------------------------
-- Le document lui-même vit dans le stockage (compartiment « recus ») ; cette
-- table dit ce qu'il contient et où le trouver. La carte SD du Pi n'en garde
-- aucune copie : un reçu se refabrique à l'identique depuis son SMS, qui est
-- dans « paiements ».
create table if not exists recus (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  numero      text not null,             -- « TM-2026-0731-0042 »
  genre       text not null check (genre in ('transfert', 'solde')),
  reference   text,                      -- ID de transaction de l'opérateur
  montant     numeric,
  chemin      text not null,             -- objet de stockage : « totem/xxx.pdf »
  etabli_le   timestamptz not null,
  cree_le     timestamptz not null default now(),
  unique (terminal, numero)
);

-- --- Commandes : le canal descendant (phase 6) -----------------------------
-- Déclaré maintenant pour éviter une migration plus tard. Inutilisé tant que
-- l'application web ne pilote pas encore le terminal.
create table if not exists commandes (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  type        text not null,             -- « solde », « ussd »…
  parametres  jsonb not null default '{}'::jsonb,
  etat        text not null default 'en_attente'
                check (etat in ('en_attente', 'en_cours', 'faite', 'echouee')),
  resultat    text,
  demandee_le timestamptz not null default now(),
  traitee_le  timestamptz
);

-- --- Raccourcis : les boutons USSD appris, par opérateur --------------------
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
  maj         timestamptz not null default now(),
  cree_le     timestamptz not null default now(),
  unique (terminal, operateur, nom)
);

comment on table raccourcis is
  'Les boutons USSD appris par le robot, par opérateur. Copie du journal '
  'local du terminal : c''est lui qui écrit, la plateforme ne fait que lire.';

-- Les téléphones qui reçoivent les notifications.
--
-- C'est le robot de Douala qui fait sonner (voir totem/notification.py) : il
-- lui faut donc savoir À QUI. Les appareils s'inscrivent ici en passant par
-- la plateforme (/api/appareil, derrière le verrou), jamais en écrivant
-- directement — le téléphone n'a aucune clé.
--
-- Le jeton d'Expo identifie un APPAREIL, pas une personne. Il ne dit rien du
-- propriétaire, ne permet pas de le localiser, et n'ouvre l'accès à rien : il
-- autorise seulement à faire sonner ce téléphone-là.
create table if not exists appareils (
  -- « ExpoPushToken[xxxxxxxx] ». C'est LUI la clé : réinstaller l'application
  -- en donne un neuf, et l'ancien s'éteint tout seul chez Expo.
  jeton       text primary key,
  plateforme  text,                      -- « android » ou « ios »
  -- De quoi reconnaître l'appareil dans une liste (« Pixel 8 »), quand il
  -- faudra en retirer un. Jamais un identifiant matériel : le modèle suffit.
  nom         text,
  -- Dernière fois que l'application s'est signalée. Un appareil qui ne
  -- reparaît plus a été perdu, vendu ou désinstallé.
  vu_le       timestamptz not null default now(),
  cree_le     timestamptz not null default now()
);

comment on table appareils is
  'Les téléphones à qui le robot fait sonner une notification. Le jeton '
  'identifie un appareil, jamais une personne, et n''ouvre l''accès à rien.';

-- Les comptes qui ouvrent la plateforme.
--
-- Avant, la plateforme avait UN mot de passe rangé dans une variable
-- d'environnement. Cela marche pour une personne seule, et ne sait rien faire
-- d'autre : ni dire qui s'est connecté, ni ouvrir à quelqu'un sans lui donner
-- la clé de la maison, ni la lui retirer sans la changer pour tout le monde.
create table if not exists utilisateurs (
  id          bigint generated always as identity primary key,
  -- En MINUSCULES, sans espaces : deux écritures d'une même adresse feraient
  -- deux comptes qu'on croirait un seul.
  courriel    text not null unique,
  -- L'empreinte, jamais le mot de passe :
  -- « pbkdf2$sha256$210000$<sel>$<empreinte> ». Voir web/lib/motdepasse.ts.
  empreinte   text not null,
  -- « proprietaire » ou « invite ». Le PREMIER compte créé est le
  -- propriétaire : personne n'est là pour l'approuver.
  role        text not null default 'invite',
  -- Un compte non approuvé est créé mais n'ouvre rien.
  approuve    boolean not null default false,
  cree_le     timestamptz not null default now(),
  vu_le       timestamptz
);

comment on table utilisateurs is
  'Les comptes qui ouvrent la plateforme. Le mot de passe n''y est jamais : '
  'seulement son empreinte PBKDF2, qui ne se remonte pas.';

-- ---------------------------------------------------------------------------
-- Mise à niveau des bases créées avant le cloisonnement par carte
--
-- « create table if not exists » ne touche pas une table déjà là : sur un
-- projet Supabase créé avec la version précédente du schéma, les nouvelles
-- colonnes n'apparaîtraient jamais. Ce bloc les rattrape.
--
-- Il vient AVANT les index, et ce n'est pas un détail : un index sur la
-- colonne « carte » écrit plus haut échouerait sur une base existante, où
-- cette colonne n'a pas encore été ajoutée.
--
-- Sur une base neuve, ce bloc ne fait rien de plus. Le relancer n'a aucun
-- effet — c'est ce qui rend ce fichier rejouable tel quel, autant de fois
-- qu'on veut.
-- ---------------------------------------------------------------------------
alter table terminaux add column if not exists version    text;
alter table comptes   add column if not exists iccid      text;
alter table comptes   add column if not exists reseau     text;
alter table comptes   add column if not exists itinerance boolean not null default false;
alter table cartes    add column if not exists nom        text;
alter table paiements add column if not exists carte      text;
alter table paiements add column if not exists expediteur   text;
alter table paiements add column if not exists commission   numeric;
alter table paiements add column if not exists montant_brut numeric;
alter table paiements add column if not exists categorie    text;
alter table paiements add column if not exists nature       text;
alter table paiements add column if not exists emis_le      timestamptz;
-- La colonne calculée « moment » vient APRÈS emis_le (elle en dépend).
alter table paiements add column if not exists moment       timestamptz
  generated always as (coalesce(emis_le, recu_le)) stored;

-- Lu / non-lu : quand le propriétaire a OUVERT ce SMS sur la plateforme.
-- Vide = pas encore regardé ; c'est la pastille « N nouveaux » du menu.
-- La colonne s'ajoute UNE fois, et l'existant est alors marqué vu — sinon la
-- plateforme s'ouvrirait sur des centaines de « nouveaux » qui n'en sont pas.
-- Le remplissage ne se rejoue jamais : relancer ce fichier ne touche pas au
-- compteur de non-lus.
do $$
begin
  if not exists (select 1 from pg_attribute
                 where attrelid = 'paiements'::regclass
                   and attname = 'lu_le' and not attisdropped) then
    alter table paiements add column lu_le timestamptz;
    update paiements set lu_le = coalesce(recu_le, now());
  end if;
end $$;

-- Les montants étaient des entiers. Orange annonce ses soldes à la décimale
-- (« Nouveau Solde: 2784137.6 FCFA ») : en bigint, PostgreSQL les ARRONDIT
-- sans rien signaler, et la plateforme afficherait un solde que l'opérateur
-- n'a jamais annoncé. Relancer ces lignes sur des colonnes déjà en numeric ne
-- fait rien.
alter table comptes   alter column solde       type numeric;
alter table paiements alter column montant     type numeric;
alter table paiements alter column solde_apres type numeric;
alter table paiements alter column frais       type numeric;

-- La clé d'un compte était son libellé (« MTN »). Deux SIM MTN successives
-- s'écrasaient donc l'une l'autre : une seule ligne pour deux caisses. La clé
-- devient l'ICCID, qui distingue physiquement les puces.
--
-- Le filtre sur « conrelid » est nécessaire : un nom de contrainte n'est
-- unique que par table, et sans lui on risquerait d'en viser une autre.
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'comptes_terminal_libelle_key'
               and conrelid = 'comptes'::regclass) then
    alter table comptes drop constraint comptes_terminal_libelle_key;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'comptes_terminal_iccid_key'
                   and conrelid = 'comptes'::regclass) then
    alter table comptes add constraint comptes_terminal_iccid_key
      unique (terminal, iccid);
  end if;
end $$;

-- Le grand livre ne doit pas s'effacer par accident. Les tables financières
-- (paiements, reçus) étaient en « on delete cascade » sur le terminal :
-- supprimer par erreur la ligne « douala » aurait effacé, en silence et sans
-- retour, tous les encaissements et tous les reçus. On bascule ces deux clés
-- en « restrict » : tant qu'il reste de l'argent tracé, la base REFUSE de
-- supprimer le terminal. Les tables d'état (cartes, comptes, événements,
-- commandes) gardent la cascade — elles n'ont pas la même valeur de preuve.
--
-- Rejouable : on retire la clé existante (quel que soit son nom) puis on pose
-- la version « restrict ». Sur une base déjà migrée, on repose la même.
do $$
declare tbl text; nom text;
begin
  foreach tbl in array array['paiements','recus']
  loop
    for nom in
      select conname from pg_constraint
      where conrelid = tbl::regclass and contype = 'f'
        and confrelid = 'terminaux'::regclass
    loop
      execute format('alter table %I drop constraint %I', tbl, nom);
    end loop;
    execute format(
      'alter table %I add constraint %I foreign key (terminal) '
      'references terminaux(id) on delete restrict',
      tbl, tbl || '_terminal_restrict_fkey');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Index — après la migration, donc toutes les colonnes existent
-- ---------------------------------------------------------------------------
create index if not exists paiements_recu_le_idx on paiements (recu_le desc);
-- L'affichage est trié par « moment » (heure réseau si connue, sinon relève).
create index if not exists paiements_moment_idx on paiements (terminal, moment desc);
create index if not exists paiements_compte_idx  on paiements (terminal, compte);
create index if not exists paiements_carte_idx   on paiements (terminal, carte);
create index if not exists paiements_tiers_idx   on paiements (tiers);
-- La pastille des non-lus compte « lu_le is null » à chaque veille du
-- navigateur : l'index partiel rend ce compte immédiat.
create index if not exists paiements_non_lus_idx
  on paiements (terminal) where lu_le is null;
create index if not exists cartes_derniere_vue_idx on cartes (terminal, derniere_vue desc);
-- Le web trie les reçus par date d'établissement (recus?order=etabli_le.desc) :
-- sans index, c'est un tri complet de la table à chaque page.
create index if not exists recus_etabli_le_idx on recus (terminal, etabli_le desc);
create index if not exists commandes_attente_idx
  on commandes (terminal, etat) where etat = 'en_attente';
-- Le robot lit « les appareils encore vivants » : un index sur la date rend
-- cette lecture immédiate même avec des années d'appareils oubliés.
create index if not exists appareils_vu_le on appareils (vu_le desc);
-- La connexion cherche par courriel, à chaque tentative.
create index if not exists utilisateurs_courriel on utilisateurs (lower(courriel));

-- ---------------------------------------------------------------------------
-- Sécurité : PERSONNE ne lit cette base directement.
--
-- CE COMMENTAIRE A DÉJÀ MENTI, et cela a compté. Il disait « l'application
-- web lit avec la clé publique, et n'obtient rien sans session » — c'était
-- vrai d'une architecture qui n'a jamais vu le jour. La plateforme lit avec
-- la CLÉ DE SERVICE (web/lib/serveur.ts), comme le robot. Cette clé
-- contourne toutes les règles ci-dessous, par nature.
--
-- Ce qu'il faut en retenir, et qui commande tout le reste : LA BASE NE
-- PROTÈGE RIEN. Toute l'autorisation est du code, dans la plateforme —
-- `middleware.ts` pour le verrou du bord, `lib/garde.ts` pour la relecture
-- des comptes derrière lui. Qui lit `schema.sql` en croyant y trouver une
-- deuxième ligne de défense se trompe de fichier.
--
-- Aucune politique n'est donc créée : RLS est active partout, sans porte.
-- Une table dont RLS est active et qui n'a aucune politique ne laisse passer
-- personne — sauf la clé de service. C'est exactement ce qu'on veut.
--
-- Il y en avait, avant : « for select to authenticated using (true) », c'est
-- à dire « tout compte connecté à la base lit tout ». Elles ne gardaient
-- rien, puisque personne n'endosse ce rôle — mais elles attendaient le jour
-- où quelqu'un obtiendrait la clé publique, qui est publique par
-- construction. Retirées le 31 août 2026 : voir
-- `migrations/20260831_regles_dormantes.sql`, qui explique le raisonnement
-- au long, et `docs/SECURITE-CONSTATS.md` (SEC-03).
--
-- Le jour où l'on voudra vraiment Supabase Auth, on réécrira des politiques —
-- nommées, cadrées, et jamais « using (true) » sur une table qui porte de
-- l'argent.
-- ---------------------------------------------------------------------------
alter table terminaux  enable row level security;
alter table cartes     enable row level security;
alter table comptes    enable row level security;
alter table paiements  enable row level security;
alter table evenements enable row level security;
alter table commandes  enable row level security;
alter table recus      enable row level security;
alter table raccourcis enable row level security;
alter table appareils  enable row level security;
alter table utilisateurs enable row level security;

-- Aucune politique, sur aucune table. Sur une base NEUVE il n'y a donc rien
-- à retirer ; sur une base déjà en service, c'est
-- `migrations/20260831_regles_dormantes.sql` qui fait le ménage.
--
-- On retire ici ce qui aurait pu être posé par une version antérieure de ce
-- même fichier : il doit être rejouable et laisser toujours le même état.
do $$
declare t text;
begin
  foreach t in array array['terminaux','cartes','comptes','paiements','evenements','commandes','recus','raccourcis']
  loop
    execute format('drop policy if exists "lecture connectee" on %I', t);
  end loop;
end $$;
drop policy if exists "demander une commande" on commandes;

-- ---------------------------------------------------------------------------
-- Le compartiment de stockage des reçus
--
-- Les PDF n'ont pas à s'accumuler sur la carte SD du Pi : le terminal les
-- fabrique en mémoire, les envoie sur Telegram, puis les dépose ici. Le
-- compartiment est privé, et on n'y accède qu'avec la clé de service — celle
-- du Pi, ou celle de la plateforme, qui sert les PDF sous son propre verrou.
--
-- Le bloc ne fait rien sur une base PostgreSQL ordinaire, où le schéma
-- « storage » n'existe pas : ce fichier doit rester exécutable partout.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('recus', 'recus', false)
    on conflict (id) do nothing;

    -- Aucune politique non plus : les PDF sont servis par la plateforme, qui
    -- les va chercher avec la clé de service (web/lib/serveur.ts).
    execute $p$drop policy if exists "recus lecture connectee" on storage.objects$p$;
  end if;
end $$;
