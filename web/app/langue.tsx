"use client";

// Le fil qui porte la langue jusqu'aux composants client. Le serveur lit le
// cookie et la donne au fournisseur (layout.tsx) ; les écrans la reçoivent
// par le crochet `useLangue()`.

import { createContext, useContext } from "react";
import { COOKIE_LANGUE, LANGUE_DEFAUT, type Langue } from "@/lib/langue";

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
