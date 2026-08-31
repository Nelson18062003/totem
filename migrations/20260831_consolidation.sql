-- ---------------------------------------------------------------------------
-- TOTEM — migration consolidée du 31 août 2026
--
-- À coller dans l'éditeur SQL de Supabase (« SQL Editor » → « New query »),
-- puis exécuter UNE fois sur la base en service.
--
-- LE SCRIPT EST REJOUABLE. Le relancer ne casse rien, ne duplique rien et ne
-- perd rien : chaque création est gardée par un « if not exists », chaque
-- règle se réécrit à l'identique. En cas de doute, relancez — c'est sans
-- risque, et c'est plus sûr que de se demander si c'est passé.
--
-- IL SE VÉRIFIE LUI-MÊME. Chaque section finit par un bloc qui ESSAIE la
-- chose interdite et exige un refus : créer un second propriétaire, effacer
-- le premier, déposer deux fois la même intention d'argent. « L'index est
-- créé » ne dit rien de ce qu'il fait. Si une vérification échoue, le script
-- s'arrête et dit pourquoi — rien n'est laissé à moitié posé.
--
-- CE QU'ELLE APPORTE, dans l'ordre où il faut l'exécuter :
--
--   1. PERSONNE NE LIT LA BASE EN DIRECT. Les règles d'accès laissaient la
--      clé publique lire les SMS et DÉPOSER DES COMMANDES — c'est-à-dire
--      faire composer un code USSD au terminal.
--   2. L'ARGENT NE PART PAS DEUX FOIS. Une clé d'intention par geste, tenue
--      par la base.
--   3. L'HEURE DU SOLDE, distincte de l'heure de la ligne.
--   4. IL N'Y A QU'UN PROPRIÉTAIRE. Trois inscriptions lancées ensemble en
--      donnaient trois.
--   5. ET IL NE S'EN VA PAS. Une plateforme sans propriétaire rouvrait ses
--      inscriptions au monde entier.
--   6. LE FREIN EST PARTAGÉ par toutes les instances du serveur.
--   7. LA PLATEFORME PEUT DIRE CE QUI S'EST PASSÉ, elle aussi.
--
-- ATTENTION, UNE SEULE SECTION PEUT REFUSER DE PASSER : la 4, si la base
-- porte DÉJÀ plusieurs propriétaires — c'est-à-dire si la course a déjà eu
-- lieu. Le message le dit et montre quoi regarder.
--
-- NB : `sql/schema.sql` reste le script COMPLET et rejouable de la base ; il
-- contient déjà tous ces blocs. Ce fichier-ci est le chemin COURT pour une
-- base déjà en service.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. PERSONNE NE LIT LA BASE EN DIRECT. PERSONNE.
-- ===========================================================================
--
-- La clé « anon » de Supabase est PUBLIQUE : elle est dans le code du
-- navigateur, lisible par quiconque ouvre les outils de développement. Les
-- règles d'accès posées au début accordaient à « authenticated » — un rôle
-- que cette clé permet d'endosser — la lecture des SMS et des soldes, et,
-- sur `commandes`, le droit d'INSÉRER.
--
-- Insérer dans `commandes`, c'est demander au terminal de Douala de composer
-- un code USSD. Avec un montant et un bénéficiaire.
--
-- Aucun écran n'a jamais eu besoin de ces règles : la plateforme lit et écrit
-- depuis le SERVEUR, avec la clé de service, qui contourne les règles de
-- ligne. Le navigateur ne parle jamais à la base — il parle à la plateforme.
--
-- « Règle de ligne activée + AUCUNE politique » = seule la clé de service
-- entre. C'est exactement ce qu'on veut.

alter table if exists terminaux    enable row level security;
alter table if exists cartes       enable row level security;
alter table if exists comptes      enable row level security;
alter table if exists paiements    enable row level security;
alter table if exists evenements   enable row level security;
alter table if exists commandes    enable row level security;
alter table if exists recus        enable row level security;
alter table if exists raccourcis   enable row level security;
alter table if exists appareils    enable row level security;
alter table if exists utilisateurs enable row level security;

