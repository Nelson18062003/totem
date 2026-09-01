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
// Ce que cela coûtait :
//
//   — LE FORFAIT. Le même téléchargement, payé quatre fois. À Douala, la
//     donnée mobile se paie au mégaoctet, et l'écran des cartes descendait
//     265 Ko à lui seul avant qu'on ne le borne.
//
//   — L'ÉCRAN VIDE. Sans réseau, l'employé « Comptes » revient les mains
//     vides et l'écran ne montre RIEN — alors que l'employé « Accueil »
//     avait le chiffre en poche trente secondes plus tôt.
//
// Il y a maintenant UN cahier, tenu ici, que tous les écrans lisent. Le
// premier qui va au guichet y écrit ; les autres lisent. Et le cahier est
// recopié SUR LE TÉLÉPHONE (voir `api/cahier.ts`) : le matin, sans réseau,
// l'application montre les chiffres d'hier soir en disant qu'ils datent,
// au lieu d'un écran gris.
//
// CHAQUE ÉCRAN NE DEMANDE PAS LA MÊME CHOSE, et c'est ce qui rend la chose
// moins simple qu'il n'y paraît. L'analyse veut mille SMS ; les Actions n'en
// veulent aucun. Le cahier porte donc TOUJOURS le plus grand besoin des
// écrans montés : servir plus que demandé est sans danger (l'accueil ne
// montre que les quatre derniers de toute façon), servir MOINS ne l'est pas
// — l'analyse calculerait un mois faux sur un mois tronqué, sans le dire.
//
// ET SURTOUT : SE TENIR À JOUR TOUT SEUL.
//
// Deux déclencheurs, et ils suffisent :
//
//   1. LA NOTIFICATION. Quand le robot fait sonner, il vient précisément de
//      se passer quelque chose : on recharge à la seconde. C'est le canal
//      temps réel — celui de Telegram, celui de toutes les applications
//      modernes. Il marche écran allumé comme téléphone en poche.
//
//   2. LE RETOUR AU PREMIER PLAN. Le filet de sécurité : une notification a
//      pu se perdre (réseau coupé au mauvais moment), et l'écran peut dater
//      de deux heures. Revenir devant l'application recharge, toujours.
//
// IL Y AVAIT UN TROISIÈME : un « pouls » qui interrogeait la plateforme
// toutes les quinze secondes. Il a été RETIRÉ, et il faut dire pourquoi,
// parce que la tentation de le remettre reviendra.
//
// Ce pouls n'était pas un choix d'architecture : c'était une béquille posée
// sur des notifications qui n'avaient jamais marché (le jeton du téléphone
// était refusé à l'inscription — voir sonnerie.tsx). Interroger un serveur
// en boucle pour lui demander « du neuf ? », c'est payer en batterie et en
// forfait ce que la notification apporte gratuitement, en plus vite. Le
// propriétaire l'a dit sans détour, et il avait raison. La béquille est
// tombée le jour où la jambe a guéri — un vrai SMS a fait sonner un vrai
// téléphone AVANT que ce fichier ne perde son pouls, jamais l'inverse.
//
// Ces deux déclencheurs vivent maintenant ICI, une seule fois, au lieu de
// sept : une notification déclenchait sept rechargements simultanés.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  useState, type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import * as Cahier from "@/api/cahier";
import { useLangue } from "@/langue";
import { textesConnexion } from "@noyau/textes/connexion";
import { useSession } from "@/session";
import type { Donnees } from "@noyau/types";

/** Ce qu'un écran demande. Les valeurs par défaut sont celles de la
 *  plateforme (`web/app/api/donnees/route.ts`) : un écran qui ne précise
 *  rien reçoit deux cents SMS et deux cents reçus. */
export type Bornes = { sms?: number; recus?: number; lignes?: number };

type BornesPleines = { sms: number; recus: number; lignes: number };

const DEFAUT: BornesPleines = { sms: 200, recus: 200, lignes: 200 };

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
 *  demandé est sans danger — l'accueil ne montre que les quatre derniers de
 *  toute façon. Servir MOINS ne l'est pas : l'analyse calculerait un mois
 *  faux sur un mois tronqué, sans le dire. */
function couvre(servies: BornesPleines, demandees: BornesPleines): boolean {
  return servies.sms >= demandees.sms
      && servies.recus >= demandees.recus
      && servies.lignes >= demandees.lignes;
}

/** Le plus grand besoin des écrans montés. Trois nombres, et il faut les
 *  trois : les Comptes comptent sur mille SMS sans en vouloir un seul, la
 *  boîte de réception en veut deux cents. Réunir cela en un seul nombre
 *  rapporterait mille lignes à qui n'en veut pas. */
