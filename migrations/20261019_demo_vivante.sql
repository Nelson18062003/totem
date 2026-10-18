-- ===========================================================================
-- LA DÉMO VIVANTE — un monde à part, dans la même base.
--
-- Voir docs/DEMO-VIVANTE.md. En une phrase : chaque table où vit l'argent a
-- son DOUBLE « demo_… », de la même forme ; un compte de démo ne lit et
-- n'écrit que là (la plateforme choisit la table d'après la session), et le
-- vrai propriétaire, le vrai boîtier, ne les lisent jamais. Il n'y a pas de
-- filtre à oublier : il n'y a pas de ligne de démo dans les vraies tables.
--
-- Ce fichier pose :
--   1. les doubles (même forme, mêmes index, mêmes garde-fous) ;
--   2. les cartes de démo qui naissent avec chaque compte ;
--   3. le faux réseau : virer, fabriquer des francs, jouer une demande USSD ;
--   4. les droits (personne ne lit la base en direct, comme partout ici).
--
-- Rejouable : chaque création vérifie ce qui est déjà là.
-- À coller dans l'éditeur SQL de Supabase, après les migrations d'avant.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LES DOUBLES. « like … including all » : mêmes colonnes, mêmes valeurs
--    par défaut, mêmes contrôles, mêmes index — y compris l'index qui dit
--    qu'il n'y a qu'UN propriétaire (ici : un administrateur de la démo).
--    Les clés étrangères ne se copient pas : elles sont reposées vers les
--    doubles, jamais vers les vraies tables.
-- ---------------------------------------------------------------------------
create table if not exists demo_utilisateurs  (like utilisateurs  including all);
create table if not exists demo_attributions  (like attributions  including all);
create table if not exists demo_appareils     (like appareils     including all);
create table if not exists demo_comptes       (like comptes       including all);
create table if not exists demo_paiements     (like paiements     including all);
create table if not exists demo_recus         (like recus         including all);
create table if not exists demo_commandes     (like commandes     including all);
create table if not exists demo_raccourcis    (like raccourcis    including all);
create table if not exists demo_beneficiaires (like beneficiaires including all);
-- Les cartes se lisent par une VUE (plus bas) : leur « dernière vue » doit
-- toujours être maintenant — une carte de démo n'est jamais « retirée ».
create table if not exists demo_cartes_base   (like cartes        including all);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'demo_attributions_utilisateur_fk') then
    alter table demo_attributions add constraint demo_attributions_utilisateur_fk
      foreign key (utilisateur) references demo_utilisateurs(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demo_appareils_utilisateur_fk') then
    alter table demo_appareils add constraint demo_appareils_utilisateur_fk
      foreign key (utilisateur) references demo_utilisateurs(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demo_beneficiaires_cree_par_fk') then
    alter table demo_beneficiaires add constraint demo_beneficiaires_cree_par_fk
      foreign key (cree_par) references demo_utilisateurs(id) on delete set null;
  end if;
end $$;

-- L'administrateur de la démo ne s'efface pas non plus : sans lui, plus
-- personne ne fabrique de francs ni ne crée de comptes.
create or replace function demo_un_administrateur_reste() returns trigger
language plpgsql as $$
begin
  if old.role = 'proprietaire'
     and not exists (select 1 from demo_utilisateurs where role = 'proprietaire' and id <> old.id) then
    raise exception 'L''administrateur de la démo ne se supprime pas.' using errcode = 'check_violation';
  end if;
  return old;
end $$;
drop trigger if exists demo_un_administrateur_reste on demo_utilisateurs;
create trigger demo_un_administrateur_reste before delete on demo_utilisateurs
  for each row execute function demo_un_administrateur_reste();

-- Le code secret ne survit pas à une demande close — la même règle, la même fonction.
drop trigger if exists commandes_code_efface on demo_commandes;
create trigger commandes_code_efface before insert or update on demo_commandes
  for each row execute function commandes_code_efface();

-- LE BOÎTIER DE DÉMO NE SE TAIT JAMAIS. La plateforme refuse une demande à
-- une carte dont le boîtier se tait depuis cinq minutes ; le boîtier de démo
-- n'existe pas, c'est la base qui répond — il est donc toujours « entendu ».
-- Une VUE, construite d'après les colonnes de « terminaux » telles qu'elles
-- sont AUJOURD'HUI : une colonne ajoutée demain y entre à la prochaine passe.
do $$
declare v_select text;
begin
  select string_agg(
           case column_name
             when 'id'         then '''demo''::text as id'
             when 'nom'        then '''TOTEM démo''::text as nom'
             when 'vu_le'      then 'now() as vu_le'
             when 'entendu_le' then 'now() as entendu_le'
             when 'revenu_le'  then 'now() - interval ''1 day'' as revenu_le'
             when 'version'    then '''demo''::text as version'
             when 'cree_le'    then 'timestamptz ''2026-10-19'' as cree_le'
             else format('null::%s as %I', data_type, column_name)
           end, ', ' order by ordinal_position)
    into v_select
    from information_schema.columns
   where table_schema = 'public' and table_name = 'terminaux';
  execute format('create or replace view demo_terminaux as select %s', v_select);
end $$;

-- Les cartes : la base, et la vue qui les montre toujours présentes.
do $$
declare v_select text;
begin
  select string_agg(
           case column_name when 'derniere_vue' then 'now() as derniere_vue'
                            else format('c.%I', column_name) end, ', ' order by ordinal_position)
    into v_select
    from information_schema.columns
   where table_schema = 'public' and table_name = 'cartes';
  execute format('create or replace view demo_cartes as select %s from demo_cartes_base c', v_select);
end $$;

-- ---------------------------------------------------------------------------
-- 2. CE QUI N'EXISTE QUE DANS LA DÉMO
-- ---------------------------------------------------------------------------
-- Les francs fabriqués par l'administrateur : la seule source d'argent de la
-- démo. À tout instant, somme des soldes de démo = somme fabriquée.
create table if not exists demo_emissions (
  id        bigint generated always as identity primary key,
  iccid     text not null,
  montant   numeric not null check (montant > 0 and montant = trunc(montant)),
  par       text,
  cree_le   timestamptz not null default now()
);

-- Une session USSD de démo par carte : où en est le menu.
create table if not exists demo_sessions (
  iccid      text primary key,
  operation  text,                -- transfert, depot, retrait
  etape      text not null,       -- menu, numero, montant, code
  numero     text,
  montant    numeric,
  par        text,
  maj        timestamptz not null default now()
);

-- Les cartes de démo qui sont des FLOATS de test chez Glisil (XAFe) : leurs
-- SMS d'argent partent chez Glisil, comme ceux d'un vrai boîtier.
create table if not exists demo_floats_xafe (
  iccid     text primary key,
  cree_le   timestamptz not null default now()
);

-- Les SMS d'argent des floats, en file pour Glisil (la plateforme les dépose).
create table if not exists demo_file_xafe (
  paiement_id bigint primary key,
  envoye_le   timestamptz,
  reponse     text,
  essais      int not null default 0
);

create sequence if not exists demo_source_id;
create sequence if not exists demo_carte_no;
create sequence if not exists demo_reference_no start with 18300000001;

-- ---------------------------------------------------------------------------
-- 3. LES CARTES NAISSENT AVEC LE COMPTE
-- ---------------------------------------------------------------------------
-- Deux cartes par compte de démo, une MTN et une Orange, au nom de la
-- personne. Ni l'ICCID ni le numéro ne peuvent être ceux d'une vraie puce :
--   — l'ICCID porte l'émetteur « 99 » (89 237 99…), qu'aucun opérateur
--     camerounais n'a : un lien signé qui sortirait de la démo, ouvert sans
--     session donc dans la maison, ne trouverait aucune carte ;
--   — le numéro commence par 600, une tranche qu'aucun opérateur n'attribue
--     (600 0x xx xx pour MTN, 600 9x xx xx pour Orange) : un testeur qui
--     recopierait un numéro de démo dans un vrai téléphone n'atteindrait
--     personne.
-- Et ils ne quittent jamais la démo : un virement vers un numéro qui n'est
-- pas une carte de démo est refusé.
create or replace function demo_nouvelle_carte(p_utilisateur bigint, p_operateur text, p_nom text)
returns text language plpgsql as $$
declare
  v_no      bigint := nextval('demo_carte_no');
  v_iccid   text := case p_operateur when 'MTN' then '89237991' else '89237992' end || lpad(v_no::text, 12, '0');
  v_numero  text := case p_operateur when 'MTN' then '6000' else '6009' end || lpad(v_no::text, 5, '0');
  v_libelle text := case p_operateur when 'MTN' then 'MTN' else 'Orange' end || ' ·' || right(v_iccid, 4);
begin
  insert into demo_cartes_base (terminal, iccid, imsi_prefixe, operateur, libelle, nom, numero, premiere_vue, derniere_vue)
  values ('demo', v_iccid, case p_operateur when 'MTN' then '62401' else '62402' end, p_operateur, v_libelle,
          p_nom, v_numero, now(), now());
  insert into demo_comptes (terminal, iccid, libelle, operateur, reseau, numero, solde, signal, solde_maj, maj)
  values ('demo', v_iccid, v_libelle, p_operateur, p_operateur, v_numero, 0, 24, now(), now());
  insert into demo_attributions (utilisateur, iccid) values (p_utilisateur, v_iccid);
  return v_iccid;
end $$;

create or replace function demo_cartes_a_la_creation() returns trigger
language plpgsql as $$
declare v_nom text;
begin
  v_nom := upper(btrim(coalesce(nullif(btrim(coalesce(to_jsonb(new) ->> 'prenom', '') || ' ' || coalesce(to_jsonb(new) ->> 'nom', '')), ''),
                                split_part(new.courriel, '@', 1))));
  perform demo_nouvelle_carte(new.id, 'MTN', v_nom);
  perform demo_nouvelle_carte(new.id, 'Orange', v_nom);
  return null;
end $$;
drop trigger if exists demo_cartes_a_la_creation on demo_utilisateurs;
create trigger demo_cartes_a_la_creation after insert on demo_utilisateurs
  for each row execute function demo_cartes_a_la_creation();

-- Les boutons du guichet de démo : les chemins des menus ci-dessous, pour que
-- « Transfert », « Dépôt », « Retrait », « Solde » se déroulent seuls.
insert into demo_raccourcis (terminal, operateur, nom, libelle, etapes) values
  ('demo', 'MTN', 'menu', 'Menu MoMo', '*126#'),
  ('demo', 'MTN', 'transfert', 'Transfert', '*126#,1'),
  ('demo', 'MTN', 'retrait', 'Retrait', '*126#,2'),
  ('demo', 'MTN', 'depot', 'Dépôt', '*126#,3'),
  ('demo', 'MTN', 'solde', 'Solde', '*126#,5'),
  ('demo', 'Orange', 'menu', 'Menu', '#150#'),
  ('demo', 'Orange', 'transfert', 'Transfert', '#150#,1'),
  ('demo', 'Orange', 'retrait', 'Retrait', '#150#,2'),
  ('demo', 'Orange', 'depot', 'Dépôt', '#150#,3'),
  ('demo', 'Orange', 'solde', 'Solde', '#150#,5')
on conflict (terminal, operateur, nom) do nothing;

-- ---------------------------------------------------------------------------
-- 4. LE FAUX RÉSEAU
-- ---------------------------------------------------------------------------
create or replace function demo_francs(n numeric) returns text
language sql immutable as $$ select replace(to_char(n, 'FM999G999G999G999'), ',', ' ') $$;

-- Un SMS d'opérateur dans la boîte de réception d'une carte de démo.
create or replace function demo_sms(
  p_compte demo_comptes, p_sens text, p_montant numeric, p_tiers text, p_numero text,
  p_reference text, p_texte text, p_categorie text
) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into demo_paiements (terminal, source_id, compte, carte, sens, montant, tiers, numero, reference,
                              solde_apres, frais, expediteur, categorie, texte, emis_le, recu_le)
  values ('demo', nextval('demo_source_id'), p_compte.libelle, p_compte.iccid, p_sens, p_montant, p_tiers, p_numero,
          p_reference, p_compte.solde, case when p_sens is null then null else 0 end,
          case p_compte.operateur when 'MTN' then 'MobileMoney' else 'OrangeMoney' end,
          p_categorie, p_texte, now(), now())
  returning id into v_id;
  -- Un float de test chez Glisil : le SMS part aussi chez Glisil (par la
  -- plateforme). Pas les francs FABRIQUÉS : ils ne viennent d'aucun client,
  -- et Glisil les garderait « retenus » pour toujours, faute de payeur. Le
  -- solde annoncé du float les compte dès le mouvement suivant.
  if p_sens is not null and p_tiers is distinct from 'BANQUE DEMO'
     and exists (select 1 from demo_floats_xafe where iccid = p_compte.iccid) then
    insert into demo_file_xafe (paiement_id) values (v_id) on conflict do nothing;
  end if;
  return v_id;
end $$;

-- VIRER, entre deux cartes de démo. Les deux lignes sont verrouillées dans
-- l'ordre de leur numéro (deux virements croisés ne s'attendent pas l'un
-- l'autre pour toujours), le solde relu SOUS le verrou, l'écriture relative.
create or replace function demo_virer(p_de text, p_vers_numero text, p_montant numeric, p_operation text, p_par text)
returns jsonb language plpgsql as $$
declare
  v_de   demo_comptes;
  v_vers demo_comptes;
  v_nom_de text; v_nom_vers text;
  v_ref  text;
  v_mot  text := case p_operation when 'depot' then 'Depot' when 'retrait' then 'Retrait' else 'Transfert' end;
begin
  if p_montant is null or p_montant <= 0 or p_montant <> trunc(p_montant) then
    return jsonb_build_object('ok', false, 'raison', 'Montant invalide.');
  end if;
  -- les deux cartes, verrouillées dans l'ordre
  perform 1 from demo_comptes
   where iccid = p_de or numero = regexp_replace(coalesce(p_vers_numero, ''), '^(\+?237)', '')
   order by id for update;
  select * into v_de from demo_comptes where iccid = p_de;
  select * into v_vers from demo_comptes where numero = regexp_replace(coalesce(p_vers_numero, ''), '^(\+?237)', '');
  if v_de.iccid is null then return jsonb_build_object('ok', false, 'raison', 'Carte inconnue.'); end if;
  if v_vers.iccid is null then
    return jsonb_build_object('ok', false, 'raison', 'Numero inconnu dans la demo : seules les cartes de demo se paient entre elles.');
  end if;
  if v_vers.iccid = v_de.iccid then return jsonb_build_object('ok', false, 'raison', 'Vous ne pouvez pas vous payer vous-meme.'); end if;
  if v_vers.operateur <> v_de.operateur then
    return jsonb_build_object('ok', false, 'raison', format('Ce numero n''est pas un numero %s.', v_de.operateur));
  end if;
  if coalesce(v_de.solde, 0) < p_montant then
    return jsonb_build_object('ok', false, 'raison', format('Solde insuffisant : %s FCFA.', demo_francs(coalesce(v_de.solde, 0))));
  end if;
  update demo_comptes set solde = solde - p_montant, solde_maj = now(), maj = now() where iccid = v_de.iccid returning * into v_de;
  update demo_comptes set solde = coalesce(solde, 0) + p_montant, solde_maj = now(), maj = now() where iccid = v_vers.iccid returning * into v_vers;
  select nom into v_nom_de from demo_cartes_base where iccid = v_de.iccid;
  select nom into v_nom_vers from demo_cartes_base where iccid = v_vers.iccid;
  v_nom_de := coalesce(v_nom_de, v_de.numero); v_nom_vers := coalesce(v_nom_vers, v_vers.numero);

  if v_de.operateur = 'MTN' then
    v_ref := nextval('demo_reference_no')::text;
    perform demo_sms(v_de, 'sortie', p_montant, v_nom_vers, v_vers.numero, v_ref,
      format('DEMO MTN MoMo : %s de %s FCFA a %s (%s) reussi le %s. Frais : 0 FCFA. Nouveau solde : %s FCFA. Transaction Id : %s.',
             v_mot, demo_francs(p_montant), v_nom_vers, v_vers.numero, to_char(now() at time zone 'Africa/Douala', 'YYYY-MM-DD HH24:MI:SS'),
             demo_francs(v_de.solde), v_ref), 'envoi');
    perform demo_sms(v_vers, 'entree', p_montant, v_nom_de, v_de.numero, v_ref,
      format('DEMO MTN MoMo : Vous avez recu %s FCFA de %s (%s) le %s. Nouveau solde : %s FCFA. Transaction Id : %s.',
             demo_francs(p_montant), v_nom_de, v_de.numero, to_char(now() at time zone 'Africa/Douala', 'YYYY-MM-DD HH24:MI:SS'),
             demo_francs(v_vers.solde), v_ref), 'encaissement');
  else
    v_ref := 'PP' || to_char(now() at time zone 'Africa/Douala', 'YYMMDD.HH24MI') || '.D' || lpad((nextval('demo_reference_no') % 100000)::text, 5, '0');
    perform demo_sms(v_de, 'sortie', p_montant, v_nom_vers, v_vers.numero, v_ref,
      format('DEMO Orange Money : %s de %s FCFA vers %s %s reussi. ID transaction : %s, Frais : 0 FCFA, Nouveau Solde : %s FCFA.',
             v_mot, demo_francs(p_montant), v_vers.numero, v_nom_vers, v_ref, demo_francs(v_de.solde)), 'envoi');
    perform demo_sms(v_vers, 'entree', p_montant, v_nom_de, v_de.numero, v_ref,
      format('DEMO Orange Money : Vous avez recu %s FCFA de %s %s. ID transaction : %s. Nouveau Solde : %s FCFA.',
             demo_francs(p_montant), v_de.numero, v_nom_de, v_ref, demo_francs(v_vers.solde)), 'encaissement');
  end if;
  return jsonb_build_object('ok', true, 'reference', v_ref, 'solde', v_de.solde, 'vers', v_vers.numero, 'nom', v_nom_vers);
end $$;

-- FABRIQUER DES FRANCS : l'administrateur de la démo, et lui seul (la
-- plateforme vérifie le rôle avant d'appeler ; la base, elle, garde la trace).
create or replace function demo_fabriquer(p_iccid text, p_montant numeric, p_par text)
returns jsonb language plpgsql as $$
declare v_c demo_comptes; v_ref text;
begin
  if p_montant is null or p_montant <= 0 or p_montant <> trunc(p_montant) then
    return jsonb_build_object('ok', false, 'raison', 'Montant invalide.');
  end if;
  select * into v_c from demo_comptes where iccid = p_iccid for update;
  if v_c.iccid is null then return jsonb_build_object('ok', false, 'raison', 'Carte inconnue.'); end if;
  insert into demo_emissions (iccid, montant, par) values (p_iccid, p_montant, p_par);
  update demo_comptes set solde = coalesce(solde, 0) + p_montant, solde_maj = now(), maj = now() where iccid = p_iccid returning * into v_c;
  v_ref := 'BD' || nextval('demo_reference_no')::text;
  perform demo_sms(v_c, 'entree', p_montant, 'BANQUE DEMO', null, v_ref,
    format('DEMO %s : Vous avez recu %s FCFA de BANQUE DEMO. Nouveau solde : %s FCFA. Transaction Id : %s.',
           case v_c.operateur when 'MTN' then 'MTN MoMo' else 'Orange Money' end, demo_francs(p_montant), demo_francs(v_c.solde), v_ref),
    'encaissement');
  return jsonb_build_object('ok', true, 'reference', v_ref, 'solde', v_c.solde);
end $$;

-- LES MENUS DE DÉMO. Les mêmes chemins pour MTN (*126#) et Orange (#150#) :
-- 1 transfert, 2 retrait, 3 dépôt, 5 solde. Ce que l'écran lit, il le
-- reconnaît comme les vrais : « numero », « montant », « code secret ».
create or replace function demo_menu(p_operateur text) returns text
language sql immutable as $$
  select case p_operateur when 'MTN'
    then E'MTN MoMo (DEMO)\n1. Transfert d''argent\n2. Retrait\n3. Depot\n4. Mon compte\n5. Mon solde'
    else E'Orange Money (DEMO)\n1. Transfert\n2. Retrait\n3. Depot\n4. Mon compte\n5. Solde' end
$$;

-- Le code secret de la démo. Comparé, jamais gardé : la demande qui le
-- porte le perd dans la même écriture que sa clôture (commandes_code_efface).
create or replace function demo_code_secret() returns text language sql immutable as $$ select '1234' $$;

-- JOUER UNE DEMANDE. La plateforme dépose la demande dans demo_commandes,
-- puis appelle cette fonction : elle répond comme le réseau, et clôt la
-- demande (« faite », son écran, et ce que le réseau dit de la session).
create or replace function demo_jouer(p_id bigint) returns demo_commandes
language plpgsql as $$
declare
  c        demo_commandes;
  v_carte  text;
  v_cpt    demo_comptes;
  s        demo_sessions;
  v_texte  text;
  v_rep    text;
  v_fini   boolean := false;
  v_r      jsonb;
  v_choix  text;
  v_code   text;
  v_parts  text[];
begin
  select * into c from demo_commandes where id = p_id for update;
  if c.id is null or c.etat not in ('en_attente', 'en_cours') then return c; end if;
  v_carte := coalesce(c.parametres ->> 'carte', c.parametres ->> 'iccid');
  select * into v_cpt from demo_comptes where iccid = v_carte;
  v_texte := btrim(coalesce(c.parametres ->> 'texte', ''));

  if v_cpt.iccid is null then
    v_rep := 'Carte inconnue dans la demo.'; v_fini := true;
  elsif c.type = 'solde' then
    v_rep := format('Votre solde est de %s FCFA.', demo_francs(coalesce(v_cpt.solde, 0)));
    update demo_comptes set solde_maj = now() where iccid = v_cpt.iccid;
    v_fini := true;
  elsif c.type = 'ussd_fin' then
    delete from demo_sessions where iccid = v_cpt.iccid;
    v_rep := 'Session terminee.'; v_fini := true;
  elsif c.type = 'ussd' then
    v_code := btrim(coalesce(c.parametres ->> 'code', ''));
    delete from demo_sessions where iccid = v_cpt.iccid;
    v_choix := case
      when v_code in ('*126#', '#150#', '#148#') then 'menu'
      when v_code = '#148*2#' then 'depot'
      when v_code = '#148*3#' then 'retrait'
      when v_code = '#148*4#' then 'transfert'
      when v_code = '#148*5#' then 'solde'
      else null end;
    if v_choix is null then
      -- un code direct « *126*1*numero*montant# » : droit à la confirmation
      v_parts := regexp_match(v_code, '^\*126\*([123])\*(\d{9,12})\*(\d+)#$');
      if v_parts is not null then
        insert into demo_sessions (iccid, operation, etape, numero, montant, par)
        values (v_cpt.iccid, case v_parts[1] when '1' then 'depot' when '2' then 'retrait' else 'transfert' end, 'code',
                v_parts[2], v_parts[3]::numeric, c.parametres ->> 'par');
        select * into s from demo_sessions where iccid = v_cpt.iccid;
        v_rep := null;     -- l'écran de confirmation, plus bas
      else
        v_rep := 'Code inconnu dans la demo. Essayez *126# (MTN) ou #150# (Orange).'; v_fini := true;
      end if;
    elsif v_choix = 'menu' then
      insert into demo_sessions (iccid, etape, par) values (v_cpt.iccid, 'menu', c.parametres ->> 'par');
      v_rep := demo_menu(v_cpt.operateur);
    elsif v_choix = 'solde' then
      v_rep := format('Votre solde est de %s FCFA.', demo_francs(coalesce(v_cpt.solde, 0))); v_fini := true;
    else
      insert into demo_sessions (iccid, operation, etape, par) values (v_cpt.iccid, v_choix, 'numero', c.parametres ->> 'par');
      v_rep := case v_choix when 'retrait' then 'Entrez le numero de l''agent:' when 'depot' then 'Entrez le numero du client:'
                            else 'Entrez le numero du beneficiaire:' end;
    end if;
  elsif c.type = 'ussd_reponse' then
    select * into s from demo_sessions where iccid = v_cpt.iccid for update;
    if s.iccid is null then
      v_rep := 'Session expiree. Recommencez.'; v_fini := true;
    elsif s.etape = 'menu' then
      v_choix := case v_texte when '1' then 'transfert' when '2' then 'retrait' when '3' then 'depot'
                              when '4' then 'compte' when '5' then 'solde' else null end;
      if v_choix is null then
        v_rep := 'Choix invalide.' || E'\n' || demo_menu(v_cpt.operateur);
      elsif v_choix = 'solde' then
        delete from demo_sessions where iccid = v_cpt.iccid;
        v_rep := format('Votre solde est de %s FCFA.', demo_francs(coalesce(v_cpt.solde, 0))); v_fini := true;
      elsif v_choix = 'compte' then
        delete from demo_sessions where iccid = v_cpt.iccid;
        v_rep := format('Votre numero : %s. Compte de demonstration TOTEM.', v_cpt.numero); v_fini := true;
      else
        update demo_sessions set operation = v_choix, etape = 'numero', maj = now() where iccid = v_cpt.iccid;
        v_rep := case v_choix when 'retrait' then 'Entrez le numero de l''agent:' when 'depot' then 'Entrez le numero du client:'
                              else 'Entrez le numero du beneficiaire:' end;
      end if;
    elsif s.etape = 'numero' then
      if regexp_replace(v_texte, '\s', '', 'g') !~ '^(\+?237)?6\d{8}$' then
        v_rep := 'Numero invalide. Entrez un numero a 9 chiffres:';
      else
        update demo_sessions set numero = regexp_replace(regexp_replace(v_texte, '\s', '', 'g'), '^(\+?237)', ''), etape = 'montant', maj = now()
         where iccid = v_cpt.iccid;
        v_rep := 'Entrez le montant:';
      end if;
    elsif s.etape = 'montant' then
      -- « case », pas « or » : SQL ne promet pas d'évaluer de gauche à droite,
      -- et « abc »::numeric lèverait au lieu de redemander le montant.
      if (case when regexp_replace(v_texte, '[\s.]', '', 'g') ~ '^\d{1,12}$'
               then regexp_replace(v_texte, '[\s.]', '', 'g')::numeric <= 0 else true end) then
        v_rep := 'Montant invalide. Entrez le montant:';
      else
        update demo_sessions set montant = regexp_replace(v_texte, '[\s.]', '', 'g')::numeric, etape = 'code', maj = now()
         where iccid = v_cpt.iccid returning * into s;
        v_rep := null;     -- l'écran de confirmation, plus bas
      end if;
    elsif s.etape = 'code' then
      -- le code secret : comparé, jamais gardé
      delete from demo_sessions where iccid = v_cpt.iccid;
      if v_texte <> demo_code_secret() then
        v_rep := 'Code secret incorrect. Operation annulee. (Demo : le code est 1234.)';
      else
        v_r := demo_virer(v_cpt.iccid, s.numero, s.montant, s.operation, c.parametres ->> 'par');
        v_rep := case when (v_r ->> 'ok')::boolean
          then format('Operation reussie. %s de %s FCFA vers %s (%s). Transaction Id : %s. Nouveau solde : %s FCFA.',
                      initcap(s.operation), demo_francs(s.montant), v_r ->> 'nom', v_r ->> 'vers', v_r ->> 'reference',
                      demo_francs((v_r ->> 'solde')::numeric))
          else 'Echec : ' || (v_r ->> 'raison') end;
      end if;
      v_fini := true;
    end if;
    -- l'écran de confirmation : ce qu'on va signer, puis le code
    if v_rep is null and s.etape = 'code' then
      v_rep := format(E'%s de %s FCFA vers %s (%s).\nFrais : 0 FCFA.\nSolde apres : %s FCFA.\nConfirmer l''operation ?\nEntrez votre code secret:',
                      initcap(s.operation), demo_francs(s.montant),
                      coalesce((select b.nom from demo_cartes_base b join demo_comptes k on k.iccid = b.iccid where k.numero = s.numero), 'NUMERO INCONNU'),
                      s.numero, demo_francs(coalesce(v_cpt.solde, 0) - s.montant));
    end if;
  elsif c.type in ('recu', 'identite', 'raccourci') then
    v_rep := 'Pas dans la demo : les recus PDF, le nom de la carte et les boutons appris viennent du boitier.';
    update demo_commandes set etat = 'echouee', resultat = v_rep, traitee_le = now() where id = c.id returning * into c;
    return c;
  else
    v_rep := 'Demande inconnue dans la demo.'; v_fini := true;
  end if;
  -- l'écran de confirmation d'un code direct (ussd)
  if v_rep is null and s.etape = 'code' then
    v_rep := format(E'%s de %s FCFA vers %s (%s).\nFrais : 0 FCFA.\nSolde apres : %s FCFA.\nConfirmer l''operation ?\nEntrez votre code secret:',
                    initcap(s.operation), demo_francs(s.montant),
                    coalesce((select b.nom from demo_cartes_base b join demo_comptes k on k.iccid = b.iccid where k.numero = s.numero), 'NUMERO INCONNU'),
                    s.numero, demo_francs(coalesce(v_cpt.solde, 0) - s.montant));
  end if;
  update demo_commandes
     set etat = 'faite', resultat = v_rep, traitee_le = now(),
         parametres = parametres || jsonb_build_object('reseau', case when v_fini then 'fini' else 'attend' end)
   where id = c.id returning * into c;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- 5. LES DROITS. Comme partout ici : RLS active, aucune politique — seule la
--    clé de service (la plateforme) lit et écrit. La vue des cartes et celle
--    du boîtier de démo ne s'ouvrent à personne d'autre non plus.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['demo_utilisateurs', 'demo_attributions', 'demo_appareils', 'demo_comptes', 'demo_paiements',
                           'demo_recus', 'demo_commandes', 'demo_raccourcis', 'demo_beneficiaires', 'demo_cartes_base',
                           'demo_emissions', 'demo_sessions', 'demo_floats_xafe', 'demo_file_xafe'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
  revoke all on demo_terminaux, demo_cartes from anon, authenticated;
end $$;
revoke all on function demo_nouvelle_carte(bigint, text, text), demo_virer(text, text, numeric, text, text),
  demo_fabriquer(text, numeric, text), demo_jouer(bigint), demo_sms(demo_comptes, text, numeric, text, text, text, text, text)
  from public, anon, authenticated;
