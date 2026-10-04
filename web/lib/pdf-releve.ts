// --- Le RELEVÉ DE COMPTE en PDF — A4, autant de pages qu'il faut --------------
//
// Fait main, comme la fiche des coordonnées (`pdf-rib.ts`, dont il reprend
// les briques) : aucune bibliothèque, deux polices standard, aucun flux
// compressé. Un relevé de trois mois sur une caisse active fait cinquante
// pages ; il s'imprime, se joint, s'ouvre partout.
//
// CE QUI NE SE NÉGOCIE PAS :
//
//   · LE NUMÉRO EN TÊTE, en grand — c'est par lui qu'on désigne une carte,
//     quel que soit le réseau. Sans numéro inscrit, l'en-tête le DIT et montre
//     le libellé et l'ICCID.
//   · UN NOM DE TIERS N'EST JAMAIS COUPÉ. « STE. NOUVELLE BRASSERIE DU
//     LITTORAL ET DES HAUTS PLATEAUX DE L'OUEST SARL » fait 75 caractères :
//     il passe à la ligne, la rangée grandit. Une référence non plus : c'est
//     le numéro qu'on recopie pour réclamer chez l'opérateur — trop large,
//     elle rapetisse, puis passe à la ligne, jamais « PP2408… ».
//   · CHAQUE LIGNE UNE FOIS. Le saut de page ne perd ni ne double une ligne :
//     un jour coupé reprend sous « (suite) » en haut de la page suivante.
//   · « page n/N » et le pied : établi d'après les SMS, le SMS fait foi.
//
// La police standard ne connaît que le latin-1 : un caractère au-delà
// (« ٥ », un émoji) devient « ? ». Les montants et références sont déjà
// normalisés par le lecteur ; pour les noms exotiques, le CSV garde l'UTF-8.

import { formaterNumero } from "@noyau/numero";
import {
  jourCourtReleve, jourEnLettres, montantReleve, parJour, periodeEnLettres,
  genreDuMouvement, type Releve, type SectionReleve,
} from "@noyau/releve";
import { textesReleve } from "@noyau/textes/releve";
import { textesSms } from "@noyau/textes/sms";
import type { Paiement } from "@noyau/types";
import {
  BRIN_A, BRIN_B, ENCRE, GRIS, LATERITE, TRAIT, assemblerPdf, brin, latin1,
  marqueReseau, texte,
} from "./pdf-rib";

const LARGEUR = 595;
const HAUTEUR = 842;
const MARGE = 36;
const UTILE = LARGEUR - 2 * MARGE;
const BAS = 46;               // en dessous : le pied
const FOND = "0.965 0.953 0.937";
const ROUGE = "0.698 0.133 0.133";

// --- La largeur d'un texte -----------------------------------------------------
//
// Les métriques des deux polices standard (fichiers AFM d'Adobe), de l'espace
// au tilde. Une lettre accentuée a la largeur de sa lettre de base ; un
// caractère inconnu, celle d'un chiffre — surestimer coûte une ligne de plus,
// sous-estimer ferait déborder un nom sur la colonne voisine.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722,
  667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, 334, 260, 334, 584];
const HELVETICA_GRAS = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333,
  278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722,
  667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556,
  778, 556, 556, 500, 389, 280, 389, 584];

type Police = "F1" | "F2";

/** La largeur, en points, d'un texte dans une police et un corps. */
export function largeur(t: string, police: Police, corps: number): number {
  const table = police === "F2" ? HELVETICA_GRAS : HELVETICA;
  let somme = 0;
  for (const c of latin1(t)) {
    let code = c.charCodeAt(0);
    // Les signes de WinAnsi au-delà du latin-1 (voir pdf-rib) : l'apostrophe
    // est étroite, le tiret cadratin large.
    if (code >= 0x80 && code <= 0x9f) {
      somme += code === 0x91 || code === 0x92 ? 222 : code === 0x97 || code === 0x85 ? 1000 : 556;
      continue;
    }
    if (code > 126) {
      const base = c.normalize("NFD").charCodeAt(0);
      code = base >= 32 && base <= 126 ? base : 48;
    }
    somme += table[code - 32] ?? 556;
  }
  return (somme * corps) / 1000;
}

/** Un texte en lignes qui tiennent dans `place` — par mots, et un mot plus
 *  large que la colonne se coupe par lettres. Rien n'est jamais retiré. */
