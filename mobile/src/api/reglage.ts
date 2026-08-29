// Les réglages ordinaires — ce qui n'est PAS un secret.
//
// À ne pas confondre avec `coffre.ts`, qui garde le jeton de session : celui-
// là ouvre l'accès à l'argent, il ne vit que dans le coffre du système, et
// l'application REFUSE de le ranger ailleurs.
//
// Ici, c'est autre chose : l'adresse de la plateforme, par exemple. Une
// adresse web n'est pas un secret — elle est publique par nature, elle est
// écrite dans la barre du navigateur de la plateforme, et la mettre au coffre
// serait se mentir sur ce qu'on protège. Elle a donc son rangement à elle.
//
// Ce n'est pas qu'une question de vocabulaire : le coffre refuse d'écrire
// hors du téléphone, ce qui est juste pour un jeton et absurde pour une
// adresse — l'aperçu web ne pouvait alors plus la corriger, alors que c'est
// précisément là qu'on s'en aperçoit.

import { Platform } from "react-native";
import * as Systeme from "expo-secure-store";

const web = Platform.OS === "web";

export async function lire(cle: string): Promise<string | null> {
  if (web) {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(cle) : null;
    } catch {
      return null;    // navigateur privé, stockage refusé : on fait sans
    }
  }
  return Systeme.getItemAsync(cle).catch(() => null);
}

export async function ecrire(cle: string, valeur: string): Promise<void> {
  if (web) {
    try {
      localStorage.setItem(cle, valeur);
    } catch {
      /* rien à faire : le réglage vaudra pour cette session seulement */
    }
    return;
  }
  // Sur le téléphone, on réutilise le rangement du système : c'est celui
  // qu'on a déjà, il survit aux mises à jour, et y poser un réglage public ne
  // coûte rien. Ce qui compte est l'inverse — qu'un SECRET ne se retrouve
  // jamais ailleurs que là.
  await Systeme.setItemAsync(cle, valeur).catch(() => {});
}
