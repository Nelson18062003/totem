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

import {
  enregistrerAppareil, ErreurGuichet, langueDeLEcran, versErreurGuichet,
} from "@/api/guichet";
import { couleurs } from "@/theme/jetons";
import { textesConnexion } from "@noyau/textes/connexion";

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
  /** Le compte connecté n'est pas celui du propriétaire : la plateforme
   *  refuse (403), à dessein — une notification porte le SMS reçu, de
   *  TOUTES les cartes. Ce n'est pas une panne, et réessayer n'y changera
   *  rien. */
  | "reservee"
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
 * UN DÉLAI PAR ÉTAPE — car chacune pouvait ne JAMAIS rendre la main.
 *
 * Le jeton d'Expo se demande par un `fetch` sans délai ; sur iPhone, le
 * jeton d'Apple attend un rappel qui peut ne pas venir hors ligne ; l'envoi
 * à la plateforme subissait le corps qui ne finit pas (voir `guichet.ts`).
 * Une seule étape muette, et l'inscription restait « en cours » pour
 * toujours : chaque nouvel essai la REJOIGNAIT, la carte des Réglages
 * tournait sans fin, et un téléphone dont le jeton avait changé ne se
 * réinscrivait plus jamais.
 *
 * Chaque étape court donc contre sa propre échéance. Une étape qui la
 * dépasse est une panne qui se DIT — « le téléphone n'a pas répondu à
 * temps » — et l'inscription réessaie comme pour un réseau coupé.
 *
 * La demande de permission a le délai le plus long : c'est une PERSONNE qui
 * lit le message du système, puis répond. On ne l'abandonne pas pendant
 * qu'elle lit.
 */
const DELAI_SYSTEME_MS = 10_000;      // le canal, la permission déjà donnée
const DELAI_ACCORD_MS = 120_000;      // la demande de permission, à une personne
const DELAI_JETON_MS = 30_000;        // le service de notification
const DELAI_ENVOI_MS = 40_000;        // la plateforme (le guichet borne déjà à 30 s)

/** Une étape du téléphone qui n'a pas rendu la main à temps. */
class EtapeMuette extends Error {}

function avant<T>(travail: Promise<T>, ms: number): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const echeance = new Promise<never>((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new EtapeMuette()), ms);
  });
  // Perdante, l'étape peut encore échouer plus tard : personne ne l'écoute.
  travail.catch(() => {});
  return Promise.race([travail, echeance]).finally(() => clearTimeout(minuteur));
}

/** La phrase d'une étape muette, dans la langue de l'écran — jamais le
 *  message brut du système, qui n'existe pas ici : il n'a rien dit. */
async function phraseDuSilence(): Promise<string> {
  return textesConnexion[await langueDeLEcran()].telephoneSansReponse;
}

/**
 * LE SERVICE DE JETON N'A PAS PU ÊTRE JOINT — et il le dit en anglais
 * technique.
 *
 * Hors ligne, expo-notifications rejette avec le code
 * « ERR_NOTIFICATIONS_NETWORK_ERROR » et ce message : « Error encountered
 * while fetching Expo token: TypeError: fetch failed: The Internet
 * connection appears to be offline.. ». Les Réglages le montraient mot pour
 * mot sous l'état du téléphone, et le gardaient jusqu'au verdict suivant.
 * Sur Android, le service de Google dit « SERVICE_NOT_AVAILABLE » pour la
 * même raison. C'est le cas le plus courant — l'application qui s'ouvre
 * sans réseau — et il mérite une phrase, pas un message d'erreur.
 *
 * Tout le reste GARDE les mots du système : « Default FirebaseApp is not
 * initialized », ou le droit Apple qui manque au paquet, désignent la
 * panne d'un mot, et cette panne ne se répare pas en réessayant.
 */
function serviceInjoignable(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "ERR_NOTIFICATIONS_NETWORK_ERROR") return true;
  const m = e instanceof Error ? e.message : String(e);
  return /fetch failed|network request failed|appears to be offline|SERVICE_NOT_AVAILABLE/i.test(m);
}

/** Ce qu'une tentative a donné : son état, et ce qui l'a arrêtée. */
type Issue = { etat: EtatSonnerie; souci: string | null };

