"use client";

import { useState } from "react";

/**
 * Le pavé du code secret, sur la plateforme.
 *
 * La règle de la maison s'applique ici comme partout : le code n'est jamais
 * stocké, jamais journalisé autrement que « •••• ». Cette maquette pousse la
 * règle jusqu'au bout — elle ne retient que le NOMBRE de chiffres composés,
 * jamais lesquels. Le branchement réel transmettra les chiffres au terminal
 * par un canal éphémère, effacé sitôt lu, sans jamais les écrire en base.
 */
export function PaveSecret({ onValider }: { onValider: () => void }) {
  const [nb, setNb] = useState(0);

  const appuyer = () => setNb((n) => Math.min(n + 1, 6));
  const effacer = () => setNb((n) => Math.max(n - 1, 0));

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-small text-ink-soft">Code secret Mobile Money</p>

      {/* Ce qui s'affiche est tout ce qui sera jamais journalisé : des points. */}
      <div className="flex h-6 items-center gap-2.5" aria-label={`${nb} chiffres composés`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i}
            className={`rounded-full transition-all ${
              i < nb ? "size-3 bg-ink" : "size-2.5 border border-ink-faint"
            }`} />
        ))}
        {nb > 4 && Array.from({ length: nb - 4 }).map((_, i) => (
          <span key={`x${i}`} className="size-3 rounded-full bg-ink" />
        ))}
      </div>

      <div className="grid w-full max-w-56 grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((t) => (
          <button key={t} onClick={appuyer}
            className="rounded-btn border border-line bg-surface-raised py-3 text-body font-medium tabnums transition hover:border-ink-faint active:bg-surface-2">
            {t}
          </button>
        ))}
        <button onClick={effacer} aria-label="Effacer le dernier chiffre"
          className="rounded-btn py-3 text-small text-ink-soft transition hover:text-ink">
          Effacer
        </button>
        <button onClick={appuyer}
          className="rounded-btn border border-line bg-surface-raised py-3 text-body font-medium tabnums transition hover:border-ink-faint active:bg-surface-2">
          0
        </button>
        <button onClick={onValider} disabled={nb < 4}
          className="rounded-btn bg-ink py-3 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
          Valider
        </button>
      </div>

      <p className="text-center text-caption leading-relaxed text-ink-faint">
        Le code part au réseau puis disparaît. Nulle part il n’est enregistré —
        le journal n’en garde que « •••• ».
      </p>
    </div>
  );
}
