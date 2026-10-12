// LE MODULE FLUX — ce qui est entré et sorti de chaque carte, et rien d'autre.
//
// Les SMS restent la source et la preuve : ce fichier ne relit AUCUN texte.
// Il range ce que le robot a déjà lu (`Paiement` : catégorie, sens, montant,
// frais, commission, solde annoncé) et en tire, une seule fois pour le
// téléphone et pour le site :
//
//   — le TYPE d'une transaction, dit du point de vue de la carte : sur une
//     puce d'agent, un dépôt chez le client fait BAISSER le solde
//     électronique (« Dépôt client », −), un retrait le fait MONTER ;
//   — son EFFET sur le solde, signé — ou `null` quand le SMS ne dit pas le
//     sens : on ne devine pas une entrée, on la montre « à vérifier » ;
//   — son ÉTAT : comptée, à vérifier, échouée ;
//   — LA SUITE DES SOLDES : carte par carte, le solde annoncé d'avant plus
//     ce que les opérations ont fait doit donner le solde annoncé d'après.
//     Sinon, l'écart se MONTRE, à sa place, avec son montant et son créneau.
//     Il ne se corrige jamais : un solde calculé présenté comme annoncé est
//     un faux.
//
// Le ✓ d'une ligne veut dire une chose et une seule : les soldes que
// l'opérateur a lui-même annoncés tombent juste avec ce que les SMS disent.

import type { Paiement, Categorie } from "./types";
import type { Langue } from "./langue";

/** Les types, du point de vue de la CARTE. */
export type TypeFlux =
  | "depot_client"      // agent : le client remet des espèces, le solde baisse
  | "retrait_client"    // agent : on remet des espèces, le solde monte
  | "depot_recu"        // client : quelqu'un a déposé sur la carte
  | "retrait_especes"   // client : on a retiré chez un agent
  | "argent_recu"
  | "argent_envoye"
  // Le sens n'a pas été lu : on garde la famille, et la ligne attend.
  | "depot_inconnu" | "retrait_inconnu" | "transfert_inconnu"
  // Le robot sait que c'est de l'argent, sans en avoir tout compris.
  | "illisible";

export type EtatFlux = "comptee" | "a_verifier" | "echouee";

/** Ce que la suite des soldes dit d'une ligne qui annonce un solde. */
export type VerdictFlux =
  | "suit"        // le solde annoncé tombe juste : ✓
  | "rupture"     // il ne tombe pas juste : l'écart est montré avant la ligne
  | "inconnu"     // une ligne sans effet connu se trouve entre les deux soldes
  | "premier"     // premier solde connu de la carte : rien à comparer
  | "sans_solde"; // le SMS n'annonce pas de solde

export type Ecart = {
  montant: number;          // solde annoncé − solde attendu (négatif : il manque)
  depuis: string;           // heure du solde d'avant
  depuisJour: string;
  jusqua: string;           // heure du solde d'après
};

export type Flux = {
  p: Paiement;
  type: TypeFlux;
  etat: EtatFlux;
  /** Signé : + entre, − sort (frais compris). `null` : sens ou montant inconnu. */
  effet: number | null;
  verdict: VerdictFlux;
  /** L'écart de la suite des soldes, juste AVANT cette ligne (dans le temps) :
   *  la liste, du plus récent au plus ancien, le montre SOUS la ligne. */
  ecartAvant: Ecart | null;
  /** Un écart révélé APRÈS cette ligne par une consultation de solde : la
   *  liste le montre AU-DESSUS. */
  ecartApres: Ecart | null;
  /** Quand une seule ligne au sens inconnu explique exactement la suite. */
  lesSoldesDisent: "in" | "out" | null;
  /** Le solde d'avant, CALCULÉ (jamais présenté comme annoncé). */
  soldeAvantCalcule: number | null;
};

const ARGENT: Categorie[] = ["encaissement", "envoi", "transfert", "depot", "retrait", "illisible"];

/** La famille d'une ligne : la nature choisie si elle est d'argent, sinon la catégorie. */
function familleDe(p: Pick<Paiement, "categorie" | "nature">): Categorie {
  const n = p.nature;
  if ((n === "depot" || n === "retrait" || n === "transfert") && ARGENT.includes(p.categorie)) return n;
  return p.categorie;
}

/** Est-ce une transaction ? Une consultation de solde, un code, une publicité n'en sont pas. */
export function estUneTransaction(p: Pick<Paiement, "categorie" | "nature">): boolean {
  const f = familleDe(p);
  return ARGENT.includes(f) || f === "echec";
}

