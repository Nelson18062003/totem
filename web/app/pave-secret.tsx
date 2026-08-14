"use client";

import { useState } from "react";
import { textesGuichet } from "@/lib/textes/guichet";
import { useLangue } from "./langue";

/**
 * Le pavé du code secret, sur la plateforme.
 *
 * Les chiffres composés ne vivent que dans la mémoire de cette page : jamais
 * affichés (des points), jamais journalisés, envoyés au terminal seulement à
 * « Valider » — puis aussitôt oubliés ici, et masqués dans la base par le
 * robot sitôt lus. Le journal n'en garde que « •••• ».
 */
export function PaveSecret({ onValider }: { onValider: (code: string) => void }) {
  const langue = useLangue();
  const t = textesGuichet[langue];
  const [code, setCode] = useState("");

  const appuyer = (c: string) => setCode((v) => (v.length >= 6 ? v : v + c));
  const effacer = () => setCode((c) => c.slice(0, -1));
  const valider = () => {
    if (code.length < 4) return;
    onValider(code);
    setCode("");        // rien ne subsiste après l'envoi
  };

  return (
    // Compact à dessein : sur téléphone, chaque centimètre pris par le pavé
    // est volé au message de l'opérateur — qui dit ce qu'on s'apprête à
    // confirmer. Pas de note d'explication ici : la promesse sur le code
    // (jamais enregistré) vit sur l'écran de connexion.
    <div className="flex flex-col items-center gap-2.5">
      <p className="flex items-center gap-3 text-small text-ink-soft">
        {t.paveTitre}
        {/* Ce qui s'affiche est tout ce qui sera jamais montré : des points. */}
        <span className="flex items-center gap-1.5" aria-label={t.chiffresComposes(code.length)}>
          {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
            <span key={i}
              className={`rounded-full transition-all ${
                i < code.length ? "size-2.5 bg-ink" : "size-2 border border-ink-faint"
              }`} />
          ))}
        </span>
      </p>

      <div className="grid w-full max-w-64 grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((c) => (
          <button key={c} onClick={() => appuyer(c)}
            className="rounded-btn border border-line bg-surface-raised py-2 text-body font-medium tabnums transition hover:border-ink-faint active:bg-surface-2">
            {c}
          </button>
        ))}
        <button onClick={effacer} aria-label={t.effacerDernier}
          className="rounded-btn py-2 text-small text-ink-soft transition hover:text-ink">
          {t.effacer}
        </button>
        <button onClick={() => appuyer("0")}
          className="rounded-btn border border-line bg-surface-raised py-2 text-body font-medium tabnums transition hover:border-ink-faint active:bg-surface-2">
          0
        </button>
        <button onClick={valider} disabled={code.length < 4}
          className="rounded-btn bg-ink py-2 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
          {t.valider}
        </button>
      </div>
    </div>
  );
}
