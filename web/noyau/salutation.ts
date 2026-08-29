// Comment saluer la personne connectée.
//
// Le prénom était écrit en dur dans les textes (« Hello, Nelson »). Tant que
// TOTEM n'appartenait qu'à une personne, cela passait. Dès qu'un deuxième
// compte existe, tout le monde est accueilli sous le prénom du premier — et
// sur une capture d'écran de fiche publique, c'est le prénom du propriétaire
// qui part faire le tour du monde.
//
// On le tire donc du COURRIEL du compte connecté. Pas d'un champ « prénom »
// à saisir : une case de plus à remplir pour une salutation, et une donnée
// personnelle de plus à garder, alors que le courriel est déjà là.

import { textesAccueil } from "./textes/accueil";
import type { Langue } from "./langue";

/**
 * « nelson.mbarga@exemple.cm » → « Nelson ».
 *
 * On prend ce qui précède l'arobase, on coupe au premier séparateur, et on
 * met une majuscule. Un courriel qui ne donne rien de présentable
 * (« contact@ », « a1b2c3@ ») rend une chaîne vide : mieux vaut « Bonjour »
 * tout court qu'un « Bonjour, A1b2c3 ».
 */
export function prenomDuCourriel(courriel: string | null | undefined): string {
  const local = (courriel ?? "").split("@")[0];
  const brut = local.split(/[.\-_+0-9]/)[0];
  if (brut.length < 2) return "";
  return brut.charAt(0).toUpperCase() + brut.slice(1).toLowerCase();
}

/** La salutation complète, nom ou pas. */
export function salutation(langue: Langue, courriel?: string | null): string {
  const t = textesAccueil[langue];
  const nom = prenomDuCourriel(courriel);
  return nom ? t.bonjour.replace("{nom}", nom) : t.bonjourSeul;
}
