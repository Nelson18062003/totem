-- ---------------------------------------------------------------------------
-- TOTEM — structure de la base Supabase
--
-- À coller dans l'éditeur SQL de Supabase (menu « SQL Editor » → « New query »),
-- puis exécuter. Le script est rejouable : le relancer ne casse rien.
--
-- Principe : le Raspberry Pi reste la source de vérité. Il écrit ici une copie
-- de ce qu'il a vu, quand il a du réseau. Le cloud sert à consulter depuis
-- n'importe où et à survivre à la mort d'une carte mémoire — pas à décider.
-- ---------------------------------------------------------------------------

-- --- Terminaux : un Raspberry Pi, quelque part -----------------------------
create table if not exists terminaux (
  id          text primary key,          -- « douala », « atelier »…
  nom         text,
  vu_le       timestamptz,               -- dernier signe de vie
  sante       jsonb,                     -- température, tension, disque…
  cree_le     timestamptz not null default now()
);

comment on table terminaux is
  'Un boîtier TOTEM. « vu_le » permet de détecter un terminal devenu muet.';

-- --- Comptes : une SIM Mobile Money ----------------------------------------
create table if not exists comptes (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  libelle     text not null,             -- « MTN », « Orange »
  operateur   text,                      -- nom réseau complet
  numero      text,
  solde       bigint,                    -- en FCFA, tel que le SMS l'annonce
  signal      int,                       -- 0..31
  maj         timestamptz not null default now(),
  unique (terminal, libelle)
);

-- --- Paiements : ce que les SMS racontent, une fois compris -----------------
create table if not exists paiements (
  id           bigint generated always as identity primary key,
  terminal     text not null references terminaux(id) on delete cascade,
  -- Identifiant de la ligne dans le journal local du Pi. Couplé au terminal,
  -- il garantit qu'un même paiement renvoyé deux fois (reprise après coupure)
  -- n'apparaisse qu'une seule fois ici.
  source_id    bigint not null,
  compte       text,                     -- libellé du compte (« MTN »)
  sens         text check (sens in ('entree', 'sortie')),
  montant      bigint,
  tiers        text,                     -- nom si connu, sinon numéro
  numero       text,
  reference    text,                     -- référence de transaction opérateur
  solde_apres  bigint,
  frais        bigint,
  texte        text not null,            -- le SMS d'origine : il fait foi
  recu_le      timestamptz not null,
  cree_le      timestamptz not null default now(),
  unique (terminal, source_id)
);

create index if not exists paiements_recu_le_idx on paiements (recu_le desc);
create index if not exists paiements_compte_idx  on paiements (terminal, compte);
create index if not exists paiements_tiers_idx   on paiements (tiers);

comment on column paiements.texte is
  'Message d''origine, jamais modifié : c''est lui qui fait foi en cas de litige.';

-- --- Événements : la vie du terminal ---------------------------------------
create table if not exists evenements (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  source_id   bigint not null,
  texte       text not null,
  survenu_le  timestamptz not null,
  cree_le     timestamptz not null default now(),
  unique (terminal, source_id)
);

-- --- Commandes : le canal descendant (phase 6) -----------------------------
-- Déclaré maintenant pour éviter une migration plus tard. Inutilisé tant que
-- l'application web ne pilote pas encore le terminal.
create table if not exists commandes (
  id          bigint generated always as identity primary key,
  terminal    text not null references terminaux(id) on delete cascade,
  type        text not null,             -- « solde », « ussd »…
  parametres  jsonb not null default '{}'::jsonb,
  etat        text not null default 'en_attente'
                check (etat in ('en_attente', 'en_cours', 'faite', 'echouee')),
  resultat    text,
  demandee_le timestamptz not null default now(),
  traitee_le  timestamptz
);

create index if not exists commandes_attente_idx
  on commandes (terminal, etat) where etat = 'en_attente';

-- ---------------------------------------------------------------------------
-- Sécurité : personne ne lit sans être connecté.
--
-- Le Pi écrit avec la clé « service_role », qui contourne ces règles — c'est
-- pour cela qu'elle ne doit jamais quitter le fichier de configuration du Pi.
-- L'application web lit avec la clé publique, et n'obtient rien sans session.
-- ---------------------------------------------------------------------------
alter table terminaux  enable row level security;
alter table comptes    enable row level security;
alter table paiements  enable row level security;
alter table evenements enable row level security;
alter table commandes  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['terminaux','comptes','paiements','evenements','commandes']
  loop
    execute format(
      'drop policy if exists "lecture connectee" on %I; '
      'create policy "lecture connectee" on %I for select to authenticated using (true);',
      t, t);
  end loop;
end $$;

-- Seule exception en écriture : un utilisateur connecté peut demander une
-- commande (appuyer sur un bouton). Il ne peut pas modifier l'historique.
drop policy if exists "demander une commande" on commandes;
create policy "demander une commande" on commandes
  for insert to authenticated with check (true);
