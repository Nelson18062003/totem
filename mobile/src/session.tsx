// L'état de la session, partagé par toute l'application.
//
// Il vit ici plutôt que dans la racine parce que plusieurs écrans le font
// changer : la connexion et l'inscription l'ouvrent, les réglages la ferment
// (se déconnecter, supprimer son compte). Sans un point commun, la
// racine ne verrait pas le changement et resterait bloquée sur le verrou.

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import {
  fermerSession, inscrire as inscrireAuGuichet, ouvrirSession, sessionVivante,
  type FicheInscription,
} from "@/api/guichet";
import type { Langue } from "@noyau/langue";

/** Ce que l'écran de connexion a à dire en revenant d'une session close. */
export type AvisDeConnexion = "compteSupprime";

type Boite = {
  /** `null` tant qu'on n'a pas encore regardé dans le coffre. */
  connecte: boolean | null;
  /** Se connecter. Sans courriel, c'est la clé de secours qu'on présente. */
  ouvrir: (courriel: string, motdepasse: string, langue: Langue) => Promise<void>;
  /** Créer son compte : il est actif tout de suite, la session s'ouvre. */
  inscrire: (fiche: FicheInscription, langue: Langue) => Promise<void>;
  /** Fermer la session. `avis` : ce que l'écran de connexion dira, UNE
   *  fois, en revenant — « votre compte a été supprimé ». Sans lui, une
   *  suppression réussie ressemblait trait pour trait à une déconnexion. */
  fermer: (avis?: AvisDeConnexion) => Promise<void>;
  /** L'avis en attente, et de quoi l'oublier une fois montré. */
  avis: AvisDeConnexion | null;
  oublierAvis: () => void;
  /** À appeler quand le guichet a répondu « session expirée ». */
  perdue: () => void;
};

const Contexte = createContext<Boite>({
  connecte: null,
  ouvrir: async () => {},
  inscrire: async () => {},
  fermer: async () => {},
  avis: null,
  oublierAvis: () => {},
  perdue: () => {},
});

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [avis, setAvis] = useState<AvisDeConnexion | null>(null);

  useEffect(() => {
    sessionVivante().then(setConnecte).catch(() => setConnecte(false));
  }, []);

  const ouvrir = useCallback(
    async (courriel: string, motdepasse: string, langue: Langue) => {
      await ouvrirSession(courriel, motdepasse, langue);  // lève si c'est faux
      setConnecte(true);
    }, []);

  const inscrire = useCallback(async (fiche: FicheInscription, langue: Langue) => {
    await inscrireAuGuichet(fiche, langue);  // lève si la plateforme refuse
    setConnecte(true);
  }, []);

  const fermer = useCallback(async (nouvelAvis?: AvisDeConnexion) => {
    await fermerSession();
    setAvis(nouvelAvis ?? null);
    setConnecte(false);
  }, []);
  const oublierAvis = useCallback(() => setAvis(null), []);

  const perdue = useCallback(() => setConnecte(false), []);

  return (
    <Contexte.Provider value={{ connecte, ouvrir, inscrire, fermer, avis, oublierAvis, perdue }}>
      {children}
    </Contexte.Provider>
  );
}

export const useSession = () => useContext(Contexte);
