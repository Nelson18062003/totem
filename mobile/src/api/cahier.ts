// LE CAHIER : ce que le téléphone garde de son dernier passage.
//
// POURQUOI. Ouvrez l'application dans une zone sans réseau, le matin : elle
// ne montrait RIEN. Pas « pas de réseau » — rien du tout, un écran gris puis
// un message d'erreur. Or le téléphone AVAIT les chiffres d'hier soir ; il
// les jetait à chaque fermeture. Un commerçant qui ouvre sa boutique veut
// voir son solde d'hier, même s'il ne peut pas avoir celui de maintenant.
//
// CE QUI EST ÉCRIT ICI, ET CE QUI NE L'EST PAS. Le cahier porte ce que la
// plateforme a renvoyé : les soldes, les SMS, les reçus. C'est-à-dire des
// choses qui appartiennent au propriétaire et qui sont DÉJÀ sur ce
// téléphone — l'écrire ne les expose à personne de plus. Le JETON de
// session, lui, n'entre jamais ici : il vit dans le coffre du système, et
// nulle part ailleurs (voir `coffre.ts`).
//
// LE CAHIER SE FERME AVEC LA SESSION. C'est la règle qui compte. Se
// déconnecter, ou voir sa session expirer, EFFACE le cahier : sans cela, un
// téléphone rendu, revendu ou perdu montrerait les SMS du propriétaire à qui
// l'ouvrirait, sans avoir à entrer le moindre mot de passe.
//
// SUR LE WEB, il n'y a pas de fichier — le cahier passe par le rangement du
// navigateur. On aurait pu s'en dispenser : l'export web n'est qu'un aperçu,
// l'application vit sur Android. Mais alors le cahier ne serait éprouvé
// NULLE PART, puisque c'est sur cet aperçu que tourne toute la batterie —
// et un cahier jamais essayé est un cahier qui ne marche pas.
//
// Rien n'y est plus exposé qu'ailleurs : sur le web, le jeton de session est
// DÉJÀ dans ce même rangement (voir `reglage.ts`), et la règle qui compte
// tient dans les deux cas — le cahier se ferme avec la session.

import { Platform } from "react-native";
import type { Donnees } from "@noyau/types";

const NOM = "cahier-totem.json";

type Page = {
  /** Quand la plateforme a répondu — pour dire « relevé hier à 18 h ». */
  quand: number;
  /** Ce que la page couvre, pour ne pas servir moins que ce qu'on demande. */
  bornes: { sms: number; recus: number; lignes: number };
  donnees: Donnees;
};

/** Le module de fichiers n'existe pas sur le web ; on ne le charge donc que
 *  là où il sert, et une absence n'est jamais une panne. */
const CLE_WEB = "cahier-totem";

async function fichier() {
  if (Platform.OS === "web") return null;
  try {
    const fs = await import("expo-file-system");
    // LE DOSSIER « CACHE », ET C'EST UN CHOIX. Le dossier « document » est
    // sauvegardé par le système vers iCloud ou Google : les SMS du
    // propriétaire partiraient alors dans une sauvegarde en ligne, ce que
    // personne n'a demandé. Le cache ne l'est pas. Le système peut l'effacer
    // quand le disque se remplit — et ce n'est pas grave : on perd un
    // confort, jamais une donnée. Elle est sur la plateforme.
    const dossier = fs.Paths.cache;
    return { fs, chemin: new fs.File(dossier, NOM) };
  } catch {
    return null;
  }
}

export async function lire(): Promise<Page | null> {
  if (Platform.OS === "web") return lireDuNavigateur();
  const f = await fichier();
  if (!f) return null;
  try {
    if (!f.chemin.exists) return null;
    // La lecture ASYNCHRONE, jamais `textSync` : le cahier peut peser deux
    // cent cinquante kilo-octets, et le lire d'un bloc gèlerait l'écran
    // pendant le démarrage — exactement le moment qu'on veut accélérer.
    const brut = await f.chemin.text();
    // Un cahier écrit par une version d'avant peut ne pas avoir la forme
    // attendue. On préfère ne rien montrer qu'afficher n'importe quoi.
    return valide(JSON.parse(brut));
  } catch {
    return null;
  }
}

export async function ecrire(page: Page): Promise<void> {
  if (Platform.OS === "web") return ecrireAuNavigateur(page);
  const f = await fichier();
  if (!f) return;
  try {
    f.chemin.write(JSON.stringify(page));
  } catch {
    /* disque plein, dossier refusé : le cahier est un confort, pas une
       condition. L'application marche sans. */
  }
}

/** À LA DÉCONNEXION, ET À CHAQUE SESSION PERDUE. */
export async function fermer(): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(CLE_WEB); } catch { /* rien à faire */ }
    return;
  }
  const f = await fichier();
  if (!f) return;
  try {
    if (f.chemin.exists) f.chemin.delete();
  } catch {
    /* rien : on réessaiera à la prochaine fermeture */
  }
}

// --- Le même cahier, dans le rangement du navigateur ---------------------

function valide(page: unknown): Page | null {
  const p = page as Page | null;
  if (!p || typeof p.quand !== "number" || !p.donnees || !p.bornes) return null;
  return p;
}

function lireDuNavigateur(): Page | null {
  try {
    const brut = typeof localStorage !== "undefined"
      ? localStorage.getItem(CLE_WEB) : null;
    return brut ? valide(JSON.parse(brut)) : null;
  } catch {
    return null;      // navigation privée, rangement refusé : on fait sans
  }
}

function ecrireAuNavigateur(page: Page): void {
  try {
    localStorage.setItem(CLE_WEB, JSON.stringify(page));
  } catch {
    // Le rangement du navigateur est plafonné (quelques mégaoctets) : une
    // caisse très chargée peut le dépasser. Le cahier est un confort, jamais
    // une condition — on n'en fait pas une panne.
  }
}

export type { Page };
