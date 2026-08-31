-- IL NE PEUT Y AVOIR QU'UN SEUL PROPRIÉTAIRE. La base doit le tenir.
--
-- La plateforme comptait les comptes, voyait zéro, et créait un
-- propriétaire. Entre le comptage et la création il se passe un temps —
-- celui d'un aller-retour vers la base, plus celui du calcul de l'empreinte
-- du mot de passe, qui est LENT à dessein (210 000 tours). Deux inscriptions
-- arrivées ensemble sur une plateforme neuve comptaient donc toutes les deux
-- zéro, et devenaient toutes les deux propriétaires.
--
-- Ce n'est pas une hypothèse : trois inscriptions lancées ensemble contre un
-- vrai serveur ont donné TROIS propriétaires, trois sessions ouvertes,
-- trois comptes approuvés. Chacun d'eux peut lire tous les SMS, voir tous
-- les soldes, faire composer des codes USSD par le terminal — et fermer le
-- compte des deux autres, dont celui du vrai propriétaire.
--
-- Une vérification faite AVANT une écriture ne garantit rien : entre les
-- deux, quelqu'un d'autre a pu écrire. La seule chose qui tienne est une
-- règle que la BASE fait respecter au moment de l'écriture. C'est ce que
-- fait cet index : deux lignes ne peuvent pas porter « proprietaire ». La
-- deuxième inscription est refusée par la base elle-même, et la plateforme
-- répond ce qu'elle répond à toute inscription tardive — « la porte est
-- fermée » —, sans jamais dire pourquoi.
--
--     psql "$SUPABASE_DB_URL" -f migrations/20260831_un-seul-proprietaire.sql
--
-- SI ELLE ÉCHOUE, c'est que la base porte DÉJÀ plusieurs propriétaires —
-- c'est-à-dire que la course a déjà eu lieu. La requête de contrôle plus bas
-- les montre ; il faut alors décider lequel est le vrai et rétrograder les
-- autres en « invite » avant de rejouer ce fichier.

create unique index if not exists utilisateurs_un_seul_proprietaire
  on utilisateurs (role) where role = 'proprietaire';

-- ---------------------------------------------------------------------------
-- Vérification. À lire, pas à croire.
-- ---------------------------------------------------------------------------
do $$
declare
  combien int;
begin
  select count(*) into combien from utilisateurs where role = 'proprietaire';
  raise notice 'propriétaires : % (jamais plus de 1 désormais)', combien;

  if not exists (
    select 1 from pg_indexes
    where tablename = 'utilisateurs'
      and indexname = 'utilisateurs_un_seul_proprietaire'
  ) then
    raise exception 'L''index du propriétaire unique N''EST PAS EN PLACE.';
  end if;

  raise notice 'La règle est en place : la base refusera un second propriétaire.';
end $$;
