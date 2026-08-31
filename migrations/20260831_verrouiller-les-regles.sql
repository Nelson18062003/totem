-- ---------------------------------------------------------------------------
-- TOTEM — migration du 31 août 2026 : refermer les règles d'accès
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service.
--
-- LE SCRIPT EST REJOUABLE. Il ne supprime aucune donnée, ne touche aucune
-- colonne, ne déplace rien. Il retire des RÈGLES D'ACCÈS — et seulement
-- celles dont plus personne ne se sert.
--
-- ===========================================================================
-- POURQUOI
--
-- La base porte dix tables, toutes en « row level security ». Huit d'entre
-- elles accordaient la LECTURE au rôle `authenticated` :
--
--     create policy "lecture connectee" on paiements
--       for select to authenticated using (true);
--
-- et `commandes` accordait en plus l'ÉCRITURE :
--
--     create policy "demander une commande" on commandes
--       for insert to authenticated with check (true);
--
-- Ces règles ont été écrites pour une application web qui lirait la base
-- directement avec la clé publique. Cette application n'a jamais existé :
-- la plateforme parle à Supabase depuis le SERVEUR, avec la clé de service
-- (`SUPABASE_CLE`), qui contourne ces règles par nature. Aucun code du dépôt
-- n'ouvre de session Supabase — ni `@supabase/supabase-js`, ni `signInWith`,
-- ni le moindre appel à `/auth/v1`. Le rôle `authenticated` n'a donc AUCUN
-- usage légitime ici.
--
-- Il a en revanche un usage pour quelqu'un d'autre. `authenticated`, c'est
-- « toute personne qui a ouvert un compte sur le projet Supabase » — et
-- l'inscription y est ouverte par défaut, avec la clé `anon`, que la
-- documentation du dépôt elle-même décrit comme publique et faite pour être
-- exposée (`docs/CLOUD.md`). Il suffisait donc de cette clé publique pour :
--
--   — LIRE le texte intégral de chaque SMS, chaque montant, chaque solde,
--     chaque numéro de client, chaque ICCID, chaque parcours USSD appris ;
--   — ÉCRIRE dans `commandes`. Et là, ce n'est plus une fuite : le robot de
--     Douala relève cette table et COMPOSE ce qu'il y trouve sur la carte
--     SIM. Sur une ligne Mobile Money, l'USSD *est* l'interface de transfert.
--     Une ligne insérée depuis n'importe où dans le monde faisait donc
--     composer un transfert sur la vraie carte, avec le vrai argent.
--
-- LE REMÈDE est celui que la base applique déjà à `appareils` et à
-- `utilisateurs` : garder « row level security » ACTIVE et ne déclarer
-- AUCUNE politique. Sans politique, personne ne passe — sauf la clé de
-- service, qui n'est pas soumise à ces règles et que seuls le serveur et le
-- robot détiennent. C'est exactement ce dont la plateforme a besoin, et rien
-- de plus.
--
-- CE QUI CONTINUE DE FONCTIONNER, à l'identique : la plateforme web, le
-- téléphone, le robot. Tous passent par la clé de service ou par la
-- plateforme. Rien dans le dépôt n'emprunte le chemin qu'on referme ici.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. RETIRER LA LECTURE ACCORDÉE À « authenticated »
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['terminaux','cartes','comptes','paiements',
                           'evenements','commandes','recus','raccourcis']
  loop
    execute format('drop policy if exists "lecture connectee" on %I;', t);
  end loop;
end $$;


-- ===========================================================================
-- 2. RETIRER L'ÉCRITURE DANS « commandes »
--
-- C'est la ligne qui transformait « détenir une clé publique » en « faire
-- composer un code USSD sur une carte SIM qui porte de l'argent ».
-- ===========================================================================

drop policy if exists "demander une commande" on commandes;


-- ===========================================================================
-- 3. S'ASSURER QUE LE VERROU EST BIEN MIS
--
-- Retirer une politique ne sert à rien si « row level security » n'est pas
-- active sur la table : sans elle, tout est lisible. On la (re)pose donc,
-- explicitement, sur les dix tables. C'est sans effet là où elle l'est déjà.
-- ===========================================================================

