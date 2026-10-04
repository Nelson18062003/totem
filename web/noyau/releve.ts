// LE RELEVÉ DE COMPTE — ce qu'il contient, compté une fois, ici.
//
// Le propriétaire : « télécharger toutes les transactions sur une période
// choisie librement, bien organisé, comme un relevé bancaire, avec les
// informations de la carte SIM, et chaque SIM identifiée par son NUMÉRO quel
// que soit le réseau ».
//
// Un relevé n'est pas un écran : il SORT de TOTEM. Il part chez un comptable,
// une banque, un associé — des gens qui ne verront jamais l'application et
// qui le liront comme une pièce. D'où trois règles, tenues ici et pas dans
// chaque générateur :
//
//   1. IL NE PORTE QUE L'ARGENT. Un encaissement, un envoi, un transfert, un
//      dépôt, un retrait — avec un montant. Pas une publicité, pas un échec,
//      pas une consultation de solde, et surtout PAS UN CODE : un relevé
//      remis à un tiers est un « groupe » au sens de la règle de Telegram, et
//      « Votre code de confirmation est 483921 » n'a rien à y faire. La règle
//      vaut pour le PDF ET pour le CSV.
//   2. UN SENS INCONNU N'EST RANGÉ NULLE PART. Orange écrit parfois les deux
//      parties sans dire laquelle est la nôtre : la ligne se MONTRE, elle ne
//      COMPTE dans aucun total, et elle est dénombrée à part. La même
//      prudence que `totauxDe` et que le lecteur de SMS.
//   3. LES SOLDES SE LISENT, ILS NE SE CALCULENT PAS. L'ouverture et la
//      clôture sont des chiffres annoncés par l'opérateur dans ses SMS ;
//      faute d'annonce, « non connu » — jamais 0, qui serait un solde. Le
//      rapprochement (ouverture + entrées − sorties − frais) se MONTRE quand
//      il ne tombe pas juste ; il ne corrige rien.
//
// Les montants se comptent en CENTIMES entiers : Orange annonce des montants
// décimaux (2 784 137,6 F), et 0,1 + 0,2 ne fait pas 0,3 en virgule flottante.

import { dansBornes, decalerJour, depuisPourLaBase, type Bornes } from "./periodes";
import type { Categorie, Paiement } from "./types";
import type { Langue } from "./langue";

/** Une année et un jour : le plus long relevé qu'on fabrique d'un coup. */
export const JOURS_MAX_RELEVE = 366;

/** Un SMS relevé après une coupure porte une heure de relève postérieure à
 *  son heure d'émission ; la base filtre sur la relève. On demande large, et
 *  la coupe exacte se fait sur le JOUR de l'heure qui fait foi. */
export const MARGE_RELEVE_JOURS = 7;

const JOUR_MS = 86_400_000;

/** Les natures d'un mouvement d'argent. Tout le reste reste dehors. */
const ARGENT: readonly Categorie[] = ["encaissement", "envoi", "transfert", "depot", "retrait"];

/** Ce que la ligne EST : la nature choisie par le propriétaire si elle en
 *  est une d'argent, sinon la catégorie lue par le robot. `null` : ce n'est
 *  pas un mouvement d'argent (une « solde » choisie à la main non plus). */
export function genreDuMouvement(p: Pick<Paiement, "categorie" | "nature">): Categorie | null {
  const g = p.nature ?? p.categorie;
  return ARGENT.includes(g) ? g : null;
}

/** Cette ligne entre-t-elle au relevé ? Un montant lu, et de l'argent. */
export function estMouvement(
  p: Pick<Paiement, "categorie" | "nature" | "montant">,
): boolean {
  return p.montant != null && Number.isFinite(p.montant) && genreDuMouvement(p) !== null;
}

const instant = (p: Pick<Paiement, "recuLe">) => Date.parse(p.recuLe) || 0;

/** L'ordre d'un relevé : du plus ancien au plus récent, sur l'heure qui fait
 *  foi ; à la même seconde, l'ordre d'arrivée dans la base. */
