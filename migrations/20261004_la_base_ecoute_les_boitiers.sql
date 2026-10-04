-- ===========================================================================
-- 4 OCTOBRE 2026 — LA BASE ÉCOUTE LES BOÎTIERS
-- ===========================================================================
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Rejouable : chaque instruction vérifie ce qui est déjà en place.
--
-- Une coupure de courant de dix minutes à la boutique faisait déclarer TOUTES
-- les cartes « retirées » sur le téléphone : les gestes d'argent
-- disparaissaient, puis réapparaissaient au retour. Et un boîtier dont
-- l'horloge avait pris du retard paraissait muet alors qu'il parlait, et la
-- plateforme refusait ses demandes. La base note maintenant elle-même quand
-- elle entend chaque boîtier, et depuis quand il parle sans interruption :
-- la plateforme ne conclut plus qu'une carte est partie avant que le boîtier
-- ait eu le temps de la relire.
--
-- Rien n'est effacé. Les colonnes se remplissent au prochain signe de vie de
-- chaque boîtier, une minute au plus après l'exécution.

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