alter table terminaux    enable row level security;
alter table cartes       enable row level security;
alter table comptes      enable row level security;
alter table paiements    enable row level security;
alter table evenements   enable row level security;
alter table commandes    enable row level security;
alter table recus        enable row level security;
alter table raccourcis   enable row level security;
alter table appareils    enable row level security;
alter table utilisateurs enable row level security;


-- ===========================================================================
-- 4. L'HEURE DU SOLDE, distincte de l'heure de la ligne
--
-- « maj » disait « cette ligne a été touchée » — et le signe de vie du robot
-- la remettait à l'heure toutes les soixante secondes. Deux dégâts :
--
--   — un solde annoncé par SMS n'était écrit que si « maj » lui était
--     ANTÉRIEUR. Comme « maj » valait presque toujours « il y a moins d'une
--     minute » et que l'heure du SMS est dans le passé, la condition
--     échouait : le solde frais était jeté, en silence, et la fonction
--     répondait quand même « c'est fait » ;
--   — l'écran lisait « maj » pour écrire « D'après l'interrogation de
--     09:47 ». Il affichait donc l'heure du dernier signe de vie : le solde
--     semblait frais même vieux de plusieurs heures.
--
-- Une colonne pour chaque chose. Sans valeur au départ : le premier solde
-- annoncé la remplira, et l'écran retombe entre-temps sur « maj », comme
-- avant.
-- ===========================================================================

alter table comptes add column if not exists solde_maj timestamptz;


-- ===========================================================================
-- 5. LA CLÉ D'INTENTION — pour ne pas envoyer l'argent deux fois
--
-- Un code USSD complet porte le bénéficiaire ET le montant
-- (« *126*1*677123456*5000# ») : le composer deux fois, c'est transférer deux
-- fois. Rien n'empêchait qu'une même demande soit enregistrée deux fois — un
-- appui compté double, un onglet resté ouvert, une requête abandonnée par un
-- délai alors qu'elle avait abouti côté serveur, et le propriétaire qui
-- recommence. Le robot relève alors DEUX lignes et compose DEUX fois.
--
-- L'écran tire désormais une clé au hasard par geste. Deux envois de la même
-- clé sont le même geste : le second retrouve la première ligne au lieu d'en
-- créer une seconde. Deux gestes distincts gardent deux clés — répondre « 1 »
-- à deux questions successives d'un menu reste donc possible.
--
-- L'index est PARTIEL (« where cle is not null ») : les demandes déjà en base,
-- qui n'ont pas de clé, ne se gênent pas entre elles.
-- ===========================================================================

alter table commandes add column if not exists cle text;

create unique index if not exists commandes_cle_unique
  on commandes (terminal, cle) where cle is not null;


-- ===========================================================================
-- 6. LE CONTRÔLE — et il PARLE
--
-- Une migration silencieuse ne prouve rien. Celle-ci compte ce qui reste et
-- s'interrompt s'il reste la moindre politique sur ces dix tables. Mieux
-- vaut un script qui échoue bruyamment qu'une base qu'on croit fermée.
-- ===========================================================================

do $$
declare restantes int;
declare detail text;
begin
  select count(*), coalesce(string_agg(format('%s.%s', tablename, policyname), ', '), '—')
    into restantes, detail
    from pg_policies
   where schemaname = 'public'
     and tablename in ('terminaux','cartes','comptes','paiements','evenements',
                       'commandes','recus','raccourcis','appareils','utilisateurs');

  if restantes > 0 then
    raise exception
      'Il reste % politique(s) sur les tables de TOTEM : %. '
      'Aucune ne devrait subsister : seule la clé de service doit entrer.',
      restantes, detail;
  end if;

  raise notice 'Règles refermées : aucune politique ne subsiste. '
               'Seule la clé de service entre — c''est le but.';
end $$;
