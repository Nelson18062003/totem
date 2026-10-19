// LE REÇU PDF, FABRIQUÉ PAR LA PLATEFORME — la transcription de `totem/recu.py`.
//
// Le boîtier fabrique le reçu d'un SMS d'argent depuis toujours : il a le SMS,
// il le lit, il dessine le document (`totem/recu.py`, sur `totem/pdf.py`) et le
// dépose sur la plateforme. Fabriquer coûte quelques millisecondes ; ce qui
// coûtait du temps, c'était le TRAJET (demande → boîtier → dépôt → écran).
// La plateforme a déjà, dans chaque ligne de `paiements`, ce que le reçu
// affiche : montant, tiers, numéro, référence, frais, commission, heure du
// réseau. Elle peut donc le dessiner elle-même, sur place, à la demande.
//
// LE DESSIN NE CHANGE PAS. Mêmes millimètres, mêmes corps, mêmes couleurs,
// même police embarquée (DM Sans), même symbole, mêmes marques des réseaux :
// ce fichier recopie `recu.py` et `pdf.py` règle pour règle, et
// `scripts/verifier-le-recu-de-la-plateforme.mjs` compare, pixel par pixel,
// le document d'ici à celui du boîtier pour les mêmes données.
//
// Il ne dépend d'aucun module de Next : le harnais le charge tel quel.

import { deflateSync } from "node:zlib";
import { BRINS, DM_SANS_400, DM_SANS_700, EPAISSEUR_BRIN, GRILLE, MARQUES } from "./recu-donnees";

export type Langue = "fr" | "en";
const t = (en: string, fr: string, langue: Langue) => (langue === "en" ? en : fr);

export const MM = 72 / 25.4;

/** Python formate « {x:.3f} » ; `toFixed` arrondit pareil à l'écart de
 *  représentation près — invisible à l'œil, comparé au pixel près. */
const f = (n: number, d = 3) => n.toFixed(d);

