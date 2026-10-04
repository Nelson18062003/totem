// LE CAHIER SUR LE COMPTOIR — le chargement des données, pour tous les écrans.
//
// Un seul endroit qui sait : demander au guichet, dire qu'on charge, dire
// qu'on a échoué, et — le point important — reconnaître une session perdue
// pour renvoyer vers le verrou au lieu de boucler sur des refus.
//
// POURQUOI CE FICHIER A CHANGÉ DE FORME.
//
// C'était un simple `useDonnees` : chaque écran l'appelait, et chaque appel
// gardait SON état. Quatre onglets, c'était donc quatre employés qui ne se
// parlent pas. On ouvre l'Accueil : il court chercher le solde MTN. On
// touche « Comptes » : il RECOURT chercher le MÊME chiffre, vieux de dix
// secondes. Sept écrans appelaient ce hook.
//
// Il y a maintenant UN cahier, tenu ici, que tous les écrans lisent. Le
// premier qui va au guichet y écrit ; les autres lisent. Et le cahier est
// recopié SUR LE TÉLÉPHONE (voir `api/cahier.ts`) : le matin, sans réseau,
// l'application montre les chiffres d'hier soir en disant qu'ils datent,
// au lieu d'un écran gris.
//
// CHAQUE ÉCRAN NE DEMANDE PAS LA MÊME CHOSE. L'analyse veut mille SMS ; les
// Actions n'en veulent aucun. Le cahier porte donc TOUJOURS le plus grand
// besoin des écrans montés : servir plus que demandé est sans danger,
// servir MOINS ne l'est pas — l'analyse calculerait un mois faux sur un mois
// tronqué, sans le dire.
//
// LA ROUE N'APPARTIENT PLUS AU CAHIER — ET C'EST TOUTE L'HISTOIRE.
//
// Le propriétaire, sur ses deux téléphones : « un truc de chargement en haut
// qui a calé ; tout part vers le bas ; il faut redémarrer l'application ».
// Une première correction avait séparé deux drapeaux et passé ses harnais au
// vert — et la roue restait plantée. Une enquête (six enquêteurs, chacun
// contredit) a trouvé pourquoi, et ce n'était pas UNE cause :
//
//   — La roue de « tirer pour rafraîchir » suivait le CHARGEMENT, pas le
//     doigt. Ouverture, premier passage sur un onglet, SMS non lu ouvert,
//     opération finie : elle tournait sans qu'on ait tiré. Or sur iPhone,
//     pour montrer cette roue sans geste, React Native DESCEND lui-même le
//     contenu de sa hauteur (`setContentOffset`) — « tout part vers le bas ».
//     Et le drapeau étant partagé, les quatre onglets tournaient ensemble.
//   — Un appel pouvait ne JAMAIS finir : le fetch d'Expo rend la main aux
//     en-têtes, et une coupure pendant le corps laissait la lecture en
//     suspens pour toujours. Le compteur restait à un, la roue aussi, sur
//     des chiffres pourtant à jour. Seul un redémarrage la retirait.
//   — Un écran non couvert dont le chargement « discret » échouait restait
//     en formes grises et en roue POUR TOUJOURS : personne ne réessayait.
//
// Aucun harnais ne pouvait le voir : la roue est un objet natif, et l'export
// web n'en dessine pas. Une correction de drapeau ne pouvait donc pas tenir.
// Celle-ci ne corrige pas le drapeau : elle le SUPPRIME. La roue vit dans
// `useRoue`, sur l'écran qu'on tire, levée par le doigt et baissée à la fin
// de SA relecture, vingt secondes au plus quoi qu'il arrive. Aucun
// chargement ne peut plus la faire apparaître — il n'y a plus de fil entre
// les deux. `verifier-la-roue` l'exige, et l'ancien cahier y échoue.
//
// CE QUE LE CAHIER DIT À CHAQUE ÉCRAN, à la place :
//
//   `donnees`  ce qu'il a et qui SUFFIT à cet écran — sinon rien ;
//   `attente`  cet écran n'a encore rien et aucun échec n'est connu : des
//              formes grises, jamais une roue ;
//   `erreur`   cet écran n'a rien ET le dernier essai a échoué : un message
//              et « Réessayer ». Il ne s'efface qu'au SUCCÈS — un nouvel
//              essai qui part ne le fait plus disparaître sous les yeux.
//
// SE TENIR À JOUR TOUT SEUL — SANS POULS.
//
// Un pouls qui interrogeait la plateforme toutes les quinze secondes a été
// retiré en août, et le propriétaire avait raison : « ce n'est pas comme ça
// qu'on construit une application ». Le temps réel, c'est la NOTIFICATION.
// Ce qui manquait, c'était de la prendre au sérieux :
//
//   1. LA NOTIFICATION arrive souvent AVANT que le SMS soit en base : on
//      relit tout de suite, puis une seconde fois cinq secondes plus tard si
//      rien n'avait changé. Une fois. C'est un accusé, pas une boucle.
//   2. LE RETOUR DEPUIS L'ARRIÈRE-PLAN — et seulement de là. Tirer le centre
//      de notifications d'un iPhone fait passer l'application par
//      « inactive » : cela ne doit rien recharger.
//   3. LE RETOUR SUR UN ONGLET dont les chiffres ont plus de trente secondes.
//   4. APRÈS UN GESTE (une opération finie), trois relectures espacées pour
//      attraper le SMS de l'opérateur, qui arrive quelques secondes après.
//   5. APRÈS UN ÉCHEC, de nouveaux essais espacés (3 s, 10 s, 30 s, puis
//      chaque minute) jusqu'au premier succès. Ce n'est pas un pouls : cela
//      s'arrête dès que ça marche.
//
// Tout cela est SILENCIEUX : aucune roue, aucune forme grise sur un écran
// qui a déjà ses chiffres. Les chiffres changent, c'est tout.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  useState, type ReactElement, type ReactNode,
} from "react";
import {
  AppState, RefreshControl, View, type AppStateStatus, type RefreshControlProps,
} from "react-native";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useIsFocused } from "expo-router";
import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import * as Cahier from "@/api/cahier";
import { useLangue } from "@/langue";
import { textesConnexion } from "@noyau/textes/connexion";
import { useSession } from "@/session";
import { couleurs } from "@/theme/jetons";
import type { Donnees } from "@noyau/types";
import type { Langue } from "@noyau/langue";