async function essayer(): Promise<Issue> {
  // Un émulateur n'a pas les services Google : Expo n'a pas de jeton à
  // rendre, et insister ne ferait qu'un message d'erreur au démarrage.
  if (!Appareil.isDevice) return { etat: "simulateur", souci: null };

  let accord: string;
  try {
    await avant(declarerLeCanal(), DELAI_SYSTEME_MS);
    ({ status: accord } = await avant(Notifications.getPermissionsAsync(), DELAI_SYSTEME_MS));
    if (accord !== "granted") {
      ({ status: accord } = await avant(Notifications.requestPermissionsAsync(), DELAI_ACCORD_MS));
    }
  } catch (e) {
    if (e instanceof EtapeMuette) return { etat: "echec", souci: await phraseDuSilence() };
    throw e;
  }
  if (accord !== "granted") return { etat: "refusee", souci: null };

  const projectId = projet();
  if (!projectId) return { etat: "sansProjet", souci: null };

  let jeton: string | undefined;
  try {
    ({ data: jeton } = await avant(
      Notifications.getExpoPushTokenAsync({ projectId }), DELAI_JETON_MS));
  } catch (e) {
    if (e instanceof EtapeMuette) return { etat: "sansJeton", souci: await phraseDuSilence() };
    // Le réseau qui manque se dit dans la langue de l'écran.
    if (serviceInjoignable(e)) {
      return {
        etat: "sansJeton",
        souci: textesConnexion[await langueDeLEcran()].serviceSonnerieInjoignable,
      };
    }
    // ON GARDE LE MESSAGE. C'est ici que se joue la panne la plus opaque :
    // sans Firebase dans le paquet, Android répond « Default FirebaseApp is
    // not initialized » — une phrase qui dit tout. L'avaler, comme je le
    // faisais, laissait « aucun téléphone inscrit » et rien d'autre.
    return { etat: "sansJeton", souci: e instanceof Error ? e.message : String(e) };
  }
  if (!jeton) return { etat: "sansJeton", souci: null };

  try {
    await avant(
      enregistrerAppareil(jeton, Platform.OS, Appareil.modelName ?? ""), DELAI_ENVOI_MS);
  } catch (e) {
    if (e instanceof ErreurGuichet && e.statut === 403) return { etat: "reservee", souci: null };
    // Réseau coupé, session expirée : le jeton est bon, c'est le dépôt qui
    // a manqué. On réessaiera — et le propriétaire peut réessayer lui-même.
    // Le guichet parle déjà la langue de l'écran ; une étape muette aussi,
    // et ce qui ne viendrait pas du guichet passe par SA porte de sortie :
    // jamais le message brut d'un `fetch`.
    const langue = await langueDeLEcran();
    const souci = e instanceof EtapeMuette
      ? textesConnexion[langue].reseauEnPanne
      : versErreurGuichet(e, langue).message;
    return { etat: "echec", souci };
  }
  return { etat: "inscrit", souci: null };
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
  dernierSouci = null;
  const { etat, souci } = await essayer();
  dernierSouci = souci;
  return etat;
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

/** Une seule inscription QUI PARLE à la fois, et pas deux à la suite. Sans
 *  ces deux garde-fous, un retour à l'écran pendant un réessai en lancerait
 *  un second, et l'écoute du jeton pourrait boucler sur elle-même. (Une
 *  tentative remplacée peut finir son essai dans son coin : elle se tait.) */
type Tentative = {
  depuis: number;
  promesse: Promise<EtatSonnerie>;
  /** Vrai pendant l'attente entre deux essais ; faux pendant un essai. */
  dort: boolean;
  /** Le début de l'essai en cours. */
  essaiDepuis: number;
  /** Vrai dès qu'une tentative plus neuve parle à sa place. */
  remplacee: boolean;
  rendre: (r: EtatSonnerie | Promise<EtatSonnerie>) => void;
};
let enCours: Tentative | null = null;
let dernierEtat: EtatSonnerie = "echec";
let derniereTentative = 0;
const REPOS = 20_000;

/** Au-delà, une tentative qui DORT entre deux réessais (2, 5, 15, puis
 *  60 s) ne se rejoint plus : on en lance une neuve. La rejoindre, c'était
 *  faire tourner la carte des Réglages quatre-vingts secondes, et
 *  « Réessayer » ne faisait que rejoindre la même attente. */
const TROP_LONG = 30_000;

/** Un essai qui TRAVAILLE depuis plus longtemps que la somme de ses
 *  échéances a laissé une étape lui échapper : on ne le rejoint plus. Cela
 *  ne devrait jamais arriver — c'est le filet sous le filet, et il ne sert
 *  qu'à ce qui n'est pas pressé : une PERSONNE qui appuie n'attend pas un
 *  essai en cours (voir `Demandeur`). Écrit comme une somme pour qu'il
 *  reste AU-DELÀ des échéances si l'une d'elles change. */
const PLAFOND_ESSAI =
  2 * DELAI_SYSTEME_MS + DELAI_ACCORD_MS + DELAI_JETON_MS + DELAI_ENVOI_MS + 30_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * QUI DEMANDE — et donc ce qu'on a le droit de faire de l'essai en route.
 *
 *   « personne »   quelqu'un a APPUYÉ (« Réessayer », « Inscrire ce
 *                  téléphone »). Il veut une réponse MAINTENANT : un essai
 *                  neuf part tout de suite, même si un autre travaille.
 *   « branchement » l'ouverture de session, ou l'écoute du jeton. Forcé (le
 *                  repos ne l'arrête pas), mais il REJOINT l'essai qui
 *                  travaille.
 *   « fond »       un retour à l'écran, l'ouverture des Réglages : rien ne
 *                  presse, il rejoint ce qui est en route.
 *
 * POURQUOI UNE PERSONNE NE REJOINT PLUS L'ESSAI QUI TRAVAILLE. Elle le
 * rejoignait, et cela s'est mesuré : une connexion à demi ouverte, le
 * service de jeton qui se tait, chaque essai qui tombe à son échéance de
 * trente secondes ; le réseau revient, on appuie sur « Réessayer » — et le
 * bouton reste occupé QUATRE-VINGT-SEPT secondes, le temps que l'essai muet
 * tombe, puis que la série de réessais aille au bout. Un essai parti quand
 * le réseau manquait n'a plus rien à dire : il attend une réponse qui ne
 * viendra pas.
 *
 * POURQUOI L'ÉCOUTE DU JETON, ELLE, REJOINT TOUJOURS. Obtenir le jeton fait
 * annoncer le jeton (expo-notifications émet « onDevicePushToken » à CHAQUE
 * obtention, sur iPhone comme sur Android), et l'annonce force une
 * inscription. Si elle remplaçait l'essai qui travaille, le neuf obtiendrait
 * le jeton, qui en forcerait un troisième, et ainsi sans fin — 1 201
 * demandes de jeton en deux minutes, mesuré. Une personne, elle, appuie à
 * la vitesse d'une personne, et le bouton reste occupé jusqu'à sa réponse.
 */
type Demandeur = "personne" | "branchement" | "fond";

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
 *
 * `force` : une PERSONNE a appuyé — l'essai neuf part tout de suite, même
 * si un autre est en route (voir `Demandeur`). Sans `force`, c'est le fond :
 * on rejoint ce qui est en route, et l'on rend le dernier état connu
 * pendant le repos.
 */
export function inscrireAvecPatience(force = false): Promise<EtatSonnerie> {
  return inscrire(force ? "personne" : "fond");
}

function inscrire(qui: Demandeur): Promise<EtatSonnerie> {
  const t = enCours;
  if (t) {
    // Une tentative qui TRAVAILLE se REJOINT — on n'invente pas un échec.
    // L'écran des réglages, ouvert pendant l'inscription du démarrage,
    // affichait « l'inscription a échoué » pour une inscription qui allait
    // réussir trois secondes plus tard, et rien ne corrigeait ce mensonge.
    //
    // Le branchement la rejoint même FORCÉ, et c'est ce qui empêche la
    // boucle de l'écoute du jeton. Chaque étape a son échéance : l'essai
    // rendra la main. Seule une personne qui appuie ne l'attend pas.
    const coincee = Date.now() - t.essaiDepuis > PLAFOND_ESSAI;
    if (!t.dort && !coincee && qui !== "personne") return t.promesse;
    // Une tentative qui DORT entre deux essais se rejoint si elle est
    // récente et que personne n'insiste.
    if (t.dort && qui === "fond" && Date.now() - t.depuis < TROP_LONG) return t.promesse;
    // Sinon — un appui, ou une attente ancienne — on ne l'attend plus.
    // Une neuve part MAINTENANT, et ceux qui attendaient l'ancienne
    // reçoivent la réponse de la neuve : personne ne reste sur une attente
    // que plus rien ne fera aboutir. L'ancienne, si elle travaillait, finit
    // dans son coin et se tait (`remplacee`) : son échec tardif n'écrase
    // pas la réponse de la neuve.
    t.remplacee = true;
    const neuve = lancer();
    t.rendre(neuve);
    return neuve;
  }
  // Dans la période de repos, on rend le DERNIER état connu : « echec »
  // vingt secondes après une réussite était l'autre moitié du mensonge.
  if (qui === "fond" && Date.now() - derniereTentative < REPOS) {
    return Promise.resolve(dernierEtat);
  }
  return lancer();
}

function lancer(): Promise<EtatSonnerie> {
  derniereTentative = Date.now();
  let rendre: Tentative["rendre"] = () => {};
  const promesse = new Promise<EtatSonnerie>((r) => { rendre = r; });
  const t: Tentative = {
    depuis: Date.now(), essaiDepuis: Date.now(), dort: false,
    promesse, remplacee: false, rendre,
  };
  enCours = t;
  void (async () => {
    let issue: Issue;
    try {
      issue = await essayer();
      for (const attente of ATTENTES) {
        if (t.remplacee || !A_REESSAYER.has(issue.etat)) break;
        t.dort = true;
        await dormir(attente);
        t.dort = false;
        if (t.remplacee) break;
        t.essaiDepuis = Date.now();
        issue = await essayer();
      }
    } catch {
      issue = { etat: "echec", souci: null };
    }
    // Remplacée : la neuve a déjà répondu à sa place, et c'est elle qui
    // dira l'état et le souci. Celle-ci se tait.
    if (t.remplacee) return;
    enCours = null;
    dernierEtat = issue.etat;
    dernierSouci = issue.souci;
    rendre(issue.etat);
  })();
  return promesse;
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

    void inscrire("branchement");

    const auRetour = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void inscrire("fond");
    });

    const auJeton = Notifications.addPushTokenListener(() => {
      setTimeout(() => { void inscrire("branchement"); }, 0);
    });

    return () => {
      auRetour.remove();
      auJeton.remove();
    };
  }, [connecte]);
}
