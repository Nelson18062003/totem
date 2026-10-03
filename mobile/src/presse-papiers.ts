// LE PRESSE-PAPIERS — un seul endroit pour copier.
//
// Celui du cœur de React Native : il est déjà dans l'application installée,
// donc copier ne demande aucune brique neuve, et arrive par une simple mise
// à jour à distance. React Native l'annonce « extrait du cœur » ; le jour où
// il disparaîtra, c'est ce fichier seul qu'on changera.
//
// COPIER NE FAIT JAMAIS ÉCHOUER UN ÉCRAN. Ce que `true` veut dire, et rien de
// plus : l'appel est parti sans être refusé. Sur iPhone et Android, le
// système ne répond rien — il n'y a pas d'accusé de réception à attendre ;
// seul le navigateur (react-native-web) peut refuser, et il le dit en rendant
// `false`. `false` (texte vide, presse-papiers absent ou refusé) : l'écran
// ne dit pas « Copié ». Le texte reste sélectionnable à l'appui long.

import { Clipboard } from "react-native";

export function copierTexte(texte: string): boolean {
  if (!texte) return false;
  try {
    // Les types de React Native disent `void` ; react-native-web rend un
    // booléen. On n'écoute que le refus explicite.
    return (Clipboard.setString(texte) as unknown) !== false;
  } catch {
    return false;
  }
}
