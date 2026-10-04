// CE QU'ON TAPE, OU QU'ON COLLE, DANS UN CHAMP D'OPÉRATION.
//
// Un numéro se recopie d'un SMS, d'un message WhatsApp, d'un carnet : il
// arrive avec « +237 », des espaces, des points, parfois une phrase autour.
// Un montant arrive avec « FCFA », des espaces de milliers, une virgule.
//
// Le champ accepte donc TOUT — on tape, on colle, on corrige, on recopie — et
// l'écran montre ce qui partira réellement au réseau. Le pavé de chiffres
// d'avant n'acceptait que des chiffres, un par un : impossible d'y coller un
// numéro. « C'est trop figé », a dit le propriétaire, et il avait raison.
//
// RIEN N'EST INVENTÉ. Deux numéros dans le même texte, ce n'est pas « le
// premier » : c'est une question, et la réponse est vide. Un chiffre d'une
// autre écriture (« ٥ », « ５ ») n'est pas un 5 : la leçon vient du lecteur de
// SMS, où « 5٥٠٠٠0000 » se lisait 550 000 000. Dans le doute, rien ne part —
// l'écran le dit, et le bouton reste éteint.
//
// Règle pure, sans navigateur : le noyau, partagé par la plateforme et le
// téléphone, qui lisent ainsi un même collage de la même façon.

import { nombre } from "./types";