export function enLignes(t: string, place: number, police: Police, corps: number): string[] {
  const lignes: string[] = [];
  let courante = "";
  const pousser = (mot: string) => {
    // Un mot trop large pour une ligne entière : on le découpe.
    while (largeur(mot, police, corps) > place) {
      let n = mot.length - 1;
      while (n > 1 && largeur(mot.slice(0, n), police, corps) > place) n--;
      if (courante) { lignes.push(courante); courante = ""; }
      lignes.push(mot.slice(0, n));
      mot = mot.slice(n);
    }
    const essai = courante ? `${courante} ${mot}` : mot;
    if (largeur(essai, police, corps) <= place) courante = essai;
    else { lignes.push(courante); courante = mot; }
  };
  for (const mot of t.split(/\s+/).filter(Boolean)) pousser(mot);
  if (courante) lignes.push(courante);
  return lignes.length ? lignes : [""];
}

const aDroite = (x: number, t: string, police: Police, corps: number) =>
  x - largeur(t, police, corps);

// --- Les colonnes du tableau ---------------------------------------------------

type Colonne = "date" | "heure" | "operation" | "reference" | "debit" | "credit"
  | "frais" | "solde";
const LARGEURS: Record<Colonne, number> = {
  date: 42, heure: 26, operation: 0, reference: 92, debit: 52, credit: 52, frais: 36,
  solde: 58,
};
LARGEURS.operation = UTILE - Object.values(LARGEURS).reduce((a, b) => a + b, 0);
const ORDRE: Colonne[] = ["date", "heure", "operation", "reference", "debit", "credit",
  "frais", "solde"];
const X: Record<Colonne, number> = {} as Record<Colonne, number>;
{
  let x = MARGE;
  for (const c of ORDRE) { X[c] = x; x += LARGEURS[c]; }
}
const CHIFFRES = new Set<Colonne>(["debit", "credit", "frais", "solde"]);
const PAD = 3;
const CORPS = 7;
const INTERLIGNE = 8.6;

/** Un montant qui tient dans sa colonne : il rapetisse, il ne se coupe pas. */
function corpsQuiTient(t: string, police: Police, place: number, corps = CORPS): number {
  let c = corps;
  while (c > 4.5 && largeur(t, police, c) > place) c -= 0.25;
  return c;
}

// --- Une page qu'on remplit ----------------------------------------------------

type Page = { contenu: string };

class Ecriture {
  pages: Page[] = [];
  y = 0;
  readonly langue: Releve["langue"];
  constructor(r: Releve) { this.langue = r.langue; }

  get t() { return textesReleve[this.langue]; }
  get page(): Page { return this.pages[this.pages.length - 1]; }
  ecrire(s: string) { this.page.contenu += s; }

  nouvellePage(): void {
    this.pages.push({ contenu: "" });
    this.y = HAUTEUR - MARGE;
  }

  /** La place qui reste avant le pied. */
  reste(): number { return this.y - BAS; }
}

/** La valeur d'un solde : « non connu » quand l'opérateur ne l'a pas dit —
 *  jamais 0, qui serait un solde. */
function solde(v: number | null, r: Releve): string {
  return v == null ? textesReleve[r.langue].nonConnu : `${montantReleve(v, r.langue)} FCFA`;
}

/** Le nom d'une carte dans un titre : son numéro, sinon son libellé. */
function nomDeCarte(s: SectionReleve, r: Releve): string {
  return formaterNumero(s.carte.numero)
    || `${s.carte.libelle} (${textesReleve[r.langue].numeroNonRenseigne})`;
}

