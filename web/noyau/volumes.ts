// LES VOLUMES — ce qui est entré et sorti des cartes, sur la période qu'on
// choisit, compté UNE fois, ici, pour le site et pour le téléphone.
//
// La demande vient d'un utilisateur : « connaître le volume d'entrée ou de
// sortie sur une journée, une semaine, un mois, ou un nombre de jours
// choisis ». L'Analyse d'avant ne comptait que l'argent REÇU, sur sept jours,
// parmi les mille derniers SMS : sur la vraie base (août–octobre 2026), elle
// laissait dehors 22 % des entrées et toutes les sorties.
//
// LE DICTIONNAIRE DES CHIFFRES, validé par le propriétaire :
//
//   — Ce qui compte : l'argent qui bouge sur la carte — argent reçu ou
//     envoyé, transferts, dépôts, retraits —, avec un montant lu. La nature
//     choisie à la main l'emporte sur celle que le robot a devinée. C'est la
//     règle du relevé (`genreDuMouvement`), et c'est la même fonction.
//   — ENTRÉES : ce qui fait monter le solde. SORTIES : ce qui le fait
//     baisser, SANS les frais. Sur une puce d'agent, le dépôt d'un client
//     fait baisser le solde (sortie), son retrait le fait monter (entrée).
//   — FRAIS : ceux que la carte a payés, sur ses sorties, à part. NET =
//     entrées − sorties − frais : exactement ce dont les soldes ont bougé.
//   — COMMISSIONS GAGNÉES : à part, jamais dans les entrées — elles vont sur
//     le compte des commissions de l'opérateur, pas sur le solde de la carte.
//     Quand elles y sont VERSÉES (un SMS « reçu de » la carte elle-même),
//     c'est une entrée : « commissions versées sur la carte ».
//   — Ne comptent pas : échecs, publicités, consultations de solde, codes,
//     messages, avis en double. Un SMS illisible ou dont on ne sait pas si
//     l'argent entre ou sort n'est JAMAIS deviné : il est dénombré à part, et
//     l'écran avertit.
//   — Une opération se compte une fois (`sansDoublons`). Le même numéro de
//     transaction sur deux cartes de la sélection, c'est un TRANSFERT ENTRE
//     ELLES : compté sur chaque carte (sinon ses soldes ne tomberaient plus
//     juste), retiré des totaux d'ensemble (l'argent n'a pas quitté vos
//     cartes), montré à part.
//   — L'heure qui fait foi est celle de l'opérateur, à l'heure de la CAISSE
//     (`Paiement.jour`, `recuLe`) ; un jour va de minuit à minuit, là-bas.
//   — Les montants se comptent en CENTIMES entiers (Orange annonce des
//     décimales).
//   — Le contrôle des soldes, carte par carte : solde annoncé au début +
//     entrées − sorties − frais doit donner le solde annoncé à la fin. L'écart
//     se MONTRE ; il ne se corrige jamais. Pas d'annonce : « non connu ».
//
// Les lignes arrivent déjà dans la portée de la personne : ce fichier ne
// décide pas de QUI voit quoi, il compte ce qu'on lui donne.

import { dansBornes, decalerJour, type Bornes } from "./periodes";
import {
  chronologique, dernierSoldeAvant, duCompteDesCommissions, estMouvement, genreDuMouvement,
  joursDe, numeroNormal, repereDeSolde, sansDoublons, soldesDuReleve, totauxDuReleve,
  JOURS_MAX_RELEVE,
} from "./releve";
import { fluxDe } from "./flux";
import type { Paiement } from "./types";
import type { Langue } from "./langue";

// --- La période --------------------------------------------------------------

export const GENRES_PERIODE = ["jour", "semaine", "mois", "6mois", "dates"] as const;
export type GenrePeriode = (typeof GENRES_PERIODE)[number];
export const estGenrePeriode = (v: unknown): v is GenrePeriode =>
  typeof v === "string" && (GENRES_PERIODE as readonly string[]).includes(v);

/** Le pas de la courbe : une colonne par heure, par jour, par semaine, par mois. */
export type Pas = "heure" | "jour" | "semaine" | "mois";

export type PeriodeVolumes = Bornes & {
  genre: GenrePeriode;
  pas: Pas;
  /** La période contient aujourd'hui : elle n'est pas finie, et se compare
   *  aux MÊMES jours de la précédente (le 1er–21 octobre au 1er–21 septembre). */
  enCours: boolean;
  /** Le dernier jour qui a pu porter une opération : min(fin, aujourd'hui). */
  jusqua: string;
};

const FORME = /^\d{4}-\d{2}-\d{2}$/;

