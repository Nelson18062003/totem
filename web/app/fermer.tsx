"use client";

import { IconClose } from "./icons";

/**
 * LE bouton qui ferme une fenêtre — fiche d'un SMS, pop-up d'opération,
 * session USSD. Une pastille pleine, visible au premier regard : une croix
 * nue dans un coin ne se voyait pas, et fermer est le geste qu'on cherche
 * le plus souvent.
 */
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
