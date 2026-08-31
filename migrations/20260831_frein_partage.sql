-- ---------------------------------------------------------------------------
-- TOTEM — l'ardoise du frein, partagée entre les instances
-- (31 août 2026 — issu de l'audit de sécurité, résidu de SEC-04)
--
-- CE QUE FAIT CE FICHIER : il ajoute UNE table. Aucune donnée existante n'est
-- touchée, aucune colonne modifiée, aucune ligne effacée. Rejouable.
--
-- POURQUOI. Le frein aux essais de mot de passe comptait dans la mémoire du
-- serveur. Sur Vercel, chaque instance froide repart à zéro : il suffisait
-- d'insister pour tomber sur une neuve et retrouver ses essais libres.
-- Mesuré avec deux serveurs partageant la même base : la seconde instance
-- répondait en 36 ms après que la première eut fait attendre huit secondes.
-- Avec cette table : 8 028 ms sur la seconde aussi.
--
-- SANS CE FICHIER, RIEN NE CASSE. La plateforme interroge la table ; si elle
-- n'existe pas, la réponse est « je ne sais pas » et le frein retombe sur sa
-- mémoire locale — le comportement d'avant. On perd le partage, pas la
-- connexion.
--
-- COMMENT L'EXÉCUTER : Supabase → SQL Editor → New query → coller → Run.
-- ---------------------------------------------------------------------------

-- L'ardoise du frein aux mots de passe.
--
-- POURQUOI ELLE EST EN BASE ET NON EN MÉMOIRE. Le frein comptait les échecs
-- dans la mémoire du serveur. Sur Vercel, chaque instance froide repart à
-- zéro : il suffisait d'insister pour tomber sur une neuve et retrouver ses
-- essais libres. Mesuré — une seconde instance, mémoire vierge, répondait en
-- 36 ms là où la première faisait attendre huit secondes.
--
-- POURQUOI ELLE EST BÊTE, ET C'EST VOULU. On AJOUTE une ligne par échec, on
-- ne modifie jamais rien : pas de lecture-puis-écriture, donc pas de comptage
-- perdu entre deux instances qui écrivent en même temps. Compter les lignes
-- de la fenêtre suffit.
--
-- ELLE NE FERME JAMAIS LA PORTE À ELLE SEULE. Si la base ne répond pas, la
-- plateforme retombe sur sa mémoire locale (voir web/lib/frein.ts). Faire
-- dépendre la connexion d'une base joignable serait exactement ce que la clé
-- de secours existe pour éviter.
--
-- ELLE NE PORTE AUCUN SECRET : ni courriel, ni mot de passe, ni jeton. Une
-- adresse vue par le serveur, et une heure.
create table if not exists freins (
  id     bigserial primary key,
  -- L'identité freinée : « s:<adresse attestée> », « d:<adresse annoncée> »,
  -- ou le seau commun. Jamais une personne, jamais un courriel.
  cle    text        not null,
  vu_le  timestamptz not null default now()
);

-- Les deux seules lectures faites dessus : compter par clé sur une fenêtre,
-- et faire le ménage des vieilles lignes.
create index if not exists freins_cle_vu on freins (cle, vu_le desc);

comment on table freins is
  'Les échecs de connexion récents, pour que le frein soit le même sur '
  'toutes les instances. Aucun secret, aucune identité : une adresse et une '
  'heure, effacées au bout d''un quart d''heure.';

-- RLS active, AUCUNE politique — comme toutes les autres tables depuis
-- « 20260831_regles_dormantes.sql ». Seule la clé de service y touche, et
-- elle contourne ces règles par nature.
alter table freins enable row level security;

-- ===========================================================================
-- VÉRIFICATION
-- ===========================================================================

-- La table est là, RLS active, et personne n'a de politique dessus.
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename = 'freins';
select count(*) as politiques_sur_freins from pg_policies
 where schemaname = 'public' and tablename = 'freins';