// Une suite de chiffres, avec ce qui les sépare d'ordinaire dans un numéro
// recopié : espaces (même insécables), points, tirets, parenthèses. JAMAIS
// un retour à la ligne : deux lignes collées sont deux choses, et les
// recoudre fabriquerait un numéro que personne n'a écrit.
const RE_SUITE_NUMERO = /\+?\p{Nd}(?:[\p{Nd} \t.\-()\u00a0\u202f]*\p{Nd})?/gu;
// Un montant : des chiffres, espaces de milliers, points, virgules, apostrophes.
const RE_SUITE_MONTANT = /\p{Nd}(?:[\p{Nd} \t.,'\u00a0\u202f]*\p{Nd})?/gu;

/** Une suite qui porte un chiffre d'une autre écriture : on ne la lit pas. */
const etrangere = (suite: string) => /[^\x00-\x7f]/.test(suite.replace(/[ \t\u00a0\u202f]/g, ""));

/** Le numéro sans indicatif camerounais, en chiffres seuls. */
function sansIndicatif(chiffres: string): string {
  if (chiffres.length === 14 && chiffres.startsWith("00237")) return chiffres.slice(5);
  if (chiffres.length === 12 && chiffres.startsWith("237")) return chiffres.slice(3);
  return chiffres;
}

/**
 * Le numéro lu dans ce qui a été tapé ou collé : des chiffres seuls, sans
 * l'indicatif du Cameroun. Vide quand rien ne ressemble à UN numéro — aucun,
 * plusieurs différents, ou un chiffre qu'on ne sait pas lire.
 *
 * Pendant qu'on tape (« 677 »), rend les chiffres tels quels : l'écran sait
 * qu'un numéro se tient à partir de huit, ce n'est pas à ce lecteur de le
 * dire.
 */
export function numeroSaisi(brut: string): string {
  const suites = (brut ?? "").match(RE_SUITE_NUMERO) ?? [];
  if (suites.some(etrangere)) return "";
  const lus = suites.map((s) => sansIndicatif(s.replace(/\D/g, "")));
  const complets = [...new Set(lus.filter((c) => c.length >= 8 && c.length <= 15))];
  if (complets.length === 1) return complets[0];
  if (complets.length > 1) return "";
  // Rien de complet : une saisie en cours (une seule suite), ou du bruit.
  return lus.length === 1 && lus[0].length <= 15 ? lus[0] : "";
}

/**
 * Le montant, en francs entiers, lu dans ce qui a été tapé ou collé — 0 quand
 * il n'y en a pas UN, clairement.
 *
 * « 5 000 FCFA », « 5.000 », « 5,000 F » font 5 000. Des centimes écrits
 * (« 1 500,00 ») tombent : le franc CFA n'en a pas, et les garder ferait
 * 150 000. Deux nombres dans le même texte (« 5000 vers 677998877 »), c'est
 * une question : 0.
 */
export function montantSaisi(brut: string): number {
  const suites = (brut ?? "").match(RE_SUITE_MONTANT) ?? [];
  if (suites.length !== 1 || etrangere(suites[0])) return 0;
  const sansCentimes = suites[0].replace(/[.,]\d{1,2}$/, "");
  const chiffres = sansCentimes.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  // Neuf chiffres au plus : 999 999 999 F. Au-delà, ce n'est pas un montant
  // qu'on tape, c'est un numéro collé au mauvais endroit.
  if (!chiffres || chiffres.length > 9) return 0;
  return Number(chiffres);
}

// ---------------------------------------------------------------------------
// CE QUE LE CHAMP MONTRE PENDANT QU'ON TAPE.
//
// « 677998877 » et « 250000 » se lisaient mal : neuf chiffres collés, on ne
// voit pas qu'il en manque un, et un zéro de trop sur un montant ne saute pas
// aux yeux — sur de l'argent. Le propriétaire : « ce n'est pas formaté, c'est
// illisible ». Le champ écrit donc le numéro comme on le dit au Cameroun
// (« 677 12 34 56 ») et le montant par milliers (« 250 000 »), À MESURE
// qu'on tape.
//
// Ce n'est qu'une façon de MONTRER : ce qui part au réseau reste
// `numeroSaisi` / `montantSaisi`, qui relisent cette forme sans peine. Et
// rien n'est réécrit quand on ne sait pas lire : une phrase collée, deux
// numéros, une écriture étrangère restent tels quels — l'annonce sous le
// champ dit le doute.
// ---------------------------------------------------------------------------

/** « 677123456 » → « 677 12 34 56 », groupé à mesure : « 6771 » → « 677 1 ». */
function groupesDuNumero(chiffres: string): string {
  const morceaux = [chiffres.slice(0, 3), chiffres.slice(3, 5), chiffres.slice(5, 7), chiffres.slice(7, 9)];
  const debut = morceaux.filter(Boolean).join(" ");
  return chiffres.length > 9 ? `${debut} ${chiffres.slice(9)}` : debut;
}

/**
 * Le texte à montrer dans le champ, mis en forme — ou le texte tel quel quand
 * il ne se lit pas comme UN numéro / UN montant.
 */
export function enFormeDansLeChamp(
  type: "numero" | "montant", brut: string, langue: "fr" | "en",
): string {
  const texte = brut ?? "";
  if (type === "numero") {
    // Seulement ce qui s'écrit dans un numéro. Une lettre, et c'est un
    // collage avec du texte autour : on n'y touche pas.
    if (!/^[\d\s+().\-  ]*$/.test(texte)) return texte;
    const chiffres = texte.replace(/\D/g, "");
    if (!chiffres) return texte.trim() === "+" ? "+" : "";
    // L'indicatif en cours de frappe (« +237 6… ») : on le garde devant,
    // jusqu'à ce que le numéro soit complet — il tombe alors de lui-même.
    const indicatif = chiffres.startsWith("237") && chiffres.length < 12
      && (texte.trim().startsWith("+") || chiffres.length > 9);
    const lu = numeroSaisi(texte);
    if (!indicatif && lu && lu.length <= 9) return groupesDuNumero(lu);
    if (indicatif) {
      const reste = chiffres.slice(3);
      return reste ? `+237 ${groupesDuNumero(reste)}` : "+237";
    }
    return groupesDuNumero(chiffres);
  }
  // Le montant : des chiffres et ce qui les sépare — ou un montant collé avec
  // son unité (« 5 000 FCFA »), qu'on ramène à son nombre.
  // Le séparateur de milliers de l'ÉCRAN s'efface avant de lire : en anglais,
  // c'est la virgule. Sans cela, « 5,000 » dont on efface un zéro devenait
  // « 5,00 », lu comme cinq francs et zéro centime — le montant tombait à 5.
  const sansGroupes = langue === "en"
    ? texte.replace(/,/g, "") : texte.replace(/[\s\u00a0\u202f]/g, "");
  const m = montantSaisi(sansGroupes);
  if (m > 0) return nombre(m, langue);
  return /^[\s\d]*$/.test(texte) ? texte.replace(/\s/g, "") : texte;
}

/**
 * Effacer un ESPACE de la mise en forme ne doit pas être un coup pour rien :
 * la forme le remettrait aussitôt, et la touche « effacer » semblerait ne
 * rien faire. Quand le texte a raccourci sans que les chiffres changent, on
 * efface le chiffre qui précédait.
 */
export function apresEffacement(avant: string, apres: string): string {
  const chiffres = (s: string) => s.replace(/\D/g, "");
  if (apres.length < avant.length && chiffres(apres) === chiffres(avant) && chiffres(apres)) {
    const c = chiffres(apres);
    return c.slice(0, -1);
  }
  return apres;
}