function couleur(hexa: string): [number, number, number] {
  const h = hexa.replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const rgb = (hexa: string) => couleur(hexa).map((v) => f(v, 4)).join(" ");

// --- Lecture d'une police TrueType (pdf.py, Police) --------------------------

class Police {
  octets: Uint8Array;
  nom: string;
  glyphesUtilises = new Set<number>();
  unites = 1000;
  cadre: [number, number, number, number] = [0, 0, 0, 0];
  montantCapitale = 700;
  auDessus = 0;
  auDessous = 0;
  montee = 0;
  interligne = 0;
  private tables = new Map<string, [number, number]>();
  private chasses: number[] = [];
  private cmap = new Map<number, number>();
  private v: DataView;

  constructor(base64: string, nom: string) {
    this.octets = Uint8Array.from(Buffer.from(base64, "base64"));
    this.v = new DataView(this.octets.buffer, this.octets.byteOffset, this.octets.byteLength);
    this.nom = nom;
    this.repertoire();
    this.lireHead();
    this.lireMetriques();
    this.lireCmap();
  }

  private repertoire() {
    const nombre = this.v.getUint16(4);
    for (let i = 0; i < nombre; i++) {
      const base = 12 + 16 * i;
      const tag = String.fromCharCode(...this.octets.slice(base, base + 4));
      this.tables.set(tag, [this.v.getUint32(base + 8), this.v.getUint32(base + 12)]);
    }
  }

  private debut(nom: string): number {
    const t = this.tables.get(nom);
    if (!t) throw new Error(`table ${nom} absente`);
    return t[0];
  }

  private lireHead() {
    const head = this.debut("head");
    this.unites = this.v.getUint16(head + 18);
    this.cadre = [this.v.getInt16(head + 36), this.v.getInt16(head + 38),
      this.v.getInt16(head + 40), this.v.getInt16(head + 42)];
    const os2 = this.tables.get("OS/2");
    const lg = os2?.[1] ?? 0;
    this.montantCapitale = os2 && lg >= 90 ? this.v.getInt16(os2[0] + 88) : Math.trunc(this.unites * 0.7);
    this.auDessus = os2 && lg >= 70 ? this.v.getInt16(os2[0] + 68) : this.cadre[3];
    this.auDessous = os2 && lg >= 72 ? this.v.getInt16(os2[0] + 70) : this.cadre[1];
    const hhea = this.debut("hhea");
    const monte = this.v.getInt16(hhea + 4);
    const descend = this.v.getInt16(hhea + 6);
    const blanc = this.v.getInt16(hhea + 8);
    this.montee = monte / this.unites;
    this.interligne = (monte - descend + blanc) / this.unites;
  }

  private lireMetriques() {
    const nombre = this.v.getUint16(this.debut("hhea") + 34);
    const hmtx = this.debut("hmtx");
    for (let i = 0; i < nombre; i++) this.chasses.push(this.v.getUint16(hmtx + 4 * i));
  }

  private lireCmap() {
    const cmap = this.debut("cmap");
    const nombre = this.v.getUint16(cmap + 2);
    let choisie: number | null = null;
    for (let i = 0; i < nombre; i++) {
      const plate = this.v.getUint16(cmap + 4 + 8 * i);
      const encodage = this.v.getUint16(cmap + 6 + 8 * i);
      const decalage = this.v.getUint32(cmap + 8 + 8 * i);
      const ok = (plate === 3 && (encodage === 1 || encodage === 10)) || (plate === 0 && (encodage === 3 || encodage === 4));
      if (ok && this.v.getUint16(cmap + decalage) === 4) { choisie = cmap + decalage; break; }
    }
    if (choisie === null) return;
    const base = choisie;
    const segments = this.v.getUint16(base + 6) / 2;
    const bloc = (decalage: number) =>
      Array.from({ length: segments }, (_, i) => this.v.getUint16(base + decalage + 2 * i));
    const fins = bloc(14);
    const debuts = bloc(16 + segments * 2);
    const deltas = bloc(16 + segments * 4);
    const ecarts = bloc(16 + segments * 6);
    const baseEcarts = base + 16 + segments * 6;
    const fin = this.octets.length;
    for (let i = 0; i < segments; i++) {
      if (debuts[i] === 0xffff) continue;
      for (let code = debuts[i]; code <= Math.min(fins[i], 0xfffe); code++) {
        let glyphe: number;
        if (ecarts[i] === 0) {
          glyphe = (code + deltas[i]) & 0xffff;
        } else {
          const position = baseEcarts + i * 2 + ecarts[i] + (code - debuts[i]) * 2;
          if (position + 2 > fin) continue;
          glyphe = this.v.getUint16(position);
          if (glyphe) glyphe = (glyphe + deltas[i]) & 0xffff;
        }
        if (glyphe) this.cmap.set(code, glyphe);
      }
    }
  }

  glyphes(texte: string): number[] {
    const trouves = Array.from(texte, (c) => this.cmap.get(c.codePointAt(0)!) ?? 0);
    trouves.forEach((g) => this.glyphesUtilises.add(g));
    return trouves;
  }

  chasse(glyphe: number): number {
    if (this.chasses.length === 0) return 500;
    return this.chasses[Math.min(glyphe, this.chasses.length - 1)] * 1000 / this.unites;
  }

  largeur(texte: string, corps: number, interlettrage = 0): number {
    const g = this.glyphes(texte);
    if (g.length === 0) return 0;
    const avance = g.reduce((s, x) => s + this.chasse(x), 0) / 1000 * corps;
    return avance + interlettrage * corps * (g.length - 1);
  }
}

// --- La page (pdf.py, Page) ---------------------------------------------------

class Page {
  polices = new Map<string, Police>();
  empreintes: [number, number, string][] = [];
  flux: string[] = [];
  largeur: number;
  hauteur: number;
  // Pas de « constructor(public …) » : Node lit ce fichier en retirant les
  // types, et une propriété déclarée dans les paramètres n'en est pas un.
  constructor(largeur: number, hauteur: number) {
    this.largeur = largeur;
    this.hauteur = hauteur;
  }

  private y(y: number) { return this.hauteur - y; }

  rectangle(x: number, y: number, largeur: number, hauteur: number, teinte: string, rayon = 0) {
    this.flux.push(`${rgb(teinte)} rg`);
    this.flux.push(this.contourRectangle(x, y, largeur, hauteur, rayon));
    this.flux.push("f");
  }

  private contourRectangle(x: number, y: number, largeur: number, hauteur: number, rayon: number) {
    const bas = this.y(y + hauteur);
    const haut = this.y(y);
    if (rayon <= 0) return `${f(x)} ${f(bas)} ${f(largeur)} ${f(hauteur)} re`;
    const r = Math.min(rayon, largeur / 2, hauteur / 2);
    const k = r * 0.5523;
    const d = x + largeur;
    return [
      `${f(x + r)} ${f(bas)} m`,
      `${f(d - r)} ${f(bas)} l`,
      `${f(d - r + k)} ${f(bas)} ${f(d)} ${f(bas + r - k)} ${f(d)} ${f(bas + r)} c`,
      `${f(d)} ${f(haut - r)} l`,
      `${f(d)} ${f(haut - r + k)} ${f(d - r + k)} ${f(haut)} ${f(d - r)} ${f(haut)} c`,
      `${f(x + r)} ${f(haut)} l`,
      `${f(x + r - k)} ${f(haut)} ${f(x)} ${f(haut - r + k)} ${f(x)} ${f(haut - r)} c`,
      `${f(x)} ${f(bas + r)} l`,
      `${f(x)} ${f(bas + r - k)} ${f(x + r - k)} ${f(bas)} ${f(x + r)} ${f(bas)} c`,
      "h",
    ].join(" ");
  }

  filet(x: number, y: number, largeur: number, teinte: string, epaisseur = 0.75) {
    this.flux.push(`${rgb(teinte)} RG ${f(epaisseur)} w`);
    this.flux.push(`${f(x)} ${f(this.y(y))} m ${f(x + largeur)} ${f(this.y(y))} l S`);
  }

  texte(x: number, ligneDeBase: number, contenu: string, police: Police, corps: number,
    teinte: string, interlettrage = 0): number {
    if (!contenu) return 0;
    const nom = this.enregistrer(police);
    const hexa = police.glyphes(contenu).map((g) => g.toString(16).toUpperCase().padStart(4, "0")).join("");
    this.flux.push(`BT /${nom} ${f(corps)} Tf ${f(interlettrage * corps, 4)} Tc ${rgb(teinte)} rg `
      + `${f(x)} ${f(this.y(ligneDeBase))} Td <${hexa}> Tj ET`);
    const largeur = police.largeur(contenu, corps, interlettrage);
    this.empreintes.push([x, x + largeur, contenu]);
    return largeur;
  }

  private enregistrer(police: Police): string {
    for (const [nom, connue] of this.polices) if (connue === police) return nom;
    const nom = `P${this.polices.size + 1}`;
    this.polices.set(nom, police);
    return nom;
  }

  trace(chemin: string, teinte: string, epaisseur: number, echelle: number, dx: number, dy: number,
    decoupes: [number, number][][] = []) {
    this.flux.push("q");
    this.flux.push(`${f(echelle, 5)} 0 0 ${f(-echelle, 5)} ${f(dx)} ${f(this.y(dy))} cm`);
    if (decoupes.length) {
      const grand = 10000;
      const morceaux = [`${-grand} ${-grand} ${2 * grand} ${2 * grand} re`, ...decoupes.map(quadrilatere)];
      this.flux.push(morceaux.join(" ") + " W* n");
    }
    this.flux.push(`${rgb(teinte)} RG ${f(epaisseur)} w 1 J 1 j`);
    this.flux.push(svgEnPdf(chemin) + " S");
    this.flux.push("Q");
  }

  remplir(traces: string[], teinte: string, echelle: number, dx: number, dy: number) {
    const morceaux = traces.map(cheminSvg).filter(Boolean);
    if (!morceaux.length) return;
    this.flux.push("q");
    this.flux.push(`${f(echelle, 5)} 0 0 ${f(-echelle, 5)} ${f(dx)} ${f(this.y(dy))} cm`);
    this.flux.push(`${rgb(teinte)} rg`);
    this.flux.push(morceaux.join(" ") + " f");
    this.flux.push("Q");
  }
}

function quadrilatere(sommets: [number, number][]): string {
  const [x0, y0] = sommets[0];
  const corps = sommets.slice(1).map(([x, y]) => `${f(x)} ${f(y)} l`).join(" ");
  return `${f(x0)} ${f(y0)} m ${corps} h`;
}

const ARGUMENTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4 };

