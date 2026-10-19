-- ===========================================================================
-- LA DÉMO VIVANTE · LES REÇUS — de vrais documents, de faux francs.
--
-- Dans la démo, il n'y a pas de boîtier pour fabriquer les reçus PDF. La
-- PLATEFORME les dessine maintenant elle-même, à l'ouverture, avec le dessin
-- du boîtier (web/lib/recu-pdf.ts, comparé au pixel près à totem/recu.py par
-- tests/test_recu_de_la_plateforme.py). La base ne garde que la FICHE du
-- reçu (demo_recus), comme pour un vrai : son numéro, son genre, sa
-- référence, son montant.
--
--   1. demo_fiche_de_recu : la fiche d'un SMS, numérotée comme le boîtier
--      la numérote (« TM-2026-1019-0042 » : le jour, puis la ligne) ;
--   2. demo_sms : chaque SMS d'argent naît avec son reçu ;
--   3. demo_jouer : « Établir le reçu » répond « prêt », au lieu d'échouer.
--
-- Rejouable. À coller dans l'éditeur SQL de Supabase, après
-- 20261019_demo_vivante.sql.
-- ===========================================================================

-- 1. La fiche d'un reçu. Rend son numéro, ou null si la ligne ne porte pas
--    de quoi le remplir (rien n'est inventé : pas de montant, pas de reçu de
--    transfert ; pas de solde annoncé, pas de reçu de solde).
create or replace function demo_fiche_de_recu(p_paiement bigint, p_genre text)
returns text language plpgsql as $$
declare
  p demo_paiements;
  v_numero text;
begin
  select * into p from demo_paiements where id = p_paiement;
  if p.id is null or p.source_id is null then return null; end if;
  if p_genre = 'solde' and p.solde_apres is null then return null; end if;
  if p_genre <> 'solde' and not (coalesce(p.montant, 0) > 0) then return null; end if;
  v_numero := 'TM-' || to_char(p.recu_le at time zone 'Africa/Douala', 'YYYY-MMDD')
              || '-' || lpad(p.source_id::text, 4, '0');
  insert into demo_recus (terminal, numero, genre, reference, montant, chemin, etabli_le)
  values ('demo', v_numero, case when p_genre = 'solde' then 'solde' else 'transfert' end, p.reference,
          case when p_genre = 'solde' then p.solde_apres else p.montant end, 'plateforme', now())
  on conflict (terminal, numero) do update
    set genre = excluded.genre, montant = excluded.montant, etabli_le = excluded.etabli_le;
  return v_numero;
end $$;

-- 2. Le SMS d'opérateur, avec son reçu.
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
  -- LE REÇU NAÎT AVEC LE SMS, comme sur un vrai boîtier qui le fabrique dès
  -- l'arrivée d'un SMS d'argent. La plateforme le dessine à l'ouverture
  -- (web/lib/recu-de-la-plateforme.ts) : on ne garde que sa fiche.
  if p_sens is not null and coalesce(p_montant, 0) > 0 then
    perform demo_fiche_de_recu(v_id, 'transfert');
  end if;
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

-- 3. Le faux réseau, qui sait maintenant établir un reçu.
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
  v_numero text;
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
  elsif c.type = 'recu' then
    -- Établir, ou refaire, le reçu d'un SMS : la plateforme le dessine, la
    -- base n'en garde que la fiche. Les trois phrases sont celles du boîtier
    -- (totem/pilotage.py) : l'écran choisit sa réaction sur la phrase.
    v_numero := demo_fiche_de_recu(
      (select p.id from demo_paiements p
        where p.source_id = (case when c.parametres ->> 'source_id' ~ '^\d{1,15}$' then (c.parametres ->> 'source_id')::bigint end)
          and (v_carte is null or p.carte = v_carte)),
      case when c.parametres ->> 'nature' = 'solde' then 'solde' else 'transfert' end);
    if v_numero is null then
      v_rep := case when c.parametres ->> 'langue' = 'en'
        then 'This message does not carry what that receipt needs — a readable amount for a transfer, an announced balance for a balance receipt.'
        else 'Ce message ne porte pas de quoi remplir ce reçu — un montant lisible pour un transfert, un solde annoncé pour un reçu de solde.' end;
      update demo_commandes set etat = 'echouee', resultat = v_rep, traitee_le = now() where id = c.id returning * into c;
      return c;
    end if;
    v_rep := case when c.parametres ->> 'langue' = 'en'
      then format('Receipt %s is ready: it can be shared now.', v_numero)
      else format('Reçu %s prêt : il se partage dès maintenant.', v_numero) end;
    update demo_commandes set etat = 'faite', resultat = v_rep, traitee_le = now() where id = c.id returning * into c;
    return c;
  elsif c.type in ('identite', 'raccourci') then
    v_rep := 'Pas dans la demo : le nom de la carte et les boutons appris viennent du boitier.';
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

-- Les reçus des SMS de démo déjà là : ils auraient eu le leur sur un vrai boîtier.
select demo_fiche_de_recu(id, 'transfert') from demo_paiements where sens is not null and coalesce(montant, 0) > 0;

revoke all on function demo_fiche_de_recu(bigint, text) from public, anon, authenticated;
