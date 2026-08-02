-- ---------------------------------------------------------------------------
-- TOTEM — migration « refonte SMS + correctifs d'audit »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il amène une base Supabase DÉJÀ EN SERVICE au niveau du code actuel. C'est
-- le chemin, pas la structure : il ne crée aucune table, il ajoute seulement
-- ce qui manque et corrige ce qui doit l'être. La structure complète, elle,
-- reste décrite une seule fois dans « sql/schema.sql » (à utiliser pour une
-- base NEUVE). Les deux disent la même chose ; ce fichier-ci est le raccourci
-- pour une base qui contient déjà des données.
--
-- POURQUOI CETTE MIGRATION
--  - Les SMS avaient cessé de remonter : la colonne « expediteur » manquait,
--    et la base refusait chaque insertion sans le dire clairement. Elle est
--    ajoutée ici, en tout premier.
--  - La refonte « un SMS n'est pas un paiement » a besoin de trois colonnes de
--    plus (categorie, nature, emis_le) et d'une colonne calculée (moment).
--  - L'audit a demandé de protéger le grand livre de l'effacement (clés en
--    « restrict ») et d'ajouter deux index manquants.
--
-- EST-CE SANS RISQUE
-- Oui. Chaque instruction est rejouable : la relancer ne casse rien et ne
-- touche à aucune donnée existante. On peut l'exécuter deux fois de suite sans
-- effet la seconde. Aucune colonne n'est supprimée, aucune ligne n'est
-- effacée.
--
-- COMMENT L'EXÉCUTER
--  1. Ouvrir Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier.
--  3. « Run ». Quelques secondes.
--  4. Descendre jusqu'au bloc « VÉRIFICATION » en bas et lancer ces requêtes :
--     elles confirment que tout est en place.
--
-- Si la base est VIDE (nouveau projet Supabase), n'utilisez pas ce fichier :
-- lancez « sql/schema.sql », qui crée les tables d'abord.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. La refonte SMS — les colonnes qui manquaient
-- ===========================================================================

-- « expediteur » EN PREMIER : c'est son absence qui faisait disparaître les
-- SMS en silence. Qui a envoyé le message (« OrangeMoney », « MTN »…), tel que
-- le téléphone l'afficherait — c'est le nom que la boîte de réception met en
-- avant.
alter table paiements add column if not exists expediteur text;

-- La catégorie DEVINÉE par le robot, pour ranger la boîte de réception :
-- encaissement, envoi, transfert, depot, retrait, solde, code, publicite,
-- message.
alter table paiements add column if not exists categorie text;

-- La nature CHOISIE par le propriétaire (depot / retrait / transfert / solde).
-- Elle l'emporte sur la catégorie devinée et c'est elle qui déclenche le reçu.
alter table paiements add column if not exists nature text;

-- L'heure RÉSEAU du SMS (TP-SCTS), l'heure vraie de l'opération telle que
-- l'opérateur l'a datée. « recu_le » n'est que l'heure de relève du Pi ; après
-- une coupure, les deux divergent, et c'est « emis_le » qui fait foi pour
-- l'ordre d'affichage.
alter table paiements add column if not exists emis_le timestamptz;

-- « moment » : l'heure retenue pour trier — réseau si connue, sinon relève.
-- Colonne CALCULÉE (elle se remplit seule) et indexée plus bas. Elle vient
-- APRÈS « emis_le », dont elle dépend : l'ordre de ce fichier n'est pas
-- décoratif.
alter table paiements add column if not exists moment timestamptz
  generated always as (coalesce(emis_le, recu_le)) stored;

-- ===========================================================================
-- 2. Rattrapage des colonnes plus anciennes
--
-- Au cas où la base serait en retard de plus d'une version. Si elles sont déjà
-- là, ces lignes ne font rien.
-- ===========================================================================
alter table terminaux add column if not exists version    text;
alter table comptes   add column if not exists iccid      text;
alter table comptes   add column if not exists reseau     text;
alter table comptes   add column if not exists itinerance boolean not null default false;
alter table cartes    add column if not exists nom        text;
alter table paiements add column if not exists carte        text;
alter table paiements add column if not exists commission   numeric;
alter table paiements add column if not exists montant_brut numeric;

-- ===========================================================================
-- 3. Les montants à la décimale
--
-- Orange annonce ses soldes avec une virgule (« Nouveau Solde : 2784137.6
-- FCFA »). En entier (bigint), PostgreSQL ARRONDIT sans rien signaler, et la
-- plateforme afficherait un solde que l'opérateur n'a jamais annoncé. On passe
-- ces colonnes en numeric. Rejouer sur des colonnes déjà en numeric ne fait
-- rien.
-- ===========================================================================
alter table comptes   alter column solde       type numeric;
alter table paiements alter column montant     type numeric;
alter table paiements alter column solde_apres type numeric;
alter table paiements alter column frais       type numeric;

