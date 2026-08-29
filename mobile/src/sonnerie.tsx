// Faire sonner le téléphone quand un paiement arrive.
//
// CE QUE CE FICHIER FAIT, ET DANS QUEL ORDRE
//
//   1. Il déclare le CANAL Android « paiements ». Un canal, c'est le réglage
//      que le propriétaire voit dans les paramètres du téléphone : la
//      sonnerie, la vibration, l'affichage sur l'écran verrouillé. Sans
//      canal déclaré, Android range la notification dans un canal « Divers »
//      muet, et le paiement arrive sans bruit.
//   2. Il DEMANDE la permission. Depuis Android 13, une application ne peut
//      plus notifier sans l'accord explicite du propriétaire.
//   3. Il récupère le JETON de cet appareil auprès d'Expo, et l'inscrit
//      auprès de la plateforme.
//
// CE QU'IL NE FAIT PAS : décider du texte. Ce que la notification a le droit
// de dire est tranché à Douala, dans `totem/notification.py` — c'est là que
// vit la règle « un code ne sort jamais ». Le téléphone ne fait qu'afficher.
//
// Un refus n'est jamais une panne : l'application marche exactement pareil
// sans notification, on la consulte simplement soi-même.

import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Appareil from "expo-device";
import Constants from "expo-constants";

import { enregistrerAppareil } from "@/api/guichet";
import { couleurs } from "@/theme/jetons";

// Application ouverte au moment où la notification arrive : on la montre
// quand même. Un encaissement pendant qu'on regarde l'écran reste une
// nouvelle — et sans cela, elle serait avalée en silence.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Le canal Android — celui que `totem/notification.py` vise par son nom. */
const CANAL = "paiements";

async function declarerLeCanal(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: "Encaissements",
    description: "Les mouvements d’argent sur les caisses.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    // La petite lumière des téléphones qui en ont une : latérite,
    // comme la marque.
    lightColor: couleurs.laterite,
    // L'écran verrouillé montre le message. C'est tout l'intérêt : le
    // propriétaire voit l'encaissement sans déverrouiller. Ce qui s'y
    // affiche a déjà été filtré à Douala — jamais un code, jamais un
    // montant inventé.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** L'identifiant du projet Expo : c'est lui qui adresse le jeton. */
function projet(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * Inscrit CE téléphone auprès de la plateforme. Rend le jeton obtenu, ou
 * `null` si l'appareil ne peut pas être notifié — et ce n'est pas une
 * erreur : un émulateur, un refus de permission, un projet pas encore
 * rattaché sont tous des cas normaux.
 */
export async function inscrireLAppareil(): Promise<string | null> {
  // Un émulateur n'a pas de services Google : Expo n'a pas de jeton à
  // rendre, et insister ne ferait qu'un message d'erreur au démarrage.
  if (!Appareil.isDevice) return null;

  await declarerLeCanal();

  const { status: dejaDonne } = await Notifications.getPermissionsAsync();
  let accord = dejaDonne;
  if (accord !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    accord = status;
  }
  if (accord !== "granted") return null;

  const projectId = projet();
  if (!projectId) return null;

  const { data: jeton } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!jeton) return null;

  await enregistrerAppareil(jeton, Platform.OS, Appareil.modelName ?? "");
  return jeton;
}

/**
 * Le branchement, posé une fois la session ouverte.
 *
 * L'inscription attend la connexion à dessein : la route qui l'accueille est
 * derrière le verrou, et un appareil qui n'a pas prouvé qu'il connaît le mot
 * de passe n'a rien à faire dans la liste des téléphones à faire sonner.
 *
 * On repasse à CHAQUE ouverture de session : un jeton Expo peut changer
 * (réinstallation, restauration de sauvegarde), et l'inscription rafraîchit
 * aussi la date de dernière vue.
 */
export function useSonnerie(connecte: boolean | null): void {
  useEffect(() => {
    if (!connecte) return;
    inscrireLAppareil().catch(() => {
      // Notifications refusées, réseau coupé, guichet muet : l'application
      // fonctionne pareil. On ne dérange personne avec ça.
    });
  }, [connecte]);
}