/** Ce qu'un écran demande. Les valeurs par défaut sont celles de la
 *  plateforme (`web/app/api/donnees/route.ts`) : un écran qui ne précise
 *  rien reçoit deux cents SMS et deux cents reçus. */
export type Bornes = { sms?: number; recus?: number; lignes?: number };

type BornesPleines = { sms: number; recus: number; lignes: number };

const DEFAUT: BornesPleines = { sms: 200, recus: 200, lignes: 200 };

// --- Les délais, tous ici --------------------------------------------------

/** Après un échec, quand réessayer. Puis chaque minute, jusqu'au succès. */
const REESSAIS_MS = [3_000, 10_000, 30_000, 60_000];
/** La seconde lecture après une notification, si la première n'a rien vu. */
const RELECTURE_NOTIFICATION_MS = 5_000;
/** Après une opération : le SMS de l'opérateur arrive quelques secondes après. */
const SUIVIS_OPERATION_MS = [5_000, 15_000, 30_000];
/** Le terminal dit avoir des SMS pas encore transmis : on repasse, deux fois. */
const SUIVIS_EN_ATTENTE_MS = [20_000, 60_000];
/** Des chiffres relus du téléphone, et la plateforme qui ne répond pas :
 *  au bout de ce délai, on dit qu'ils datent — pas avant. Annoncer « Pas de
 *  réseau » pendant la première seconde d'un téléphone bien connecté, c'est
 *  ce qui faisait sauter l'écran à chaque ouverture. */
const LENT_MS = 8_000;
/** Revenir sur un onglet dont les chiffres ont plus que cela : on relit. */
const FRAIS_MS = 30_000;
/** Ce qui a été servi il y a moins que cela se redemande avec le reste :
 *  quitter l'Analyse ne doit pas jeter ses mille SMS à la notification
 *  suivante, pour les retélécharger deux minutes plus tard. */
const RECENT_MS = 5 * 60_000;
/** La roue tirée ne tourne jamais plus que cela, quoi que fasse le réseau. */
const TIRER_MAX_MS = 20_000;
/** L'horloge de l'écran : les « aujourd'hui », « hier », « il y a 3 min »
 *  se refont sans requête. */
const HORLOGE_MS = 60_000;