-- ===========================================================================
-- 4. La clé d'un compte : l'ICCID, pas le libellé
--
-- La clé d'unicité d'un compte était son libellé (« MTN »). Deux SIM MTN qui
-- se succèdent dans le berceau s'écrasaient donc l'une l'autre — une seule
-- ligne pour deux caisses. La clé devient l'ICCID, gravé sur la puce, qui
-- distingue physiquement les cartes. Le filtre sur « conrelid » vise la bonne
-- table : un nom de contrainte n'est unique que par table.
-- ===========================================================================
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

-- ===========================================================================
-- 5. Le grand livre protégé de l'effacement
--
-- Les tables financières (paiements, reçus) étaient rattachées au terminal en
-- « on delete cascade » : supprimer par erreur la ligne « douala » aurait
-- effacé, en silence et sans retour, tous les encaissements et tous les reçus.
-- On bascule ces deux clés en « restrict » : tant qu'il reste de l'argent
-- tracé, la base REFUSE de supprimer le terminal. Les tables d'état (cartes,
-- comptes, événements, commandes) gardent la cascade — elles n'ont pas la même
-- valeur de preuve. Rejouable : on retire la clé existante (quel que soit son
-- nom) puis on pose la version « restrict ».
-- ===========================================================================
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

-- ===========================================================================
-- 6. Les index — après les colonnes, donc elles existent toutes
-- ===========================================================================
-- Le tri d'affichage se fait sur « moment » (heure réseau si connue). Sans cet
-- index, chaque page balaierait toute la table.
create index if not exists paiements_moment_idx on paiements (terminal, moment desc);
-- Le web trie les reçus par date d'établissement : même raison.
create index if not exists recus_etabli_le_idx  on recus (terminal, etabli_le desc);
-- Les autres, s'ils manquaient encore.
create index if not exists paiements_recu_le_idx on paiements (recu_le desc);
create index if not exists paiements_compte_idx  on paiements (terminal, compte);
create index if not exists paiements_carte_idx   on paiements (terminal, carte);
create index if not exists paiements_tiers_idx   on paiements (tiers);
create index if not exists cartes_derniere_vue_idx on cartes (terminal, derniere_vue desc);
create index if not exists commandes_attente_idx
  on commandes (terminal, etat) where etat = 'en_attente';

-- ===========================================================================
-- 7. Sécurité : personne ne lit sans être connecté
--
-- Le Pi écrit avec la clé « service_role », qui contourne ces règles — c'est
-- pourquoi elle ne doit jamais quitter le fichier de configuration du Pi.
-- L'application web lit avec la clé publique et n'obtient rien sans session.
-- ===========================================================================
alter table terminaux  enable row level security;
alter table cartes     enable row level security;
alter table comptes    enable row level security;
alter table paiements  enable row level security;
alter table evenements enable row level security;
alter table commandes  enable row level security;
alter table recus      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['terminaux','cartes','comptes','paiements','evenements','commandes','recus']
  loop
    execute format(
      'drop policy if exists "lecture connectee" on %I; '
      'create policy "lecture connectee" on %I for select to authenticated using (true);',
      t, t);
  end loop;
end $$;

-- Seule écriture permise à un utilisateur connecté : demander une commande
-- (appuyer sur un bouton). Il ne peut jamais modifier l'historique.
drop policy if exists "demander une commande" on commandes;
create policy "demander une commande" on commandes
  for insert to authenticated with check (true);

-- ===========================================================================
-- 8. Le compartiment de stockage des reçus
--
-- Les PDF ne s'accumulent pas sur la carte SD du Pi : le terminal les fabrique
-- en mémoire, les envoie sur Telegram, puis les dépose ici. Compartiment
-- privé — accès en étant connecté, ou avec la clé de service. Le bloc ne fait
-- rien là où le schéma « storage » n'existe pas (PostgreSQL ordinaire).
-- ===========================================================================
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('recus', 'recus', false)
    on conflict (id) do nothing;

    execute $p$drop policy if exists "recus lecture connectee" on storage.objects$p$;
    execute $p$create policy "recus lecture connectee" on storage.objects
              for select to authenticated using (bucket_id = 'recus')$p$;
  end if;
end $$;

-- ===========================================================================
-- VÉRIFICATION — à lancer après la migration
--
-- Chaque requête doit renvoyer ce qui est annoncé. Si l'une ne renvoie rien,
-- la migration n'a pas abouti pour cette partie.
-- ===========================================================================

-- (a) Les cinq colonnes de la refonte SMS sont là ? → 5 lignes attendues.
select column_name
from information_schema.columns
where table_name = 'paiements'
  and column_name in ('expediteur', 'categorie', 'nature', 'emis_le', 'moment')
order by column_name;

-- (b) Le grand livre est-il protégé ? → « paiements » et « recus » en « r »
--     (restrict), les tables d'état en « c » (cascade).
select conrelid::regclass as table_liee, confdeltype as a_la_suppression
from pg_constraint
where contype = 'f' and confrelid = 'terminaux'::regclass
order by table_liee;

-- (c) Les deux index clés existent ? → 2 lignes attendues.
select indexname
from pg_indexes
where indexname in ('paiements_moment_idx', 'recus_etabli_le_idx')
order by indexname;