export function typeDe(p: Pick<Paiement, "categorie" | "nature" | "sens">): TypeFlux {
  const f = familleDe(p);
  const s = p.sens;
  switch (f) {
    case "depot": return s === "out" ? "depot_client" : s === "in" ? "depot_recu" : "depot_inconnu";
    case "retrait": return s === "in" ? "retrait_client" : s === "out" ? "retrait_especes" : "retrait_inconnu";
    case "encaissement": return s === "out" ? "argent_envoye" : "argent_recu";
    case "envoi": return s === "in" ? "argent_recu" : "argent_envoye";
    case "transfert": return s === "in" ? "argent_recu" : s === "out" ? "argent_envoye" : "transfert_inconnu";
    default: return "illisible";
  }
}

/** L'effet sur le solde : + ce qui entre, − ce qui sort, frais compris. */
export function effetDe(p: Pick<Paiement, "sens" | "montant" | "frais" | "categorie" | "nature">): number | null {
  if (p.montant == null || familleDe(p) === "echec") return null;
  if (p.sens === "in") return p.montant;
  if (p.sens === "out") return -(p.montant + (p.frais ?? 0));
  return null;
}

export function etatDe(p: Pick<Paiement, "sens" | "montant" | "frais" | "categorie" | "nature">): EtatFlux {
  if (familleDe(p) === "echec") return "echouee";
  return effetDe(p) == null ? "a_verifier" : "comptee";
}

/** Le solde qu'une ligne annonce sert-il de repère ? (Une opération échouée ou
 *  une consultation de solde en annoncent un — l'argent n'a pas bougé.) */
const repere = (p: Paiement) => p.soldeApres != null && (estUneTransaction(p) || familleDe(p) === "solde");

const ordre = (a: Paiement, b: Paiement) =>
  a.recuLe < b.recuLe ? -1 : a.recuLe > b.recuLe ? 1 : Number(a.id) - Number(b.id);

/**
 * Les transactions de toutes les cartes, de la plus récente à la plus
 * ancienne, avec la suite des soldes déjà jugée.
 *
 * `tout` : les SMS tels que la plateforme les a rendus (consultations de
 * solde comprises : elles servent de repères, sans être listées).
 */
export function fluxDe(tout: readonly Paiement[]): Flux[] {
  const parCarte = new Map<string, Paiement[]>();
  for (const p of tout) {
    if (!estUneTransaction(p) && !repere(p)) continue;
    const cle = p.carte || p.sim;
    const l = parCarte.get(cle);
    if (l) l.push(p); else parCarte.set(cle, [p]);
  }
  const sortie: Flux[] = [];
  for (const lignes of parCarte.values()) {
    lignes.sort(ordre);
    const deLaCarte: Flux[] = [];          // dans l'ordre du temps
    let ancre: { solde: number; heure: string; jour: string } | null = null;
    let cumul = 0;
    let inconnues: Flux[] = [];
    // Un écart révélé par une consultation de solde (qui n'est pas listée)
    // attend la prochaine transaction de la carte pour s'afficher.
    let ecartOrphelin: Ecart | null = null;
    for (const p of lignes) {
      const transaction = estUneTransaction(p);
      const effet = transaction ? effetDe(p) : null;
      const etat: EtatFlux = transaction ? etatDe(p) : "comptee";
      const f: Flux | null = transaction
        ? { p, type: typeDe(p), etat, effet, verdict: "sans_solde", ecartAvant: null,
            ecartApres: null, lesSoldesDisent: null, soldeAvantCalcule: null }
        : null;
      if (f) {
        deLaCarte.push(f);
        if (ecartOrphelin) { f.ecartAvant = ecartOrphelin; ecartOrphelin = null; }
        if (etat === "comptee" && effet != null) cumul += effet;
        if (etat === "a_verifier") inconnues.push(f);
      }
      if (p.soldeApres == null) continue;
      let verdict: VerdictFlux;
      let ecart: Ecart | null = null;
      if (!ancre) verdict = "premier";
      else if (inconnues.length) verdict = "inconnu";
      else {
        const diff = Math.round((p.soldeApres - (ancre.solde + cumul)) * 100) / 100;
        if (Math.abs(diff) < 1) verdict = "suit";
        else {
          verdict = "rupture";
          ecart = { montant: diff, depuis: ancre.heure, depuisJour: ancre.jour, jusqua: p.heure };
        }
      }
      // Une seule ligne au sens inconnu, et les soldes l'expliquent au franc près.
      if (ancre && inconnues.length === 1) {
        const seule = inconnues[0].p;
        const reste = Math.round((p.soldeApres - ancre.solde - cumul) * 100) / 100;
        const m = seule.montant;
        if (m != null && Math.abs(reste - m) < 1) inconnues[0].lesSoldesDisent = "in";
        else if (m != null && Math.abs(reste + m + (seule.frais ?? 0)) < 1) inconnues[0].lesSoldesDisent = "out";
      }
      if (f) {
        f.verdict = verdict;
        if (ecart) f.ecartAvant = ecart;
        if (etat === "comptee" && effet != null) f.soldeAvantCalcule = p.soldeApres - effet;
      } else if (ecart) {
        // Révélé par une consultation : il se montre au-dessus de la dernière
        // transaction d'avant, ou, s'il n'y en a pas, sous la suivante.
        const avant = deLaCarte[deLaCarte.length - 1];
        if (avant && avant.ecartApres == null) avant.ecartApres = ecart;
        else ecartOrphelin = ecart;
      }
      ancre = { solde: p.soldeApres, heure: p.heure, jour: p.jour };
      cumul = 0;
      inconnues = [];
    }
    sortie.push(...deLaCarte);
  }
  return sortie.sort((a, b) => -ordre(a.p, b.p));
}

