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
 * UN MOUVEMENT D'ARGENT : ce que l'accueil montre sous « Derniers
 * mouvements ». De l'argent entré ou sorti — pas une consultation de solde,
 * pas un échec, pas un code, pas une publicité. Les ILLISIBLES en sont : ils
 * parlent d'argent, et cacher un paiement mal lu serait pire que de le
 * montrer sans montant.
 */
const MOUVEMENTS: Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait", "illisible",
];
export const estMouvement = (p: Pick<Paiement, "nature" | "categorie">): boolean =>
  MOUVEMENTS.includes(p.nature ?? p.categorie);

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

/**
 * LE REÇU EST-IL ATTENDU ? Un SMS d'argent tout juste arrivé reçoit son
 * reçu tout seul : le boîtier le dépose sur la plateforme dans les secondes
 * qui suivent. Pendant cette fenêtre, la fiche dit « Reçu en préparation… »
 * et guette — elle ne propose PAS « Établir le reçu ».
 *
 * Avant, elle le proposait : le téléphone apprenait l'arrivée du SMS, jamais
 * celle du reçu, et l'on refaisait un document qui était déjà en route — ou
 * déjà dans Telegram. Passé la fenêtre sans reçu, la fiche revient à
 * « Établir le reçu » : le boîtier était peut-être hors ligne, ou ce message
 * ne donne pas droit à un reçu ; c'est au geste de le demander.
 *
 * Une minute et demie : le dépôt prend quelques secondes, et la fenêtre
 * couvre un aller-retour réseau lent, une reprise après un accroc. Une
 * heure réseau un peu en avance sur le téléphone (jusqu'à une minute) reste
 * « récente » ; au-delà, l'heure est suspecte et l'on n'attend rien.
 */
export const FENETRE_DU_RECU_MS = 90_000;

export function recuAttendu(
  p: Paiement,
  maintenant: number,
): boolean {
  if (p.recu || p.sourceId == null || !estArgent(p)) return false;
  const arrive = Date.parse(p.recuLe);
  if (!Number.isFinite(arrive)) return false;
  const age = maintenant - arrive;
  return age > -60_000 && age < FENETRE_DU_RECU_MS;
}

/**
 * CE QUE LE BOÎTIER A FAIT D'UNE DEMANDE DE REÇU — lu dans sa phrase.
 *
 * « Déjà à jour » se décide CHEZ LE BOÎTIER : il refait le document en
 * mémoire et compare son empreinte à celle qu'il a déposée. Les écrans le
 * déduisaient de l'égalité des numéros — or un document refait (l'identité
 * inscrite aux Réglages, une autre langue) GARDE son numéro, et l'on lisait
 * « Ce reçu est déjà à jour ✓ » au-dessus de l'ancien PDF.
 *
 *  - « inchange » : rien n'a changé, le document en place est le bon ;
 *  - « pret »     : le document vient d'être déposé, il s'ouvre maintenant ;
 *  - « en_route » : il n'est PAS encore sur la plateforme (dépôt raté, ou
 *    boîtier d'avant cette règle) — on guette, on n'ouvre pas de lien vide.
 */
export type EtatReponseRecu = "inchange" | "pret" | "en_route";

export function etatDeLaReponseRecu(resultat: string | null | undefined): EtatReponseRecu {
  const r = resultat ?? "";
  if (/déjà à jour|already up to date/i.test(r)) return "inchange";
  if (/\bprêt\b|is ready/i.test(r)) return "pret";
  return "en_route";
}
