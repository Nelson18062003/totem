// La langue de l'application.
//
// Les MOTS viennent du noyau (`@noyau/textes/…`), partagés avec la
// plateforme. Ce fichier ne s'occupe que du choix et de sa mémoire.
//
// Ce que la langue ne touche JAMAIS : le texte venu du réseau. Les réponses
// USSD et les SMS de l'opérateur s'affichent mot pour mot, dans la langue où
// la SIM les a reçus — les traduire serait les trahir.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Coffre from "expo-secure-store";
import { LANGUE_DEFAUT, langueDe, type Langue } from "@noyau/langue";

const CLE = "totem.langue";

type Boite = { langue: Langue; changer: (l: Langue) => void };
const Contexte = createContext<Boite>({ langue: LANGUE_DEFAUT, changer: () => {} });

export function FournisseurLangue({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(LANGUE_DEFAUT);

  useEffect(() => {
    // Le choix précédent, s'il y en a un. Une lecture qui échoue n'est pas
    // une panne : on reste simplement sur la langue principale.
    Coffre.getItemAsync(CLE)
      .then((v) => setLangue(langueDe(v)))
      .catch(() => {});
  }, []);

  const changer = (l: Langue) => {
    setLangue(l);
    Coffre.setItemAsync(CLE, l).catch(() => {});
  };

  return <Contexte.Provider value={{ langue, changer }}>{children}</Contexte.Provider>;
}

export const useLangue = () => useContext(Contexte).langue;
export const useChangerLangue = () => useContext(Contexte).changer;