export type TotauxFlux = {
  nombre: number;
  entrees: number;
  sorties: number;          // positif : ce qui est sorti
  frais: number;
  commissions: number;
  aVerifier: number;
  ecarts: number;
};

/** Les totaux d'un ensemble de transactions. Les échouées n'y entrent pas ;
 *  celles à vérifier sont comptées à part, jamais additionnées. */
export function totauxFlux(liste: readonly Flux[]): TotauxFlux {
  const t: TotauxFlux = { nombre: 0, entrees: 0, sorties: 0, frais: 0, commissions: 0, aVerifier: 0, ecarts: 0 };
  for (const f of liste) {
    if (f.ecartAvant) t.ecarts++;
    if (f.ecartApres) t.ecarts++;
    if (f.etat === "echouee") continue;
    t.nombre++;
    if (f.etat === "a_verifier") { t.aVerifier++; continue; }
    if (f.effet! > 0) t.entrees += f.effet!;
    else t.sorties += -f.effet!;
    t.frais += f.p.frais ?? 0;
    t.commissions += f.p.commission ?? 0;
  }
  return t;
}

/** Le dernier solde ANNONCÉ d'une carte, et ce que la suite en dit. */
export type EtatCarteFlux = {
  carte: string;
  solde: number | null;
  heure: string | null;
  jour: string | null;
  recuLe: string | null;
  ecarts: number;
  suitDepuis: string | null;   // l'heure du premier solde d'une suite sans écart
};

export function etatDesCartes(tout: readonly Paiement[], liste: readonly Flux[]): Map<string, EtatCarteFlux> {
  const m = new Map<string, EtatCarteFlux>();
  const lignes = [...tout].filter(repere).sort(ordre);
  for (const p of lignes) {
    const cle = p.carte || p.sim;
    m.set(cle, { carte: cle, solde: p.soldeApres, heure: p.heure, jour: p.jour, recuLe: p.recuLe,
                 ecarts: 0, suitDepuis: null });
  }
  // La suite sans écart la plus récente, carte par carte.
  const parCarte = new Map<string, Flux[]>();
  for (const f of liste) {
    const cle = f.p.carte || f.p.sim;
    const l = parCarte.get(cle);
    if (l) l.push(f); else parCarte.set(cle, [f]);
  }
  for (const [cle, fl] of parCarte) {
    const e = m.get(cle);
    if (!e) continue;
    e.ecarts = fl.reduce((n, f) => n + (f.ecartAvant ? 1 : 0) + (f.ecartApres ? 1 : 0), 0);
    // fl est du plus récent au plus ancien : on remonte tant que ça suit.
    let depuis: string | null = null;
    for (const f of fl) {
      if (f.ecartApres) break;
      if (f.verdict === "suit") { depuis = f.p.heure; continue; }
      if (f.verdict === "sans_solde" || (f.etat === "echouee")) continue;
      break;
    }
    e.suitDepuis = depuis;
  }
  return m;
}