export function chronologique<T extends Pick<Paiement, "recuLe" | "id">>(a: T, b: T): number {
  return instant(a) - instant(b) || (Number(a.id) || 0) - (Number(b.id) || 0);
}

/** Les lignes du relevé : les mouvements d'argent de la période, dans l'ordre. */
export function lignesDuReleve<T extends Paiement>(paiements: T[], bornes: Bornes): T[] {
  return paiements.filter((p) => dansBornes(p, bornes) && estMouvement(p))
    .sort(chronologique);
}

const cts = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? 0 : Math.round(n * 100);

export type TotauxReleve = {
  /** Toutes les lignes du relevé, sens inconnu compris. */
  nombre: number;
  entrees: number;
  sorties: number;
  /** Les frais des lignes dont le sens est connu. */
  frais: number;
  /** Les lignes dont le sens n'a pas été compris : montrées, non comptées. */
  inconnus: number;
};

export function totauxDuReleve(
  lignes: Pick<Paiement, "sens" | "montant" | "frais">[],
): TotauxReleve {
  let entrees = 0, sorties = 0, frais = 0, inconnus = 0;
  for (const p of lignes) {
    if (p.sens === "in") entrees += cts(p.montant);
    else if (p.sens === "out") sorties += cts(p.montant);
    else { inconnus++; continue; }
    frais += cts(p.frais);
  }
  return { nombre: lignes.length, entrees: entrees / 100, sorties: sorties / 100,
           frais: frais / 100, inconnus };
}

/** Le dernier solde ANNONCÉ avant le premier jour de la période — n'importe
 *  quel SMS de la carte qui en porte un, consultation comprise. */
export function dernierSoldeAvant(
  paiements: Pick<Paiement, "jour" | "recuLe" | "id" | "soldeApres">[], de: string,
): number | null {
  let meilleur: (typeof paiements)[number] | null = null;
  for (const p of paiements) {
    if (p.soldeApres == null || !(p.jour < de)) continue;
    if (!meilleur || chronologique(p, meilleur) > 0) meilleur = p;
  }
  return meilleur?.soldeApres ?? null;
}

export type SoldesReleve = {
  ouverture: number | null;
  cloture: number | null;
  /** Clôture − (ouverture + entrées − sorties − frais), quand les deux
   *  soldes sont connus ; `null` sinon. Zéro : tout tombe juste. */
  ecart: number | null;
};

/** Les soldes de la période : ouverture (lue avant), clôture (le dernier
 *  annoncé DANS la période, toutes catégories confondues). */
export function soldesDuReleve(
  smsDeLaPeriode: Pick<Paiement, "jour" | "recuLe" | "id" | "soldeApres">[],
  ouverture: number | null, totaux: TotauxReleve,
): SoldesReleve {
  let derniere: (typeof smsDeLaPeriode)[number] | null = null;
  for (const p of smsDeLaPeriode) {
    if (p.soldeApres == null) continue;
    if (!derniere || chronologique(p, derniere) > 0) derniere = p;
  }
  const cloture = derniere?.soldeApres ?? null;
  const ecart = ouverture == null || cloture == null ? null
    : (cts(cloture) - (cts(ouverture) + cts(totaux.entrees) - cts(totaux.sorties)
       - cts(totaux.frais))) / 100;
  return { ouverture, cloture, ecart };
}

/** Une carte, telle que le relevé la présente : son NUMÉRO d'abord. */
export type CarteDuReleve = {
  iccid: string;
  numero: string;
  operateur: string;
  /** « MTN Mobile Money », « Orange Money » — `serviceMobileMoney`. */
  service: string;
  nom: string;
  libelle: string;
};

export type SectionReleve = {
  carte: CarteDuReleve;
  lignes: Paiement[];
  totaux: TotauxReleve;
  soldes: SoldesReleve;
  /** La lecture a été plafonnée : le relevé le DIT. */
  tronque: boolean;
};

