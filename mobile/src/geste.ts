// UN GESTE, UNE FOIS.
//
// POURQUOI CE FICHIER EXISTE. Tous les écrans qui déposent une demande au
// terminal se gardaient de la même façon : un état React « envoi », et un
// bouton `disabled={etat === "envoi"}`. Cela ne garde rien contre un DOUBLE
// APPUI. L'état React ne change pas au moment où on l'écrit — il change au
// rendu suivant. Deux appuis rapprochés lisent donc tous les deux « repos »,
// et partent tous les deux.
//
// Sur un téléphone, deux appuis rapprochés ne sont pas une acrobatie : c'est
// ce que fait n'importe qui devant un bouton qui ne réagit pas tout de suite.
// Et à Douala, un bouton ne réagit pas tout de suite.
//
// DEUX PROTECTIONS, parce qu'elles ne parent pas la même chose :
//
//   1. UN VERROU SYNCHRONE (`useRef`). Il se ferme à l'instant même de
//      l'appui, pas au rendu suivant. C'est lui qui arrête le double appui.
//
//   2. UNE CLÉ D'INTENTION, jointe à la demande. Elle pare l'autre cas :
//      la requête est bien arrivée, le terminal a bien travaillé, mais la
//      réponse s'est perdue en route — le téléphone a coupé au bout de
//      quinze secondes. La personne recommence, de bonne foi. Sans clé, le
//      geste part une seconde fois ; avec, la plateforme reconnaît le même
//      geste et rend la demande déjà déposée.
//
// LA CLÉ EST NEUVE À CHAQUE GESTE, jamais dérivée de ce qu'on vise. Une clé
// stable (« recu-du-sms-42 ») rendrait le geste irrattrapable : si la
// première tentative échoue, la base refuserait toutes les suivantes, pour
// toujours. Ce qu'on veut dédoubler, c'est UN appui — pas une intention.

import { useCallback, useRef, useState } from "react";

/** Une clé d'intention neuve. */
export function nouvelleCle(): string {
  // `crypto.randomUUID` n'existe pas partout sur React Native selon la
  // version du moteur : on ne s'y fie pas pour un identifiant qui ne
  // protège aucun secret — il doit seulement être unique.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type Geste = {
  /** Vrai tant que le geste est en cours — pour griser le bouton. */
  occupe: boolean;
  /**
   * Lance le geste, s'il n'y en a pas déjà un.
   *
   * `faire` reçoit la clé d'intention à joindre à la demande. Un second
   * appui pendant que le premier travaille ne fait RIEN — pas une erreur,
   * pas un message : rien. C'est ce que la personne attend d'un bouton sur
   * lequel elle vient d'appuyer.
   */
  lancer: (faire: (cle: string) => Promise<void>) => Promise<void>;
};

export function useGesteUnique(): Geste {
  // Le verrou est un `ref` et pas un état : il doit être vrai AVANT le rendu
  // suivant. C'est toute la différence.
  const verrou = useRef(false);
  const [occupe, setOccupe] = useState(false);

  const lancer = useCallback(async (faire: (cle: string) => Promise<void>) => {
    if (verrou.current) return;
    verrou.current = true;
    setOccupe(true);
    try {
      await faire(nouvelleCle());
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  }, []);

  return { occupe, lancer };
}
