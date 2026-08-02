-- ---------------------------------------------------------------------------
-- DIAGNOSTIC TOTEM côté Supabase — tout est en LECTURE SEULE.
--
-- Ouvrir supabase.com → votre projet → « SQL Editor » → « New query »,
-- coller TOUT ce fichier, « Run ». Lancer ensuite chaque bloc séparément
-- si l'éditeur ne montre que le dernier résultat.
-- ---------------------------------------------------------------------------

-- 1. Le terminal donne-t-il signe de vie ? (« silence_depuis » est LE chiffre :
--    quelques secondes/minutes = le Pi parle encore au cloud ;
--    des heures/jours = le Pi est muet ou sans Internet.)
select id, nom, version,
       vu_le            as dernier_signe_de_vie,
       now() - vu_le    as silence_depuis
from terminaux
order by vu_le desc nulls last;

-- 2. Le dernier SMS arrivé dans la base, et depuis combien de temps.
select count(*)                as sms_au_total,
       max(recu_le)            as dernier_sms,
       now() - max(recu_le)    as aucun_sms_depuis
from paiements;

-- 3. Les SMS des 7 derniers jours, jour par jour : on voit le jour exact
--    où ça s'est arrêté.
select date_trunc('day', recu_le) as jour, count(*) as sms
from paiements
where recu_le > now() - interval '7 days'
group by 1
order by 1 desc;

-- 4. Les 20 dernières notes écrites par le robot lui-même : c'est ici que
--    ses pannes se lisent (« relève SMS … : erreur », « mémoire pleine »…).
select survenu_le, texte
from evenements
order by survenu_le desc
limit 20;

-- 5. La migration est-elle appliquée ? Ces 5 lignes doivent TOUTES sortir :
--    expediteur, categorie, nature, emis_le, moment. S'il en manque,
--    rejouer sql/migration-refonte-sms-et-audit.sql (sans danger).
select column_name
from information_schema.columns
where table_name = 'paiements'
  and column_name in ('expediteur', 'categorie', 'nature', 'emis_le', 'moment')
order by column_name;

-- 6. Les cartes SIM que le terminal a vues, et quand pour la dernière fois.
select libelle, operateur, numero, derniere_vue,
       now() - derniere_vue as pas_vue_depuis
from cartes
order by derniere_vue desc nulls last;