/** Regroupe par jour (clé du terminal), dans l'ordre de la liste. */
export function parJour(liste: readonly Flux[]): { jour: string; libelle: string; flux: Flux[]; totaux: TotauxFlux }[] {
  const groupes: { jour: string; libelle: string; flux: Flux[]; totaux: TotauxFlux }[] = [];
  for (const f of liste) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === f.p.jour) dernier.flux.push(f);
    else groupes.push({ jour: f.p.jour, libelle: f.p.date, flux: [f], totaux: totauxFlux([]) });
  }
  for (const g of groupes) g.totaux = totauxFlux(g.flux);
  return groupes;
}

/** La recherche : un nom, un numéro avec ou sans espaces, un montant, une référence. */
export function correspondFlux(f: Flux, requete: string): boolean {
  const q = requete.trim().toLowerCase();
  if (!q) return true;
  const sansEspaces = q.replace(/[\s  .,]/g, "");
  const p = f.p;
  const champs = [p.tiers, p.nom, p.reference].join(" ").toLowerCase();
  if (champs.includes(q)) return true;
  const chiffres = [p.numero, p.montant != null ? String(p.montant) : "", p.reference]
    .join(" ").replace(/[\s.,]/g, "");
  return sansEspaces.length > 0 && /^\d+$/.test(sansEspaces) && chiffres.includes(sansEspaces);
}

/** LE TRI. Le téléphone et le site rangent de la même façon.
 *
 *  Par date, la liste se groupe par jour et garde les écarts de la suite
 *  des soldes à leur place ; par montant, elle est À PLAT — un écart n'a
 *  pas de place entre deux montants, et le jour s'écrit sur chaque ligne.
 *  Un montant illisible va à la fin : il n'est ni gros ni petit. */
export const TRIS_FLUX = ["recentes", "anciennes", "montant_haut", "montant_bas"] as const;
export type TriFlux = (typeof TRIS_FLUX)[number];

export const parDate = (tri: TriFlux) => tri === "recentes" || tri === "anciennes";

export function trierFlux(liste: readonly Flux[], tri: TriFlux): Flux[] {
  if (tri === "recentes") return [...liste];
  if (tri === "anciennes") return [...liste].reverse();
  const rang = new Map(liste.map((f, i) => [f, i]));
  return [...liste].sort((a, b) => {
    const ma = a.p.montant, mb = b.p.montant;
    if (ma == null || mb == null) {
      if (ma == null && mb == null) return rang.get(a)! - rang.get(b)!;
      return ma == null ? 1 : -1;
    }
    if (ma !== mb) return tri === "montant_haut" ? mb - ma : ma - mb;
    return rang.get(a)! - rang.get(b)!;          // à montant égal, le plus récent
  });
}

/** Les familles du filtre « Type ». */
export const FAMILLES_FLUX = ["entrees", "sorties", "depots", "retraits", "transferts", "a_verifier", "echouees"] as const;
export type FamilleFlux = (typeof FAMILLES_FLUX)[number];

export function dansFamille(f: Flux, fam: FamilleFlux | null): boolean {
  if (fam === null) return f.etat !== "echouee";
  switch (fam) {
    case "entrees": return f.etat === "comptee" && f.effet! > 0;
    case "sorties": return f.etat === "comptee" && f.effet! < 0;
    case "depots": return f.etat !== "echouee" && f.type.startsWith("depot");
    case "retraits": return f.etat !== "echouee" && f.type.startsWith("retrait");
    case "transferts": return f.etat !== "echouee" && (f.type === "argent_recu" || f.type === "argent_envoye" || f.type === "transfert_inconnu");
    case "a_verifier": return f.etat === "a_verifier";
    case "echouees": return f.etat === "echouee";
  }
}

/** Le montant signé, tel que la liste l'écrit : « +25 000 », « −50 000 », « 184 000 ? ». */
export function montantSigne(f: Flux, langue: Langue, nombreDe: (n: number, l: Langue) => string): string {
  if (f.effet != null) return (f.effet > 0 ? "+" : "−") + nombreDe(Math.abs(f.effet), langue);
  if (f.p.montant != null) return nombreDe(f.p.montant, langue) + " ?";
  return "—";
}

/** Les initiales d'un tiers, pour son rond : « TCHOUA Marc » → « TM »,
 *  « ETS. BIYONG & FILS SARL » → « BF » (les formes de société ne nomment
 *  personne). Vide quand il n'y a pas de nom. */
export function initialesDe(nom: string): string {
  const mots = (nom || "")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((m) => m.length > 1 && !/^(ets|ste|sarl|sa|sas|epse|ep|et|de|du|des|la|le)$/i.test(m));
  return mots.slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");
}
