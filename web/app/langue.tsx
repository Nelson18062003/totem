"use client";

// Le fil qui porte la langue jusqu'aux composants client. Le serveur lit le
// cookie et la donne au fournisseur (layout.tsx) ; les écrans la reçoivent
// par le crochet `useLangue()`.

import { createContext, useContext } from "react";
import { COOKIE_LANGUE, LANGUE_DEFAUT, LANGUES, type Langue } from "@/lib/langue";

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
 *  sans avoir rien à décoder. */
export function BasculeLangue({ className = "" }: { className?: string }) {
  const langue = useLangue();
  return (
    <div
      role="group"
      aria-label={langue === "en" ? "Language" : "Langue"}
      className={`inline-flex shrink-0 overflow-hidden rounded-full border border-line bg-surface-raised ${className}`}
    >
      {LANGUES.map(({ code, libelle, bascule }) => (
        <button
          key={code}
          lang={code}
          onClick={() => code !== langue && changerLangue(code)}
          aria-pressed={code === langue}
          title={code === langue ? undefined : bascule}
          className={`px-3 py-1.5 text-caption font-medium transition ${
            code === langue ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          {libelle}
        </button>
      ))}
    </div>
  );
}
