// Le coffre : là où vit le jeton de session.
//
// Sur un téléphone, c'est le coffre du système (Keystore sur Android,
// Keychain sur iOS) — celui qu'ouvre le doigt ou le visage. C'est le seul
// rangement acceptable pour ce qui ouvre l'accès à l'argent.
//
// Sur le WEB, ce coffre n'existe pas : `expo-secure-store` est un module
// natif, sans équivalent dans un navigateur. Or l'aperçu web est précieux
// pendant le développement — il permet de voir les écrans sans compiler.
//
// D'où cette règle, et sa borne :
//
//   — téléphone, toujours : le coffre du système ;
//   — web ET développement seulement : `localStorage`, pour l'aperçu ;
//   — web hors développement : on REFUSE. Plutôt une panne franche qu'une
//     application publiée qui rangerait discrètement un jeton de session
//     dans le navigateur. TOTEM ne se publie pas sur le web : la plateforme
//     y est déjà, avec son cookie httpOnly, qui est le bon outil pour ça.

import { Platform } from "react-native";
import * as Systeme from "expo-secure-store";

const web = Platform.OS === "web";

function refus(): never {
  throw new Error(
    "Aucun coffre sûr sur cette plateforme : l'application du téléphone " +
    "ne se publie pas sur le web.",
  );
}

/** Vrai si l'aperçu web est autorisé à se rabattre sur `localStorage`.
 *
 *  Deux cas, et le second a été ajouté après une mauvaise surprise :
 *
 *    · `__DEV__` — on développe, le serveur Metro tourne ;
 *    · `EXPO_PUBLIC_APERCU=1` — un export web fabriqué EXPRÈS pour être
 *      mesuré par les harnais de vérification.
 *
 *  Pourquoi le second. `expo export` produit du code de production, donc
 *  `__DEV__` y est faux, donc le coffre refusait — et la connexion échouait
 *  en silence. Le harnais des huit formats mesurait alors l'écran de
 *  CONNEXION aux huit tailles, en vert, sans jamais voir un seul écran de
 *  l'application. Un contrôle qui passe sans rien regarder est pire que pas
 *  de contrôle : il rassure.
 *
 *  Le garde-fou reste entier pour ce qui compte : un export web PUBLIÉ n'a
 *  pas cette variable, et refuse toujours de ranger un jeton de session dans
 *  un navigateur. TOTEM ne se publie pas sur le web — la plateforme y est
 *  déjà, avec son cookie httpOnly, qui est le bon outil pour ça. */
const apercu = web
  && (__DEV__ || process.env.EXPO_PUBLIC_APERCU === "1")
  && typeof localStorage !== "undefined";

export async function lire(cle: string): Promise<string | null> {
  if (web) return apercu ? localStorage.getItem(cle) : refus();
  return Systeme.getItemAsync(cle);
}

export async function ecrire(cle: string, valeur: string): Promise<void> {
  if (web) return apercu ? localStorage.setItem(cle, valeur) : refus();
  await Systeme.setItemAsync(cle, valeur);
}

export async function effacer(cle: string): Promise<void> {
  if (web) return apercu ? localStorage.removeItem(cle) : refus();
  await Systeme.deleteItemAsync(cle);
}
