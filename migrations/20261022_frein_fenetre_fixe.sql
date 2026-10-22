-- ===========================================================================
-- LE FREIN DES MOTS DE PASSE · une fenêtre fixe, et une connexion réussie
-- rend son essai.
--
-- Le frein compte chaque essai AVANT de le juger — c'est voulu : soixante
-- essais lancés ensemble ne lisent pas tous un compteur à zéro. Mais il
-- gardait aussi les connexions RÉUSSIES, et ne repartait de un qu'après un
-- quart d'heure sans UN SEUL essai. Sur une adresse que partagent beaucoup
-- de téléphones — un opérateur mobile en met des centaines derrière une
-- seule —, le compteur ne redescendait donc jamais, et le mur de soixante
-- finissait par refuser tout le monde, avec le bon mot de passe.
--
--   1. freins.debut  : le début de la fenêtre. « vu » reste le dernier essai.
--   2. frein_compter : compte dans une fenêtre FIXE, ouverte par le premier
--                      essai ; passé la fenêtre, on repart de un.
--   3. frein_rendre  : une connexion réussie rend l'essai qu'elle avait pris.
--                      Seuls les échecs restent.
--
-- `compter_un_essai` reste en place : une plateforme d'hier l'appelle
-- encore. La plateforme d'aujourd'hui cherche les deux fonctions neuves ;
-- tant qu'elles manquent, elle compte dans sa mémoire, comme avant.
--
-- Rejouable. À coller dans l'éditeur SQL de Supabase, après
-- 20261020_demo_recus.sql.
-- ===========================================================================

-- 1. Le début de la fenêtre. Une ligne d'avant n'en a pas : sa fenêtre part
--    de son dernier essai, une seule fois, puis la règle neuve prend la main.
alter table freins add column if not exists debut timestamptz;

-- 2. Compter un essai, dans une fenêtre fixe. Une seule instruction, sous le
--    verrou de la ligne : lire puis écrire laisserait passer une rafale.
--    Toutes les expressions du « set » lisent la ligne D'AVANT.
create or replace function frein_compter(la_cle text, fenetre_s integer)
returns integer
language sql
set search_path = public
as $$
  insert into public.freins (cle, n, vu, debut)
  values (la_cle, 1, now(), now())
  on conflict (cle) do update
    set n = case
              when coalesce(freins.debut, freins.vu) > now() - make_interval(secs => fenetre_s)
              then freins.n + 1
              else 1
            end,
        debut = case
              when coalesce(freins.debut, freins.vu) > now() - make_interval(secs => fenetre_s)
              then coalesce(freins.debut, freins.vu)
              else now()
            end,
        vu = now()
  returning n;
$$;

-- 3. Rendre un essai : la connexion a réussi, elle ne compte pas. Jamais
--    sous zéro ; une clé inconnue ne crée rien.
create or replace function frein_rendre(la_cle text)
returns void
language sql
set search_path = public
as $$
  update public.freins set n = greatest(n - 1, 0) where cle = la_cle;
$$;

-- Personne d'autre que la plateforme : ni le navigateur, ni le téléphone ne
-- parlent à la base. Rendre un essai, pour un inconnu, ce serait effacer ses
-- propres échecs.
revoke all on function frein_compter(text, integer) from public, anon, authenticated;
revoke all on function frein_rendre(text) from public, anon, authenticated;
