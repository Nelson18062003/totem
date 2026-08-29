// Le chargement des données, pour tous les écrans.
//
// Un seul endroit qui sait : demander au guichet, dire qu'on charge, dire
// qu'on a échoué, et — le point important — reconnaître une session perdue
// pour renvoyer vers le verrou au lieu de boucler sur des refus.

import { useCallback, useEffect, useState } from "react";
import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import { useLangue } from "@/langue";
import { useSession } from "@/session";
import type { Donnees } from "@noyau/types";

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

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setDonnees(await chargerDonnees(langue, { sms, recus }));
    } catch (e) {
      // Session expirée : ce n'est pas une erreur à afficher, c'est un
      // retour au verrou. La racine s'en charge dès que l'état bascule.
      if (e instanceof ErreurGuichet && e.statut === 401) {
        perdue();
        return;
      }
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, [langue, sms, recus, perdue]);

  useEffect(() => { charger(); }, [charger]);

  return { donnees, chargement, erreur, recharger: charger };
}
