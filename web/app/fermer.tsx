"use client";

import { useEffect } from "react";
import { IconClose } from "./icons";

/**
 * La touche Échap ferme la fenêtre — la même sortie qu'au bouton. Chaque
 * fenêtre passe SA fonction de sortie : celle qui demande confirmation
 * quand il y a quelque chose à perdre.
 */
export function useEchap(sortir: () => void) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") sortir();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [sortir]);
}

/**
 * LE bouton qui ferme une fenêtre — fiche d'un SMS, pop-up d'opération,
 * session USSD. Une pastille pleine, visible au premier regard : une croix
 * nue dans un coin ne se voyait pas, et fermer est le geste qu'on cherche
 * le plus souvent.
 */
/**
 * La question d'arrêt — posée à la place des contrôles quand il y a quelque
 * chose à perdre : « Arrêter ? Continuer / Arrêter ». Le rouge est à droite,
 * explicite ; rien ne s'interrompt sans avoir été lu.
 */
export function ConfirmationArret({
  question,
  continuer,
  arreter,
  onContinuer,
  onArreter,
}: {
  question: string;
  continuer: string;
  arreter: string;
  onContinuer: () => void;
  onArreter: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2.5 px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5">
      <p className="text-body font-medium">{question}</p>
      <div className="flex gap-2">
        <button onClick={onContinuer}
          className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
          {continuer}
        </button>
        <button onClick={onArreter}
          className="flex-1 rounded-btn bg-negative py-2.5 text-small font-medium text-white transition hover:opacity-90">
          {arreter}
        </button>
      </div>
    </div>
  );
}

export function BoutonFermer({
  onClick,
  label,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink transition hover:bg-surface-3 disabled:opacity-40"
    >
      <IconClose size={18} />
    </button>
  );
}
