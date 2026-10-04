-- ===========================================================================
-- 4 OCTOBRE 2026 — LE CODE SECRET NE SURVIT PAS À UNE DEMANDE CLOSE
-- ===========================================================================
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Rejouable : la fonction se remplace, le déclencheur se repose.
--
-- Une annulation depuis le téléphone pouvait laisser le code secret de
-- l'opération en clair dans la base, pour toujours. La base l'efface
-- maintenant elle-même, au moment où une demande se ferme.
--
-- Rien n'est effacé d'autre. Les demandes déjà closes ne sont pas
-- relues : le bloc « RATTRAPAGE » en bas retire le code de celles qui
-- l'auraient gardé.

-- ---------------------------------------------------------------------------
-- LE CODE SECRET NE SURVIT PAS À UNE DEMANDE CLOSE.
--
-- Une réponse qui porte le code secret (« secret » vrai) attend le boîtier
-- avec le code EN CLAIR dans « parametres » : c'est le robot qui l'efface,
-- en la traitant. Une demande que personne ne traitera — annulée depuis
-- l'écran — ne passait donc jamais par cet effacement. La plateforme
-- relisait la demande pour masquer le code dans son annulation ; quand
-- cette relecture échouait (un hoquet de la base), l'annulation partait
-- quand même, réussissait… et le code restait dans une ligne « échouée »
-- que plus personne ne relit, pour toujours.
--
-- C'est donc la BASE qui le retire, dans la même écriture que le passage à
-- « faite » ou « échouée » — qui que soit l'auteur de cette écriture : la
-- plateforme qui annule, le robot qui finit, une main dans l'éditeur. Les
-- deux réussissent ensemble ou échouent ensemble. Ce qui reste est ce que
-- le robot et la plateforme gardent déjà : le drapeau, la carte (un ICCID
-- n'a rien de secret, il est imprimé sur la puce), la personne qui l'a
-- demandée et sa langue — c'est d'après elles que la plateforme dit à qui
-- est la demande.
--
-- « en cours » n'y touche pas, à dessein : le robot qui vient de la
-- réclamer doit encore lire le code pour le composer.
-- ---------------------------------------------------------------------------
create or replace function commandes_code_efface() returns trigger
language plpgsql as $$
begin
  if new.etat in ('faite', 'echouee')
     and jsonb_typeof(new.parametres) = 'object'
     and new.parametres->>'secret' = 'true' then
    new.parametres := coalesce(
      (select jsonb_object_agg(cle, valeur)
         from jsonb_each(new.parametres) as gardes(cle, valeur)
        where cle in ('secret', 'carte', 'iccid', 'par', 'langue')),
      '{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists commandes_code_efface on commandes;
create trigger commandes_code_efface before insert or update on commandes
  for each row execute function commandes_code_efface();

-- RATTRAPAGE : les demandes déjà closes qui auraient gardé leur code. La
-- mise à jour passe par le déclencheur ci-dessus, qui fait le tri.
update commandes set parametres = parametres
 where etat in ('faite', 'echouee')
   and jsonb_typeof(parametres) = 'object'
   and parametres->>'secret' = 'true'
   and parametres ? 'texte';