function reunir(toutes: BornesPleines[]): BornesPleines {
  if (!toutes.length) return DEFAUT;
  return {
    sms: Math.max(...toutes.map((b) => b.sms)),
    recus: Math.max(...toutes.map((b) => b.recus)),
    lignes: Math.max(...toutes.map((b) => b.lignes)),
  };
}

type Etat = {
  donnees: Donnees | null;
  chargement: boolean;
  erreur: string | null;
  /** Rechargement à la demande — le geste « tirer pour rafraîchir ». */
  recharger: () => void;
  /** Quand la plateforme a répondu, en millisecondes. `null` si rien encore.
   *  Sert à dire « relevé hier à 18 h » quand ce qu'on montre vient du
   *  téléphone et non du réseau. */
  quand: number | null;
  /** Vrai quand ce qui est à l'écran a été relu du téléphone et que la
   *  plateforme n'a pas encore répondu depuis. */
  duCahier: boolean;
};

type Partage = Etat & {
  inscrire: (id: number, b: BornesPleines) => void;
  retirer: (id: number) => void;
  servies: BornesPleines | null;
};

const Contexte = createContext<Partage | null>(null);

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const langue = useLangue();
  const { connecte, perdue } = useSession();

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [servies, setServies] = useState<BornesPleines | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [quand, setQuand] = useState<number | null>(null);
  const [duCahier, setDuCahier] = useState(false);

  // Le registre des écrans montés. Un `ref` et non un état : s'inscrire ne
  // doit pas provoquer un rendu de toute l'application — c'est le BESOIN
  // calculé qui compte, et lui est un état.
  const registre = useRef(new Map<number, BornesPleines>());

  // `null` tant qu'AUCUN écran ne s'est inscrit — et ce n'est pas la même
  // chose qu'un besoin par défaut. Mesuré : le cahier partait au guichet
  // AVANT que le premier écran n'ait dit ce qu'il voulait, et ramenait
  // 88 Ko de valeurs par défaut que la descente suivante remplaçait aussitôt.
  // « Personne n'a encore demandé » et « on demande ce qui se fait
  // d'habitude » sont deux états différents ; les confondre coûtait un
  // chargement entier.
  const [besoin, setBesoin] = useState<BornesPleines | null>(null);

  const recalculer = useCallback(() => {
    setBesoin((avant) => {
      if (!registre.current.size) return null;
      const neuf = reunir([...registre.current.values()]);
      // Même besoin : on garde l'objet précédent, sinon chaque montage
      // relancerait un chargement pour rien.
      return (avant && neuf.sms === avant.sms && neuf.recus === avant.recus
              && neuf.lignes === avant.lignes) ? avant : neuf;
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

  // --- Le cahier du téléphone, relu UNE fois au démarrage -----------------
  //
  // Il n'est relu que si la session tient : un cahier lisible sans mot de
  // passe montrerait les SMS du propriétaire à qui ouvrirait un téléphone
  // perdu. Et il est EFFACÉ dès que la session tombe.
  const cahierRelu = useRef(false);
  useEffect(() => {
    if (connecte === false) {
      setDonnees(null); setServies(null); setQuand(null); setDuCahier(false);
      cahierRelu.current = false;
      void Cahier.fermer();
      return;
    }
    if (connecte !== true || cahierRelu.current) return;
    cahierRelu.current = true;
    void Cahier.lire().then((page) => {
      // Si la plateforme a déjà répondu entre-temps, on ne l'écrase pas :
      // le réseau a toujours raison contre le cahier.
      if (!page) return;
      setDonnees((deja) => (deja ? deja : page.donnees));
      setServies((deja) => (deja ? deja : page.bornes));
      setQuand((deja) => (deja ? deja : page.quand));
      setDuCahier((deja) => (deja ? deja : true));
    });
  }, [connecte]);

  /**
   * `discret` : recharger SANS afficher le voile de chargement. C'est ce qui
   * distingue une mise à jour automatique d'un geste volontaire. Faire
   * clignoter l'écran à chaque notification serait pire que de ne rien
   * rafraîchir du tout.
   */
  const charger = useCallback(async (discret = false) => {
    if (!besoin) return;         // personne n'a rien demandé : rien à aller chercher
    if (!discret) setChargement(true);
    setErreur(null);
    try {
      const d = await chargerDonnees(langue, besoin);
      setDonnees(d);
      setServies(besoin);
      setQuand(Date.now());
      setDuCahier(false);
      void Cahier.ecrire({ quand: Date.now(), bornes: besoin, donnees: d });
    } catch (e) {
      // Session expirée : ce n'est pas une erreur à afficher, c'est un
      // retour au verrou. La racine s'en charge dès que l'état bascule.
      if (e instanceof ErreurGuichet && e.statut === 401) {
        perdue();
        return;
      }
      // Une mise à jour automatique qui échoue ne DOIT PAS effacer ce qui
      // est déjà à l'écran ni afficher une erreur : le réseau tombe souvent,
      // et l'écran resterait rouge pour une coupure de trois secondes. La
      // prochaine notification ou le prochain retour à l'écran rechargera.
      //
      // Le guichet parle déjà la langue de l'écran ; une panne de RÉSEAU,
      // elle, jette un message brut du système (« Failed to fetch »,
      // « Network request failed ») — en anglais quel que soit l'écran.
      // On lui substitue la phrase du dictionnaire.
      //
      // ET SI LE CAHIER PORTE QUELQUE CHOSE, ce n'est plus une erreur du
      // tout : c'est un écran qui date, et qui le dit. Un commerçant sans
      // réseau préfère le solde d'hier à un carré rouge.
      if (!discret && !donnees) {
        setErreur(e instanceof ErreurGuichet && e.message
          ? e.message
          : textesConnexion[langue].reseauEnPanne);
      }
    } finally {
      if (!discret) setChargement(false);
    }
  }, [langue, besoin, perdue, donnees]);

  // Le chargement part quand le besoin grandit — et seulement alors. Un
  // écran qui demande MOINS que ce qui est déjà au cahier ne déclenche rien :
  // c'est tout l'objet du cahier.
  const besoinCouvert = besoin === null
    || (servies !== null && couvre(servies, besoin));
  useEffect(() => {
    if (connecte !== true) return;
    if (besoinCouvert) { setChargement(false); return; }
    void charger(donnees !== null);   // discret si l'on a déjà de quoi montrer
    // `charger` change à chaque rendu (il dépend de `donnees`) : le suivre
    // ici relancerait une boucle. Ce qui décide est le besoin et sa
    // couverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecte, besoin, besoinCouvert]);

  // --- 1. Le retour au premier plan ---------------------------------------
  useEffect(() => {
    const abonnement = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void charger(true);   // l'écran peut dater de deux heures
    });
    return () => abonnement.remove();
  }, [charger]);

  // --- 2. La notification --------------------------------------------------
  useEffect(() => {
    // Le robot vient de faire sonner : il s'est passé quelque chose, et on
    // le sait à la seconde. L'écran est ainsi déjà à jour quand la personne
    // ouvre l'application depuis la notification.
    const recue = Notifications.addNotificationReceivedListener(() => {
      void charger(true);
    });
    const touchee = Notifications.addNotificationResponseReceivedListener(() => {
      void charger(true);
    });
    return () => {
      recue.remove();
      touchee.remove();
    };
  }, [charger]);

  const boite = useMemo<Partage>(() => ({
    donnees, chargement, erreur, quand, duCahier, servies,
    recharger: () => void charger(),
    inscrire, retirer,
  }), [donnees, chargement, erreur, quand, duCahier, servies,
       charger, inscrire, retirer]);

  return <Contexte.Provider value={boite}>{children}</Contexte.Provider>;
}

/**
 * L'ÂGE DE CE QUI EST À L'ÉCRAN — et rien d'autre.
 *
 * Le bandeau « pas de réseau » n'a besoin ni des soldes, ni des SMS : il veut
 * savoir si ce qu'on regarde vient du téléphone, et de quand. Il passait donc
 * par `useDonnees` avec des bornes à zéro — et le harnais des écrans le
 * prenait, à juste titre, pour un écran qui lit les données sans jamais dire
 * la panne. Exempter le harnais aurait été le rendre aveugle ; il valait
 * mieux que le bandeau demande exactement ce qu'il regarde.
 *
 * Il ne s'inscrit au registre pour rien : il ne fait donc jamais grandir ce
 * que l'application descend.
 */
export function useAgeDesChiffres(): { duCahier: boolean; quand: number | null } {
  const partage = useContext(Contexte);
  return { duCahier: partage?.duCahier ?? false, quand: partage?.quand ?? null };
}

let prochainId = 1;

export function useDonnees(bornes?: Bornes): Etat {
  const partage = useContext(Contexte);
  if (!partage) {
    throw new Error(
      "useDonnees hors du FournisseurDonnees : le cahier n'est pas monté.");
  }
  const { inscrire, retirer, servies } = partage;

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

  // CE QUI EST AU CAHIER SUFFIT-IL À CET ÉCRAN ? Servir plus que demandé est
  // sans danger ; servir moins ne l'est pas — l'analyse calculerait un mois
  // faux sur un mois tronqué, sans le dire. Tant que le cahier ne couvre pas
  // ce que CET écran demande, il montre son attente.
  const suffisant = servies !== null && couvre(servies, miennes);

  return {
    donnees: suffisant ? partage.donnees : null,
    chargement: suffisant ? partage.chargement : true,
    erreur: partage.erreur,
    recharger: partage.recharger,
    quand: suffisant ? partage.quand : null,
    duCahier: suffisant ? partage.duCahier : false,
  };
}
