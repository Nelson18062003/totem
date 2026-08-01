"use client";

import { useState } from "react";

/**
 * Le pavé du code secret, sur la plateforme.
 *
 * Les chiffres composés ne vivent que dans la mémoire de cette page : jamais
 * affichés (des points), jamais journalisés, envoyés au terminal seulement à
 * « Valider » — puis aussitôt oubliés ici, et masqués dans la base par le
 * robot sitôt lus. Le journal n'en garde que « •••• ».
 */
export function PaveSecret({ onValider }: { onValider: (code: string) => void }) {
  const [code, setCode] = useState("");

  const appuyer = (t: string) => setCode((c) => (c.length >= 6 ? c : c + t));
  const effacer = () => setCode((c) => c.slice(0, -1));
  const valider = () => {
    if (code.length < 4) return;
    onValider(code);
    setCode("");        // rien ne subsiste après l'envoi
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-small text-ink-soft">Code secret Mobile Money</p>

      {/* Ce qui s'affiche est tout ce qui sera jamais montré : des points. */}
      <div className="flex h-6 items-center gap-2.5" aria-label={`${code.length} chiffres composés`}>
        {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
          <span key={i}
            className={`rounded-full transition-all ${
              i < code.length ? "size-3 bg-ink" : "size-2.5 border border-ink-faint"
            }`} />
        ))}
      </div>

      <div className="grid w-full max-w-56 grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((t) => (
          <button key={t} onClick={() => appuyer(t)}
            className="rounded-btn border border-line bg-surface-raised py-3 text-body font-medium tabnums transition hover:border-ink-faint active:bg-surface-2">
            {t}
          </button>
        ))}
        <button onClick={effacer} aria-label="Effacer le dernier chiffre"
          className="rounded-btn py-3 text-small text-ink-soft transition hover:text-ink">
          Effacer
        </button>
        <button onClick={() => appuyer("0")}
          className="rounded-btn border border-line bg-surface-raised py-3 text-body font-medium tabnums transition hover:border-ink-faint active:bg-surface-2">
          0
        </button>
        <button onClick={valider} disabled={code.length < 4}
          className="rounded-btn bg-ink py-3 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
          Valider
        </button>
      </div>

      <p className="text-center text-caption leading-relaxed text-ink-faint">
        Le code part au terminal qui le compose sur la carte, puis disparaît.
        Nulle part il n’est enregistré — le journal n’en garde que « •••• ».
      </p>
    </div>
  );
}
