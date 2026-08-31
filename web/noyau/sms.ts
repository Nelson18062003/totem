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
 * LE TEXTE DU SMS, TEL QU'IL EST ARRIVÉ. Sans retouche.
 *
 * Le propriétaire reçoit ses messages ENTIERS — y compris les codes qu'ils
 * portent. Ce sont SES SMS, sur SA carte ; un code de connexion reçu par
 * SMS, il doit pouvoir le lire, c'est même à ça qu'il sert. On a un temps
 * masqué ces codes par excès de prudence — c'était une faute : cacher au
 * propriétaire son propre code l'empêchait de s'en servir. On ne touche
 * plus au texte. Un SMS ne se modifie pas.
 *
 * À NE PAS CONFONDRE avec le code SECRET Mobile Money que le propriétaire
 * TAPE pendant une opération USSD : celui-là n'apparaît jamais à l'écran et
 * n'entre pas par cette porte — il n'est jamais reçu par SMS, il vit dans le
 * pavé le temps d'un geste. Rien de tout cela ne change ici.
 */
export const texteSurEcran = (p: Paiement): string => p.smsBrut;

/** Au-delà de cette taille, l'écran replie le message : la preuve reste à un
 *  geste, mais elle ne chasse plus les détails. */
export const LONG_MESSAGE = 380;