function pleines(b?: Bornes): BornesPleines {
  const sms = b?.sms ?? DEFAUT.sms;
  return {
    sms,
    recus: b?.recus ?? DEFAUT.recus,
    // Qui n'a rien précisé veut tout ce qu'il a demandé.
    lignes: b?.lignes ?? sms,
  };
}

/** Ce qui est au cahier suffit-il à qui demande ceci ? Servir PLUS que
 *  demandé est sans danger. Servir MOINS ne l'est pas : l'analyse
 *  calculerait un mois faux sur un mois tronqué, sans le dire. */
function couvre(servies: BornesPleines, demandees: BornesPleines): boolean {
  return servies.sms >= demandees.sms
      && servies.recus >= demandees.recus
      && servies.lignes >= demandees.lignes;
}

/** Le plus grand besoin des écrans montés. Trois nombres, et il faut les
 *  trois : les Comptes comptent sur mille SMS sans en vouloir un seul, la
 *  boîte de réception en veut deux cents. */
function reunir(toutes: BornesPleines[]): BornesPleines {
  if (!toutes.length) return DEFAUT;
  return {
    sms: Math.max(...toutes.map((b) => b.sms)),
    recus: Math.max(...toutes.map((b) => b.recus)),
    lignes: Math.max(...toutes.map((b) => b.lignes)),
  };
}

const memesBornes = (a: BornesPleines, b: BornesPleines) =>
  a.sms === b.sms && a.recus === b.recus && a.lignes === b.lignes;

/** Ce qu'une réponse dit du MONDE, sans ce qu'elle dit d'elle-même :
 *  l'heure du serveur, l'âge du signe de vie et sa phrase changent à chaque
 *  appel. Les comparer faisait de deux réponses identiques deux réponses
 *  différentes — toujours —, et la promesse ci-dessous ne tenait jamais. */
function contenu(d: Donnees): string {
  const { serveurA: _ignore, terminal, ...reste } = d;
  const t = terminal ? { ...terminal, vuIlYa: undefined, majTexte: undefined } : terminal;
  try { return JSON.stringify({ ...reste, terminal: t }); } catch { return String(Math.random()); }
}

/** Deux réponses qui disent la même chose du monde gardent LES MÊMES
 *  tableaux : sans cela, chaque notification refaisait le rendu de deux
 *  cents lignes pour rien — et la liste des SMS se recoupait sous le doigt.
 *  Le terminal, lui, est toujours pris neuf : son âge compte. */
function retenir(avant: Donnees | null, d: Donnees): Donnees {
  if (avant && contenu(avant) === contenu(d)) {
    return { ...avant, terminal: d.terminal, serveurA: d.serveurA };
  }
  return d;
}

/** Ce qu'une notification est censée faire changer : le dernier SMS, leur
 *  nombre, les soldes. Sert à savoir si la première relecture l'a vu. */
function empreinte(d: Donnees | null): string {
  if (!d) return "";
  return [
    d.paiements[0]?.id ?? "", d.paiements.length,
    ...d.sims.map((s) => `${s.iccid}:${s.solde ?? ""}`),
  ].join("|");
}

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Etat = {
  /** Ce qui suffit à CET écran — sinon `null`. */
  donnees: Donnees | null;
  /** Cet écran n'a encore rien et aucun échec n'est connu : des formes
   *  grises. Jamais une roue. */
  attente: boolean;
  /** Cet écran n'a rien ET le dernier essai a échoué. Ne s'efface qu'au
   *  succès. Un écran qui a ses chiffres ne reçoit jamais d'erreur : la
   *  ligne d'âge et le bandeau disent qu'ils datent. */
  erreur: string | null;
  /** Le geste « tirer » — rend la main à la fin de la relecture. Les écrans
   *  ne l'appellent pas eux-mêmes pour leur roue : voir `useRoue`. Ils
   *  l'utilisent pour « Réessayer ». */
  recharger: () => Promise<void>;
  /** Relire EN SILENCE, après un geste (SMS lu, nature posée, réglage
   *  changé). `suivi` : après une opération, relire encore trois fois
   *  pour attraper le SMS de l'opérateur. */
  actualiser: (options?: { suivi?: boolean }) => void;
  /** Quand la plateforme a répondu, en millisecondes. `null` si rien encore. */
  quand: number | null;
  /** Vrai quand ce qui est à l'écran a été relu du téléphone et que la
   *  plateforme n'a pas encore répondu depuis. */
  duCahier: boolean;
};