/** L'en-tête d'une section, sur sa première page. */
function enteteDeSection(e: Ecriture, s: SectionReleve, r: Releve): void {
  const t = e.t;
  let y = e.y;
  // La Tresse et le mot, le titre à droite.
  e.ecrire(`q ${LATERITE} RG 3.6 w 1 J 1 j\n`);
  e.ecrire(brin(BRIN_A, MARGE - 6, y - 30, 1.0) + "S\n");
  e.ecrire(brin(BRIN_B, MARGE - 6, y - 30, 1.0) + "S\nQ\n");
  e.ecrire(texte(MARGE + 28, y - 18, 14, "F2", ENCRE, "TOTEM"));
  const titre = t.titre.toUpperCase();
  e.ecrire(texte(aDroite(LARGEUR - MARGE, titre, "F2", 11), y - 18, 11, "F2", ENCRE, titre));
  y -= 30;
  e.ecrire(`${ENCRE} RG 1.2 w ${MARGE} ${y} m ${LARGEUR - MARGE} ${y} l S\n`);

  // LE NUMÉRO, en grand ; la marque du réseau en face.
  y -= 32;
  const numero = formaterNumero(s.carte.numero);
  if (numero) e.ecrire(texte(MARGE, y, 24, "F2", ENCRE, numero));
  else e.ecrire(texte(MARGE, y + 4, 13, "F2", GRIS, t.numeroNonRenseigne));
  e.ecrire(marqueReseau(s.carte.operateur, s.carte.libelle, LARGEUR - MARGE - 52, y - 6));

  // Les informations de la carte, en deux colonnes « étiquette  valeur ».
  y -= 22;
  const infos: [string, string][] = [[t.reseau, s.carte.service]];
  if (s.carte.nom.trim()) infos.push([t.titulaire, s.carte.nom.trim()]);
  infos.push([t.libelle, s.carte.libelle]);
  infos.push([t.iccid, s.carte.iccid]);
  infos.push([t.periodeDoc, periodeEnLettres(r.bornes, r.langue)]);
  infos.push([t.editeLe, editeLe(r)]);
  for (const [etiquette, valeur] of infos) {
    e.ecrire(texte(MARGE, y, 7.5, "F2", GRIS, etiquette.toUpperCase()));
    const lignes = enLignes(valeur, UTILE - 120, "F1", 9);
    for (const l of lignes) {
      e.ecrire(texte(MARGE + 120, y, 9, "F1", ENCRE, l));
      y -= 12;
    }
    y -= 1;
  }

  // LA SYNTHÈSE — un cadre, deux colonnes.
  y -= 6;
  const elements: [string, string, string?][] = [
    [t.soldeOuverture, solde(s.soldes.ouverture, r)],
    [t.soldeCloture, solde(s.soldes.cloture, r)],
    [t.entrees, `${montantReleve(s.totaux.entrees, r.langue)} FCFA`],
    [t.sorties, `${montantReleve(s.totaux.sorties, r.langue)} FCFA`],
    [t.frais, `${montantReleve(s.totaux.frais, r.langue)} FCFA`],
    [t.nbOperations, String(s.totaux.nombre)],
    [t.sensInconnu, String(s.totaux.inconnus)],
  ];
  if (s.soldes.ecart != null && s.soldes.ecart !== 0) {
    elements.push([t.ecart, `${montantReleve(s.soldes.ecart, r.langue)} FCFA`, LATERITE]);
  }
  const rangs = Math.ceil(elements.length / 2);
  const hauteurCadre = 24 + rangs * 24 + (s.tronque ? 26 : 0)
    + (s.soldes.ecart ? 16 : 0);
  e.ecrire(`${FOND} rg ${MARGE} ${y - hauteurCadre} ${UTILE} ${hauteurCadre} re f\n`);
  e.ecrire(texte(MARGE + 10, y - 14, 8, "F2", GRIS, t.synthese.toUpperCase()));
  let yc = y - 30;
  elements.forEach(([etiquette, valeur, couleur], i) => {
    const col = i % 2;
    const x = MARGE + 10 + col * (UTILE / 2);
    const yy = yc - Math.floor(i / 2) * 24;
    e.ecrire(texte(x, yy, 7, "F1", GRIS, etiquette));
    e.ecrire(texte(x, yy - 10, 9.5, "F2", couleur ?? ENCRE, valeur));
  });
  yc -= rangs * 24;
  if (s.soldes.ecart) {
    for (const l of enLignes(t.ecartDetail, UTILE - 20, "F1", 6.5)) {
      e.ecrire(texte(MARGE + 10, yc - 2, 6.5, "F1", GRIS, l));
      yc -= 8;
    }
    yc -= 6;
  }
  if (s.tronque) {
    for (const l of enLignes(t.incomplet, UTILE - 20, "F2", 7.5)) {
      e.ecrire(texte(MARGE + 10, yc - 4, 7.5, "F2", ROUGE, l));
      yc -= 10;
    }
  }
  e.y = y - hauteurCadre - 16;
}

function editeLe(r: Releve): string {
  const d = new Date(r.editeLe);
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: r.fuseau }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", timeZone: r.fuseau,
  }).format(d);
  return `${jourEnLettres(jour, r.langue)}, ${heure} (${r.fuseau})`;
}

