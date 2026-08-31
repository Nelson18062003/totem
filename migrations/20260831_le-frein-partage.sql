-- LE FREIN, PARTAGÉ PAR TOUTES LES INSTANCES.
--
-- Le compteur des essais de mot de passe vivait dans la MÉMOIRE du serveur.
-- Un hébergement qui met plusieurs instances en parallèle — ce que fait
-- Vercel dès qu'il y a un peu de trafic — donnait donc à chaque instance son
-- propre seau : une attaque répartie obtenait l'allocation autant de fois
-- qu'il y avait d'instances, et personne ne pouvait le voir.
--
-- Le compteur descend ici, où il n'y en a qu'un.
--
-- TOUT TIENT DANS UNE SEULE INSTRUCTION, et c'est le seul point qui compte.
-- Lire le compteur puis l'écrire aurait reproduit un cran plus bas la faute
-- qu'on vient de corriger un cran plus haut : entre la lecture et l'écriture,
-- soixante essais passent. « insert … on conflict do update » compte et rend
-- le résultat d'un seul geste, sous le verrou de la ligne.
--
--     psql "$SUPABASE_DB_URL" -f migrations/20260831_le-frein-partage.sql

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

alter table freins enable row level security;
-- Aucune politique : seule la clé de service entre, comme partout ailleurs.

-- Le ménage : une ligne plus vieille que la fenêtre ne dit plus rien.
create index if not exists freins_vu on freins (vu);

/**
 * Compte un essai et rend le nombre d'essais dans la fenêtre.
 *
 * `fenetre_s` : la durée de la fenêtre, en secondes. Une ligne plus vieille
 * repart de un — on ne traîne pas les fautes d'hier.
 */
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

-- ---------------------------------------------------------------------------
-- Vérification. On compte VRAIMENT, et on exige les bons nombres.
-- ---------------------------------------------------------------------------
do $$
declare
  a integer; b integer; c integer;
begin
  delete from freins where cle = 'essai-de-migration';

  select compter_un_essai('essai-de-migration', 900) into a;
  select compter_un_essai('essai-de-migration', 900) into b;
  if a <> 1 or b <> 2 then
    raise exception 'Le comptage ne monte pas : % puis %', a, b;
  end if;

  -- Une fenêtre de zéro seconde : la ligne est déjà « vieille », on repart à 1.
  select compter_un_essai('essai-de-migration', 0) into c;
  if c <> 1 then
    raise exception 'Une vieille ligne ne repart pas de un : %', c;
  end if;

  delete from freins where cle = 'essai-de-migration';
  raise notice 'Le frein partagé compte juste (1, 2, puis 1 hors fenêtre).';
end $$;
