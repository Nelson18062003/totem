-- ---------------------------------------------------------------------------
-- TOTEM — migration « lu / non-lu » (août 2026)
--
-- Une seule colonne : quand le propriétaire a-t-il OUVERT ce SMS sur la
-- plateforme ? Vide = pas encore regardé. C'est elle qui alimente la pastille
-- « N nouveaux » du menu et le point des lignes non lues.
--
-- À coller dans Supabase → « SQL Editor » → « Run ». Rejouable : la relancer
-- ne casse rien ; sa seule conséquence serait de remettre le compteur de
-- non-lus à zéro (les messages non encore ouverts seraient considérés vus).
-- ---------------------------------------------------------------------------

alter table paiements add column if not exists lu_le timestamptz;

-- Les messages déjà présents datent d'avant cette notion : on les considère
-- vus, sinon la plateforme s'ouvrirait sur des centaines de « nouveaux »
-- qui n'en sont pas.
update paiements set lu_le = coalesce(lu_le, recu_le, now()) where lu_le is null;

-- Vérification : la colonne existe, et tout l'existant est marqué vu.
select
  count(*)                          as sms_au_total,
  count(*) filter (where lu_le is null) as non_lus_restants   -- doit être 0
from paiements;
