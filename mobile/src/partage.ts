// PARTAGER UN DOCUMENT — un reçu, une fiche de coordonnées, un bilan — comme
// un FICHIER, pas comme une page web.
//
// Avant, chaque bouton ouvrait le lien signé dans le navigateur du système.
// Sur Android, on tombait sur une page, le PDF se « téléchargeait » à moitié,
// et le bouton « partager » du navigateur envoyait… le LIEN : le client
// recevait sur WhatsApp une adresse « …/api/recu/… » au lieu de son reçu, et
// le lien expirait au bout de dix minutes. « Un bourbier qui n'a pas de nom »,
// a dit le propriétaire, et il avait raison.
//
// Maintenant : le fichier est TÉLÉCHARGÉ dans le téléphone, sous un vrai nom
// (« Recu-TM-2026-1003-1193.pdf »), puis la feuille de partage du système
// s'ouvre sur ce fichier. WhatsApp reçoit le PDF lui-même ; « Enregistrer »,
// « Drive », « Ouvrir avec » sont dans la même feuille.
//
// LA BRIQUE DE PARTAGE EST FACULTATIVE, ET C'EST VOULU. `expo-sharing` est
// une brique native : une application compilée avant elle ne l'a pas. Le
// paquet officiel l'EXIGE à son chargement (`requireNativeModule`) — importé
// tel quel, il ferait planter au démarrage chaque téléphone qui reçoit cette
// mise à jour à distance sans la brique, et une application qui plante au
// démarrage ne peut plus recevoir la correction (voir « runtimeVersion »
// dans app.json). On la CHERCHE donc sans l'exiger :
//   — présente : le fichier part par la feuille de partage (iPhone, Android) ;
//   — absente, sur iPhone : la feuille de partage de React Native sait
//     envoyer un fichier, le résultat est le même ;
//   — absente, sur Android : l'ancien chemin, le navigateur — jusqu'à la
//     prochaine compilation, qui apporte la brique.

import { Platform, Share } from "react-native";
import { requireOptionalNativeModule } from "expo";
import * as Navigateur from "expo-web-browser";

type ModulePartage = {
  shareAsync(url: string, options: {
    mimeType?: string; UTI?: string; dialogTitle?: string;
  }): Promise<void>;
};

const TYPES = {
  pdf: { mimeType: "application/pdf", UTI: "com.adobe.pdf" },
  csv: { mimeType: "text/csv", UTI: "public.comma-separated-values-text" },
} as const;

/** La brique de partage, si l'application installée la porte. */
function briqueDePartage(): ModulePartage | null {
  if (Platform.OS === "web") return null;
  try {
    return requireOptionalNativeModule<ModulePartage>("ExpoSharing");
  } catch {
    return null;
  }
}

/** Un nom de fichier sans rien qui gêne un téléphone ou WhatsApp. */
export function nomDeFichier(base: string, extension: "pdf" | "csv"): string {
  const propre = base.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 80);
  return `${propre || "TOTEM"}.${extension}`;
}

/** Ce que le partage a donné : `fichier` (le vrai fichier est parti),
 *  `navigateur` (l'ancien chemin, faute de brique), ou une erreur levée. */
export type Partage = "fichier" | "navigateur";

/**
 * Télécharge le document au bout d'un lien signé, puis ouvre la feuille de
 * partage du téléphone SUR LE FICHIER.
 *
 * Le contenu est vérifié avant de partir : un lien expiré rend une page
 * d'erreur, pas un PDF, et l'envoyer à un client sous le nom « Recu-….pdf »
 * serait pire que de ne rien envoyer — l'écran dit alors que ça n'a pas
 * marché, au lieu de partager un fichier illisible.
 */
export async function partagerDocument(
  url: string, nom: string, type: "pdf" | "csv", titre: string,
): Promise<Partage> {
  // Le navigateur de l'ordinateur sait déjà télécharger : rien à changer.
  if (Platform.OS === "web") {
    await Navigateur.openBrowserAsync(url);
    return "navigateur";
  }
  const brique = briqueDePartage();
  if (!brique && Platform.OS === "android") {
    await Navigateur.openBrowserAsync(url);
    return "navigateur";
  }

  const fs = await import("expo-file-system");
  const fichier = new fs.File(fs.Paths.cache, nom);
  if (fichier.exists) fichier.delete();
  const recu = await fs.File.downloadFileAsync(url, fichier);
  // Les premiers octets, lus un à un : pas de TextDecoder, que tous les
  // moteurs JavaScript des téléphones n'ont pas.
  const debut = String.fromCharCode(...Array.from(recu.bytesSync().slice(0, 5)));
  if (type === "pdf" ? debut !== "%PDF-" : debut.trimStart().startsWith("<")) {
    recu.delete();
    throw new Error("document illisible");
  }

  if (brique) {
    await brique.shareAsync(recu.uri, { ...TYPES[type], dialogTitle: titre });
  } else {
    await Share.share({ url: recu.uri, title: titre });
  }
  return "fichier";
}
