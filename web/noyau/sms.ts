// Ce qu'un SMS est, une fois lu — les règles, pas l'écran.
//
// Quatre décisions vivent ici parce que la plateforme et le téléphone doivent
// les prendre IDENTIQUEMENT. La dernière est une défense : si les deux
// écrans n'étaient pas d'accord, un code à usage unique s'afficherait en
// clair sur l'un des deux.

import type { Categorie, Paiement } from "./types";
import { NATURES } from "./natures";

/** L'icône de chaque catégorie — le NOM seulement ; chaque monde la dessine
 *  avec ses outils, à partir de `@noyau/icones`. */
export const ICONE_CATEGORIE: Record<Categorie, string> = {
  encaissement: "ArrowDown",
  envoi: "ArrowUp",
  transfert: "Transfer",
  depot: "Plus",
  retrait: "Bank",
  solde: "Chart",
  echec: "Close",
  code: "Lock",
  publicite: "Megaphone",
  illisible: "Mail",
  message: "Bubble",
  inconnu: "Mail",
};

/**
 * La catégorie EFFECTIVE : la nature choisie par le propriétaire l'emporte
 * sur celle devinée par le terminal. C'est lui qui sait ce qu'était
 * l'opération ; le robot, lui, n'a que le texte du SMS.
 */
export const categorieDe = (p: Paiement): Categorie => p.nature ?? p.categorie;

// Un SMS d'argent : il porte un montant, ou sa catégorie est un mouvement.
const ARGENT: Categorie[] = [...NATURES, "encaissement", "envoi"];

/**
 * Ce SMS a-t-il droit à un reçu ? Jamais une publicité, jamais un code : un
 * reçu atteste d'un mouvement d'argent, et rien d'autre.
 */
export const estArgent = (p: Paiement): boolean =>
  p.montant != null || ARGENT.includes(categorieDe(p));

/**
 * LE TEXTE TEL QU'ON OSE L'AFFICHER.
 *
 * Le robot masque déjà les codes à usage unique avant de les transmettre.
 * L'écran ne lui fait pourtant pas aveuglément confiance : une ligne écrite
 * AVANT le masquage dort peut-être encore en base, et elle remonterait en
 * clair. On remasque donc à l'affichage — c'est une seconde ligne de
 * défense, pas une redite.
 *
 * Et c'est la catégorie DEVINÉE qui déclenche le masque, pas la nature
 * choisie : une nature posée à la main ne doit jamais déshabiller un code.
 * Une défense ne se retire pas d'un geste d'interface.
 */
export const texteSurEcran = (p: Paiement): string =>
  p.categorie === "code" || categorieDe(p) === "code"
    ? p.smsBrut.replace(/\d(?:[\s.-]?\d){2,9}/g, "••••••")
    : p.smsBrut;

/** Au-delà de cette taille, l'écran replie le message : la preuve reste à un
 *  geste, mais elle ne chasse plus les détails. */
export const LONG_MESSAGE = 380;