function jourValide(cle: string | null | undefined): cle is string {
  if (!cle || !FORME.test(cle)) return false;
  const [a, m, j] = cle.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/** Le lundi de la semaine d'un jour — la semaine commence le lundi, comme les
 *  calendriers du Cameroun et de la France. */
export function lundiDe(cle: string): string {
  const [a, m, j] = cle.split("-").map(Number);
  const jourSemaine = (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7;
  return decalerJour(cle, -jourSemaine);
}

/** Le même jour, n mois plus tôt ou plus tard ; le 31 tombe au dernier jour
 *  d'un mois plus court (31 octobre − 1 mois = 30 septembre). */
export function decalerMois(cle: string, n: number): string {
  const [a, m, j] = cle.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const an = Math.floor(total / 12), mois = (total % 12) + 1;
  const dernier = new Date(Date.UTC(an, mois, 0)).getUTCDate();
  return `${an}-${String(mois).padStart(2, "0")}-${String(Math.min(j, dernier)).padStart(2, "0")}`;
}

const finDuMois = (cle: string) => {
  const [a, m] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/** Le pas qui garde la courbe lisible : une trentaine de colonnes au plus. */
export function pasPour(genre: GenrePeriode, jours: number): Pas {
  if (genre === "jour") return "heure";
  if (genre === "semaine" || genre === "mois") return "jour";
  if (genre === "6mois") return "semaine";
  if (jours <= 1) return "heure";
  if (jours <= 31) return "jour";
  if (jours <= 186) return "semaine";
  return "mois";
}

/**
 * La période demandée, rendue sûre — ou `null`.
 *
 * `repere` : un jour de la période (« le mois de ce jour-là »). Pour « dates »,
 * `de` et `a` sont les jours choisis, dans n'importe quel ordre. Une période
 * qui commence dans le futur est refusée ; plus de 366 jours aussi.
 */
export function periodeVolumes(
  genre: GenrePeriode, repere: string | null | undefined, aujourdhui: string,
  de?: string | null, a?: string | null,
): PeriodeVolumes | null {
  let b: Bornes;
  switch (genre) {
    case "jour": {
      const r = jourValide(repere) ? repere : aujourdhui;
      b = { de: r, a: r };
      break;
    }
    case "semaine": {
      const l = lundiDe(jourValide(repere) ? repere : aujourdhui);
      b = { de: l, a: decalerJour(l, 6) };
      break;
    }
    case "mois": {
      const r = jourValide(repere) ? repere : aujourdhui;
      b = { de: `${r.slice(0, 8)}01`, a: finDuMois(r) };
      break;
    }
    case "6mois": {
      const r = jourValide(repere) ? repere : aujourdhui;
      b = { de: decalerMois(`${r.slice(0, 8)}01`, -5), a: finDuMois(r) };
      break;
    }
    case "dates": {
      if (!jourValide(de) || !jourValide(a)) return null;
      b = de <= a ? { de, a } : { de: a, a: de };
      if (joursDe(b) > JOURS_MAX_RELEVE) return null;
      break;
    }
  }
  if (b.de > aujourdhui) return null;
  const jusqua = b.a < aujourdhui ? b.a : aujourdhui;
  return { ...b, genre, pas: pasPour(genre, joursDe(b)), enCours: b.a >= aujourdhui, jusqua };
}

/**
 * LE JOUR QUI DÉSIGNE UNE PÉRIODE, pour la redemander. Pour un jour, une
 * semaine, un mois : n'importe quel jour dedans, le premier par exemple. Pour
 * SIX MOIS, c'est le DERNIER mois qui compte (« les six mois qui finissent
 * en octobre ») : redemandée par son premier jour, « mai – oct. » devenait
 * « déc. – mai » — six mois vides sous le titre « Mai – oct. », et la flèche
 * ‹ sautait onze mois au lieu de six.
 */
export const repereDeLaPeriode = (p: Pick<PeriodeVolumes, "genre" | "de" | "a">): string =>
  p.genre === "6mois" ? p.a : p.de;

/** Ce qu'un écran demande à la plateforme : une période, une carte, et
 *  peut-être la fiche d'un correspondant. */
export type DemandeDeVolumes = {
  periode: GenrePeriode; jour?: string; de?: string; a?: string; carte: string; qui: string | null;
};

/** La période qu'une demande désigne — calculée sur l'écran, pour répondre
 *  à l'appui avant même que les chiffres n'arrivent. */
export const periodeDeLaDemande = (d: DemandeDeVolumes, aujourdhui: string): PeriodeVolumes | null =>
  periodeVolumes(d.periode, d.jour, aujourdhui, d.de, d.a);

/**
 * LA CLÉ D'UNE VUE — et l'adresse qu'on demande. Deux demandes de la même
 * période (« le mois du 22 » et « le mois du 1er ») ont la même : sinon ce
 * que l'écran garde en mémoire ne servirait jamais.
 */
export function cleDeLaDemande(d: DemandeDeVolumes, aujourdhui: string): string {
  const p = periodeDeLaDemande(d, aujourdhui);
  const q = new URLSearchParams({ periode: d.periode });
  if (p && d.periode === "dates") { q.set("de", p.de); q.set("a", p.a); }
  else if (p) q.set("jour", repereDeLaPeriode(p));
  q.set("carte", d.carte);
  if (d.qui) q.set("qui", d.qui);
  return q.toString();
}

/** La demande d'une période (les flèches ‹ ›, les voisines). */
export const demandeDeLaPeriode = (p: PeriodeVolumes, carte: string): DemandeDeVolumes =>
  p.genre === "dates" ? { periode: "dates", de: p.de, a: p.a, carte, qui: null }
    : { periode: p.genre, jour: repereDeLaPeriode(p), carte, qui: null };

/**
 * CE QU'ON CHARGE EN SILENCE, une fois une période affichée : celle d'avant,
 * celle d'après, et les autres durées pour aujourd'hui. Le prochain appui
 * trouve ses chiffres déjà là — c'est ce qui rend l'écran immédiat.
 */
export function voisinesAPrecharger(p: PeriodeVolumes, carte: string, aujourdhui: string): DemandeDeVolumes[] {
  const voisines: DemandeDeVolumes[] = [];
  for (const x of [periodeVoisine(p, -1, aujourdhui), periodeVoisine(p, 1, aujourdhui)]) {
    if (x) voisines.push(demandeDeLaPeriode(x, carte));
  }
  for (const g of GENRES_PERIODE) {
    if (g !== "dates" && g !== p.genre) voisines.push({ periode: g, jour: aujourdhui, carte, qui: null });
  }
  return voisines;
}

/** LES RACCOURCIS DE DATES — ce qu'on choisit le plus souvent, d'un appui,
 *  le même sur le téléphone et sur le site. */
export function raccourcisDeDates(aujourdhui: string): { cle: "sept" | "trente" | "ceMois" | "moisDernier"; bornes: Bornes }[] {
  const debutDuMois = `${aujourdhui.slice(0, 8)}01`;
  const finDuMoisDernier = decalerJour(debutDuMois, -1);
  return [
    { cle: "sept", bornes: { de: decalerJour(aujourdhui, -6), a: aujourdhui } },
    { cle: "trente", bornes: { de: decalerJour(aujourdhui, -29), a: aujourdhui } },
    { cle: "ceMois", bornes: { de: debutDuMois, a: aujourdhui } },
    { cle: "moisDernier", bornes: { de: `${finDuMoisDernier.slice(0, 8)}01`, a: finDuMoisDernier } },
  ];
}

/** La période d'avant ou d'après, du même genre (les flèches ‹ ›). `null` :
 *  elle serait dans le futur. */
export function periodeVoisine(
  p: PeriodeVolumes, sens: -1 | 1, aujourdhui: string,
): PeriodeVolumes | null {
  switch (p.genre) {
    case "jour": return periodeVolumes("jour", decalerJour(p.de, sens), aujourdhui);
    case "semaine": return periodeVolumes("semaine", decalerJour(p.de, 7 * sens), aujourdhui);
    case "mois": return periodeVolumes("mois", decalerMois(p.de, sens), aujourdhui);
    case "6mois": return periodeVolumes("6mois", decalerMois(p.a.slice(0, 8) + "01", 6 * sens), aujourdhui);
    case "dates": {
      const n = joursDe(p);
      return periodeVolumes("dates", null, aujourdhui,
        decalerJour(p.de, n * sens), decalerJour(p.a, n * sens));
    }
  }
}

/**
 * LA PÉRIODE DE COMPARAISON — la précédente, sur le MÊME nombre de jours.
 *
 * Un mois en cours (1er–21 octobre) se compare au 1er–21 septembre, pas au
 * mois de septembre entier : sinon le mois en cours « baisse » tous les
 * matins jusqu'au 30. Un mois fini se compare au mois d'avant entier.
 */
export function periodePrecedente(p: PeriodeVolumes): Bornes {
  const ecoules = joursDe({ de: p.de, a: p.jusqua });
  if (p.genre === "mois" || p.genre === "6mois") {
    const n = p.genre === "mois" ? 1 : 6;
    const de = decalerMois(p.de, -n);
    const fin = p.enCours ? decalerMois(p.jusqua, -n) : decalerJour(p.de, -1);
    const a = fin >= p.de ? decalerJour(p.de, -1) : fin;
    return { de, a };
  }
  const longueur = p.genre === "jour" ? 1 : p.genre === "semaine" ? 7 : joursDe(p);
  const de = decalerJour(p.de, -longueur);
  return { de, a: decalerJour(de, ecoules - 1) };
}

/** Les jours que la plateforme doit lire : la période, la précédente, et de
 *  quoi trouver le solde annoncé avant le début. */
export function joursALire(p: PeriodeVolumes): Bornes {
  return { de: periodePrecedente(p).de, a: p.jusqua };
}

// --- Les types d'opération ---------------------------------------------------

/** Ce qu'une opération a fait, du point de vue de la carte. */
export type TypeVolume =
  | "argent_recu" | "transfert_recu" | "retrait_client" | "depot_recu" | "commissions_versees"
  | "argent_envoye" | "transfert_envoye" | "depot_client" | "retrait_especes";

/** Les familles, pour les anneaux : la même couleur des deux côtés. */
export type FamilleVolume = "argent" | "especes" | "transferts" | "commissions";

export const FAMILLE_DU_TYPE: Record<TypeVolume, FamilleVolume> = {
  argent_recu: "argent", argent_envoye: "argent",
  transfert_recu: "transferts", transfert_envoye: "transferts",
  retrait_client: "especes", depot_recu: "especes", depot_client: "especes", retrait_especes: "especes",
  commissions_versees: "commissions",
};

export { numeroNormal };

function typeDe(p: Paiement, versee: boolean): TypeVolume {
  const g = genreDuMouvement(p);
  const entree = p.sens === "in";
  if (entree && versee) return "commissions_versees";
  switch (g) {
    case "depot": return entree ? "depot_recu" : "depot_client";
    case "retrait": return entree ? "retrait_client" : "retrait_especes";
    case "transfert": return entree ? "transfert_recu" : "transfert_envoye";
    default: return entree ? "argent_recu" : "argent_envoye";
  }
}

// --- Le calcul ---------------------------------------------------------------

export type CarteVolumes = { iccid: string; numero: string; operateur: string; libelle: string };

export type TotauxVolumes = {
  entrees: number; sorties: number; frais: number; net: number;
  nEntrees: number; nSorties: number; n: number;
};

export type Rupture = { montant: number; depuisJour: string; depuis: string; jusquaJour: string; jusqua: string };

export type CarteDesVolumes = CarteVolumes & {
  totaux: TotauxVolumes;
  /** Ce qui est venu d'une autre carte de la sélection, ou y est parti. */
  interneRecu: number; interneEnvoye: number;
  soldes: { ouverture: number | null; cloture: number | null; attendu: number | null; ecart: number | null };
  ruptures: Rupture[];
  aVerifier: number;
};

export type Correspondant = {
  cle: string; nom: string; numero: string;
  recu: number; envoye: number; nRecu: number; nEnvoye: number;
};

export type PointDeSerie = { cle: string; entrees: number; sorties: number; n: number };

export type Volumes = {
  periode: PeriodeVolumes;
  precedente: Bornes;
  totaux: TotauxVolumes;
  avant: TotauxVolumes;
  parType: { type: TypeVolume; famille: FamilleVolume; sens: "in" | "out"; montant: number; n: number }[];
  parCarte: CarteDesVolumes[];
  interne: { montant: number; n: number };
  serie: PointDeSerie[];
  correspondants: Correspondant[];
  nbCorrespondants: number;
  cles: {
    moyenne: number; parJour: number; commissions: number;
    plusGrosse: { montant: number; sens: "in" | "out"; jour: string; heure: string; nom: string; carte: string } | null;
  };
  /** Opérations par jour de la semaine (lundi = 0) et par heure (0–23). */
  heures: number[][];
  avertissements: { illisibles: number; aVerifier: number; incomplets: number; ecarts: number };
  /** La fiche d'un correspondant, quand on l'a demandée. */
  fiche?: Correspondant & { parCarte: { iccid: string; recu: number; envoye: number; n: number }[];
                            serie: PointDeSerie[] } | null;
  /** Le jour du plus ancien SMS de la sélection (`null` : aucun) — absent
   *  d'une plateforme d'avant. */
  debutDeLHistorique?: string | null;
  /** La période d'avant est-elle entièrement couverte par l'historique ?
   *  Sinon, la comparaison ne veut rien dire et l'écran la tait. Absent
   *  d'une plateforme d'avant : on compare, comme avant. */
  comparable?: boolean;
};

export type EntreeVolumes = {
  periode: PeriodeVolumes;
  /** Ce que la plateforme a lu (`joursALire`, avec sa marge), dans la portée. */
  lignes: Paiement[];
  /** Les cartes de la sélection : une, ou toutes celles qu'on peut voir. */
  cartes: CarteVolumes[];
  fuseau: string;
  /** Le dernier solde annoncé AVANT la période, lu plus loin dans la base,
   *  pour une carte dont les lignes lues n'en portent pas. */
  ouverturesAilleurs?: Record<string, number | null>;
  /** La clé d'un correspondant (`Correspondant.cle`), pour sa fiche. */
  correspondant?: string | null;
  /** Combien de correspondants rapporter, au plus. */
  combien?: number;
  /** Le jour du plus ancien SMS de la sélection, lu dans la base. `null` :
   *  aucun SMS ; absent : on ne sait pas (on compare quand même). */
  debutDeLHistorique?: string | null;
};

const cts = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? 0 : Math.round(n * 100);
const francs = (c: number) => c / 100;

const formateursHeure = new Map<string, Intl.DateTimeFormat>();
/** L'heure (0–23) d'un instant, à l'heure de la caisse. */
export function heureLocale(iso: string, fuseau: string): number {
  let f = formateursHeure.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: fuseau, hour: "2-digit", hourCycle: "h23" });
    formateursHeure.set(fuseau, f);
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Number(f.format(new Date(t))) % 24 : 0;
}

/** Le jour de la semaine d'une clé, lundi = 0. */
const jourDeSemaine = (cle: string) => {
  const [a, m, j] = cle.split("-").map(Number);
  return (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7;
};

/** La clé de la colonne où tombe une opération. */
export function cleDuPas(p: Pick<Paiement, "jour" | "recuLe">, periode: Bornes & { pas: Pas }, fuseau: string): string {
  switch (periode.pas) {
    case "heure": return String(heureLocale(p.recuLe, fuseau)).padStart(2, "0");
    case "jour": return p.jour;
    case "semaine": {
      const l = lundiDe(p.jour);
      return l < periode.de ? periode.de : l;
    }
    case "mois": return p.jour.slice(0, 7);
  }
}

/** Toutes les colonnes de la période, vides comprises, jusqu'au dernier jour
 *  qui a pu porter une opération. */
export function colonnesDe(periode: PeriodeVolumes): string[] {
  const cles: string[] = [];
  switch (periode.pas) {
    case "heure":
      for (let h = 0; h < 24; h++) cles.push(String(h).padStart(2, "0"));
      break;
    case "jour":
      for (let j = periode.de; j <= periode.jusqua; j = decalerJour(j, 1)) cles.push(j);
      break;
    case "semaine":
      cles.push(periode.de);
      for (let l = decalerJour(lundiDe(periode.de), 7); l <= periode.jusqua; l = decalerJour(l, 7)) cles.push(l);
      break;
    case "mois":
      for (let m = `${periode.de.slice(0, 7)}-01`; m <= periode.jusqua; m = decalerMois(m, 1)) cles.push(m.slice(0, 7));
      break;
  }
  return cles;
}

type Mouvement = {
  p: Paiement; cents: number; entree: boolean; interne: boolean; type: TypeVolume;
  correspondant: string | null;
};

/** Les mouvements comptés d'une liste de lignes (déjà coupée à la période),
 *  pour une sélection de cartes. */
function mouvementsDe(lignes: Paiement[], cartes: CarteVolumes[]): {
  comptes: Mouvement[]; aVerifier: Paiement[];
} {
  const dans = new Set(cartes.map((c) => c.iccid));
  const numeroDe = new Map(cartes.map((c) => [c.iccid, numeroNormal(c.numero)]));
  const carteDuNumero = new Map<string, string>();
  for (const c of cartes) {
    const n = numeroNormal(c.numero);
    if (n) carteDuNumero.set(n, c.iccid);
  }
  const argent = sansDoublons(lignes.filter((p) => dans.has(p.carte) && estMouvement(p))
    .sort(chronologique));
  const aVerifier = argent.filter((p) => p.sens !== "in" && p.sens !== "out");
  const connus = argent.filter((p) => p.sens === "in" || p.sens === "out");

  // LES TRANSFERTS ENTRE VOS CARTES : le même numéro de transaction, une
  // sortie sur une carte, une entrée sur une autre, le même montant.
  const internes = new Set<Paiement>();
  const parReference = new Map<string, Paiement[]>();
  for (const p of connus) {
    const ref = (p.reference ?? "").trim();
    if (ref.length < 4) continue;
    const l = parReference.get(ref);
    if (l) l.push(p); else parReference.set(ref, [p]);
  }
  for (const groupe of parReference.values()) {
    const sorties = groupe.filter((p) => p.sens === "out");
    const entrees = groupe.filter((p) => p.sens === "in");
    for (const s of sorties) {
      const e = entrees.find((x) => !internes.has(x) && x.carte !== s.carte && cts(x.montant) === cts(s.montant));
      if (e) { internes.add(s); internes.add(e); }
    }
  }
  // …et celui dont on n'a qu'un côté : son correspondant EST une autre carte
  // de la sélection.
  for (const p of connus) {
    const autre = carteDuNumero.get(numeroNormal(p.numero) ?? "");
    if (autre && autre !== p.carte) internes.add(p);
  }

  const comptes = connus.map((p): Mouvement => {
    const num = numeroNormal(p.numero);
    // « Reçu de » la carte elle-même : les commissions versées sur le
    // compte principal (MTN).
    const versee = p.sens === "in" && num != null && num === numeroDe.get(p.carte);
    const nom = (p.tiers ?? "").trim().toUpperCase();
    return {
      p, cents: cts(p.montant), entree: p.sens === "in", interne: internes.has(p),
      type: typeDe(p, versee),
      correspondant: versee ? null : num ?? (nom ? `nom:${nom}` : null),
    };
  });
  return { comptes, aVerifier };
}

function totauxDe(mouvements: Mouvement[], avecInternes: boolean): TotauxVolumes {
  let e = 0, s = 0, f = 0, nE = 0, nS = 0;
  for (const m of mouvements) {
    // Les frais que la carte a PAYÉS : ceux d'une sortie (voir
    // `totauxDuReleve`). Ceux d'un transfert entre vos cartes sont une vraie
    // dépense : ils restent, même quand le transfert sort des totaux.
    if (!m.entree) f += cts(m.p.frais);
    if (m.interne && !avecInternes) continue;
    if (m.entree) { e += m.cents; nE++; } else { s += m.cents; nS++; }
  }
  return { entrees: francs(e), sorties: francs(s), frais: francs(f), net: francs(e - s - f),
           nEntrees: nE, nSorties: nS, n: nE + nS };
}

const INCOMPLET = /message incomplet/i;

/** LE calcul. Le site et le téléphone le reçoivent tel quel de la plateforme. */
export function calculerVolumes(entree: EntreeVolumes): Volumes {
  const { periode, fuseau } = entree;
  const bornes: Bornes = { de: periode.de, a: periode.jusqua };
  const precedente = periodePrecedente(periode);
  // Les SMS du compte des commissions ne sont pas ceux de la carte : ni
  // mouvement, ni solde (`duCompteDesCommissions`).
  const numeroDe = new Map(entree.cartes.map((c) => [c.iccid, c.numero]));
  const lignes = entree.lignes.filter((p) => !duCompteDesCommissions(p, numeroDe.get(p.carte)));
  const dansLaPeriode = lignes.filter((p) => dansBornes(p, bornes));
  const { comptes, aVerifier } = mouvementsDe(dansLaPeriode, entree.cartes);
  const avant = mouvementsDe(lignes.filter((p) => dansBornes(p, precedente)), entree.cartes).comptes;

  const totaux = totauxDe(comptes, false);
  const externes = comptes.filter((m) => !m.interne);

  // Par type.
  const types = new Map<TypeVolume, { montant: number; n: number; sens: "in" | "out" }>();
  for (const m of externes) {
    const t = types.get(m.type) ?? { montant: 0, n: 0, sens: m.entree ? "in" as const : "out" as const };
    t.montant += m.cents; t.n++;
    types.set(m.type, t);
  }
  const parType = [...types.entries()]
    .map(([type, t]) => ({ type, famille: FAMILLE_DU_TYPE[type], sens: t.sens, montant: francs(t.montant), n: t.n }))
    .sort((a, b) => (a.sens === b.sens ? b.montant - a.montant : a.sens === "in" ? -1 : 1));

  // Par carte, avec le contrôle des soldes.
  const parCarte: CarteDesVolumes[] = entree.cartes.map((c) => {
    const siens = comptes.filter((m) => m.p.carte === c.iccid);
    const t = totauxDe(siens, true);
    const toutesSesLignes = lignes.filter((p) => p.carte === c.iccid);
    const sesLignesDeLaPeriode = dansLaPeriode.filter((p) => p.carte === c.iccid);
    const ouverture = dernierSoldeAvant(toutesSesLignes, periode.de)
      ?? entree.ouverturesAilleurs?.[c.iccid] ?? null;
    const releve = totauxDuReleve(sansDoublons(sesLignesDeLaPeriode.filter(estMouvement)));
    const s = soldesDuReleve(sesLignesDeLaPeriode, ouverture, releve);
    const attendu = ouverture == null ? null
      : francs(cts(ouverture) + cts(t.entrees) - cts(t.sorties) - cts(t.frais));
    // OÙ l'écart s'est produit : la suite des soldes, opération par
    // opération (`fluxDe`), sur la période.
    const ruptures: Rupture[] = [];
    for (const f of fluxDe(toutesSesLignes.filter((p) => p.jour <= periode.jusqua))) {
      if (!dansBornes(f.p, bornes)) continue;
      for (const e of [f.ecartAvant, f.ecartApres]) {
        if (e) ruptures.push({ montant: e.montant, depuisJour: e.depuisJour, depuis: e.depuis,
                               jusquaJour: f.p.jour, jusqua: e.jusqua });
      }
    }
    return {
      ...c, totaux: t,
      interneRecu: francs(siens.filter((m) => m.interne && m.entree).reduce((x, m) => x + m.cents, 0)),
      interneEnvoye: francs(siens.filter((m) => m.interne && !m.entree).reduce((x, m) => x + m.cents, 0)),
      soldes: { ouverture, cloture: s.cloture, attendu,
                ecart: attendu == null || s.cloture == null ? null : francs(cts(s.cloture) - cts(attendu)) },
      ruptures: ruptures.slice(-5),
      aVerifier: aVerifier.filter((p) => p.carte === c.iccid).length,
    };
  });

  const internes = comptes.filter((m) => m.interne);
  const interne = {
    montant: francs(internes.filter((m) => !m.entree).reduce((x, m) => x + m.cents, 0)),
    n: internes.filter((m) => !m.entree).length,
  };

  // La courbe : chaque colonne, vide ou pleine.
  const serieDe = (ms: Mouvement[]): PointDeSerie[] => {
    const cols = new Map(colonnesDe(periode).map((k) => [k, { cle: k, e: 0, s: 0, n: 0 }]));
    for (const m of ms) {
      const c = cols.get(cleDuPas(m.p, periode, fuseau));
      if (!c) continue;
      if (m.entree) c.e += m.cents; else c.s += m.cents;
      c.n++;
    }
    return [...cols.values()].map((c) => ({ cle: c.cle, entrees: francs(c.e), sorties: francs(c.s), n: c.n }));
  };
  const serie = serieDe(externes);

  // Les correspondants.
  const parQui = new Map<string, Correspondant & { noms: Map<string, number> }>();
  for (const m of externes) {
    if (!m.correspondant) continue;
    let q = parQui.get(m.correspondant);
    if (!q) {
      q = { cle: m.correspondant, nom: "", numero: numeroNormal(m.p.numero) ?? "", recu: 0, envoye: 0,
            nRecu: 0, nEnvoye: 0, noms: new Map() };
      parQui.set(m.correspondant, q);
    }
    if (m.entree) { q.recu += m.cents; q.nRecu++; } else { q.envoye += m.cents; q.nEnvoye++; }
    const nom = (m.p.tiers ?? "").trim();
    if (nom) q.noms.set(nom, (q.noms.get(nom) ?? 0) + 1);
  }
  const tous = [...parQui.values()].map(({ noms, ...q }) => {
    let nom = "", meilleur = 0;
    for (const [n, k] of noms) if (k >= meilleur) { nom = n; meilleur = k; }
    return { ...q, nom, recu: francs(q.recu), envoye: francs(q.envoye) };
  }).sort((a, b) => b.recu + b.envoye - (a.recu + a.envoye) || a.cle.localeCompare(b.cle));

  // Les chiffres clés.
  const ecoules = joursDe(bornes);
  let plusGrosse: Volumes["cles"]["plusGrosse"] = null;
  for (const m of externes) {
    if (!plusGrosse || m.cents > cts(plusGrosse.montant)) {
      plusGrosse = { montant: francs(m.cents), sens: m.entree ? "in" : "out", jour: m.p.jour,
                     heure: m.p.heure, nom: (m.p.tiers ?? "").trim(), carte: m.p.carte };
    }
  }
  let commissions = 0;
  for (const m of comptes) commissions += cts(m.p.commission);
  for (const p of dansLaPeriode) {
    if (p.categorie === "commission" && !estMouvement(p)
        && entree.cartes.some((c) => c.iccid === p.carte)) commissions += cts(p.commission);
  }

  const heures = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const m of externes) heures[jourDeSemaine(m.p.jour)][heureLocale(m.p.recuLe, fuseau)]++;

  const selection = new Set(entree.cartes.map((c) => c.iccid));
  const deLaSelection = dansLaPeriode.filter((p) => selection.has(p.carte));
  const avertissements = {
    illisibles: deLaSelection.filter((p) => p.categorie === "illisible" && !estMouvement(p)).length,
    aVerifier: aVerifier.length,
    incomplets: deLaSelection.filter((p) => INCOMPLET.test(p.smsBrut ?? "")).length,
    ecarts: parCarte.filter((c) => c.soldes.ecart != null && Math.abs(c.soldes.ecart) >= 1).length,
  };

  // La fiche d'un correspondant.
  let fiche: Volumes["fiche"] = undefined;
  if (entree.correspondant != null) {
    const q = tous.find((x) => x.cle === entree.correspondant);
    if (!q) fiche = null;
    else {
      const siens = externes.filter((m) => m.correspondant === q.cle);
      fiche = {
        ...q,
        parCarte: entree.cartes.map((c) => {
          const l = siens.filter((m) => m.p.carte === c.iccid);
          return { iccid: c.iccid, n: l.length,
                   recu: francs(l.filter((m) => m.entree).reduce((x, m) => x + m.cents, 0)),
                   envoye: francs(l.filter((m) => !m.entree).reduce((x, m) => x + m.cents, 0)) };
        }).filter((c) => c.n > 0),
        serie: serieDe(siens),
      };
    }
  }

  // LA COMPARAISON NE SE FAIT QU'À ARMES ÉGALES. Une caisse ouverte le
  // 31 juillet n'a pas de « six mois d'avant » : comparés à presque rien, ses
  // six mois montaient de 24 145 %. La période d'avant doit être entièrement
  // dans l'historique, sinon l'écran ne compare pas.
  const debut = entree.debutDeLHistorique;
  const comparable = debut === undefined ? true : debut !== null && debut <= precedente.de;

  return {
    periode, precedente, totaux, avant: totauxDe(avant, false), parType, parCarte, interne, serie,
    correspondants: tous.slice(0, entree.combien ?? 100), nbCorrespondants: tous.length,
    cles: {
      moyenne: totaux.n ? Math.round((totaux.entrees + totaux.sorties) / totaux.n) : 0,
      parJour: Math.round((totaux.n / ecoules) * 10) / 10,
      commissions: francs(commissions), plusGrosse,
    },
    heures, avertissements,
    ...(fiche === undefined ? {} : { fiche }),
    ...(debut === undefined ? {} : { debutDeLHistorique: debut }),
    comparable,
  };
}

/** Ce que la plateforme rend au site et au téléphone. */
export type ReponseVolumes = {
  volumes: Volumes;
  /** Toutes les cartes que la personne peut voir — pour le choix. */
  cartes: CarteVolumes[];
  /** « tout », ou l'ICCID de la carte choisie. */
  carte: string;
  /** La base en avait plus que la plateforme n'en lit d'un coup : les
   *  chiffres sont incomplets, et l'écran le DIT. */
  tronque: boolean;
  /** Les cartes dont le boîtier se tait maintenant (période en cours). */
  silencieuses: { iccid: string; depuis: string | null }[];
  aujourdhui: string;
  fuseau: string;
};

// --- Ce que l'écran en dit ---------------------------------------------------

/** La variation en pour cent, arrondie ; `null` quand il n'y avait rien avant
 *  (« +∞ % » n'apprend rien à personne). */
export function variation(maintenant: number, avant: number): number | null {
  if (!avant) return null;
  return Math.round(((maintenant - avant) / Math.abs(avant)) * 100);
}

/**
 * L'ÉCART AVEC LA PÉRIODE D'AVANT, tel qu'on le lit.
 *
 * « ▲ 668 % » ne se lit pas : au-delà du double, l'écran dit « × 7,7 ».
 * Rien avant, ou une période d'avant que l'historique ne couvre pas
 * (`comparable`) : rien du tout — un chiffre faux est pire qu'aucun.
 */
export function ecartLisible(
  maintenant: number, avant: number, langue: Langue, comparable = true,
): { texte: string; sens: 1 | -1 | 0 } | null {
  if (!comparable || !(avant > 0) || !Number.isFinite(maintenant)) return null;
  const rapport = maintenant / avant;
  if (rapport >= 2) {
    const fois = Math.round(rapport * 10) / 10;
    const ecrit = fois >= 10 ? String(Math.round(fois))
      : fois.toLocaleString(langue === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 });
    return { texte: `× ${ecrit}`, sens: 1 };
  }
  const pct = Math.round((rapport - 1) * 100);
  if (pct === 0) return { texte: "= 0 %", sens: 0 };
  return { texte: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)} %`, sens: pct > 0 ? 1 : -1 };
}

/** Le dernier jour couvert par une colonne. */
export function finDeLaColonne(cle: string, pas: Pas): string | null {
  switch (pas) {
    case "heure": return null;
    case "jour": return cle;
    case "semaine": return decalerJour(lundiDe(cle), 6);
    case "mois": return finDuMois(`${cle}-01`);
  }
}

/**
 * LES COLONNES À DESSINER : à partir du premier SMS. Six mois d'une caisse
 * ouverte en août montraient douze semaines vides avant la première barre —
 * l'œil lisait « rien ne marche » au lieu de « la caisse commence ici ».
 */
export function serieVisible(
  serie: PointDeSerie[], pas: Pas, debutDeLHistorique: string | null | undefined,
): { serie: PointDeSerie[]; coupee: boolean } {
  if (!debutDeLHistorique || pas === "heure") return { serie, coupee: false };
  const i = serie.findIndex((c) => (finDeLaColonne(c.cle, pas) ?? "") >= debutDeLHistorique);
  if (i <= 0) return { serie, coupee: false };
  return { serie: serie.slice(i), coupee: true };
}

/**
 * LES GRADUATIONS DE L'AXE — des nombres ronds (1, 2, 2,5, 5 × 10ⁿ), trois
 * ou quatre au plus, la dernière au-dessus du plus haut point.
 */
export function graduations(max: number): number[] {
  if (!(max > 0)) return [1];
  const brut = max / 3;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * puissance).find((p) => p >= brut) ?? 10 * puissance;
  const n = Math.max(1, Math.ceil(max / pas - 1e-9));
  return Array.from({ length: n }, (_, i) => Math.round((i + 1) * pas * 100) / 100);
}

/** La colonne retenue par défaut : la plus récente qui porte quelque chose. */
export function colonneParDefaut(serie: PointDeSerie[]): number {
  for (let i = serie.length - 1; i >= 0; i--) if (serie[i].n > 0) return i;
  return Math.max(0, serie.length - 1);
}

/** Le créneau le plus chargé, par tranches de deux heures. */
export function creneauLePlusCharge(heures: number[][]): { jour: number; heure: number; n: number } | null {
  let meilleur: { jour: number; heure: number; n: number } | null = null;
  for (let j = 0; j < 7; j++) {
    for (let h = 0; h < 24; h += 2) {
      const n = (heures[j]?.[h] ?? 0) + (heures[j]?.[h + 1] ?? 0);
      if (n > 0 && (!meilleur || n > meilleur.n)) meilleur = { jour: j, heure: h, n };
    }
  }
  return meilleur;
}

const LOCALE = (l: Langue) => (l === "en" ? "en-GB" : "fr-FR");
const date = (cle: string, opts: Intl.DateTimeFormatOptions, langue: Langue) => {
  const [a, m, j] = cle.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE(langue), { ...opts, timeZone: "UTC" })
    .format(new Date(Date.UTC(a, m - 1, j || 1))).replace(/[  ]/g, " ");
};
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Le nom d'une période : « Octobre 2026 », « Mardi 21 octobre », « 12 – 18 oct. ». */
export function nomDeLaPeriode(p: Pick<PeriodeVolumes, "genre" | "de" | "a">, langue: Langue): string {
  switch (p.genre) {
    case "jour": return majuscule(date(p.de, { weekday: "long", day: "numeric", month: "long" }, langue));
    case "mois": return majuscule(date(p.de, { month: "long", year: "numeric" }, langue));
    case "6mois":
      return `${majuscule(date(p.de, { month: "short" }, langue))} – ${date(p.a, { month: "short", year: "numeric" }, langue)}`;
    default:
      return p.de === p.a ? date(p.de, { day: "numeric", month: "short" }, langue)
        : `${date(p.de, { day: "numeric", month: "short" }, langue)} – ${date(p.a, { day: "numeric", month: "short" }, langue)}`;
  }
}

/** Le nom d'une colonne, en entier, pour le résumé au-dessus du graphe :
 *  « Jeudi 22 octobre », « Semaine du 12 oct. », « Octobre 2026 », « 14 h – 15 h ». */
export function nomDeLaColonne(cle: string, pas: Pas, langue: Langue): string {
  switch (pas) {
    case "heure": {
      const h = Number(cle);
      return langue === "en" ? `${h}:00 – ${h + 1}:00` : `${h} h – ${h + 1} h`;
    }
    case "jour": return majuscule(date(cle, { weekday: "long", day: "numeric", month: "long" }, langue));
    case "semaine": return `${langue === "en" ? "Week of" : "Semaine du"} ${date(cle, { day: "numeric", month: "short" }, langue)}`;
    case "mois": return majuscule(date(`${cle}-01`, { month: "long", year: "numeric" }, langue));
  }
}

/** L'étiquette d'une colonne de la courbe. */
export function etiquetteDuPas(cle: string, pas: Pas, langue: Langue): string {
  switch (pas) {
    case "heure": return langue === "en" ? `${Number(cle)}:00` : `${Number(cle)}h`;
    case "jour": return String(Number(cle.slice(8, 10)));
    case "semaine": return date(cle, { day: "numeric", month: "short" }, langue);
    case "mois": return date(`${cle}-01`, { month: "short" }, langue);
  }
}

/** Les familles d'un côté, pour un anneau, dans un ordre FIXE (la couleur
 *  suit la famille, jamais le rang). */
export function famillesDe(v: Pick<Volumes, "parType">, sens: "in" | "out"): { famille: FamilleVolume; montant: number; types: TypeVolume[] }[] {
  const ordre: FamilleVolume[] = ["argent", "especes", "transferts", "commissions"];
  return ordre.map((famille) => {
    const l = v.parType.filter((t) => t.sens === sens && t.famille === famille);
    return { famille, montant: l.reduce((x, t) => x + t.montant, 0), types: l.map((t) => t.type) };
  }).filter((f) => f.montant > 0);
}

/** Les SMS d'une période qui touchent au solde d'une carte, pour qui veut
 *  rejouer le contrôle (les essais). */
export const porteUnSolde = repereDeSolde;
