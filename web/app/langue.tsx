"use client";

// Le fil qui porte la langue jusqu'aux composants client. Le serveur lit le
// cookie et la donne au fournisseur (layout.tsx) ; les écrans la reçoivent
// par le crochet `useLangue()`.

import { createContext, useContext } from "react";
import { COOKIE_LANGUE, LANGUE_DEFAUT, LANGUES, type Langue } from "@/lib/langue";
import { GroupeSegments } from "@/app/ui/selecteurs";

const ContexteLangue = createContext<Langue>(LANGUE_DEFAUT);

export function FournisseurLangue({
  langue,
  children,
}: {
  langue: Langue;
  children: React.ReactNode;
}) {
  return <ContexteLangue.Provider value={langue}>{children}</ContexteLangue.Provider>;
}

export function useLangue(): Langue {
  return useContext(ContexteLangue);
}

/** Change la langue et recharge : le serveur repeint tout dans la nouvelle. */
export function changerLangue(langue: Langue) {
  const unAn = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_LANGUE}=${langue}; path=/; max-age=${unAn}; samesite=lax`;
  window.location.reload();
}

/** La bascule English | Français bien en vue : la langue active pleine,
 *  l'autre à un geste. Les noms s'écrivent EN TOUTES LETTRES, chacun dans sa
 *  propre langue — pas d'abréviation : celle qui la cherche doit la lire
 *  sans avoir rien à décoder.
 *
 *  C'est un groupe de segments, et pas un dessin de plus : ses deux boutons
 *  faisaient 28 px de haut, sous le plancher des 44. Le groupe pose la hauteur
 *  une fois, les deux segments l'occupent, quel que soit l'état. */
export function BasculeLangue({ className = "" }: { className?: string }) {
  const langue = useLangue();
  return (
    <GroupeSegments
      libelle={langue === "en" ? "Language" : "Langue"}
      options={LANGUES.map(({ code, libelle }) => ({ valeur: code, libelle }))}
      valeur={langue}
      surChangement={(code) => {
        if (code !== langue) changerLangue(code as Langue);
      }}
      classe={`shrink-0 ${className}`}
    />
  );
}
