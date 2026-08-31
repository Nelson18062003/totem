-- ---------------------------------------------------------------------------
-- TOTEM — retirer les règles qui n'ont jamais rien gardé
-- (31 août 2026 — issu de l'audit de sécurité, constat SEC-03)
--
-- CE QUE FAIT CE FICHIER
-- Il supprime les politiques de lecture accordées au rôle « authenticated »
-- sur toutes les tables, et sur le compartiment des reçus. Il ne touche à
-- aucune donnée, ne crée ni ne supprime aucune table, et n'enlève RIEN à la
-- plateforme ni au robot.
--
-- ===========================================================================
-- POURQUOI
-- ===========================================================================
--
-- Ces politiques disaient, mot pour mot :
--
--     create policy "lecture connectee" on paiements
--       for select to authenticated using (true);
--
-- « using (true) » veut dire : TOUT compte connecté à la base lit TOUT. Le
-- grand livre entier, les soldes, les reçus. Et « demander une commande »
-- allait plus loin : « for insert ... with check (true) » laisse un compte
-- connecté DÉPOSER une demande — c'est-à-dire faire composer un code sur une
-- vraie carte SIM.
--
-- Elles ont été écrites pour une architecture qui a été abandonnée depuis :
-- celle où l'application web lisait la base avec la clé PUBLIQUE, au nom de
-- la personne connectée par Supabase Auth. Le commentaire de « sql/schema.sql »
-- le dit encore ; il ne décrit plus la réalité.
--
-- Aujourd'hui, la plateforme lit avec la CLÉ DE SERVICE (web/lib/serveur.ts),
-- qui contourne les règles de la base par nature. Le robot aussi. Personne
-- n'endosse jamais le rôle « authenticated » — la table « auth.users » est
-- vide, et le code n'appelle Supabase Auth nulle part.
--
-- Ces politiques ne protègent donc rien. Elles ATTENDENT.
--
-- CE QU'ELLES ATTENDENT, précisément. La clé « anon » de Supabase est
-- publique par construction : elle est sans danger PARCE QUE les règles de la
-- base protègent les données. Ici elles ne les protègent pas. Il suffirait
-- donc que quelqu'un obtienne cette clé — et qu'une inscription Supabase Auth
-- soit possible sur le projet — pour lire 302 paiements, tous les soldes, 203
-- reçus, et déposer des commandes. La sécurité de l'argent reposerait alors
-- sur le secret d'une clé conçue pour être publique. C'est le modèle à
-- l'envers.
--
-- ===========================================================================
-- CE QUI RESTE APRÈS
-- ===========================================================================
--
-- RLS reste ACTIVE sur chaque table, sans aucune politique. En PostgreSQL,
-- une table dont RLS est active et qui n'a aucune politique ne laisse passer
-- PERSONNE — sauf la clé de service, qui la contourne. C'est exactement la
-- posture déjà choisie, et expliquée, pour « utilisateurs » et « appareils »
-- (sql/schema.sql) : « aucune politique n'est créée pour ces tables, donc
-- personne ne passe ». On l'étend simplement au reste.
--
-- La plateforme et le robot ne perdent rien : ils n'ont jamais lu autrement
-- qu'avec la clé de service.
--
-- LE JOUR OÙ L'ON VOUDRA VRAIMENT Supabase Auth, on réécrira des politiques
-- — mais nommées, cadrées, et surtout jamais « using (true) » sur une table
-- qui porte de l'argent.
--
-- ===========================================================================
-- EST-CE SANS RISQUE
-- ===========================================================================
--
-- Oui, et c'est vérifiable avant comme après :
--   · chaque instruction est rejouable — la relancer ne fait rien ;
--   · aucune donnée n'est touchée, aucune colonne, aucune ligne ;
--   · le bloc de VÉRIFICATION en bas montre l'état obtenu.
--
-- Ce qui casserait, si quelque chose devait casser : un client qui lirait la
-- base avec la clé publique. Il n'y en a aucun — ni le web, ni le téléphone
-- (qui ne connaît même pas l'adresse de Supabase), ni le robot.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ».
--  3. Lancer le bloc « VÉRIFICATION » et lire le résultat.
--  4. Rouvrir la plateforme et le téléphone : tout doit être intact.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Les politiques de lecture accordées à « authenticated »
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['terminaux','cartes','comptes','paiements',
                           'evenements','commandes','recus','raccourcis']
  loop
    -- « if exists » : rejouable, et sans effet sur une base déjà nettoyée.
    execute format('drop policy if exists "lecture connectee" on public.%I', t);
  end loop;
end $$;

-- ===========================================================================
-- 2. L'écriture : déposer une commande
--
-- Celle-ci était la plus lourde de conséquence. Une commande n'est pas une
-- ligne de plus dans une table : c'est un code composé sur une vraie carte,
-- avec de vrais francs derrière. La plateforme la dépose elle-même, avec la
-- clé de service, et seulement après avoir vérifié que c'est bien le
-- propriétaire qui la demande (web/app/api/commande/route.ts).
-- ===========================================================================
drop policy if exists "demander une commande" on public.commandes;

-- ===========================================================================
-- 3. Le compartiment des reçus
--
-- Même raison : les PDF sont servis par la plateforme, qui les va chercher
-- avec la clé de service (web/lib/serveur.ts, chargerRecu). Le compartiment
-- reste privé ; il n'a simplement plus de porte dérobée.
--
-- Le bloc ne fait rien sur une base PostgreSQL ordinaire, où le schéma
-- « storage » n'existe pas : ce fichier doit rester exécutable partout.
-- ===========================================================================
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'objects') then
    execute $p$drop policy if exists "recus lecture connectee" on storage.objects$p$;
  end if;
end $$;

-- ===========================================================================
-- 4. RLS reste active partout — on s'en assure plutôt que de l'espérer
--
-- Retirer une politique sans que RLS soit active laisserait la table
-- GRANDE OUVERTE, ce qui serait l'exact contraire du but. « enable » est
-- idempotent : le rejouer ne fait rien.
-- ===========================================================================
alter table public.terminaux    enable row level security;
alter table public.cartes       enable row level security;
alter table public.comptes      enable row level security;
alter table public.paiements    enable row level security;
alter table public.evenements   enable row level security;
alter table public.commandes    enable row level security;
alter table public.recus        enable row level security;
alter table public.raccourcis   enable row level security;
alter table public.appareils    enable row level security;
alter table public.utilisateurs enable row level security;

-- ===========================================================================
-- VÉRIFICATION — à lancer après, et à LIRE
-- ===========================================================================

-- (a) Plus AUCUNE politique ne doit rester sur « public » ni sur les reçus.
--     Le résultat attendu est : zéro ligne.
select schemaname, tablename, policyname, roles::text, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
    or (schemaname = 'storage' and policyname like '%recus%')
 order by tablename, policyname;

-- (b) RLS doit être active sur TOUTES les tables. Le résultat attendu est :
--     zéro ligne (aucune table sans RLS).
select tablename
  from pg_tables
 where schemaname = 'public' and rowsecurity = false
 order by tablename;

-- (c) Et le compte des données, pour se rassurer : rien n'a bougé.
select (select count(*) from public.paiements)    as paiements,
       (select count(*) from public.recus)        as recus,
       (select count(*) from public.utilisateurs) as comptes;