export type Releve = {
  bornes: Bornes;
  /** L'instant d'édition (ISO). */
  editeLe: string;
  fuseau: string;
  langue: Langue;
  /** « carte=tout » : une section par carte, puis un récapitulatif. */
  tout: boolean;
  sections: SectionReleve[];
};

/**
 * La section d'une carte, à partir de ce que la base a rapporté pour elle
 * (période ET marge). `ouvertureAilleurs` : un solde lu par une seconde
 * question à la base, quand la marge n'en portait pas.
 */
export function sectionDuReleve(
  carte: CarteDuReleve, sms: Paiement[], bornes: Bornes,
  ouvertureAilleurs: number | null, tronque: boolean,
): SectionReleve {
  const dansLaPeriode = sms.filter((p) => p.carte === carte.iccid && dansBornes(p, bornes));
  const lignes = lignesDuReleve(dansLaPeriode, bornes);
  const totaux = totauxDuReleve(lignes);
  const avant = sms.filter((p) => p.carte === carte.iccid);
  const ouverture = dernierSoldeAvant(avant, bornes.de) ?? ouvertureAilleurs;
  return { carte, lignes, totaux, soldes: soldesDuReleve(dansLaPeriode, ouverture, totaux),
           tronque };
}

/** Les lignes d'un relevé, rangées par jour, avec ce que chaque jour a fait
 *  entrer et sortir (sens inconnu exclu, comme partout). */
export function parJour(lignes: Paiement[]): { jour: string; lignes: Paiement[];
                                                 entrees: number; sorties: number }[] {
  const jours: { jour: string; lignes: Paiement[]; entrees: number; sorties: number }[] = [];
  for (const p of lignes) {
    let j = jours.at(-1);
    if (!j || j.jour !== p.jour) {
      j = { jour: p.jour, lignes: [], entrees: 0, sorties: 0 };
      jours.push(j);
    }
    j.lignes.push(p);
  }
  for (const j of jours) {
    const t = totauxDuReleve(j.lignes);
    j.entrees = t.entrees;
    j.sorties = t.sorties;
  }
  return jours;
}

// --- La période --------------------------------------------------------------

const FORME = /^\d{4}-\d{2}-\d{2}$/;

