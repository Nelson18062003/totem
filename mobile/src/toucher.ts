// CE QUE LE DOIGT SENT.
//
// POURQUOI CE FICHIER EXISTE. `verifier-la-reponse` garde une promesse
// depuis longtemps : un bouton doit RÉPONDRE, et il le mesure en comptant
// les pixels qui bougent sous le doigt. C'est la moitié visible de la
// promesse. L'autre moitié n'était mesurée par personne, ni tenue nulle
// part : sur un téléphone, un bouton répond aussi en se faisant SENTIR.
//
// Un geste qui déplace de l'argent et ne fait rien sentir laisse un doute
// d'une demi-seconde — « est-ce que ça a pris ? » — et c'est exactement le
// doute qui fait appuyer une seconde fois. Le verrou de `geste.ts` pare ce
// second appui ; autant ne pas le provoquer.
//
// QUATRE TOUCHERS, ET PAS UN DE PLUS. Une application qui vibre à tout
// devient une application qu'on met en silencieux, et on perd alors les
// quatre.
//
//   depart   — un geste d'argent part. Léger : c'est un accusé de réception,
//              pas un événement.
//   choix    — on a changé d'onglet, de carte, de filtre. Le plus discret.
//   reussite — la demande est passée.
//   echec    — elle n'est pas passée.
//
// CE QUI NE VIBRE PAS, ET C'EST VOULU :
//
//   — le SECOND appui refusé par le verrou. Il ne fait RIEN, dit `geste.ts`,
//     et « rien » doit se sentir comme rien. Une vibration lui répondrait
//     qu'il a fait quelque chose, ce qui est faux.
//   — les chiffres du code secret. Le pavé n'affiche pas le code ; le faire
//     vibrer à chaque touche le donnerait à qui regarde la main.
//
// UN TOUCHER NE FAIT JAMAIS ÉCHOUER UN GESTE. Chaque appel est avalé : un
// téléphone sans moteur haptique, un émulateur, un navigateur — aucun de ces
// cas n'est une panne, et aucun ne doit remonter jusqu'à l'argent.

import { Platform } from "react-native";
import * as Haptique from "expo-haptics";

// Le navigateur n'a rien à faire vibrer, et les harnais tournent dessus :
// autant ne pas leur faire traverser une bibliothèque native pour rien.
const MUET = Platform.OS === "web";

function sans(f: () => Promise<unknown>): void {
  if (MUET) return;
  // Volontairement sans `await` : le doigt ne doit pas attendre le moteur,
  // et l'argent encore moins.
  void f().catch(() => {});
}

/** Un geste d'argent part. */
export const toucherDepart = (): void =>
  sans(() => Haptique.impactAsync(Haptique.ImpactFeedbackStyle.Light));

/** On a changé d'onglet, de carte, de filtre. */
export const toucherChoix = (): void =>
  sans(() => Haptique.selectionAsync());

/** La demande est passée. */
export const toucherReussite = (): void =>
  sans(() => Haptique.notificationAsync(Haptique.NotificationFeedbackType.Success));

/** Elle n'est pas passée. */
export const toucherEchec = (): void =>
  sans(() => Haptique.notificationAsync(Haptique.NotificationFeedbackType.Error));
