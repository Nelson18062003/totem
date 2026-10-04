// --- Un vrai fichier PDF, fabriqué ici même -----------------------------------
//
// Aucune bibliothèque, aucun serveur : le document est assemblé octet par
// octet dans le navigateur, puis remis au propriétaire comme un fichier. Il
// ouvre donc partout, se joint à un message, s'imprime — et rien ne quitte
// l'appareil.
//
// On n'embarque aucune police : les quatorze polices standard du format PDF
// (ici Helvetica) sont lues par tous les lecteurs. L'encodage WinAnsi couvre
// le latin-1, donc les accents français.

import { formaterNumero } from "@noyau/numero";

export type CoordonneesRib = {
  nom: string;
  numero: string;
  operateur: string;   // « MTN », « Orange »
  service: string;     // « MTN Mobile Money »
  libelle: string;     // « MTN ·3501 »
  titre: string;       // « Mes coordonnées »
  etiquetteNom: string;
  etiquetteNumero: string;
  etiquetteReseau: string;
  pied: string;
};

// A5 portrait : un document, pas une affiche — il tient sur un écran de
// téléphone sans qu'on ait à zoomer.
const LARGEUR = 420;
const HAUTEUR = 595;

export const ENCRE = "0.141 0.118 0.090";      // #241E17
export const GRIS = "0.545 0.506 0.459";       // #8B8175
export const TRAIT = "0.890 0.863 0.820";      // #E3DCD1
export const LATERITE = "0.698 0.227 0.055";   // #B23A0E

// « La Tresse » — les deux brins, tels que brand/generer.py fait autorité.
export const BRIN_A =
  "M16 4.4C17.54 5.302 22.6 6.462 22.6 8.267C22.6 10.071 19.08 10.329 16 12.133" +
  "C12.92 13.938 9.4 14.196 9.4 16C9.4 17.804 12.92 18.062 16 19.867" +
  "C19.08 21.671 22.6 21.929 22.6 23.733C22.6 25.538 17.54 26.698 16 27.6";
export const BRIN_B =
  "M16 4.4C14.46 5.302 9.4 6.462 9.4 8.267C9.4 10.071 12.92 10.329 16 12.133" +
  "C19.08 13.938 22.6 14.196 22.6 16C22.6 17.804 19.08 18.062 16 19.867" +
  "C12.92 21.671 9.4 21.929 9.4 23.733C9.4 25.538 14.46 26.698 16 27.6";

// Ce que WinAnsiEncoding range AU-DELÀ du latin-1, aux places 0x80–0x9F :
// l'apostrophe typographique du dictionnaire (« d’ouverture »), les tirets,
// les points de suspension. Sans cette table, chacun devenait « ? » —
// « Solde d?ouverture » en tête du relevé. Le signe moins et les espaces
// fines se ramènent à leurs cousins ordinaires.
const WINANSI: Record<string, string> = {
  "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94",
  "•": "\x95", "–": "\x96", "—": "\x97", "…": "\x85",
  "€": "\x80", "−": "-", " ": " ", " ": " ",
};

/** Le texte réduit à ce que WinAnsiEncoding sait montrer. */
export function latin1(texte: string): string {
  let sortie = "";
  for (const c of texte) {
    const p = c.codePointAt(0) ?? 63;
    sortie += p <= 0xff ? String.fromCharCode(p) : WINANSI[c] ?? "?";
  }
  return sortie;
}

/** Une chaîne PDF : les parenthèses et la barre oblique s'échappent. */
export function chaine(texte: string): string {
  return latin1(texte).replace(/[\\()]/g, (c) => "\\" + c);
}

export function texte(x: number, y: number, corps: number, police: "F1" | "F2",
               couleur: string, contenu: string): string {
  return `BT ${couleur} rg /${police} ${corps} Tf 1 0 0 1 ${x} ${y} Tm ` +
         `(${chaine(contenu)}) Tj ET\n`;
}

/** Un brin de la tresse, retourné : le SVG descend, le PDF monte. */
export function brin(d: string, x: number, y: number, k: number): string {
  const nombres = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const px = (v: number) => (x + v * k).toFixed(2);
  const py = (v: number) => (y + (32 - v) * k).toFixed(2);
  let sortie = `${px(nombres[0])} ${py(nombres[1])} m\n`;
  for (let i = 2; i + 5 < nombres.length; i += 6) {
    sortie += `${px(nombres[i])} ${py(nombres[i + 1])} ` +
              `${px(nombres[i + 2])} ${py(nombres[i + 3])} ` +
              `${px(nombres[i + 4])} ${py(nombres[i + 5])} c\n`;
  }
  return sortie;
}

/** Une ellipse pleine — quatre courbes, la constante de Kappa. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  const [ax, ay] = [rx * k, ry * k];
  return `${cx + rx} ${cy} m\n` +
    `${cx + rx} ${cy + ay} ${cx + ax} ${cy + ry} ${cx} ${cy + ry} c\n` +
    `${cx - ax} ${cy + ry} ${cx - rx} ${cy + ay} ${cx - rx} ${cy} c\n` +
    `${cx - rx} ${cy - ay} ${cx - ax} ${cy - ry} ${cx} ${cy - ry} c\n` +
    `${cx + ax} ${cy - ry} ${cx + rx} ${cy - ay} ${cx + rx} ${cy} c\n`;
}

/**
 * La marque du réseau, dessinée au trait — jamais une image téléchargée.
 * Orange : le carré et le mot en blanc. MTN : l'ovale jaune et le sigle.
 * Un opérateur sans marque garde son libellé écrit, comme à l'écran.
 */
