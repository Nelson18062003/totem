// Le chargement des données, pour tous les écrans.
//
// Un seul endroit qui sait : demander au guichet, dire qu'on charge, dire
// qu'on a échoué, et — le point important — reconnaître une session perdue
// pour renvoyer vers le verrou au lieu de boucler sur des refus.
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

import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import { useLangue } from "@/langue";
import { textesConnexion } from "@noyau/textes/connexion";
import { useSession } from "@/session";
import type { Donnees } from "@noyau/types";

type Etat = {
  donnees: Donnees | null;
  chargement: boolean;
  erreur: string | null;
  /** Rechargement à la demande — le geste « tirer pour rafraîchir ». */
  recharger: () => void;
};

export function useDonnees(
  bornes?: { sms?: number; recus?: number; sansLignes?: boolean },
): Etat {
  const langue = useLangue();
  const { perdue } = useSession();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const sms = bornes?.sms;
  const recus = bornes?.recus;
  const sansLignes = bornes?.sansLignes;


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
      const d = await chargerDonnees(langue, { sms, recus, sansLignes });
      setDonnees(d);
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
      if (!discret) {
        setErreur(e instanceof ErreurGuichet && e.message
          ? e.message
          : textesConnexion[langue].reseauEnPanne);
      }
    } finally {
      if (!discret) setChargement(false);
    }
  }, [langue, sms, recus, sansLignes, perdue]);

  useEffect(() => { charger(); }, [charger]);

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

  return { donnees, chargement, erreur, recharger: () => charger() };
}
