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
 * POURQUOI L'INSCRIPTION DOIT DIRE CE QUI L'A ARRÊTÉE.
 *
 * Elle rendait `null` dans cinq cas différents, sans jamais dire lequel :
 * émulateur, permission refusée, projet non rattaché, jeton non rendu,
 * réseau coupé. Et l'appel était enveloppé dans un `catch` muet.
 *
 * Résultat : les réglages affichaient « aucun téléphone inscrit » et le
 * propriétaire n'avait AUCUN moyen de savoir par quel bout prendre la
 * panne. « Un refus n'est jamais une panne » — c'était vrai, mais je l'ai
 * rendu invisible, ce qui est pire : on ne peut pas réparer ce qu'on ne
 * voit pas.
 *
 * Chaque sortie porte donc son nom, et l'écran des réglages le montre.
 */
export type EtatSonnerie =
  /** Tout va bien : ce téléphone est inscrit et peut sonner. */
  | "inscrit"
  /** La permission a été refusée. Sur Android, une fois refusée, le système
   *  ne la redemande plus : il faut passer par ses propres réglages. */
  | "refusee"
  /** Un émulateur, ou un appareil sans les services Google. */
  | "simulateur"
  /** Le projet Expo n'est pas rattaché — un défaut de compilation. */
  | "sansProjet"
  /** Le service de notification n'a pas rendu de jeton. */
  | "sansJeton"
  /** La plateforme n'a pas pu enregistrer le jeton (réseau, session). */
  | "echec";

/** Vrai si le système acceptera encore d'AFFICHER la demande de permission.
 *
 *  Sur Android, une permission refusée ne se redemande pas : le système
 *  ignore l'appel, et l'application semble ne rien faire. Il faut alors
 *  envoyer la personne dans les réglages du téléphone — et le lui dire,
 *  plutôt que de lui faire appuyer trois fois sur un bouton inerte. */
/**
 * Le dernier message d'erreur rendu par le système, s'il y en a un.
 *
 * Les cas nommés (`refusee`, `sansProjet`…) disent QUOI. Celui-ci dit
 * pourquoi, avec les mots du système — et ce sont souvent les seuls qui
 * mènent quelque part. « Default FirebaseApp is not initialized » désigne
 * la panne d'un mot ; « sansJeton » ne désigne rien.
 */
let dernierSouci: string | null = null;
export const souciDeLaSonnerie = (): string | null => dernierSouci;

export async function peutEncoreDemander(): Promise<boolean> {
  const { canAskAgain } = await Notifications.getPermissionsAsync();
  return canAskAgain !== false;
}

/**
 * Inscrit CE téléphone auprès de la plateforme, et DIT ce qui s'est passé.
 *
 * Aucun de ces cas n'est une panne de l'application : elle marche
 * exactement pareil sans notification, on la consulte soi-même. Mais
 * chacun demande un geste différent, et c'est pour cela qu'on les
 * distingue.
 */
export async function inscrireLAppareil(): Promise<EtatSonnerie> {
  // Un émulateur n'a pas les services Google : Expo n'a pas de jeton à
  // rendre, et insister ne ferait qu'un message d'erreur au démarrage.
  dernierSouci = null;
  if (!Appareil.isDevice) return "simulateur";

  await declarerLeCanal();

  const { status: dejaDonne } = await Notifications.getPermissionsAsync();
  let accord = dejaDonne;
  if (accord !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    accord = status;
  }
  if (accord !== "granted") return "refusee";

  const projectId = projet();
  if (!projectId) return "sansProjet";

  let jeton: string | undefined;
  try {
    ({ data: jeton } = await Notifications.getExpoPushTokenAsync({ projectId }));
  } catch (e) {
    // ON GARDE LE MESSAGE. C'est ici que se joue la panne la plus opaque :
    // sans Firebase dans le paquet, Android répond « Default FirebaseApp is
    // not initialized » — une phrase qui dit tout. L'avaler, comme je le
    // faisais, laissait « aucun téléphone inscrit » et rien d'autre.
    dernierSouci = e instanceof Error ? e.message : String(e);
    return "sansJeton";
  }
  if (!jeton) return "sansJeton";

  try {
    await enregistrerAppareil(jeton, Platform.OS, Appareil.modelName ?? "");
  } catch (e) {
    dernierSouci = e instanceof Error ? e.message : String(e);
    // Réseau coupé, session expirée : le jeton est bon, c'est le dépôt qui
    // a manqué. On réessaiera — et le propriétaire peut réessayer lui-même.
    return "echec";
  }
  return "inscrit";
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
      // On ne dérange personne à l'ouverture : l'application fonctionne
      // pareil sans notification. Ce qui a manqué se lit dans les
      // réglages, où l'on va justement quand on se pose la question.
    });
  }, [connecte]);
}