/** Un tracé SVG complet → opérateurs PDF (pdf.py, chemin_svg). */
function cheminSvg(trace: string): string {
  const elements: (string | number)[] = [];
  for (const m of (trace || "").matchAll(/([MmLlHhVvCcSsZz])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g)) {
    elements.push(m[1] ? m[1] : Number(m[2]));
  }
  const sortie: string[] = [];
  let x = 0, y = 0, ox = 0, oy = 0, cx = 0, cy = 0;
  let commande = "";
  let i = 0;
  while (i < elements.length) {
    const jeton = elements[i];
    if (typeof jeton === "string") {
      commande = jeton;
      i++;
      if (commande === "Z" || commande === "z") { sortie.push("h"); x = ox; y = oy; continue; }
    } else if (!commande) {
      break;
    } else if (commande === "M") {
      commande = "L";
    } else if (commande === "m") {
      commande = "l";
    }
    const majuscule = commande.toUpperCase();
    const besoin = ARGUMENTS[majuscule];
    if (besoin === undefined || i + besoin > elements.length) break;
    const valeurs = elements.slice(i, i + besoin);
    if (valeurs.some((v) => typeof v === "string")) break;
    const n = valeurs as number[];
    i += besoin;
    const relatif = commande === commande.toLowerCase();
    if (majuscule === "M") {
      x = n[0] + (relatif ? x : 0); y = n[1] + (relatif ? y : 0);
      ox = x; oy = y;
      sortie.push(`${f(x)} ${f(y)} m`);
      cx = x; cy = y;
    } else if (majuscule === "L" || majuscule === "H" || majuscule === "V") {
      if (majuscule === "L") { x = n[0] + (relatif ? x : 0); y = n[1] + (relatif ? y : 0); }
      else if (majuscule === "H") x = n[0] + (relatif ? x : 0);
      else y = n[0] + (relatif ? y : 0);
      sortie.push(`${f(x)} ${f(y)} l`);
      cx = x; cy = y;
    } else {
      let p1x: number, p1y: number, p2x: number, p2y: number, fx: number, fy: number;
      if (majuscule === "C") {
        [p1x, p1y, p2x, p2y, fx, fy] = n;
        if (relatif) { p1x += x; p1y += y; p2x += x; p2y += y; fx += x; fy += y; }
      } else {
        p1x = 2 * x - cx; p1y = 2 * y - cy;
        [p2x, p2y, fx, fy] = n;
        if (relatif) { p2x += x; p2y += y; fx += x; fy += y; }
      }
      sortie.push(`${f(p1x)} ${f(p1y)} ${f(p2x)} ${f(p2y)} ${f(fx)} ${f(fy)} c`);
      cx = p2x; cy = p2y;
      x = fx; y = fy;
    }
  }
  return sortie.join(" ");
}

/** Le sous-ensemble M / L / C de brand/generer.py (pdf.py, _svg_en_pdf). */
function svgEnPdf(chemin: string): string {
  const sortie: string[] = [];
  let nombres: number[] = [];
  let commande: string | null = null;
  const vider = () => {
    if (commande === "M" && nombres.length >= 2) sortie.push(`${f(nombres[0])} ${f(nombres[1])} m`);
    else if (commande === "L" && nombres.length >= 2) sortie.push(`${f(nombres[0])} ${f(nombres[1])} l`);
    else if (commande === "C" && nombres.length >= 6) sortie.push(nombres.slice(0, 6).map((n) => f(n)).join(" ") + " c");
  };
  let tampon = "";
  for (const c of chemin + "Z") {
    if ("MLCZ".includes(c)) {
      if (tampon) { nombres.push(Number(tampon)); tampon = ""; }
      vider();
      commande = c; nombres = [];
    } else if (c === " " || c === ",") {
      if (tampon) { nombres.push(Number(tampon)); tampon = ""; }
    } else if (c === "-" && tampon && !/[eE]$/.test(tampon)) {
      nombres.push(Number(tampon)); tampon = "-";
    } else {
      tampon += c;
    }
  }
  return sortie.join(" ");
}