/** Un échec, et de QUELLE NATURE : « Pas de réseau » ne se dit que du
 *  réseau. Une plateforme qui répond mal se dit autrement — sans quoi le
 *  propriétaire coupe et rallume son wifi pour rien. */
type Echec = { message: string; a: number; reseau: boolean };

type EnVol = {
  n: number; bornes: BornesPleines; langue: Langue;
  /** Rend les données APPLIQUÉES — `null` si la réponse a été écartée ou
   *  a échoué. */
  promesse: Promise<Donnees | null>; ctrl: AbortController;
};

type Partage = {
  donnees: Donnees | null;
  servies: BornesPleines | null;
  quand: number | null;
  duCahier: boolean;
  echec: Echec | null;
  lent: boolean;
  enRoute: boolean;
  recharger: () => Promise<void>;
  actualiser: (options?: { suivi?: boolean }) => void;
  retoucher: (f: (d: Donnees) => Donnees) => void;
  inscrire: (id: number, b: BornesPleines) => void;
  retirer: (id: number) => void;
};

const Contexte = createContext<Partage | null>(null);
const Horloge = createContext<number>(Date.now());

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const langue = useLangue();
  const { connecte, perdue } = useSession();

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  // Les bornes de ce qui est À L'ÉCRAN, exactement — jamais plus grandes :
  // Comptes croirait compter sur mille SMS une réponse qui en compte trente.
  const [servies, setServies] = useState<BornesPleines | null>(null);
  const [langueServie, setLangueServie] = useState<Langue | null>(null);
  const [quand, setQuand] = useState<number | null>(null);
  const [duCahier, setDuCahier] = useState(false);
  const [echec, setEchec] = useState<Echec | null>(null);
  const [lent, setLent] = useState(false);
  const [enRoute, setEnRoute] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // --- Ce que les fonctions stables lisent ---------------------------------
  const connecteRef = useRef(connecte);
  connecteRef.current = connecte;
  const langueRef = useRef(langue);
  langueRef.current = langue;
  const perdueRef = useRef(perdue);
  perdueRef.current = perdue;
  const donneesRef = useRef(donnees);
  donneesRef.current = donnees;
  const serviesRef = useRef(servies);
  serviesRef.current = servies;
  const quandRef = useRef(quand);
  quandRef.current = quand;

  // UNE SESSION FERMÉE OUBLIE TOUT — Y COMPRIS CE QUI ÉTAIT EN ROUTE. Sans
  // ce numéro, une réponse partie sous le propriétaire arrivait après sa
  // déconnexion : le vendeur qui se connectait ensuite voyait les soldes et
  // les SMS de toutes les cartes, et le cahier était réécrit après sa
  // fermeture.
  const generation = useRef(0);
  // LES RÉPONSES SONT NUMÉROTÉES. Deux relectures se croisent (notification
  // et retour devant l'application) : la plus ancienne arrivait la dernière
  // et effaçait l'encaissement que la plus récente venait de montrer.
  const seq = useRef(0);
  const applique = useRef(0);
  const enVol = useRef<EnVol | null>(null);
  const echecsDeSuite = useRef(0);
  const suiviEnAttente = useRef(false);
  const cahierRelu = useRef(false);
  // La plateforme a-t-elle déjà répondu ? Le cahier arrive APRÈS elle sur un
  // téléphone rapide : il ne doit alors rien dire.
  const reseauARepondu = useRef(false);
  const minuteries = useRef(new Set<ReturnType<typeof setTimeout>>());

  // Le registre des écrans montés. Un `ref` et non un état : s'inscrire ne
  // doit pas provoquer un rendu de toute l'application — c'est le BESOIN
  // calculé qui compte, et lui est un état.
  const registre = useRef(new Map<number, BornesPleines>());

  // `null` tant qu'AUCUN écran ne s'est inscrit — ce n'est pas la même chose
  // qu'un besoin par défaut : le cahier partait au guichet avant que le
  // premier écran n'ait dit ce qu'il voulait, et ramenait 88 Ko de valeurs
  // par défaut que la descente suivante remplaçait aussitôt.
  const [besoin, setBesoin] = useState<BornesPleines | null>(null);
  const besoinRef = useRef(besoin);
  besoinRef.current = besoin;

  const recalculer = useCallback(() => {
    setBesoin((avant) => {
      if (!registre.current.size) return null;
      const neuf = reunir([...registre.current.values()]);
      return avant && memesBornes(avant, neuf) ? avant : neuf;
    });
  }, []);

  const inscrire = useCallback((id: number, b: BornesPleines) => {
    registre.current.set(id, b);
    recalculer();
  }, [recalculer]);

  const retirer = useCallback((id: number) => {
    registre.current.delete(id);
    recalculer();
  }, [recalculer]);

  const plusTard = useCallback((ms: number, f: () => void) => {
    const m = setTimeout(() => { minuteries.current.delete(m); f(); }, ms);
    minuteries.current.add(m);
  }, []);

  /**
   * ALLER AU GUICHET. Une seule porte, pour tous les déclencheurs.
   *
   * `forcer` : partir même si une relecture couvrant le besoin est déjà en
   * route. Une NOTIFICATION force : la relecture en vol est partie avant le
   * SMS, s'y joindre le manquerait. Le reste se joint à elle — c'est ce qui
   * évite deux descentes quand on touche une notification qui ramène aussi
   * l'application au premier plan.
   */
  const charger = useCallback((options: { forcer?: boolean } = {}): Promise<Donnees | null> => {
    const b0 = besoinRef.current;
    if (!b0 || connecteRef.current !== true) return Promise.resolve(null);
    const s = serviesRef.current;
    const q = quandRef.current;
    const b = s && q != null && Date.now() - q < RECENT_MS ? reunir([b0, s]) : b0;
    const lg = langueRef.current;
    const vol = enVol.current;
    if (!options.forcer && vol && vol.langue === lg && couvre(vol.bornes, b)) return vol.promesse;

    const n = ++seq.current;
    const gen = generation.current;
    const ctrl = new AbortController();
    setEnRoute(true);
    const promesse = (async (): Promise<Donnees | null> => {
      try {
        const d = await chargerDonnees(lg, b, ctrl.signal);
        if (gen !== generation.current || n < applique.current) return null;
        applique.current = n;
        echecsDeSuite.current = 0;
        const retenu = retenir(donneesRef.current, d);
        donneesRef.current = retenu;
        setDonnees(retenu);
        setServies((avant) => (avant && memesBornes(avant, b) ? avant : b));
        setLangueServie(lg);
        setQuand(Date.now());
        setDuCahier(false);
        setEchec(null);
        setLent(false);
        reseauARepondu.current = true;
        void Cahier.ecrire({ quand: Date.now(), bornes: b, donnees: d }).catch(() => {});
        // Le terminal dit avoir des SMS pas encore transmis : on repasse,
        // deux fois, puis on s'arrête — l'écran ne promet plus « elle se met
        // à jour toute seule » sans le faire. UNE fois par épisode : chaque
        // relecture qui retrouvait « en attente » en reprogrammait deux
        // autres, et cela devenait une relecture toutes les vingt secondes —
        // le pouls qu'on avait retiré, revenu par la petite porte.
        const enAttente = (d.terminal?.enAttente ?? 0) > 0;
        if (enAttente && !suiviEnAttente.current) {
          suiviEnAttente.current = true;
          for (const ms of SUIVIS_EN_ATTENTE_MS) plusTard(ms, () => void charger());
        }
        if (!enAttente) suiviEnAttente.current = false;
        return retenu;
      } catch (e) {
        if (gen !== generation.current) return null;
        // Session expirée : ce n'est pas une erreur à afficher, c'est un
        // retour au verrou. La racine s'en charge dès que l'état bascule.
        if (e instanceof ErreurGuichet && e.statut === 401) { perdueRef.current(); return null; }
        // Une relecture plus récente a déjà réussi : cet échec ne dit rien
        // de ce qui est à l'écran.
        if (n < applique.current) return null;
        echecsDeSuite.current += 1;
        // Le guichet parle la langue de l'écran ; tout le reste — une panne
        // de réseau, un corps illisible — reçoit la phrase du dictionnaire.
        const nature = e instanceof ErreurGuichet ? e.nature : "reseau";
        setEchec({
          message: e instanceof ErreurGuichet && e.message
            ? e.message : textesConnexion[lg].reseauEnPanne,
          a: Date.now(),
          reseau: nature === "reseau" || nature === "interceptee",
        });
        return null;
      } finally {
        if (enVol.current?.n === n) {
          enVol.current = null;
          if (gen === generation.current) setEnRoute(false);
        }
      }
    })();
    enVol.current = { n, bornes: b, langue: lg, promesse, ctrl };
    return promesse;
  }, [plusTard]);

  // --- Le cahier du téléphone, relu UNE fois au démarrage -----------------
  //
  // Il n'est relu que si la session tient : un cahier lisible sans mot de
  // passe montrerait les SMS du propriétaire à qui ouvrirait un téléphone
  // perdu. Et il est EFFACÉ dès que la session tombe.
  useEffect(() => {
    if (connecte === false) {
      generation.current += 1;
      enVol.current?.ctrl.abort();
      enVol.current = null;
      for (const m of minuteries.current) clearTimeout(m);
      minuteries.current.clear();
      setDonnees(null); setServies(null); setLangueServie(null); setQuand(null);
      setDuCahier(false); setEchec(null); setLent(false); setEnRoute(false);
      echecsDeSuite.current = 0;
      suiviEnAttente.current = false;
      cahierRelu.current = false;
      reseauARepondu.current = false;
      void Cahier.fermer();
      return;
    }
    if (connecte !== true || cahierRelu.current) return;
    cahierRelu.current = true;
    const gen = generation.current;
    void Cahier.lire().then((page) => {
      // Le réseau a toujours raison contre le cahier ; et une session
      // tombée entre-temps n'en veut plus rien.
      if (!page || reseauARepondu.current || gen !== generation.current) return;
      setDonnees((deja) => deja ?? page.donnees);
      setServies((deja) => deja ?? page.bornes);
      setQuand((deja) => deja ?? page.quand);
      setDuCahier(true);
    }).catch(() => { /* cahier illisible : on attend le réseau */ });
  }, [connecte]);

  // Des chiffres relus du téléphone, et la plateforme qui ne répond pas
  // encore : on ne dit « ça date » qu'au bout de quelques secondes.
  useEffect(() => {
    if (!duCahier) { setLent(false); return; }
    const m = setTimeout(() => setLent(true), LENT_MS);
    return () => clearTimeout(m);
  }, [duCahier]);

  // LE BESOIN QUI GRANDIT, OU UNE LANGUE QUI CHANGE. Un écran qui demande
  // MOINS que ce qui est au cahier ne déclenche rien : c'est tout l'objet du
  // cahier. Des chiffres relus du téléphone ne couvrent aucun besoin — ils
  // tiennent l'écran en attendant. Une autre langue non plus : les « il y a
  // 3 min » de la plateforme resteraient dans l'ancienne.
  const besoinCouvert = besoin === null
    || (servies !== null && !duCahier && langueServie === langue && couvre(servies, besoin));
  useEffect(() => {
    if (connecte !== true || besoinCouvert) return;
    void charger();
  }, [connecte, besoin, besoinCouvert, langue, charger]);

  // APRÈS UN ÉCHEC, ON RÉESSAIE — ESPACÉ, ET SEULEMENT DEVANT. Avant, un
  // échec « discret » ne relançait rien : l'onglet restait gris pour
  // toujours, et seul un redémarrage le débloquait.
  useEffect(() => {
    if (!echec || connecte !== true) return;
    const k = Math.min(Math.max(echecsDeSuite.current - 1, 0), REESSAIS_MS.length - 1);
    const m = setTimeout(() => {
      if (AppState.currentState === "active") void charger();
    }, REESSAIS_MS[k]);
    return () => clearTimeout(m);
  }, [echec, connecte, charger]);

  // --- Le retour au premier plan — depuis l'ARRIÈRE-PLAN seulement --------
  //
  // SAUF APRÈS UN ÉCHEC. Un essai espacé qui tombait pendant un passage par
  // « inactive » — le centre de contrôle qu'on ouvre justement pour
  // rallumer les données mobiles — ne faisait rien, et rien ne le
  // reprogrammait : le message de panne restait, le réseau revenu.
  const echecRef = useRef(echec);
  echecRef.current = echec;
  useEffect(() => {
    let parti = false;
    const abonnement = AppState.addEventListener("change", (etat: AppStateStatus) => {
      if (etat === "background") parti = true;
      if (etat === "active") {
        setMaintenant(Date.now());
        // « inactive » puis « active » sans être passé par l'arrière-plan :
        // le centre de notifications, une demande d'autorisation. On n'a
        // pas quitté l'application : rien à recharger.
        if (parti || echecRef.current) void charger();
        parti = false;
      }
    });
    return () => abonnement.remove();
  }, [charger]);

  // --- La notification : relire, et relire encore si rien n'a bougé -------
  useEffect(() => {
    const quandSonne = () => {
      const avant = empreinte(donneesRef.current);
      void charger({ forcer: true }).then((vues) => {
        // Le robot fait sonner au moment où il LIT le SMS ; la ligne arrive
        // en base un peu après. Si la première relecture n'a rien vu — ou
        // n'a rien rapporté —, on repasse une fois, pas davantage. On compare
        // ce qu'elle a APPLIQUÉ : l'état de l'écran n'est mis à jour qu'au
        // rendu suivant, et la comparaison disait toujours « rien vu ».
        if (!vues || empreinte(vues) === avant) {
          plusTard(RELECTURE_NOTIFICATION_MS, () => void charger({ forcer: true }));
        }
      });
    };
    const recue = Notifications.addNotificationReceivedListener(quandSonne);
    const touchee = Notifications.addNotificationResponseReceivedListener(quandSonne);
    return () => { recue.remove(); touchee.remove(); };
  }, [charger, plusTard]);

  // --- L'horloge de l'écran — sans requête --------------------------------
  // Une application restée ouverte depuis hier soir disait encore
  // « Aujourd'hui » des paiements d'hier : rien ne refaisait le rendu.
  useEffect(() => {
    const m = setInterval(() => {
      if (AppState.currentState === "active") setMaintenant(Date.now());
    }, HORLOGE_MS);
    return () => clearInterval(m);
  }, []);

  const recharger = useCallback(
    () => charger({ forcer: true }).then(() => undefined), [charger]);
  const actualiser = useCallback((options?: { suivi?: boolean }) => {
    void charger({ forcer: true });
    if (options?.suivi) {
      for (const ms of SUIVIS_OPERATION_MS) plusTard(ms, () => void charger());
    }
  }, [charger, plusTard]);
  // Ce que l'écran sait déjà (un SMS lu, une nature posée) se montre TOUT
  // DE SUITE, sans attendre la plateforme ni faire tourner quoi que ce soit.
  const retoucher = useCallback((f: (d: Donnees) => Donnees) => {
    setDonnees((d) => (d ? f(d) : d));
  }, []);

  const boite = useMemo<Partage>(() => ({
    donnees, servies, quand, duCahier, echec, lent, enRoute,
    recharger, actualiser, retoucher, inscrire, retirer,
  }), [donnees, servies, quand, duCahier, echec, lent, enRoute,
       recharger, actualiser, retoucher, inscrire, retirer]);

  return (
    <Contexte.Provider value={boite}>
      <Horloge.Provider value={maintenant}>
        {/* LE TÉMOIN DU CHARGEMENT — web seulement, comme `data-squelette` et
            `data-ligne`. `dataSet` devient un attribut `data-*` sur le web et
            n'existe pas dans le paquet du téléphone. Il dit qu'une relecture
            est EN ROUTE — et `verifier-le-cahier` exige qu'il disparaisse
            quand le réseau a refusé. */}
        {enRoute
          ? <View
              {...({ dataSet: { chargement: "1" } } as object)}
              pointerEvents="none"
              style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
            />
          : null}
        {children}
      </Horloge.Provider>
    </Contexte.Provider>
  );
}

