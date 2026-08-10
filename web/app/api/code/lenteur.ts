// La porte est-elle lente en ce moment, pour cette adresse ?
//
// POURQUOI CETTE QUESTION SE POSE AVANT LA COMPARAISON, ET PAS APRÈS
// `verifierCode` cherche la ligne PAR l'empreinte du code : un code faux ne
// trouve rien, et repart sans même avoir regardé le ralentissement. Un code
// juste, lui, trouve sa ligne et se fait refuser par la lenteur. Les deux
// chemins n'ont donc ni la même longueur ni le même nombre d'allers-retours
// vers la base — et quelqu'un qui chronomètre les réponses pendant une
// période de lenteur apprendrait, sans jamais entrer, lequel de ses codes
// était le bon.
//
// D'où ce contrôle, posé AVANT : pendant une période de lenteur, la route
// répond la même chose à tout le monde, sans avoir rien comparé du tout.

import { lire } from "@/lib/base";
import { adresseNormalisee, type LigneCode } from "@/lib/code-entree";

/**
 * Combien de temps il reste à attendre, en millisecondes. Zéro le reste du
 * temps — c'est-à-dire presque toujours.
 *
 * On interroge par ADRESSE, comme le compteur d'essais : sinon il suffirait
 * de redemander un code neuf pour repartir de zéro, et le ralentissement ne
 * ralentirait rien.
 */
export async function attenteDeLaPorte(courriel: string): Promise<number> {
  const lignes = await lire<LigneCode>(
    `codes_entree?courriel=eq.${encodeURIComponent(adresseNormalisee(courriel))}`
    + `&utilise_le=is.null&lent_jusqu_a=not.is.null`
    + `&order=lent_jusqu_a.desc&limit=1&select=lent_jusqu_a`);
  const jusqua = lignes[0]?.lent_jusqu_a;
  if (!jusqua) return 0;
  return Math.max(0, new Date(jusqua).getTime() - Date.now());
}
