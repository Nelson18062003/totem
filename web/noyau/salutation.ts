// Comment saluer la personne connectée.
//
// Le prénom était écrit en dur dans les textes (« Hello, Nelson »). Tant que
// TOTEM n'appartenait qu'à une personne, cela passait. Dès qu'un deuxième
// compte existe, tout le monde est accueilli sous le prénom du premier — et
// sur une capture d'écran de fiche publique, c'est le prénom du propriétaire
// qui part faire le tour du monde.
//
// On prend le PRÉNOM que la personne a saisi en créant son compte. Les
// comptes d'avant l'inscription publique n'en ont pas : pour eux seuls, on
// le tire du COURRIEL.

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

/**
 * La salutation complète, nom ou pas.
 *
 * LE PRÉNOM SAISI D'ABORD. L'inscription publique le demande : le deviner
 * du courriel alors qu'on l'a, c'était saluer « nom+test1@gmail.com » d'un
 * « Bonjour, Nom », et « kamdemjp@yahoo.fr » d'un « Bonjour, Kamdemjp ». Le
 * courriel ne sert plus qu'aux comptes d'avant, qui n'ont pas de prénom.
 */
export function salutation(
  langue: Langue, courriel?: string | null, prenom?: string | null,
): string {
  const t = textesAccueil[langue];
  const saisi = (prenom ?? "").trim().split(/\s+/)[0] ?? "";
  const nom = saisi || prenomDuCourriel(courriel);
  return nom ? t.bonjour.replace("{nom}", nom) : t.bonjourSeul;
}