/** Une clé de jour qui existe vraiment (« 2026-02-30 » n'existe pas). */
function jourValide(cle: string | null | undefined): cle is string {
  if (!cle || !FORME.test(cle)) return false;
  const [a, m, j] = cle.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/** Le nombre de jours d'une période, bornes comprises. */
export function joursDe(b: Bornes): number {
  return Math.round((Date.parse(`${b.a}T00:00:00Z`) - Date.parse(`${b.de}T00:00:00Z`))
    / JOUR_MS) + 1;
}

/**
 * La période demandée, rendue sûre — ou `null` si elle ne peut pas l'être.
 *
 * Deux jours dans le désordre font la même période ; une fin dans le futur
 * s'arrête à aujourd'hui (rien n'y est encore arrivé) ; un début dans le
 * futur, une date qui n'existe pas, ou plus de 366 jours : refusé.
 */
export function periodeDuReleve(
  de: string | null | undefined, a: string | null | undefined, aujourdhui: string,
): Bornes | null {
  if (!jourValide(de) || !jourValide(a)) return null;
  let b: Bornes = de <= a ? { de, a } : { de: a, a: de };
  if (b.de > aujourdhui) return null;
  if (b.a > aujourdhui) b = { de: b.de, a: aujourdhui };
  return joursDe(b) <= JOURS_MAX_RELEVE ? b : null;
}

/** Les instants à demander à la base pour une période : large des deux
 *  côtés (la marge de relève), la coupe exacte se fait ensuite au jour. */
export function bornesPourLaBase(b: Bornes): { depuis: string; jusqua: string } {
  const depuis = Date.parse(depuisPourLaBase(b)) - MARGE_RELEVE_JOURS * JOUR_MS;
  const lendemain = Date.parse(`${decalerJour(b.a, 2)}T00:00:00Z`);
  return {
    depuis: new Date(depuis).toISOString(),
    jusqua: new Date(lendemain + MARGE_RELEVE_JOURS * JOUR_MS).toISOString(),
  };
}

export type ChoixPeriode = "mois" | "moisDernier" | "troisMois";

/** Les trois périodes toutes faites de la feuille du téléphone. */
export function bornesDuChoix(choix: ChoixPeriode, aujourdhui: string): Bornes {
  const debutDuMois = `${aujourdhui.slice(0, 8)}01`;
  const moisAvant = (cle: string, n: number) => {
    const [a, m] = cle.split("-").map(Number);
    const total = a * 12 + (m - 1) - n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
  };
  switch (choix) {
    case "mois": return { de: debutDuMois, a: aujourdhui };
    case "moisDernier": {
      const de = moisAvant(aujourdhui, 1);
      return { de, a: decalerJour(debutDuMois, -1) };
    }
    case "troisMois": return { de: moisAvant(aujourdhui, 2), a: aujourdhui };
  }
}

// --- Les mots ----------------------------------------------------------------

const LOCALE = (l: Langue) => (l === "en" ? "en-GB" : "fr-FR");

/** « 1er janvier 2026 » / « 1 January 2026 » — le mois en TOUTES LETTRES,
 *  la règle de `dateVue` : « 8/31 » et « 31/8 » se confondent. */
export function jourEnLettres(cle: string, langue: Langue, semaine = false): string {
  const [a, m, j] = cle.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const mois = new Intl.DateTimeFormat(LOCALE(langue), { month: "long", timeZone: "UTC" })
    .format(d);
  const nomDuJour = semaine
    ? new Intl.DateTimeFormat(LOCALE(langue), { weekday: "long", timeZone: "UTC" }).format(d)
      + " "
    : "";
  const quantieme = langue === "fr" && j === 1 ? "1er" : String(j);
  return `${nomDuJour}${quantieme} ${mois} ${a}`;
}

/** « 3 août » / « 3 Aug » — la colonne Date, dont l'année est en tête. */
export function jourCourtReleve(cle: string, langue: Langue): string {
  const [a, m, j] = cle.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE(langue), {
    day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, j))).replace(/[  ]/g, " ");
}

/** « du 1er janvier 2026 au 31 mars 2026 » — une période qu'on lit à voix
 *  haute sans se tromper de mois. */
export function periodeEnLettres(b: Bornes, langue: Langue): string {
  if (b.de === b.a) {
    return langue === "en" ? `on ${jourEnLettres(b.de, langue)}`
      : `le ${jourEnLettres(b.de, langue)}`;
  }
  return langue === "en"
    ? `from ${jourEnLettres(b.de, langue)} to ${jourEnLettres(b.a, langue)}`
    : `du ${jourEnLettres(b.de, langue)} au ${jourEnLettres(b.a, langue)}`;
}

/** Un montant écrit EN ENTIER, avec ses centimes s'il en a : « 2 784 137,60 ».
 *  Une espace ORDINAIRE entre les milliers — la police du PDF n'en connaît
 *  pas d'autre, et le robot écrit ainsi. */
export function montantReleve(n: number, langue: Langue): string {
  const c = Math.round(Math.abs(n) * 100);
  const entier = String(Math.floor(c / 100))
    .replace(/\B(?=(\d{3})+(?!\d))/g, langue === "en" ? "," : " ");
  const reste = c % 100;
  const decimales = reste ? (langue === "en" ? "." : ",") + String(reste).padStart(2, "0") : "";
  return `${n < 0 && c > 0 ? "-" : ""}${entier}${decimales}`;
}

/** Le nom du fichier : le NUMÉRO de la carte, sinon son libellé, et la période. */
export function nomDuReleve(qui: string, b: Bornes, extension: "pdf" | "csv"): string {
  const propre = (qui || "TOTEM").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "TOTEM";
  return `Releve-${propre}-${b.de}_${b.a}.${extension}`;
}