/** Le bandeau d'une page de suite : de quelle carte, sur quelle période. */
function enteteDeSuite(e: Ecriture, s: SectionReleve | null, r: Releve): void {
  const t = e.t;
  const ligne = [`TOTEM · ${t.titre}`, s ? nomDeCarte(s, r) : t.recapitulatif,
    periodeEnLettres(r.bornes, r.langue)].join(" · ");
  for (const l of enLignes(ligne, UTILE, "F1", 7.5)) {
    e.ecrire(texte(MARGE, e.y - 8, 7.5, "F1", GRIS, l));
    e.y -= 10;
  }
  e.y -= 4;
  e.ecrire(`${TRAIT} RG 0.8 w ${MARGE} ${e.y} m ${LARGEUR - MARGE} ${e.y} l S\n`);
  e.y -= 8;
}

/** L'en-tête des colonnes. */
function enteteDuTableau(e: Ecriture): void {
  const t = e.t;
  const noms: Record<Colonne, string> = {
    date: t.colDate, heure: t.colHeure, operation: t.colOperation,
    reference: t.colReference, debit: t.colDebit, credit: t.colCredit, frais: t.colFrais,
    solde: t.colSolde,
  };
  const h = 14;
  e.ecrire(`${ENCRE} rg ${MARGE} ${e.y - h} ${UTILE} ${h} re f\n`);
  for (const c of ORDRE) {
    const nom = noms[c];
    const corps = corpsQuiTient(nom, "F2", LARGEURS[c] - 2 * PAD, 6.5);
    const x = CHIFFRES.has(c) ? aDroite(X[c] + LARGEURS[c] - PAD, nom, "F2", corps) : X[c] + PAD;
    e.ecrire(texte(x, e.y - 9.5, corps, "F2", "1 1 1", nom));
  }
  e.y -= h + 2;
}

/** Une ligne du relevé, mise en cellules — avant d'être dessinée, pour
 *  savoir sa hauteur. */
type Cellules = Record<Colonne, { lignes: string[]; corps: number; police: Police;
                                  couleur: string }>;
/** Les cellules, et combien de lignes de l'opération sont en gras (la
 *  nature, et pour un sens inconnu son montant). */
type Rangee = { cel: Cellules; gras: number };

function cellules(p: Paiement, r: Releve): Rangee {
  const t = textesReleve[r.langue];
  const genre = genreDuMouvement(p);
  const nature = genre ? textesSms[r.langue].cat[genre] : "";
  const place = (c: Colonne) => LARGEURS[c] - 2 * PAD;
  const montant = p.montant == null ? "" : montantReleve(p.montant, r.langue);

  // L'opération : la nature en gras, puis le TIERS en entier, puis son numéro.
  // Un sens inconnu dit son montant ICI, et ni au débit ni au crédit : il
  // n'est compté nulle part.
  const premiere = p.sens === "?" ? `${nature} — ${montant} (${t.sensNonDetermine})`
    : nature;
  const lignesOp = enLignes(premiere, place("operation"), "F2", CORPS);
  const tiers = p.tiers.trim();
  const numero = formaterNumero(p.numero) || p.numero.trim();
  const reste: string[] = tiers ? enLignes(tiers, place("operation"), "F1", CORPS) : [];
  if (numero) {
    const derniere = reste.at(-1);
    if (derniere && largeur(`${derniere} · ${numero}`, "F1", CORPS) <= place("operation")) {
      reste[reste.length - 1] = `${derniere} · ${numero}`;
    } else reste.push(numero);
  }

  // La référence : elle rapetisse pour tenir, puis passe à la ligne.
  const ref = p.reference.trim();
  const corpsRef = corpsQuiTient(ref, "F1", place("reference"), 6.5);
  const lignesRef = ref ? (largeur(ref, "F1", corpsRef) <= place("reference")
    ? [ref] : enLignes(ref, place("reference"), "F1", corpsRef)) : [""];

  const chiffre = (v: string) => ({
    lignes: [v], corps: corpsQuiTient(v, "F1", LARGEURS.debit - 2 * PAD), police: "F1" as Police,
    couleur: ENCRE,
  });
  return { gras: lignesOp.length, cel: {
    date: { lignes: [jourCourtReleve(p.jour, r.langue)], corps: CORPS, police: "F1", couleur: ENCRE },
    heure: { lignes: [p.heure], corps: CORPS, police: "F1", couleur: ENCRE },
    operation: { lignes: [...lignesOp, ...reste], corps: CORPS, police: "F1", couleur: ENCRE },
    reference: { lignes: lignesRef, corps: corpsRef, police: "F1", couleur: GRIS },
    debit: chiffre(p.sens === "out" ? montant : ""),
    credit: chiffre(p.sens === "in" ? montant : ""),
    frais: chiffre(p.sens !== "?" && p.frais != null && p.frais !== 0
      ? montantReleve(p.frais, r.langue) : ""),
    solde: {
      ...chiffre(p.soldeApres == null ? "" : montantReleve(p.soldeApres, r.langue)),
      corps: corpsQuiTient(p.soldeApres == null ? "" : montantReleve(p.soldeApres, r.langue),
        "F1", LARGEURS.solde - 2 * PAD),
    },
  } };
}

