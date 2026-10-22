-- ===========================================================================
-- LE FREIN DES MOTS DE PASSE · une fenêtre fixe, trois seaux, et une
-- connexion réussie qui rend son essai.
--
-- Le frein compte chaque essai AVANT de le juger — c'est voulu : soixante
-- essais lancés ensemble ne lisent pas tous un compteur à zéro. Mais il
-- gardait aussi les connexions RÉUSSIES, et ne repartait de un qu'après un
-- quart d'heure sans UN SEUL essai. Mesuré : après soixante-dix connexions
-- réussies, chaque connexion de la plateforme attendait huit secondes.
--
-- Et son mur était par ADRESSE. Un opérateur mobile met des centaines de
-- téléphones derrière une seule adresse : un voisin qui se trompait soixante
-- fois fermait la porte à tous les autres, propriétaire compris.
--
--   1. freins.debut  : le début de la fenêtre. « vu » reste le dernier essai.
--   2. frein_compter : compte UN seau, dans une fenêtre FIXE ouverte par le
--                      premier essai. Une ligne sans début — écrite par la
--                      règle d'hier, qui comptait aussi les réussites —
--                      repart de un.
--   3. frein_essai   : compte un essai de mot de passe dans ses trois seaux,
--                      dans cet ordre, et s'arrête au premier mur :
--                        · l'ADRESSE — un plafond haut, qui ne protège que le
--                          serveur (chaque essai coûte 210 000 tours) ;
--                        · le COUPLE adresse + compte visé — le vrai mur :
--                          une adresse qui attaque un compte se ferme CE
--                          compte, jamais celui des voisins ;
--                        · le COMPTE, de partout — une attaque répartie.
--                      Une adresse murée n'écrit donc plus rien de neuf.
--                      Et elle fait le ménage : une ligne dont le dernier
--                      essai a plus d'une heure n'a plus de fenêtre ouverte.
--   4. frein_rendre  : une connexion réussie rend l'essai qu'elle avait pris,
--                      dans chacun de ses seaux. Seuls les échecs restent.
--
-- `compter_un_essai` reste en place : une plateforme d'hier l'appelle
-- encore. Tant que ces fonctions manquent, la plateforme d'aujourd'hui
-- compte les connexions dans sa mémoire, et le note au journal.
--
-- Rejouable. À coller dans l'éditeur SQL de Supabase, après
-- 20261020_demo_recus.sql. Le même texte est dans sql/schema.sql, pour une
-- base neuve.
-- ===========================================================================

-- 1. Le début de la fenêtre.
alter table freins add column if not exists debut timestamptz;

-- 2. Compter un seau, dans une fenêtre fixe. Une seule instruction, sous le
--    verrou de la ligne : lire puis écrire laisserait passer une rafale.
--    Toutes les expressions du « set » lisent la ligne D'AVANT ; un début
--    absent rend la comparaison nulle, donc fausse : la fenêtre repart.
create or replace function frein_compter(la_cle text, fenetre_s integer)
returns integer
language sql
set search_path = public
as $$
  insert into public.freins (cle, n, vu, debut)
  values (la_cle, 1, now(), now())
  on conflict (cle) do update
    set n = case
              when freins.debut > now() - make_interval(secs => fenetre_s)
              then freins.n + 1
              else 1
            end,
        debut = case
              when freins.debut > now() - make_interval(secs => fenetre_s)
              then freins.debut
              else now()
            end,
        vu = now()
  returning n;
$$;

-- 3. Un essai de mot de passe, ses trois seaux. Rend {adresse, couple,
--    compte} ; 0 pour un seau qu'on n'a pas touché. Le couple et le compte
--    sont facultatifs (null) : l'inscription ne vise aucun compte, et la
--    vitrine — dont le mot de passe est public — n'a pas de seau de compte.
create or replace function frein_essai(
  p_adresse text, p_couple text, p_compte text,
  fenetre_s integer, mur_adresse integer, mur_couple integer)
returns integer[]
language plpgsql
set search_path = public
as $$
declare
  a integer;
  c integer := 0;
  k integer := 0;
begin
  delete from public.freins
   where vu < now() - make_interval(secs => greatest(fenetre_s, 3600));
  a := public.frein_compter(p_adresse, fenetre_s);
  if a > mur_adresse or p_couple is null then
    return array[a, 0, 0];
  end if;
  c := public.frein_compter(p_couple, fenetre_s);
  if c > mur_couple or p_compte is null then
    return array[a, c, 0];
  end if;
  k := public.frein_compter(p_compte, fenetre_s);
  return array[a, c, k];
end;
$$;

-- 4. Rendre un essai : la connexion a réussi, elle ne compte pas. Jamais
--    sous zéro ; une clé inconnue ne crée rien. (Une première version de
--    cette migration le faisait clé par clé : elle s'efface.)
drop function if exists frein_rendre(text);
create or replace function frein_rendre(les_cles text[])
returns void
language sql
set search_path = public
as $$
  update public.freins set n = greatest(n - 1, 0) where cle = any(les_cles);
$$;

-- Personne d'autre que la plateforme : ni le navigateur, ni le téléphone ne
-- parlent à la base. Rendre un essai, pour un inconnu, ce serait effacer ses
-- propres échecs.
revoke all on function frein_compter(text, integer) from public, anon, authenticated;
revoke all on function frein_essai(text, text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function frein_rendre(text[]) from public, anon, authenticated;
-- …et la plateforme, elle, les appelle : son rôle les reçoit en propre, sans
-- dépendre des droits par défaut de l'hébergeur.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function frein_compter(text, integer),
      frein_essai(text, text, text, integer, integer, integer),
      frein_rendre(text[]) to service_role;
  end if;
end $$;
