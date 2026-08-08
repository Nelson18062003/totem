-- ---------------------------------------------------------------------------
-- TOTEM — migration « le verrouillage du téléphone »
-- (août 2026)
--
-- CE QUE FAIT CE FICHIER
-- Il ajoute les deux tables qui permettent d'entrer dans TOTEM avec le
-- verrouillage de son propre téléphone — l'empreinte, le visage, le schéma —
-- au lieu d'un code reçu par courriel.
--
-- CE QU'EST UNE « CLÉ » ICI
-- Un accord entre UN téléphone et TOTEM. Le téléphone garde un secret qui ne
-- le quitte jamais ; il nous donne seulement la moitié publique, celle qui ne
-- déverrouille rien. À chaque entrée, il signe une phrase que nous venons
-- d'inventer, et nous vérifions la signature.
--
-- CE QUE ÇA CHANGE POUR LA PERSONNE
-- Rien à retenir, rien à recopier, rien à attendre. Et un faux site qui
-- imiterait TOTEM ne peut pas s'en servir : le téléphone refuse de signer pour
-- une autre adresse que la nôtre. C'est la seule protection de cette liste qui
-- tienne quand la personne, elle, s'est fait avoir.
--
-- LA LIMITE, ET ELLE EST SÉRIEUSE
-- Une clé reconnaît un APPAREIL, pas une personne. Sur un téléphone de
-- comptoir que trois personnes se passent, elle ne prouve rien du tout. TOTEM
-- ne la proposera donc jamais sur un appareil déclaré partagé — sur celui-là
-- on entre par le courriel, et la session se ferme le soir même.
--
-- CE QUE CES TABLES NE REMPLACENT PAS
-- Le courriel. Une clé se perd avec le téléphone, et le jour où c'est arrivé
-- il faut un autre chemin. Les deux coexistent, exprès et pour toujours.
--
-- EST-CE SANS RISQUE
-- Oui. Aucune table existante n'est touchée. Rejouable.
--
-- COMMENT L'EXÉCUTER
--  1. Supabase → « SQL Editor » → « New query ».
--  2. Coller TOUT ce fichier, puis « Run ». Le relancer ne doit rien casser.
-- ---------------------------------------------------------------------------

-- --- Les clés : un appareil, un accord -------------------------------------
create table if not exists cles (
  id          bigint generated always as identity primary key,
  personne    bigint not null references personnes(id) on delete restrict,

  -- L'identifiant que l'appareil s'est donné. Unique au monde, et sans intérêt
  -- pour qui le lit : il ne sert qu'à retrouver la bonne ligne.
  identifiant text not null unique,

  -- La moitié PUBLIQUE de la clé. Elle ne déverrouille rien : elle permet
  -- seulement de vérifier une signature. C'est pourquoi elle peut être ici en
  -- clair alors que rien d'autre ne l'est.
  cle_publique text not null,

  -- Le compteur que l'appareil incrémente à chaque signature. Il ne sert qu'à
  -- une chose : repérer une clé COPIÉE. Si un compteur recule, deux objets
  -- portent la même clé. Beaucoup d'appareils renvoient toujours zéro — on ne
  -- s'alarme donc que si le compteur a déjà bougé une fois.
  compteur    bigint not null default 0,

  -- « appareil » : le téléphone ou l'ordinateur lui-même.
  -- « objet »   : une clé physique qu'on branche, pour qui en a une.
  genre       text not null default 'appareil'
                check (genre in ('appareil', 'objet')),

  -- Vraie quand la clé est recopiée dans le compte du fabricant (iCloud,
  -- Google). Elle survit alors au téléphone perdu — et c'est une information
  -- que la personne doit voir, parce qu'elle change entièrement ce qu'il faut
  -- faire le jour de la perte.
  sauvegardee boolean not null default false,

  -- « Chrome sur Android ». Pour que la personne reconnaisse SON téléphone
  -- dans la liste, et sache lequel retirer.
  appareil    text,
  lieu        text,

  cree_le     timestamptz not null default now(),
  vue_le      timestamptz,

  -- Retirer, c'est dater. Une clé retirée reste : c'est elle qui explique,
  -- trois mois plus tard, pourquoi une entrée a eu lieu ce jour-là.
  retiree_le  timestamptz,
  retiree_par bigint references personnes(id),
  retiree_motif text
);

create index if not exists cles_personne_idx on cles (personne) where retiree_le is null;

comment on table cles is
  'Un accord entre un appareil et TOTEM. La table ne contient que la moitié '
  'publique : elle vérifie une signature, elle n''en produit aucune.';

alter table cles enable row level security;

-- --- Les défis : la phrase qu'on demande de signer -------------------------
-- À chaque entrée, TOTEM invente une phrase et demande à l'appareil de la
-- signer. Elle doit être NEUVE et à USAGE UNIQUE, sinon quelqu'un qui a
-- entendu une vieille signature la rejouerait pour entrer.
--
-- La garder en base plutôt que dans un biscuit signé n'est pas gratuit : c'est
-- ce qui permet de vérifier qu'elle n'a pas DÉJÀ servi. Un biscuit, même
-- parfaitement signé, ne sait pas dire cela.
create table if not exists defis (
  id          bigint generated always as identity primary key,
  valeur      text not null unique,      -- publique par nature : c'est une phrase à signer
  -- « enregistrer » : la personne installe une clé sur cet appareil.
  -- « entrer »      : elle s'en sert.
  usage       text not null check (usage in ('enregistrer', 'entrer')),
  -- Nul pour « entrer » : au moment où on invente la phrase, on ne sait pas
  -- encore qui va la signer. C'est justement l'intérêt — la personne n'a rien
  -- à taper avant de poser son doigt.
  personne    bigint references personnes(id) on delete restrict,
  -- Cinq minutes. La fenêtre du navigateur s'ouvre tout de suite ; au-delà,
  -- la personne a fermé l'onglet et recommencera.
  expire_le   timestamptz not null,
  utilise_le  timestamptz,
  cree_le     timestamptz not null default now()
);

create index if not exists defis_vivants_idx on defis (valeur) where utilise_le is null;
-- Les défis périmés n'ont aucune valeur et s'accumulent. On les efface — et
-- c'est la SEULE table de TOTEM où effacer est permis, parce qu'une phrase
-- expirée n'a jamais rien raconté sur personne.
create index if not exists defis_age_idx on defis (expire_le);

comment on table defis is
  'La phrase à signer, à usage unique. Seule table de TOTEM dont on efface '
  'les lignes : une phrase expirée ne raconte rien sur personne.';

alter table defis enable row level security;

-- Aucune politique de lecture sur ni l'une ni l'autre, volontairement : sans
-- politique, une clé publique ne lit RIEN.
