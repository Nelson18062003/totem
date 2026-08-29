// Le chargement des données, pour tous les écrans.
//
// Un seul endroit qui sait : demander au guichet, dire qu'on charge, dire
// qu'on a échoué, et — le point important — reconnaître une session perdue
// pour renvoyer vers le verrou au lieu de boucler sur des refus.
//
// ET SURTOUT : SE TENIR À JOUR TOUT SEUL.
//
// L'application ne chargeait qu'une fois, à l'ouverture. Un SMS arrivé
// ensuite n'apparaissait qu'après un geste de rafraîchissement — ce qui est
// absurde pour un outil qu'on ouvre justement pour savoir ce qui vient
// d'arriver. Telegram, lui, prévient à la seconde ; l'application avait
// l'air en retard sur son propre robot.
//
// Trois déclencheurs, et ils se complètent :
//
//   1. LE POULS. Toutes les quinze secondes, on demande `/api/actualite` —
//      deux nombres, rien de plus. Si le dernier SMS connu a changé, ALORS
//      on recharge tout. Demander la liste entière toutes les quinze
//      secondes coûterait cher en données, et à Douala les données se
//      paient ; deux nombres ne coûtent rien.
//
//   2. LE RETOUR AU PREMIER PLAN. Un téléphone rangé dans une poche ne
//      compte pas : le pouls s'arrête quand l'application passe derrière,
//      et l'on recharge en revenant. Sans cela, on afficherait l'état d'il
//      y a deux heures pendant quinze secondes.
//
//   3. LA NOTIFICATION. Quand le robot fait sonner, il vient précisément de
//      se passer quelque chose. On recharge sans attendre le pouls suivant :
//      l'écran est déjà à jour quand la personne ouvre l'application depuis
//      la notification.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { actualite, chargerDonnees, ErreurGuichet } from "@/api/guichet";
import { useLangue } from "@/langue";
import { useSession } from "@/session";
import type { Donnees } from "@noyau/types";

/** Le rythme du pouls, application ouverte. Assez court pour qu'un
 *  encaissement paraisse « immédiat », assez long pour ne pas manger la
 *  batterie ni le forfait. */
const POULS_MS = 15_000;

type Etat = {
  donnees: Donnees | null;
  chargement: boolean;
  erreur: string | null;
  /** Rechargement à la demande — le geste « tirer pour rafraîchir ». */
  recharger: () => void;
};

export function useDonnees(bornes?: { sms?: number; recus?: number }): Etat {
  const langue = useLangue();
  const { perdue } = useSession();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const sms = bornes?.sms;
  const recus = bornes?.recus;

  // Le dernier SMS connu, par son identifiant de LIGNE. Dans une référence
  // et non dans un état : le pouls le lit et l'écrit sans avoir besoin de
  // redessiner quoi que ce soit.
  //
  // `Paiement.id` voyage en texte (il vient du JSON) là où « /api/actualite »
  // rend un nombre. On compare donc des nombres des deux côtés, sinon
  // « 42 » ≠ 42 et le pouls rechargerait à chaque battement.
  const dernierVu = useRef<number | null>(null);

  /**
   * `discret` : recharger SANS afficher le voile de chargement. C'est ce qui
   * distingue une mise à jour automatique d'un geste volontaire. Faire
   * clignoter l'écran toutes les quinze secondes serait pire que de ne rien
   * rafraîchir du tout.
   */
  const charger = useCallback(async (discret = false) => {
    if (!discret) setChargement(true);
    setErreur(null);
    try {
      const d = await chargerDonnees(langue, { sms, recus });
      setDonnees(d);
      dernierVu.current = Number(d.paiements[0]?.id ?? 0) || 0;
    } catch (e) {
      // Session expirée : ce n'est pas une erreur à afficher, c'est un
      // retour au verrou. La racine s'en charge dès que l'état bascule.
      if (e instanceof ErreurGuichet && e.statut === 401) {
        perdue();
        return;
      }
      // Une mise à jour automatique qui échoue ne DOIT PAS effacer ce qui
      // est déjà à l'écran ni afficher une erreur : le réseau tombe souvent,
      // et l'écran resterait rouge pour une coupure de trois secondes. On
      // réessaiera au pouls suivant, sans rien dire.
      if (!discret) setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      if (!discret) setChargement(false);
    }
  }, [langue, sms, recus, perdue]);

  useEffect(() => { charger(); }, [charger]);

  // --- 1. Le pouls, tant que l'application est devant -----------------------
  useEffect(() => {
    let vivant = true;
    let minuterie: ReturnType<typeof setInterval> | null = null;

    /** Deux nombres, pas la liste entière. On ne recharge que si ça a bougé. */
    const tater = async () => {
      try {
        const { dernier } = await actualite();
        if (!vivant) return;
        if (dernierVu.current !== null && dernier !== dernierVu.current) {
          void charger(true);
        }
      } catch {
        // Réseau coupé, session en train d'expirer : le pouls se tait. Ce
        // n'est pas à lui d'annoncer une panne — la prochaine vraie demande
        // le fera, avec un message qui a du sens.
      }
    };

    const demarrer = () => {
      if (minuterie) return;
      minuterie = setInterval(tater, POULS_MS);
    };
    const arreter = () => {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
    };

    // --- 2. Le retour au premier plan --------------------------------------
    const abonnement = AppState.addEventListener("change", (etat) => {
      if (etat === "active") {
        void charger(true);   // l'écran peut dater de deux heures
        demarrer();
      } else {
        arreter();            // dans une poche, on ne consomme rien
      }
    });

    if (AppState.currentState === "active") demarrer();

    return () => {
      vivant = false;
      arreter();
      abonnement.remove();
    };
  }, [charger]);

  // --- 3. La notification --------------------------------------------------
  useEffect(() => {
    // Le robot vient de faire sonner : il s'est passé quelque chose, et on
    // le sait avant le pouls suivant. L'écran est ainsi déjà à jour quand la
    // personne ouvre l'application depuis la notification.
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

  return { donnees, chargement, erreur, recharger: () => charger() };
}