function hauteurDe({ cel: c }: Rangee): number {
  return Math.max(...ORDRE.map((k) => c[k].lignes.length)) * INTERLIGNE + 5;
}

function dessinerLigne(e: Ecriture, rangee: Rangee): void {
  const { cel: c, gras: nbGras } = rangee;
  const h = hauteurDe(rangee);
  for (const k of ORDRE) {
    const cel = c[k];
    cel.lignes.forEach((l, i) => {
      if (!l) return;
      const y = e.y - 8 - i * INTERLIGNE;
      const police: Police = k === "operation" && i < nbGras ? "F2" : cel.police;
      const x = CHIFFRES.has(k)
        ? aDroite(X[k] + LARGEURS[k] - PAD, l, police, cel.corps) : X[k] + PAD;
      e.ecrire(texte(x, y, cel.corps, police, cel.couleur, l));
    });
  }
  e.y -= h;
  e.ecrire(`${TRAIT} RG 0.4 w ${MARGE} ${e.y + 1.5} m ${LARGEUR - MARGE} ${e.y + 1.5} l S\n`);
}

/** L'intertitre d'un jour, et ce qu'il a fait entrer et sortir. */
function dessinerJour(e: Ecriture, jour: string, entrees: number, sorties: number,
                      suite: boolean, r: Releve): void {
  const t = e.t;
  const h = 15;
  e.ecrire(`${FOND} rg ${MARGE} ${e.y - h + 2} ${UTILE} ${h - 2} re f\n`);
  const titre = jourEnLettres(jour, r.langue, true) + (suite ? ` (${t.suite})` : "");
  e.ecrire(texte(MARGE + PAD, e.y - 9.5, 7.5, "F2", ENCRE, titre));
  const total = t.sousTotal(montantReleve(entrees, r.langue), montantReleve(sorties, r.langue));
  e.ecrire(texte(aDroite(LARGEUR - MARGE - PAD, total, "F1", 6.5), e.y - 9.5, 6.5, "F1",
                 GRIS, total));
  e.y -= h;
}

/** Une section : une carte, sa première page, ses jours. */
function ecrireSection(e: Ecriture, s: SectionReleve, r: Releve): void {
  e.nouvellePage();
  enteteDeSection(e, s, r);
  const t = e.t;
  if (s.lignes.length === 0) {
    e.ecrire(texte(MARGE, e.y - 10, 9, "F1", GRIS, t.aucuneOperation));
    e.y -= 20;
    return;
  }
  e.ecrire(texte(MARGE, e.y, 6.5, "F1", GRIS, t.montantsEn));
  e.y -= 6;
  enteteDuTableau(e);
  const pageSuivante = () => {
    e.nouvellePage();
    enteteDeSuite(e, s, r);
    enteteDuTableau(e);
  };
  for (const j of parJour(s.lignes)) {
    const premieres = cellules(j.lignes[0], r);
    // Un intertitre ne reste jamais seul en bas d'une page.
    if (e.reste() < 15 + hauteurDe(premieres)) pageSuivante();
    dessinerJour(e, j.jour, j.entrees, j.sorties, false, r);
    j.lignes.forEach((p, i) => {
      const c = i === 0 ? premieres : cellules(p, r);
      if (e.reste() < hauteurDe(c)) {
        pageSuivante();
        dessinerJour(e, j.jour, j.entrees, j.sorties, true, r);
      }
      dessinerLigne(e, c);
    });
  }
}