// --- Le document (pdf.py, Document) ---------------------------------------------

function documentPdf(page: Page): Uint8Array {
  const objets: (Buffer | null)[] = [null];
  const ajouter = (b: Buffer) => { objets.push(b); return objets.length - 1; };
  const latin = (s: string) => Buffer.from(s, "latin1");

  const flux = deflateSync(latin(page.flux.join("\n")));
  const contenu = ajouter(Buffer.concat([latin(`<< /Length ${flux.length} /Filter /FlateDecode >>\nstream\n`), flux, latin("\nendstream")]));

  const ressources: string[] = [];
  for (const [nom, police] of page.polices) ressources.push(`/${nom} ${policePdf(police, ajouter)} 0 R`);
  const polices = ressources.length ? `<< ${ressources.join(" ")} >>` : "<< >>";

  const pages = objets.length + 1;
  const pageObj = ajouter(latin(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${f(page.largeur)} ${f(page.hauteur)}] `
    + `/Resources << /Font ${polices} >> /Contents ${contenu} 0 R >>`));
  ajouter(latin(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`));
  const catalogue = ajouter(latin(`<< /Type /Catalog /Pages ${pages} 0 R >>`));

  const morceaux: Buffer[] = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let longueur = morceaux[0].length;
  const positions: number[] = [0];
  objets.forEach((objet, numero) => {
    if (!objet) return;
    positions.push(longueur);
    const b = Buffer.concat([latin(`${numero} 0 obj\n`), objet, latin("\nendobj\n")]);
    morceaux.push(b);
    longueur += b.length;
  });
  const depart = longueur;
  let xref = `xref\n0 ${objets.length}\n0000000000 65535 f \n`;
  for (const p of positions.slice(1)) xref += `${String(p).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objets.length} /Root ${catalogue} 0 R >>\nstartxref\n${depart}\n%%EOF\n`;
  morceaux.push(latin(xref));
  return new Uint8Array(Buffer.concat(morceaux));
}

