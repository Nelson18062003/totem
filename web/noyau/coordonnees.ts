// Les coordonnées d'une carte — le « RIB » de la SIM — mises en mots.
//
// Ce que la fiche COPIE et ce qu'elle PARTAGE s'écrivait deux fois : dans
// `web/app/coordonnees.tsx` et dans `mobile/src/coordonnees.tsx`, à
// l'identique, avec le même `service()` recopié. Deux copies, deux occasions
// de diverger ; la plateforme et le téléphone lisent maintenant ici.

import { formaterNumero } from "./numero";
import { numeroSaisi } from "./saisie";

/** Le nom commercial du service — ce qu'on écrit sur la ligne « réseau ».
 *  Un opérateur inconnu arrive de la plateforme sous la forme « ? » : il
 *  partait tel quel dans le partage et dans le PDF, « Réseau : ? ». */
export function serviceMobileMoney(operateur: string): string {
  if (operateur === "MTN") return "MTN Mobile Money";
  if (operateur === "Orange") return "Orange Money";
  return operateur && operateur !== "?" ? operateur : "Mobile Money";
}

/**
 * Ce que le bouton « Copier » emporte : le NOM et le NUMÉRO, chacun sur sa
 * ligne, sans étiquette — prêt à coller dans un message.
 *
 * Pas le réseau, et c'est le propriétaire qui l'a demandé : copier servait à
 * coller « qui » et « quel numéro », et la troisième ligne était à effacer à
 * chaque fois. Le réseau reste dans le PARTAGE et dans le PDF, qui partent
 * tels quels chez quelqu'un qui ne connaît pas encore la carte.
 *
 * Sans nom inscrit, il reste le numéro seul : on n'invente rien, et l'on ne
 * colle pas une ligne vide en tête de message.
 */
export function texteACopier(nom: string, numero: string): string {
  return [nom.trim(), formaterNumero(numero)].filter(Boolean).join("\n");
}

/**
 * Ce que le rond du NUMÉRO copie : les chiffres seuls, sans l'indicatif —
 * « 677998877 ». Il sert à COLLER dans un champ (« numéro du bénéficiaire »
 * d'une application d'opérateur), et un champ qui attend neuf chiffres
 * refuse « +237 677 99 88 77 » ou le coupe : il fallait retoucher. Le grand
 * « Copier », lui, part dans un MESSAGE, où le numéro se lit par tranches.
 */
export function numeroACopier(numero: string): string {
  return numeroSaisi(numero) || (numero || "").replace(/\D/g, "");
}

/** Ce que « Copier » emporte VRAIMENT, pour que le bouton le dise juste :
 *  une carte sans nom inscrit ne copie que son numéro, et une aide vocale
 *  qui annoncerait « le nom et le numéro » mentirait. `null` : rien à
 *  copier — le bouton ne s'affiche pas plutôt que de copier du vide. */
export function ceQueCopierEmporte(
  nom: string, numero: string,
): "nom-et-numero" | "nom" | "numero" | null {
  const n = Boolean(nom.trim()), c = Boolean(formaterNumero(numero));
  if (n && c) return "nom-et-numero";
  if (n) return "nom";
  if (c) return "numero";
  return null;
}

/** Ce que le bouton « Partager » envoie : le nom, le numéro, le réseau. */
export function texteAPartager(nom: string, numero: string, operateur: string): string {
  return [nom.trim(), formaterNumero(numero), serviceMobileMoney(operateur)]
    .filter(Boolean).join("\n");
}