function usePartage(): Partage {
  const partage = useContext(Contexte);
  if (!partage) {
    throw new Error(
      "Le cahier n'est pas monté : un écran lit les données hors du FournisseurDonnees.");
  }
  return partage;
}

/**
 * L'ÂGE DE CE QUI EST À L'ÉCRAN — et s'il faut le dire.
 *
 * `horsLigne` : le dernier essai a échoué, OU les chiffres relus du
 * téléphone attendent la plateforme depuis plusieurs secondes. Le bandeau
 * ne s'affichait que sur la PROVENANCE (« relu du fichier ») : à chaque
 * ouverture d'un téléphone bien connecté, il apparaissait une seconde et
 * faisait sauter l'écran — et une application restée ouverte depuis hier
 * soir, dont le rechargement échouait, montrait les chiffres d'hier soir
 * sans un mot.
 *
 * Il ne s'inscrit à aucun besoin : il ne fait jamais grandir ce que
 * l'application descend.
 */
export function useAgeDesChiffres(): {
  duCahier: boolean; quand: number | null; horsLigne: boolean;
  /** « reseau » : le téléphone n'atteint pas TOTEM. « plateforme » : elle
   *  répond, mais mal (panne, réponse coupée). */
  panne: "reseau" | "plateforme" | null;
} {
  const p = useContext(Contexte);
  if (!p) return { duCahier: false, quand: null, horsLigne: false, panne: null };
  const horsLigne = p.donnees !== null && (p.echec !== null || (p.duCahier && p.lent));
  const panne = !horsLigne ? null : p.echec && !p.echec.reseau ? "plateforme" : "reseau";
  return { duCahier: p.duCahier, quand: p.quand, horsLigne, panne };
}