function policePdf(police: Police, ajouter: (b: Buffer) => number): number {
  const latin = (s: string) => Buffer.from(s, "latin1");
  const compresse = deflateSync(Buffer.from(police.octets));
  const fichier = ajouter(Buffer.concat([
    latin(`<< /Length ${compresse.length} /Length1 ${police.octets.length} /Filter /FlateDecode >>\nstream\n`),
    compresse, latin("\nendstream")]));
  const e = 1000 / police.unites;
  const cadre = police.cadre.map((v) => (v * e).toFixed(0)).join(" ");
  const descripteur = ajouter(latin(`<< /Type /FontDescriptor /FontName /${police.nom} /Flags 32 `
    + `/FontBBox [${cadre}] /ItalicAngle 0 /Ascent ${(police.auDessus * e).toFixed(0)} `
    + `/Descent ${(police.auDessous * e).toFixed(0)} /CapHeight ${(police.montantCapitale * e).toFixed(0)} /StemV 80 `
    + `/FontFile2 ${fichier} 0 R >>`));
  const chasses = [...police.glyphesUtilises].sort((a, b) => a - b)
    .map((g) => `${g} [${police.chasse(g).toFixed(0)}]`).join(" ");
  const descendante = ajouter(latin(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${police.nom} `
    + `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descripteur} 0 R /DW 500 `
    + `/W [${chasses}] /CIDToGIDMap /Identity >>`));
  return ajouter(latin(`<< /Type /Font /Subtype /Type0 /BaseFont /${police.nom} `
    + `/Encoding /Identity-H /DescendantFonts [${descendante} 0 R] >>`));
}

// --- La charte (recu.py) -----------------------------------------------------------

const ENCRE = "#16171a", ETIQUETTE = "#8a8279", SECOND = "#62605c", FILET = "#e8e5e1";
const SABLE = "#f7f4f1", LATERITE = "#9a4b2e";
const LARGEUR = 420 * MM, HAUTEUR = 297 * MM;
const MARGE_H = 28 * MM, MARGE_V = 26 * MM;
const GAUCHE = MARGE_H, DROITE = LARGEUR - MARGE_H, UTILE = DROITE - GAUCHE;
const CORPS_ETIQUETTE = 13, ECART_ETIQUETTE = 0.20;
const CORPS_MOT = 30, ECART_MOT = 0.18;
const CORPS_TYPE = 20, CORPS_NUMERO = 13;
const CORPS_SOMME = 88, ECART_SOMME = -0.04;
const CORPS_NOM = 27, ECART_NOM = -0.025;
const CORPS_NUM = 21, CORPS_PREUVE = 26, CORPS_PIED = 13;
const SUIVI = -0.011;
const TRANCHE = 0.22;
const PART_DEVISE = 0.42, ECART_DEVISE = 0.34;
const COTE_SYMBOLE = 78 * 0.75;
const COTE_MARQUE = 34;
const LIGNES_NOM = 2;

const MOIS: Record<Langue, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
};

/** Une date et une heure LOCALES (celles de la caisse), déjà découpées. */
export type Instant = { annee: number; mois: number; jour: number; heure: number; minute: number; seconde: number };

export function dateEnLettres(q: Instant, langue: Langue): string {
  return `${q.jour} ${MOIS[langue][q.mois - 1]} ${q.annee}`;
}

export function heureEnLettres(q: Instant, langue: Langue, secondes = false): string {
  const mm = String(q.minute).padStart(2, "0");
  const ss = String(q.seconde).padStart(2, "0");
  if (langue === "en") return secondes ? `${q.heure}:${mm}:${ss}` : `${q.heure}:${mm}`;
  const court = `${q.heure} h ${mm}`;
  return secondes ? `${court} min ${ss} s` : court;
}

/** « TM-2026-0731-0042 » (recu.py, numero_de_recu). */
export function numeroDeRecu(q: Instant, sourceId: number, source: "sms" | "ussd" = "sms"): string {
  const tete = source === "ussd" ? "TS" : "TM";
  return `${tete}-${q.annee}-${String(q.mois).padStart(2, "0")}${String(q.jour).padStart(2, "0")}-${String(sourceId).padStart(4, "0")}`;
}

export function numeroLisible(numero: string | null | undefined): string {
  const chiffres = (numero ?? "").replace(/\D/g, "");
  if (chiffres.length === 12 && chiffres.startsWith("237")) {
    const r = chiffres.slice(3);
    return `+237 ${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6)}`;
  }
  return chiffres.length === 9 ? `${chiffres.slice(0, 3)} ${chiffres.slice(3, 6)} ${chiffres.slice(6)}` : (numero ?? "");
}

/** analyse_sms.formater_montant : décimales seulement si elles disent quelque chose. */
export function formaterMontant(valeur: number, langue: Langue): string {
  const entier = Math.trunc(Math.abs(valeur));
  const reste = Math.round((Math.abs(valeur) - entier) * 100) / 100;
  const decimales = reste ? reste.toFixed(2).split(".")[1].replace(/0+$/, "") : "";
  const milliers = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, langue === "en" ? "," : " ");
  const corps = langue === "en"
    ? milliers + (decimales ? "." + decimales : "")
    : milliers + (decimales ? "," + decimales : "");
  return (valeur < 0 ? "−" : "") + corps;
}

type Marque = { nom: string; voir: [number, number, number, number]; rayon?: number; fond: string; encre: string; traces: string[] };

function marqueDe(operateur: string): Marque | null {
  const nom = (operateur || "").trim().toLowerCase();
  if (!nom) return null;
  for (const [cle, marque] of Object.entries(MARQUES)) {
    if (nom.startsWith(cle)) return marque;
  }
  return null;
}

type Partie = [etiquette: string, nom: string | null, numero: string | null];
type Preuve = [etiquette: string, valeurs: (string | number)[], poids: number];

class Gabarit {
  page = new Page(LARGEUR, HAUTEUR);
  normale: Police;
  grasse: Police;
  basEntete: number;

  operateur: string;
  langue: Langue;

  constructor(typeDocument: string, numero: string, operateur: string, langue: Langue) {
    this.operateur = operateur;
    this.langue = langue;
    // Une police lue par document : la liste des glyphes employés (déclarés
    // dans le PDF) ne doit pas grossir de document en document.
    this.normale = new Police(DM_SANS_400, "DMSans");
    this.grasse = new Police(DM_SANS_700, "DMSansGras");
    this.page.rectangle(0, 0, LARGEUR, HAUTEUR, "#ffffff");
    this.basEntete = this.entete(typeDocument, numero);
  }

  base(haut: number, corps: number, interligne?: number) {
    const naturel = this.normale.interligne * corps;
    const hauteur = interligne === undefined ? naturel : interligne * corps;
    return haut + (hauteur - naturel) / 2 + this.normale.montee * corps;
  }

  static hauteur(corps: number, interligne?: number) {
    return corps * (interligne === undefined ? 1.302 : interligne);
  }

  replier(texte: string, police: Police, corps: number, largeur: number, interlettrage = 0, lignesMax = 2): string[] {
    const mots = (texte || "").split(/\s+/).filter(Boolean);
    if (!mots.length) return [""];
    const lignes: string[] = [];
    let courante = "";
    for (const mot of mots) {
      const essai = `${courante} ${mot}`.trim();
      if (courante && police.largeur(essai, corps, interlettrage) > largeur) {
        lignes.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    lignes.push(courante);
    if (lignes.length <= lignesMax) return lignes;
    return [...lignes.slice(0, lignesMax - 1), lignes.slice(lignesMax - 1).join(" ")];
  }

  corpsAjuste(texte: string, police: Police, corps: number, largeur: number, interlettrage = 0) {
    const mesure = police.largeur(texte, corps, interlettrage);
    if (mesure <= largeur || mesure <= 0) return corps;
    return corps * largeur / mesure;
  }

  blocNom(texte: string, largeur: number): [string[], number] {
    let corps = CORPS_NOM;
    let lignes: string[] = [];
    for (let i = 0; i < 12; i++) {
      lignes = this.replier(texte, this.grasse, corps, largeur, ECART_NOM, LIGNES_NOM);
      const tropLarge = Math.max(0, ...lignes.map((l) => this.grasse.largeur(l, corps, ECART_NOM)));
      if (tropLarge <= largeur) return [lignes, corps];
      corps *= Math.max(0.9, largeur / tropLarge);
    }
    return [lignes, corps];
  }

  poserAjuste(x: number, base: number, texte: string, police: Police, corps: number, teinte: string, largeur: number, interlettrage = 0) {
    const reduit = this.corpsAjuste(texte, police, corps, largeur, interlettrage);
    return this.page.texte(x, base, texte, police, reduit, teinte, interlettrage);
  }

  private entete(typeDocument: string, numero: string): number {
    const haut = MARGE_V;
    poserSymbole(this.page, GAUCHE, haut, COTE_SYMBOLE, LATERITE);
    const boiteMot = haut + (COTE_SYMBOLE - CORPS_MOT) / 2;
    this.page.texte(GAUCHE + COTE_SYMBOLE + 7 * MM, this.base(boiteMot, CORPS_MOT, 1.0), "TOTEM",
      this.grasse, CORPS_MOT, ENCRE, ECART_MOT);
    const bas = haut + COTE_SYMBOLE;
    const hautNumero = bas - Gabarit.hauteur(CORPS_NUMERO);
    this.aDroite(`N° ${numero}`, this.base(hautNumero, CORPS_NUMERO), this.normale, CORPS_NUMERO, ETIQUETTE);
    const hautType = hautNumero - 2.5 * MM - Gabarit.hauteur(CORPS_TYPE, 1.1);
    this.aDroite(typeDocument, this.base(hautType, CORPS_TYPE, 1.1), this.grasse, CORPS_TYPE, ENCRE, -0.02);
    const hautReseau = hautType - 4 * MM - COTE_MARQUE;
    this.reseauADroite(hautReseau, COTE_MARQUE);
    this.page.filet(GAUCHE, bas + 9 * MM, UTILE, FILET);
    return bas + 9 * MM;
  }

  private reseauADroite(haut: number, cote: number) {
    const marque = marqueDe(this.operateur);
    if (marque) {
      const largeur = cote * (marque.voir[2] / marque.voir[3]);
      poserMarque(this.page, marque, DROITE - largeur, haut, cote);
      return;
    }
    const nom = this.operateur || "";
    const corps = cote * 0.52;
    this.page.texte(DROITE - this.grasse.largeur(nom, corps, SUIVI),
      this.base(haut + (cote - Gabarit.hauteur(corps)) / 2, corps), nom, this.grasse, corps, ENCRE, SUIVI);
  }

  private aDroite(texte: string, base: number, police: Police, corps: number, teinte: string, interlettrage = SUIVI, largeurMax?: number) {
    const c = this.corpsAjuste(texte, police, corps, largeurMax || UTILE / 2, interlettrage);
    const largeur = police.largeur(texte, c, interlettrage);
    this.page.texte(DROITE - largeur, base, texte, police, c, teinte, interlettrage);
  }

  etiquette(x: number, haut: number, texte: string) {
    this.page.texte(x, this.base(haut, CORPS_ETIQUETTE, 1.0), texte.toUpperCase(), this.grasse,
      CORPS_ETIQUETTE, ETIQUETTE, ECART_ETIQUETTE);
  }

  private decomposer(valeur: number): [string[], string, string] {
    if (this.langue === "en") {
      const [entier, decimales = ""] = formaterMontant(valeur, "en").split(".");
      return [entier.split(","), decimales, "."];
    }
    const [entier, decimales = ""] = formaterMontant(valeur, "fr").split(",");
    return [entier.split(" "), decimales, ","];
  }

  private largeurSomme(valeur: number, corps: number, partDevise: number, ecartDevise: number) {
    const [tranches, decimales, sep] = this.decomposer(valeur);
    let large = tranches.reduce((s, m) => s + this.grasse.largeur(m, corps, ECART_SOMME), 0);
    large += TRANCHE * corps * (tranches.length - 1);
    if (decimales) large += 0.02 * corps + this.grasse.largeur(sep + decimales, corps, ECART_SOMME);
    const corpsDevise = partDevise * corps;
    return large + ecartDevise * corpsDevise + this.grasse.largeur("FCFA", corpsDevise, -0.01);
  }

  somme(x: number, base: number, valeur: number, corps: number, partDevise = PART_DEVISE, ecartDevise = ECART_DEVISE, largeurMax?: number) {
    if (largeurMax) {
      const mesure = this.largeurSomme(valeur, corps, partDevise, ecartDevise);
      if (mesure > largeurMax) corps = corps * largeurMax / mesure;
    }
    const [tranches, decimales, sep] = this.decomposer(valeur);
    tranches.forEach((tranche, i) => {
      if (i) x += TRANCHE * corps;
      x += this.page.texte(x, base, tranche, this.grasse, corps, ENCRE, ECART_SOMME);
    });
    if (decimales) {
      x += 0.02 * corps;
      x += this.page.texte(x, base, sep + decimales, this.grasse, corps, ENCRE, ECART_SOMME);
    }
    const corpsDevise = partDevise * corps;
    x += ecartDevise * corpsDevise;
    x += this.page.texte(x, base, "FCFA", this.grasse, corpsDevise, SECOND, -0.01);
    return x;
  }

  partie(x: number, haut: number, etiquette: string, lignes: string[], numero: string | null, placeNom: number, largeur: number, corpsNom = CORPS_NOM) {
    this.etiquette(x, haut, etiquette);
    haut += CORPS_ETIQUETTE + 6 * MM;
    let y = haut;
    for (const morceau of lignes) {
      this.poserAjuste(x, this.base(y, corpsNom, 1.18), morceau, this.grasse, corpsNom, ENCRE, largeur, ECART_NOM);
      y += Gabarit.hauteur(corpsNom, 1.18);
    }
    haut += placeNom + 3 * MM;
    this.poserAjuste(x, this.base(haut, CORPS_NUM), numeroLisible(numero), this.normale, CORPS_NUM, SECOND, largeur, SUIVI);
  }

  centre(bas: number, etiquetteSomme: string, valeur: number, parties: Partie[]) {
    const interieurHaut = this.basEntete + 14 * MM;
    const interieurBas = bas - 14 * MM;
    const milieu = (interieurHaut + interieurBas) / 2;
    const largeurSomme = UTILE * 0.42;
    const colonne = (UTILE - largeurSomme - 24 * MM - 20 * MM) / 2;
    const blocs = parties.map(([, nom]) => this.blocNom(nom || "—", colonne));
    const corpsNom = blocs.length ? Math.min(...blocs.map(([, c]) => c)) : CORPS_NOM;
    const replis = parties.map(([, nom]) => this.replier(nom || "—", this.grasse, corpsNom, colonne, ECART_NOM, LIGNES_NOM));
    const lignesNom = Math.max(1, ...replis.map((l) => l.length));
    const placeNom = lignesNom * Gabarit.hauteur(corpsNom, 1.18);
    const hauteurPartie = CORPS_ETIQUETTE + 6 * MM + placeNom + 3 * MM + Gabarit.hauteur(CORPS_NUM);
    const hauteurSomme = CORPS_ETIQUETTE + 6 * MM + CORPS_SOMME;
    let haut = milieu - hauteurSomme / 2;
    this.etiquette(GAUCHE, haut, etiquetteSomme);
    this.somme(GAUCHE, this.base(haut + CORPS_ETIQUETTE + 6 * MM, CORPS_SOMME, 1.0), valeur, CORPS_SOMME,
      PART_DEVISE, ECART_DEVISE, largeurSomme);
    const x = GAUCHE + largeurSomme + 24 * MM;
    haut = milieu - hauteurPartie / 2;
    parties.forEach(([nomColonne, , numero], i) => {
      this.partie(x + i * (colonne + 20 * MM), haut, nomColonne, replis[i], numero, placeNom, colonne, corpsNom);
    });
  }

  preuves(colonnes: Preuve[]): number {
    const interieurH = 13 * MM, interieurV = 11 * MM, ecart = 12 * MM;
    const largeurMax = UTILE - 2 * interieurH;
    const disponible = (largeurMax - ecart * (colonnes.length - 1)) * Math.min(1, (colonnes.length + 1) / 5);
    const poidsTotal = colonnes.reduce((s, [, , p]) => s + p, 0);
    const largeurs = colonnes.map(([, , p]) => p / poidsTotal * disponible);
    const decoupees = colonnes.map(([nom], i) => this.decouper(nom, largeurs[i]));
    const lignesEtiquette = Math.max(2, ...decoupees.map((d) => d.length));
    const hauteurEtiquette = lignesEtiquette * Gabarit.hauteur(CORPS_ETIQUETTE, 1.32);
    const lignesValeur = Math.max(...colonnes.map(([, v]) => v.length));
    const hauteur = 2 * interieurV + hauteurEtiquette + 2 * MM + lignesValeur * Gabarit.hauteur(CORPS_PREUVE, 1.28);
    const bas = HAUTEUR - MARGE_V - Gabarit.hauteur(CORPS_PIED) - 9 * MM;
    const haut = bas - hauteur;
    this.page.rectangle(GAUCHE, haut, UTILE, hauteur, SABLE, 4 * MM);
    let x = GAUCHE + interieurH;
    colonnes.forEach(([, valeurs], i) => {
      const largeur = largeurs[i];
      let y = haut + interieurV;
      for (const morceau of decoupees[i]) {
        this.etiquette(x, y, morceau);
        y += Gabarit.hauteur(CORPS_ETIQUETTE, 1.32);
      }
      y = haut + interieurV + hauteurEtiquette + 2 * MM;
      for (const valeur of valeurs) {
        const base = this.base(y, CORPS_PREUVE, 1.28);
        if (typeof valeur === "string") this.poserAjuste(x, base, valeur, this.grasse, CORPS_PREUVE, ENCRE, largeur, -0.02);
        else this.somme(x, base, valeur, CORPS_PREUVE, 0.66, 0.3, largeur);
        y += Gabarit.hauteur(CORPS_PREUVE, 1.28);
      }
      x += largeur + ecart;
    });
    return haut;
  }

  private decouper(etiquette: string, largeur: number): string[] {
    const lignes: string[] = [];
    let courante = "";
    for (const mot of etiquette.toUpperCase().split(/\s+/).filter(Boolean)) {
      const essai = `${courante} ${mot}`.trim();
      if (courante && this.grasse.largeur(essai, CORPS_ETIQUETTE, ECART_ETIQUETTE) > largeur) {
        lignes.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    if (courante) lignes.push(courante);
    return lignes.length ? lignes : [""];
  }

  pied() {
    const haut = HAUTEUR - MARGE_V - Gabarit.hauteur(CORPS_PIED);
    this.page.texte(GAUCHE, this.base(haut, CORPS_PIED), t("Douala, Cameroon", "Douala, Cameroun", this.langue),
      this.normale, CORPS_PIED, ETIQUETTE, SUIVI);
  }

  debordements(tolerance = 0.5): [string, number, number][] {
    return this.page.empreintes.filter(([g, d]) => g < GAUCHE - tolerance || d > DROITE + tolerance)
      .map(([g, d, c]) => [c, g, d]);
  }

  octets() { return documentPdf(this.page); }
}

function poserSymbole(page: Page, x: number, y: number, cote: number, teinte: string) {
  const echelle = cote / GRILLE;
  for (const { trace, decoupes } of BRINS) page.trace(trace, teinte, EPAISSEUR_BRIN, echelle, x, y, decoupes);
}

function poserMarque(page: Page, marque: Marque, x: number, haut: number, hauteur: number) {
  const [vx, vy, vl, vh] = marque.voir;
  const echelle = hauteur / vh;
  page.rectangle(x, haut, vl * echelle, hauteur, marque.fond, (marque.rayon ?? 0) * echelle);
  page.remplir(marque.traces, marque.encre, echelle, x - vx * echelle, haut - vy * echelle);
}

// --- Les deux documents (recu.py) ----------------------------------------------------

export function etiquetteSomme(sens: string | null | undefined, langue: Langue): string {
  if (sens === "entree") return t("Amount received", "Montant reçu", langue);
  if (sens === "sortie") return t("Amount sent", "Montant envoyé", langue);
  return t("Net amount", "Montant net", langue);
}

/** Ce que le reçu d'une opération lit dans la ligne du paiement. */
export type PaiementDuRecu = {
  sens: string | null;
  montant: number;
  nom: string | null;          // le tiers nommé par le SMS
  numero: string | null;
  reference: string | null;
  frais: number | null;
  commission: number | null;
  montantBrut: number | null;
  /** L'heure écrite par le RÉSEAU (à la seconde) — sinon l'heure de réception. */
  heureDuReseau: boolean;
};

export type TitreDuRecu = "transfert" | "depot" | "retrait";

export function titreDuRecu(nature: TitreDuRecu, langue: Langue): string {
  if (nature === "depot") return t("Deposit receipt", "Reçu de dépôt", langue);
  if (nature === "retrait") return t("Withdrawal receipt", "Reçu de retrait", langue);
  return t("Transfer receipt", "Reçu de transfert", langue);
}

function deEtA(p: PaiementDuRecu, compte: [string | null, string | null] | null, de: string, a: string): Partie[] {
  const tiers: [string | null, string | null] = [p.nom, p.numero];
  const nous: [string | null, string | null] = compte && (compte[0] || compte[1]) ? compte : [null, null];
  if (p.sens === "sortie") return [[de, ...nous], [a, ...tiers]];
  if (p.sens === "entree") return [[de, ...tiers], [a, ...nous]];
  return [[de, ...tiers], [a, null, null]];
}

/** Le reçu d'une opération réussie (recu.py, recu_transfert). */
export function recuTransfert(p: PaiementDuRecu, numero: string, quand: Instant, operateur: string,
  titre: string, langue: Langue, compte: [string | null, string | null] | null): { pdf: Uint8Array; debordements: number } {
  const gabarit = new Gabarit(titre, numero, operateur, langue);
  const preuves: Preuve[] = [
    [t("Transaction ID", "ID transaction", langue), [p.reference || "—"], 2.2],
    [t("Date", "Date", langue), [dateEnLettres(quand, langue), heureEnLettres(quand, langue, p.heureDuReseau)], 1.3],
  ];
  if (p.montantBrut != null) preuves.push([t("Transaction amount", "Montant transaction", langue), [p.montantBrut], 1.5]);
  if (p.frais != null) preuves.push([t("Fees", "Frais", langue), [p.frais], 1]);
  if (p.commission != null) preuves.push([t("Commission", "Commission", langue), [p.commission], 1]);
  const haut = gabarit.preuves(preuves);
  gabarit.centre(haut, etiquetteSomme(p.sens, langue), p.montant,
    deEtA(p, compte, t("From", "De", langue), t("To", "À", langue)));
  gabarit.pied();
  return { pdf: gabarit.octets(), debordements: gabarit.debordements().length };
}

/** Le reçu d'une interrogation de solde (recu.py, recu_solde). */
export function recuSolde(solde: number, compte: string, numeroLigne: string, numero: string, quand: Instant,
  operateur: string, langue: Langue): { pdf: Uint8Array; debordements: number } {
  const gabarit = new Gabarit(t("Balance receipt", "Reçu de solde", langue), numero, operateur, langue);
  const haut = gabarit.preuves([
    [t("Operator", "Opérateur", langue), [operateur], 1.4],
    [t("Statement date", "Date du relevé", langue), [dateEnLettres(quand, langue)], 1.4],
    [t("Statement time", "Heure du relevé", langue), [heureEnLettres(quand, langue)], 1],
  ]);
  gabarit.centre(haut, t("Account balance", "Solde du compte", langue), solde,
    [[t("Account", "Compte", langue), compte, numeroLigne]]);
  gabarit.pied();
  return { pdf: gabarit.octets(), debordements: gabarit.debordements().length };
}

/** « MTN » → « MTN MoMo », « Orange » → « Orange Money » (app.py, SERVICES). */
export function serviceDeLOperateur(operateur: string | null | undefined): string {
  const premier = (operateur ?? "").trim().split(/\s+/)[0] ?? "";
  return ({ Orange: "Orange Money", MTN: "MTN MoMo" } as Record<string, string>)[premier] || operateur || "Mobile Money";
}
