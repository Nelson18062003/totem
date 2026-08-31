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
// CE QU'IL NE FAIT PAS : décider du texte. Le corps de la notification est
// composé à Douala, dans `totem/notification.py` — c'est le message REÇU, en
// aperçu, tel qu'il est arrivé, code compris. Le téléphone ne fait qu'afficher.
//
// Un refus n'est jamais une panne : l'application marche exactement pareil
// sans notification, on la consulte simplement soi-même.

import { useEffect } from "react";
import { AppState, Platform } from "react-native";
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
    // propriétaire lit son SMS depuis le volet, sans déverrouiller — comme
    // WhatsApp ou l'application SMS. S'il veut cacher le contenu sur l'écran
    // verrouillé, c'est SON choix, dans les réglages du téléphone.
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
/** Les cas où RÉESSAYER a un sens. Les autres ne changeront pas tout seuls :
 *  une permission refusée se rend dans les réglages du téléphone, un projet
 *  non rattaché se répare à la compilation, un émulateur reste un émulateur.
 *  Insister ne ferait qu'user la batterie. */
const A_REESSAYER: ReadonlySet<EtatSonnerie> = new Set(["echec", "sansJeton"]);

/** Les attentes entre deux tentatives. Elles s'allongent : un réseau qui
 *  revient revient vite, et s'il ne revient pas, on cesse de le harceler. */
const ATTENTES = [2_000, 5_000, 15_000, 60_000];

/** Une seule inscription à la fois, et pas deux à la suite. Sans ces deux
 *  garde-fous, un retour à l'écran pendant un réessai en lancerait un
 *  second, et l'écoute du jeton pourrait boucler sur elle-même. */
let enCours: Promise<EtatSonnerie> | null = null;
let dernierEtat: EtatSonnerie = "echec";
let derniereTentative = 0;
const REPOS = 20_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Inscrire ce téléphone, et INSISTER tant que cela peut encore marcher.
 *
 * POURQUOI CETTE FONCTION EXISTE. L'inscription ne se tentait qu'UNE fois,
 * à l'ouverture de la session, et abandonnait pour toujours au premier
 * échec. Un réseau absent une seconde à ce moment-là, et le téléphone ne
 * sonnait plus jamais — sans que rien ne le dise, sinon une ligne dans les
 * réglages et un bouton « Inscrire ce téléphone » qu'il fallait deviner.
 *
 * Aucune application ne demande cela. Ce bouton était l'aveu que
 * l'inscription ne se réparait pas toute seule. Elle se répare maintenant.
 */
export function inscrireAvecPatience(force = false): Promise<EtatSonnerie> {
  // Une tentative déjà en route se REJOINT — on n'invente pas un échec.
  // L'écran des réglages, ouvert pendant l'inscription du démarrage,
  // affichait « l'inscription a échoué » pour une inscription qui allait
  // réussir trois secondes plus tard, et rien ne corrigeait ce mensonge.
  if (enCours) return enCours;
  // Dans la période de repos, on rend le DERNIER état connu : « echec »
  // vingt secondes après une réussite était l'autre moitié du mensonge.
  if (!force && Date.now() - derniereTentative < REPOS) {
    return Promise.resolve(dernierEtat);
  }
  derniereTentative = Date.now();
  enCours = (async () => {
    try {
      let etat = await inscrireLAppareil();
      for (const attente of ATTENTES) {
        if (!A_REESSAYER.has(etat)) break;
        await dormir(attente);
        etat = await inscrireLAppareil();
      }
      dernierEtat = etat;
      return etat;
    } catch {
      dernierEtat = "echec";
      return "echec";
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

/**
 * Le branchement, posé une fois la session ouverte.
 *
 * L'inscription attend la connexion à dessein : la route qui l'accueille est
 * derrière le verrou, et un appareil qui n'a pas prouvé qu'il connaît le mot
 * de passe n'a rien à faire dans la liste des téléphones à faire sonner.
 *
 * TROIS DÉCLENCHEURS, parce qu'un seul ne suffisait pas :
 *
 *   1. L'OUVERTURE DE SESSION. C'était le seul, et c'était trop peu.
 *   2. LE RETOUR À L'ÉCRAN. Le réseau manquait peut-être à l'ouverture ; il
 *      est là maintenant. C'est le rattrapage le plus fréquent.
 *   3. LE CHANGEMENT DE JETON. Android en change tout seul — restauration
 *      d'une sauvegarde, mise à jour du service, effacement des données de
 *      Google Play. L'ancien jeton devient muet SANS PRÉVENIR : le robot
 *      continue d'écrire à une adresse que plus personne ne relève. C'est
 *      la panne la plus traître, parce que tout a marché la veille.
 *
 * Le service ne rend pas le jeton d'Expo dans cet événement, mais le jeton
 * natif : on relance donc l'inscription complète, hors du fil de l'écoute
 * pour ne pas la rappeler depuis elle-même.
 */
export function useSonnerie(connecte: boolean | null): void {
  useEffect(() => {
    if (!connecte) return;

    void inscrireAvecPatience(true);

    const auRetour = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void inscrireAvecPatience();
    });

    const auJeton = Notifications.addPushTokenListener(() => {
      setTimeout(() => { void inscrireAvecPatience(true); }, 0);
    });

    return () => {
      auRetour.remove();
      auJeton.remove();
    };
  }, [connecte]);
}
