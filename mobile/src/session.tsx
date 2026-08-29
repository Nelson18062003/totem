// L'état de la session, partagé par toute l'application.
//
// Il vit ici plutôt que dans la racine parce que DEUX écrans le font changer :
// la connexion l'ouvre, les réglages la ferment. Sans un point commun, la
// racine ne verrait pas le changement et resterait bloquée sur le verrou.

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { fermerSession, ouvrirSession, sessionVivante } from "@/api/guichet";
import type { Langue } from "@noyau/langue";

type Boite = {
  /** `null` tant qu'on n'a pas encore regardé dans le coffre. */
  connecte: boolean | null;
  ouvrir: (motdepasse: string, langue: Langue) => Promise<void>;
  fermer: () => Promise<void>;
  /** À appeler quand le guichet a répondu « session expirée ». */
  perdue: () => void;
};

const Contexte = createContext<Boite>({
  connecte: null,
  ouvrir: async () => {},
  fermer: async () => {},
  perdue: () => {},
});

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [connecte, setConnecte] = useState<boolean | null>(null);

  useEffect(() => {
    sessionVivante().then(setConnecte).catch(() => setConnecte(false));
  }, []);

  const ouvrir = useCallback(async (motdepasse: string, langue: Langue) => {
    await ouvrirSession(motdepasse, langue);   // lève si le mot de passe est faux
    setConnecte(true);
  }, []);

  const fermer = useCallback(async () => {
    await fermerSession();
    setConnecte(false);
  }, []);

  const perdue = useCallback(() => setConnecte(false), []);

  return (
    <Contexte.Provider value={{ connecte, ouvrir, fermer, perdue }}>
      {children}
    </Contexte.Provider>
  );
}

export const useSession = () => useContext(Contexte);