do $$
declare
  t text;
  p text;
begin
  for t, p in
    select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', p, t);
  end loop;
end $$;


-- ===========================================================================
-- 2. L'ARGENT NE PART PAS DEUX FOIS — la clé d'intention
-- ===========================================================================
--
-- Un code USSD complet porte le bénéficiaire ET le montant
-- (« *126*1*677123456*5000# ») : le composer deux fois, c'est transférer deux
-- fois. Or une demande peut être présentée deux fois sans que personne ne
-- l'ait voulu — un appui compté double, un onglet resté ouvert, une requête
-- abandonnée par un délai côté téléphone alors qu'elle a bien abouti côté
-- serveur, et le propriétaire qui recommence.
--
-- L'écran tire une clé au hasard PAR GESTE et la joint à sa demande. Deux
-- envois de la même clé sont le même geste : le second ne crée pas de
-- seconde ligne, il retrouve la première.
--
-- L'index est PARTIEL : les demandes sans clé (le robot, les vieux écrans)
-- cohabitent sans se gêner.

alter table if exists commandes add column if not exists cle text;

create unique index if not exists commandes_cle_unique
  on commandes (terminal, cle) where cle is not null;


-- ===========================================================================
-- 3. L'HEURE DU SOLDE, distincte de l'heure de la ligne
-- ===========================================================================
--
-- « maj » date la LIGNE : elle bouge à chaque fois que le terminal donne
-- signe de vie, même s'il n'a rien appris de neuf sur le solde. L'écran
-- affichait donc « solde relevé il y a une minute » sur un chiffre vieux de
-- six heures. Un solde daté à tort est pire qu'un solde sans date.

alter table if exists comptes add column if not exists solde_maj timestamptz;


-- ===========================================================================
-- 4. IL N'Y A QU'UN SEUL PROPRIÉTAIRE — et c'est la base qui le tient
-- ===========================================================================
--
-- La plateforme comptait les comptes, voyait zéro, puis créait un
-- propriétaire. Entre le comptage et la création il s'écoule un aller-retour
-- vers la base PLUS le calcul de l'empreinte du mot de passe, lent à dessein
-- (210 000 tours). Une fenêtre d'un cinquième de seconde.
--
-- Ce n'est pas une hypothèse : trois inscriptions lancées ensemble contre un
-- vrai serveur ont donné TROIS propriétaires, trois sessions ouvertes, trois
-- comptes approuvés. Chacun pouvait lire tous les SMS, faire composer des
-- codes USSD par le terminal, et fermer le compte des deux autres — dont
-- celui du vrai propriétaire.
--
-- UNE VÉRIFICATION FAITE AVANT UNE ÉCRITURE NE GARANTIT RIEN : entre les
-- deux, quelqu'un a pu écrire. Seule tient une règle que la BASE fait
-- respecter au moment de l'écriture.
--
-- SI CETTE SECTION ÉCHOUE, c'est que la base porte déjà plusieurs
-- propriétaires — la course a déjà eu lieu. Regardez-les avec :
--
--     select id, courriel, cree_le from utilisateurs where role = 'proprietaire';
--
-- décidez lequel est le vrai, passez les autres en « invite », et rejouez.

create unique index if not exists utilisateurs_un_seul_proprietaire
  on utilisateurs (role) where role = 'proprietaire';


-- ===========================================================================
-- 5. ET LE PROPRIÉTAIRE NE S'EN VA PAS
-- ===========================================================================
--
-- La clé de secours ouvre l'administration sans désigner personne : la garde
-- « on ne se supprime pas soi-même » ne s'appliquait donc pas à elle, et le
-- compte du propriétaire pouvait disparaître. Ce qui suivait, joué contre un
-- vrai serveur : la table se vidait, la plateforme lisait « aucun compte »
-- comme « jamais installée », et ROUVRAIT ses inscriptions. Le premier
-- passant venu du réseau s'inscrivait et devenait propriétaire.
--
-- « La table est vide » et « cette plateforme n'a jamais été installée » sont
-- deux faits différents. On cesse de les confondre en empêchant la table de
-- se vider.
--
-- CE QUE CELA N'EMPÊCHE PAS : transmettre la maison. Cela se fait par un
-- changement de rôle (UPDATE), pas par une suppression.

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


-- ===========================================================================
-- 6. LE FREIN AUX ESSAIS DE MOT DE PASSE, partagé par toutes les instances
-- ===========================================================================
--
-- Le compteur vivait dans la MÉMOIRE du serveur. Un hébergement qui met
-- plusieurs instances en parallèle — ce que fait Vercel dès qu'il y a du
-- trafic — donnait à chacune son propre seau : une attaque répartie obtenait
-- l'allocation autant de fois qu'il y avait d'instances, et rien ne le
-- signalait. Mesuré : la première instance mure l'adresse au soixantième
-- essai, la seconde vérifiait encore les mots de passe comme si de rien
-- n'était.
--
-- TOUT TIENT DANS UNE SEULE INSTRUCTION, et c'est le seul point qui compte.
-- Lire le compteur puis l'écrire reproduirait un cran plus bas la faute
-- corrigée un cran plus haut : entre les deux, soixante essais passent.
-- « insert … on conflict do update … returning » compte et rend le résultat
-- d'un seul geste, sous le verrou de la ligne.

create table if not exists freins (
  -- L'adresse vue par le serveur, ou le seau commun. Jamais un courriel :
  -- une table d'adresses ne doit pas devenir une liste de qui a un compte.
  cle    text primary key,
  n      integer not null default 0,
  vu     timestamptz not null default now()
);

comment on table freins is
  'Les essais de mot de passe comptés, partagés par toutes les instances. '
  'Aucune donnée personnelle : une adresse réseau et un nombre.';

create index if not exists freins_vu on freins (vu);

alter table freins enable row level security;
-- Aucune politique : seule la clé de service entre, comme partout ailleurs.

create or replace function compter_un_essai(la_cle text, fenetre_s integer)
returns integer
language sql
as $$
  insert into freins (cle, n, vu)
  values (la_cle, 1, now())
  on conflict (cle) do update
    set n = case
              when freins.vu > now() - make_interval(secs => fenetre_s)
              then freins.n + 1
              else 1
            end,
        vu = now()
  returning n;
$$;


-- ===========================================================================
-- 7. LA PLATEFORME AUSSI A LE DROIT DE DIRE CE QUI S'EST PASSÉ
-- ===========================================================================
--
-- Le terminal tient un journal depuis toujours : modem redémarré, SMS
-- illisible, nuage injoignable. Il le pousse ici, dans « evenements ». Et
-- personne ne le lisait jamais — aucun écran ne l'affichait. On collectait
-- pour jeter. (La page « Ce qui s'est passé » le montre désormais.)
--
-- La plateforme, elle, n'écrivait rien du tout : ses pannes partaient dans la
-- sortie d'erreur de l'hébergeur, que le propriétaire n'ouvrira jamais.
--
-- Un incident de la plateforme n'appartient à AUCUN terminal — la base est
-- injoignable, un bilan a été coupé. La colonne devient facultative.

alter table evenements alter column terminal drop not null;

comment on column evenements.terminal is
  'Le terminal concerné, ou NULL quand c''est la plateforme qui parle.';


-- ===========================================================================
-- VÉRIFICATION — on ESSAIE vraiment, et on exige un refus
--
-- « L'index est créé » ne dit rien de ce qu'il fait. Ce bloc tente les gestes
-- interdits sur des lignes d'essai, qu'il efface ensuite, et lève si l'un
-- d'eux passe.
-- ===========================================================================
do $$
declare
  reste     int;
  refuse    boolean;
  a         int;
  b         int;
  c         int;
  terminal_essai text;
begin
  -- --- 1. Personne ne lit la base en direct --------------------------------
  select count(*) into reste from pg_policies where schemaname = 'public';
  if reste > 0 then
    raise exception 'Il reste % politique(s) : quelqu''un peut lire sans la clé de service.', reste;
  end if;

  select count(*) into reste
    from pg_tables t
   where t.schemaname = 'public'
     and not exists (select 1 from pg_class c
                      where c.relname = t.tablename and c.relrowsecurity);
  if reste > 0 then
    raise exception '% table(s) sans règle de ligne : lisibles par la clé publique.', reste;
  end if;
  raise notice 'Règles refermées : seule la clé de service entre.';

  -- --- 4 et 5. Le propriétaire ---------------------------------------------
  if not exists (select 1 from pg_indexes
                  where tablename = 'utilisateurs'
                    and indexname = 'utilisateurs_un_seul_proprietaire') then
    raise exception 'L''index du propriétaire unique N''EST PAS EN PLACE.';
  end if;

  select count(*) into reste from utilisateurs where role = 'proprietaire';
  raise notice 'Propriétaires en base : % (jamais plus de 1 désormais)', reste;

  if reste = 1 then
    -- On essaie VRAIMENT de le supprimer, dans un bloc qui rattrape.
    refuse := false;
    begin
      delete from utilisateurs where role = 'proprietaire';
      raise exception 'LE PROPRIÉTAIRE A ÉTÉ SUPPRIMÉ — la règle ne tient pas.';
    exception when check_violation then
      refuse := true;
    end;
    if not refuse then
      raise exception 'La suppression du propriétaire n''a pas été refusée.';
    end if;
    raise notice 'Essayé de supprimer le propriétaire : refusé, comme il faut.';
  end if;

  -- --- 6. Le frein compte juste --------------------------------------------
  delete from freins where cle = 'essai-de-migration';
  select compter_un_essai('essai-de-migration', 900) into a;
  select compter_un_essai('essai-de-migration', 900) into b;
  select compter_un_essai('essai-de-migration', 0)   into c;
  if a <> 1 or b <> 2 or c <> 1 then
    raise exception 'Le frein compte faux : %, % puis % (attendu 1, 2, 1)', a, b, c;
  end if;
  delete from freins where cle = 'essai-de-migration';
  raise notice 'Le frein partagé compte juste (1, 2, puis 1 hors fenêtre).';

  -- --- 7. La plateforme peut parler sans terminal ---------------------------
  insert into evenements (terminal, source_id, texte, survenu_le)
  values (null, 0, 'essai de migration', now());
  delete from evenements where texte = 'essai de migration';
  raise notice 'La plateforme peut noter un incident sans terminal.';

  -- --- 2. L'argent ne part pas deux fois ------------------------------------
  select id into terminal_essai from terminaux limit 1;
  if terminal_essai is null then
    raise notice 'Aucun terminal en base : la clé d''intention sera éprouvée '
                 'à la première demande.';
  else
    delete from commandes where cle = 'essai-de-migration';
    insert into commandes (terminal, type, parametres, etat, cle)
      values (terminal_essai, 'ussd', '{}'::jsonb, 'en_attente', 'essai-de-migration');
    refuse := false;
    begin
      insert into commandes (terminal, type, parametres, etat, cle)
        values (terminal_essai, 'ussd', '{}'::jsonb, 'en_attente', 'essai-de-migration');
    exception when unique_violation then
      refuse := true;
    end;
    delete from commandes where cle = 'essai-de-migration';
    if not refuse then
      raise exception 'La même intention a été déposée DEUX fois : l''argent '
                      'peut partir en double.';
    end if;
    raise notice 'La même intention deux fois : refusée, comme il faut.';
  end if;

  raise notice '--- Migration du 31 août 2026 : posée ET vérifiée. ---';
end $$;
