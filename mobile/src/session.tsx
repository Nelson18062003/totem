// L'état de la session, partagé par toute l'application.
//
// Il vit ici plutôt que dans la racine parce que DEUX écrans le font changer :
// la connexion l'ouvre, les réglages la ferment. Sans un point commun, la
// racine ne verrait pas le changement et resterait bloquée sur le verrou.

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import {
  creerCompte, fermerSession, ouvrirSession, sessionVivante,
} from "@/api/guichet";
import type { Langue } from "@noyau/langue";

type Boite = {
  /** `null` tant qu'on n'a pas encore regardé dans le coffre. */
  connecte: boolean | null;
  /** Se connecter. Sans courriel, c'est la clé de secours qu'on présente. */
  ouvrir: (courriel: string, motdepasse: string, langue: Langue) => Promise<void>;
  /** Créer un compte. Rend `true` si l'on entre tout de suite (le premier
   *  compte est celui du propriétaire), `false` si le compte attend. */
  inscrire: (courriel: string, motdepasse: string, langue: Langue) => Promise<boolean>;
  fermer: () => Promise<void>;
  /** À appeler quand le guichet a répondu « session expirée ». */
  perdue: () => void;
};

const Contexte = createContext<Boite>({
  connecte: null,
  ouvrir: async () => {},
  inscrire: async () => false,
  fermer: async () => {},
  perdue: () => {},
});

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [connecte, setConnecte] = useState<boolean | null>(null);

  useEffect(() => {
    sessionVivante().then(setConnecte).catch(() => setConnecte(false));
  }, []);

  const ouvrir = useCallback(
    async (courriel: string, motdepasse: string, langue: Langue) => {
      await ouvrirSession(courriel, motdepasse, langue);  // lève si c'est faux
      setConnecte(true);
    }, []);

  const inscrire = useCallback(
    async (courriel: string, motdepasse: string, langue: Langue) => {
      const r = await creerCompte(courriel, motdepasse, langue);
      // Un compte en attente ne connecte personne : l'écran le dit, et le
      // verrou reste fermé. Le basculer ici mènerait à un écran vide.
      if (r.entre) setConnecte(true);
      return r.entre;
    }, []);

  const fermer = useCallback(async () => {
    await fermerSession();
    setConnecte(false);
  }, []);

  const perdue = useCallback(() => setConnecte(false), []);

  return (
    <Contexte.Provider value={{ connecte, ouvrir, inscrire, fermer, perdue }}>
      {children}
    </Contexte.Provider>
  );
}

export const useSession = () => useContext(Contexte);