/** Le récapitulatif de « toutes mes cartes » : une ligne par numéro. */
function ecrireRecapitulatif(e: Ecriture, r: Releve): void {
  const t = e.t;
  e.nouvellePage();
  enteteDeSuite(e, null, r);
  e.ecrire(texte(MARGE, e.y - 14, 13, "F2", ENCRE, t.recapitulatif));
  e.y -= 30;
  const cols = [
    { nom: t.colNumero, l: 110, droite: false },
    { nom: t.reseau, l: 85, droite: false },
    { nom: t.nbOperations, l: 44, droite: true },
    { nom: t.entrees, l: 62, droite: true },
    { nom: t.sorties, l: 62, droite: true },
    { nom: t.frais, l: 44, droite: true },
    { nom: t.soldeOuverture, l: 58, droite: true },
    { nom: t.soldeCloture, l: 58, droite: true },
  ];
  const ecrireRang = (valeurs: string[], police: Police, couleur: string, fond?: string) => {
    const lignes = valeurs.map((v, i) => enLignes(v, cols[i].l - 2 * PAD, police, 6.8));
    const h = Math.max(...lignes.map((l) => l.length)) * INTERLIGNE + 5;
    if (e.reste() < h) { e.nouvellePage(); enteteDeSuite(e, null, r); }
    if (fond) e.ecrire(`${fond} rg ${MARGE} ${e.y - h} ${UTILE} ${h} re f\n`);
    let x = MARGE;
    lignes.forEach((ls, i) => {
      ls.forEach((l, k) => {
        const xx = cols[i].droite ? aDroite(x + cols[i].l - PAD, l, police, 6.8) : x + PAD;
        e.ecrire(texte(xx, e.y - 8 - k * INTERLIGNE, 6.8, police, couleur, l));
      });
      x += cols[i].l;
    });
    e.y -= h;
    e.ecrire(`${TRAIT} RG 0.4 w ${MARGE} ${e.y + 1.5} m ${LARGEUR - MARGE} ${e.y + 1.5} l S\n`);
  };
  ecrireRang(cols.map((c) => c.nom), "F2", "1 1 1", ENCRE);
  const m = (v: number) => montantReleve(v, r.langue);
  const ouvert = (v: number | null) => (v == null ? t.nonConnu : m(v));
  for (const s of r.sections) {
    ecrireRang([nomDeCarte(s, r), s.carte.service, String(s.totaux.nombre), m(s.totaux.entrees),
      m(s.totaux.sorties), m(s.totaux.frais), ouvert(s.soldes.ouverture),
      ouvert(s.soldes.cloture)], "F1", ENCRE);
  }
  const somme = (f: (s: SectionReleve) => number) =>
    r.sections.reduce((a, s) => a + Math.round(f(s) * 100), 0) / 100;
  ecrireRang(["Total", "", String(r.sections.reduce((a, s) => a + s.totaux.nombre, 0)),
    m(somme((s) => s.totaux.entrees)), m(somme((s) => s.totaux.sorties)),
    m(somme((s) => s.totaux.frais)), "", ""], "F2", ENCRE, FOND);
  e.ecrire(texte(MARGE, e.y - 12, 6.5, "F1", GRIS, t.montantsEn));
}

/** Le document entier. */
export function pdfReleve(r: Releve): Uint8Array<ArrayBuffer> {
  const e = new Ecriture(r);
  for (const s of r.sections) ecrireSection(e, s, r);
  if (r.tout && r.sections.length > 0) ecrireRecapitulatif(e, r);
  if (e.pages.length === 0) e.nouvellePage();

  // Le pied, maintenant qu'on connaît le nombre de pages.
  const t = e.t;
  const n = e.pages.length;
  return assemblerPdf(e.pages.map((p, i) => {
    const numero = t.page(i + 1, n);
    const pied =
      `${TRAIT} RG 0.6 w ${MARGE} ${BAS - 14} m ${LARGEUR - MARGE} ${BAS - 14} l S\n` +
      texte(MARGE, BAS - 26, 6.8, "F1", GRIS, t.pied) +
      texte(aDroite(LARGEUR - MARGE, numero, "F2", 6.8), BAS - 26, 6.8, "F2", GRIS, numero);
    return { largeur: LARGEUR, hauteur: HAUTEUR, contenu: p.contenu + pied };
  }));
}