/** L'heure de l'écran, refaite chaque minute et au retour devant
 *  l'application. Tout ce qui dit « aujourd'hui », « hier » ou « il y a »
 *  la lit, plutôt que `Date.now()` figé au dernier rendu. */
export function useMaintenant(): number {
  return useContext(Horloge);
}

/** Corriger sur place ce qu'on sait déjà (un SMS lu, une nature posée). */
export function useRetouche(): (f: (d: Donnees) => Donnees) => void {
  return usePartage().retoucher;
}

/**
 * LA ROUE DE « TIRER POUR RAFRAÎCHIR » — la seule de l'application.
 *
 * Levée par le DOIGT, baissée à la fin de SA relecture, et au plus tard au
 * bout de vingt secondes, quoi que fasse le réseau. Un écran qui n'est pas
 * devant ne la montre jamais : allumée puis éteinte hors de la fenêtre,
 * iOS n'en revenait pas proprement.
 *
 * C'est le seul endroit de l'application qui dessine un `RefreshControl` —
 * `verifier-la-roue` refuse tout autre.
 */
export function useRoue(): ReactElement<RefreshControlProps> {
  const { recharger } = usePartage();
  const devant = useIsFocused();
  const [tire, setTire] = useState(false);
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => { vivant.current = false; };
  }, []);
  // Quitter l'écran pendant qu'elle tourne la range : au retour, elle ne
  // doit pas réapparaître sans geste.
  useEffect(() => { if (!devant) setTire(false); }, [devant]);
  const onRefresh = useCallback(() => {
    setTire(true);
    void Promise.race([recharger(), attendre(TIRER_MAX_MS)])
      .finally(() => { if (vivant.current) setTire(false); });
  }, [recharger]);
  return (
    <RefreshControl refreshing={tire && devant} onRefresh={onRefresh}
                    tintColor={couleurs.encrePale} />
  );
}

