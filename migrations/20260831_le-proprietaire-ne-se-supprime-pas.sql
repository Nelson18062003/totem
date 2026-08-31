-- LE PROPRIÉTAIRE NE SE SUPPRIME PAS. La base doit le tenir aussi.
--
-- CE QUI SE PASSAIT, joué contre un vrai serveur. La clé de secours ouvre
-- l'administration sans désigner personne : la garde « on ne se supprime pas
-- soi-même » ne s'appliquait donc pas à elle, et le compte du propriétaire
-- pouvait disparaître. La table des comptes se vidait ; la plateforme lisait
-- « aucun compte » comme « jamais installée » ; et elle ROUVRAIT ses
-- inscriptions. Le premier passant venu du réseau s'inscrivait, devenait
-- propriétaire, et lisait tous les SMS, tous les soldes — et faisait
-- composer au terminal ce qu'il voulait.
--
-- « La table est vide » et « cette plateforme n'a jamais été installée » sont
-- deux faits différents. On cesse de les confondre en empêchant la table de
-- se vider : la dernière ligne « proprietaire » ne s'efface pas.
--
-- CE QUE CELA N'EMPÊCHE PAS. Transmettre la maison à quelqu'un d'autre : cela
-- se fait par un changement de rôle (UPDATE), pas par une suppression. Ni
-- supprimer un invité, ni supprimer un ancien propriétaire s'il y en avait un
-- autre — la règle ne parle que de la DERNIÈRE ligne.
--
--     psql "$SUPABASE_DB_URL" -f migrations/20260831_le-proprietaire-ne-se-supprime-pas.sql

create or replace function refuser_de_laisser_la_maison_sans_proprietaire()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'proprietaire'
     and not exists (
       select 1 from utilisateurs
       where role = 'proprietaire' and id <> old.id
     )
  then
    raise exception
      'Le compte du propriétaire ne se supprime pas : la plateforme resterait '
      'sans propriétaire, et rouvrirait ses inscriptions.'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists un_proprietaire_reste on utilisateurs;
create trigger un_proprietaire_reste
  before delete on utilisateurs
  for each row
  execute function refuser_de_laisser_la_maison_sans_proprietaire();

-- ---------------------------------------------------------------------------
-- Vérification. On ESSAIE vraiment de supprimer, et on exige un refus.
-- « Le déclencheur est créé » ne dit rien de ce qu'il fait.
-- ---------------------------------------------------------------------------
do $$
declare
  cible bigint;
  refuse boolean := false;
begin
  select id into cible from utilisateurs where role = 'proprietaire' limit 1;

  if cible is null then
    raise notice 'Aucun propriétaire en base : rien à éprouver ici.';
  else
    begin
      -- Dans un bloc à part : on ne veut surtout PAS que cela aboutisse.
      delete from utilisateurs where id = cible;
      raise exception 'LE PROPRIÉTAIRE A ÉTÉ SUPPRIMÉ — la règle ne tient pas.';
    exception
      when check_violation then
        refuse := true;
    end;

    if not refuse then
      raise exception 'La suppression n''a pas été refusée.';
    end if;
    raise notice 'Essayé de supprimer le propriétaire : refusé, comme il faut.';
  end if;
end $$;
