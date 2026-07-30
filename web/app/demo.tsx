"use client";

import { useEffect, useState } from "react";
import { IconClose } from "./icons";

const CLE = "totem-demo-masque";

/**
 * Bandeau d'honnêteté : cette maquette affiche des données inventées, pas les
 * vrais comptes. Il disparaît d'un clic et ne revient pas — l'avertissement
 * doit se voir la première fois, pas gêner à chaque visite.
 */
export function BandeauDemo() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(CLE) !== "1");
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-card border border-line bg-surface-2 px-4 py-3">
      <span className="mt-0.5 rounded-sm bg-ink px-1.5 py-0.5 text-caption font-medium text-white">
        Démo
      </span>
      <p className="flex-1 text-small leading-relaxed text-ink-soft">
        Aperçu de l’interface avec des données inventées. Les vrais comptes et
        paiements y seront branchés une fois la base de données en place.
      </p>
      <button
        onClick={() => {
          localStorage.setItem(CLE, "1");
          setVisible(false);
        }}
        aria-label="Masquer cet avertissement"
        className="text-ink-faint transition hover:text-ink"
      >
        <IconClose size={16} />
      </button>
    </div>
  );
}