let prochainId = 1;

export function useDonnees(bornes?: Bornes): Etat {
  const partage = usePartage();
  const { inscrire, retirer, servies, actualiser } = partage;

  const sms = bornes?.sms;
  const recus = bornes?.recus;
  const lignes = bornes?.lignes;
  const miennes = useMemo(
    () => pleines({ sms, recus, lignes }), [sms, recus, lignes]);

  const id = useRef(0);
  if (id.current === 0) id.current = prochainId++;

  useEffect(() => {
    const n = id.current;
    inscrire(n, miennes);
    return () => retirer(n);
  }, [inscrire, retirer, miennes]);

  // REVENIR SUR UN ONGLET dont les chiffres ont plus de trente secondes :
  // on relit, en silence. Passer d'un onglet à l'autre ne rafraîchissait
  // rien — l'écran restait sur le solde du moment où on l'avait ouvert.
  const quandRef = useRef(partage.quand);
  quandRef.current = partage.quand;
  useFocusEffect(useCallback(() => {
    const q = quandRef.current;
    if (q != null && Date.now() - q > FRAIS_MS) actualiser();
  }, [actualiser]));

  // CE QUI EST AU CAHIER SUFFIT-IL À CET ÉCRAN ? Tant qu'il ne couvre pas ce
  // que CET écran demande, il montre son attente — ou sa panne.
  const suffisant = servies !== null && partage.donnees !== null && couvre(servies, miennes);

  return {
    donnees: suffisant ? partage.donnees : null,
    attente: !suffisant && partage.echec === null,
    erreur: !suffisant && partage.echec !== null ? partage.echec.message : null,
    recharger: partage.recharger,
    actualiser,
    quand: suffisant ? partage.quand : null,
    duCahier: suffisant ? partage.duCahier : false,
  };
}