export function marqueReseau(operateur: string, libelle: string,
                      x: number, y: number): string {
  const nom = (operateur || "").trim().toLowerCase();
  if (nom.startsWith("orange")) {
    return `1 0.475 0 rg ${x} ${y} 34 34 re f\n` +
           texte(x + 4, y + 6, 7.5, "F2", "1 1 1", "orange");
  }
  if (nom.startsWith("mtn")) {
    return `1 0.796 0 rg ` + ellipse(x + 24, y + 17, 24, 15) + "f\n" +
           texte(x + 10, y + 12, 12, "F2", "0 0 0", "MTN");
  }
  return `${TRAIT} RG 0.8 w ${x} ${y} 52 34 re S\n` +
         texte(x + 5, y + 13, 8, "F2", ENCRE, libelle.slice(0, 12));
}

/** Le document : en-tête signé, les trois lignes, le pied d'explication. */
function flux(c: CoordonneesRib): string {
  const marge = 40;
  let f = "";

  // Le cadre du document — une pièce, pas une note.
  f += `${ENCRE} RG 1.4 w ${marge - 14} 60 ${LARGEUR - 2 * (marge - 14)} ` +
       `${HAUTEUR - 120} re S\n`;

  // L'en-tête : La Tresse et le mot, puis la règle qui les souligne.
  let haut = HAUTEUR - 108;
  f += `${LATERITE} RG 4.4 w 1 J 1 j\n`;
  f += brin(BRIN_A, marge, haut, 1.35) + "S\n";
  f += brin(BRIN_B, marge, haut, 1.35) + "S\n";
  f += texte(marge + 52, haut + 16, 17, "F2", ENCRE, "TOTEM");
  haut -= 16;
  f += `${ENCRE} RG 1.4 w ${marge} ${haut} m ${LARGEUR - marge} ${haut} l S\n`;

  // Le titre du document.
  haut -= 34;
  f += texte(marge, haut, 10.5, "F2", GRIS, c.titre.toUpperCase());

  // Les trois lignes, chacune sur son filet.
  const lignes: [string, string][] = [];
  if (c.nom.trim()) lignes.push([c.etiquetteNom, c.nom]);
  // Le numéro se met en forme ICI, pas chez l'appelant. Le web le formatait
  // avant d'appeler, la route du téléphone non : le même document disait
  // « 677 12 34 56 » d'un côté et « 677123456 » de l'autre. La mise en forme
  // ne change pas un numéro déjà formaté — on peut donc l'appliquer deux fois.
  lignes.push([c.etiquetteNumero, formaterNumero(c.numero) || "—"]);
  lignes.push([c.etiquetteReseau, c.service]);

  haut -= 30;
  for (const [etiquette, valeur] of lignes) {
    f += texte(marge, haut, 8.5, "F2", GRIS, etiquette.toUpperCase());
    f += texte(marge, haut - 22, 17, "F2", ENCRE, valeur);
    haut -= 36;
    f += `${TRAIT} RG 0.8 w ${marge} ${haut} m ${LARGEUR - marge} ${haut} l S\n`;
    haut -= 26;
  }

  // La marque du réseau, posée sous les lignes — elle dit la caisse.
  haut -= 6;
  f += marqueReseau(c.operateur, c.libelle, marge, haut - 20);

  // Le pied : à quoi sert ce papier.
  f += texte(marge, 84, 8.5, "F1", GRIS, c.pied);
  return f;
}

/** Le fichier complet, prêt à être remis au propriétaire. */
export function pdfCoordonnees(c: CoordonneesRib): Uint8Array<ArrayBuffer> {
  return assemblerPdf([{ largeur: LARGEUR, hauteur: HAUTEUR, contenu: flux(c) }]);
}

/**
 * L'assemblage d'un PDF de N pages — la fiche des coordonnées en a une, le
 * relevé de compte autant qu'il en faut. Deux polices standard (Helvetica,
 * Helvetica-Bold), aucune image, aucune compression : le document se lit
 * avec un éditeur de texte, et un harnais peut y chercher chaque référence.
 */
export function assemblerPdf(
  pages: { largeur: number; hauteur: number; contenu: string }[],
): Uint8Array<ArrayBuffer> {
  // 1 catalogue, 2 arbre des pages, 3 et 4 les polices ; puis, par page,
  // la page et son contenu.
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ");
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((p, i) => {
    objets.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.largeur} ${p.hauteur}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
    // La longueur se compte en OCTETS du latin-1 : un caractère, un octet.
    const contenu = latin1(p.contenu);
    objets.push(`<< /Length ${contenu.length} >>\nstream\n${contenu}endstream`);
  });

  let fichier = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((corps, i) => {
    decalages.push(fichier.length);
    fichier += `${i + 1} 0 obj\n${corps}\nendobj\n`;
  });

  const depart = fichier.length;
  fichier += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) {
    fichier += String(d).padStart(10, "0") + " 00000 n \n";
  }
  fichier += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\n` +
             `startxref\n${depart}\n%%EOF\n`;

  // Chaque caractère vaut un octet : le document est en latin-1 de bout en
  // bout, donc les décalages comptés plus haut sont exacts. Le tampon est
  // alloué explicitement — un Blob n'accepte pas une vue sur mémoire
  // partagée, et c'est ce que le type large laisserait passer.
  const octets = new Uint8Array(new ArrayBuffer(fichier.length));
  for (let i = 0; i < fichier.length; i++) octets[i] = fichier.charCodeAt(i) & 0xff;
  return octets;
}
