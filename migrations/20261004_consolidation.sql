-- ===========================================================================
-- 4 OCTOBRE 2026 — LA BASE ÉCOUTE LES BOÎTIERS, ET LE CODE SECRET NE SURVIT
-- PAS À UNE DEMANDE CLOSE
-- ===========================================================================
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Une seule fois suffit ; rejouable sans risque : chaque instruction vérifie
-- ce qui est déjà en place (colonnes « if not exists », fonctions qui se
-- remplacent, déclencheurs qui se reposent).
--
-- Deux parties, indépendantes, dans cet ordre :
--
--   1. LA BASE ÉCOUTE LES BOÎTIERS. Une coupure de courant de dix minutes à
--      la boutique faisait déclarer TOUTES les cartes « retirées » sur le
--      téléphone ; et un boîtier dont l'horloge retardait paraissait muet
--      alors qu'il parlait. La base note maintenant elle-même quand elle
--      entend chaque boîtier, et depuis quand il parle sans interruption.
--
--   2. LE CODE SECRET NE SURVIT PAS À UNE DEMANDE CLOSE. Une annulation
--      depuis le téléphone pouvait laisser le code secret d'une opération en
--      clair dans la base, pour toujours. La base l'efface elle-même, au
--      moment où une demande se ferme, et rattrape celles qui l'ont gardé.
--
-- Rien d'autre n'est effacé. Les nouvelles colonnes se remplissent au
-- prochain signe de vie de chaque boîtier, une minute au plus après.

-- ===========================================================================
-- 1. LA BASE ÉCOUTE LES BOÎTIERS
-- ===========================================================================
--
-- L'OREILLE DE LA BASE : QUAND ELLE A ENTENDU CHAQUE BOÎTIER.
--
-- « vu_le » est daté par le boîtier lui-même, sur l'horloge du Pi — et c'est
-- voulu : on la compare à « cartes.derniere_vue », datée par la même
-- horloge, pour savoir s'il voit encore une puce. Mais pour savoir s'il SE
-- TAIT, il faut une autre horloge que la sienne. Un Pi sans pile redémarre
-- après une coupure de courant avec l'heure de sa dernière sauvegarde,
-- parfois une heure en retard, jusqu'à ce qu'Internet le remette à l'heure :
-- compté sur sa date à lui, un boîtier bien vivant paraissait muet, et la
-- plateforme refusait tout ce qu'on lui demandait.
--
--   « entendu_le » : l'heure de la BASE quand elle a reçu son dernier signe
--                    de vie. C'est d'elle que se mesure le silence.
--   « revenu_le »  : depuis quand il parle SANS INTERRUPTION. Remise à
--                    l'heure de la base quand le signe de vie précédent a plus
--                    d'une minute et demie (au moins un battement manqué), ou
--                    quand son horloge a sauté d'autant (remise à l'heure).
--                    Dans les deux cas, ce qu'il avait dit de ses cartes date
--                    d'avant : la plateforme attend qu'il les ait relues avant
--                    de conclure qu'une carte est partie. Son signe de vie
--                    revient en effet AVANT ses cartes — deux envois séparés,
--                    jusqu'à une minute d'écart — et toutes passaient pour
--                    retirées le temps qu'elles arrivent.
--
-- PERSONNE D'AUTRE NE LES ÉCRIT. Un renommage, une mise hors service ne sont
-- pas des signes de vie ; une valeur posée à la main est remplacée par celle
-- d'avant. Seul un changement de « vu_le » fait bouger l'oreille : c'est la
-- base qui tient la règle, au moment de l'écriture.
-- ---------------------------------------------------------------------------
alter table terminaux add column if not exists entendu_le timestamptz;
alter table terminaux add column if not exists revenu_le  timestamptz;

create or replace function terminaux_entendu() returns trigger
language plpgsql as $$
declare
  -- Une minute et demie : le signe de vie part chaque minute, un raté se
  -- retente dix secondes plus tard. Au-delà, au moins un battement a manqué.
  coupure constant interval := interval '90 seconds';
begin
  if tg_op = 'UPDATE' then
    if new.vu_le is not distinct from old.vu_le or new.vu_le is null then
      new.entendu_le := old.entendu_le;
      new.revenu_le  := old.revenu_le;
      return new;
    end if;
  elsif new.vu_le is null then
    -- Inscrit sans avoir jamais parlé : la base ne l'a pas entendu.
    new.entendu_le := null;
    new.revenu_le  := null;
    return new;
  end if;
  new.entendu_le := now();
  if tg_op = 'INSERT' or old.entendu_le is null or old.vu_le is null
     or now() - old.entendu_le > coupure
     -- L'écart entre son horloge et celle de la base a bougé : il a été
     -- remis à l'heure (ou s'est déréglé). Ses dates d'avant ne se
     -- comparent plus à celles d'après.
     or abs(extract(epoch from (new.vu_le - now()))
            - extract(epoch from (old.vu_le - old.entendu_le)))
        > extract(epoch from coupure)
  then
    new.revenu_le := now();
  else
    new.revenu_le := coalesce(old.revenu_le, now());
  end if;
  return new;
end $$;

drop trigger if exists terminaux_entendu on terminaux;
create trigger terminaux_entendu before insert or update on terminaux
  for each row execute function terminaux_entendu();

-- ===========================================================================
-- 2. LE CODE SECRET NE SURVIT PAS À UNE DEMANDE CLOSE
-- ===========================================================================
--
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
