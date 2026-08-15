"use client";

import { useCallback, useEffect, useState } from "react";
import { IconClose } from "./icons";

/**
 * LA sortie d'un écran — définie une seule fois, pour toute la plateforme.
 *
 * Trois familles de sortie, trois visages (docs/REFONTE-SMS-ET-CROIX.md) :
 *   FERMER   — rien ne se perd : bouton bordé discret, voile, Échap.
 *   ANNULER  — une saisie se perd : une étiquette de texte, jamais une croix.
 *   ARRÊTER  — une session réseau se coupe : bouton rouge à texte explicite,
 *              et une confirmation légère quand la session est en cours.
 *
 * Aucun écran ne redessine sa croix : il pose une <Feuille> et lui dit si la
 * sortie est libre (sans perte) ou retenue (une session vivante à raccrocher).
 */

/** Le bouton de fermeture : cible de 44 px, bord visible, étiquette exacte. */
export function BoutonFermer({
  onClick,
  libelle,
}: {
  onClick: () => void;
  libelle: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={libelle}
      title={libelle}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface-raised text-ink-soft transition hover:border-ink hover:text-ink"
    >
      <IconClose size={18} />
    </button>
  );
}

/** La sortie retenue : ce qu'il faut dire, et quoi faire si on arrête. */
export type SortieRetenue = {
  question: string;   // « Raccrocher la session ? »
  arreter: string;    // « Raccrocher »
  garder: string;     // « La garder ouverte »
  onArreter: () => void;
};

/**
 * La barre de confirmation d'un arrêt — à même le pied de la fenêtre, jamais
 * une deuxième fenêtre par-dessus la première.
 */
export function BarreArret({
  retenue,
  onGarder,
}: {
  retenue: SortieRetenue;
  onGarder: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small font-medium">{retenue.question}</p>
      <div className="flex gap-2">
        <button
          onClick={onGarder}
          className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint"
        >
          {retenue.garder}
        </button>
        <button
          onClick={retenue.onArreter}
          className="flex-1 rounded-btn bg-negative py-2.5 text-small font-medium text-white transition hover:opacity-90"
        >
          {retenue.arreter}
        </button>
      </div>
    </div>
  );
}

/**
 * La feuille : la fenêtre unique de la plateforme. Posée en bas de l'écran
 * sur téléphone (la page reste visible au-dessus — on sait toujours où l'on
 * est), carte centrée à partir des écrans moyens.
 *
 * L'en-tête est ÉPINGLÉ : la sortie ne défile jamais avec le contenu. Le
 * pied, quand il existe, l'est aussi : les gestes restent sous le pouce.
 * Échap, le voile et le bouton sortent — et si `retenue` est fournie (une
 * session réseau en cours), ces trois chemins mènent à la même confirmation
 * légère au lieu de couper quoi que ce soit en silence.
 */
export function Feuille({
  entete,
  libelleFermer,
  onFermer,
  retenue,
  pied,
  children,
}: {
  entete: React.ReactNode;
  libelleFermer: string;
  onFermer: () => void;
  retenue?: SortieRetenue | null;
  // Le pied peut être une fonction : elle reçoit LA porte de sortie, pour
  // qu'un bouton « Annuler la session » passe par la même confirmation que
  // la croix et le voile — un seul chemin, jamais deux.
  pied?: React.ReactNode | ((sortir: () => void) => React.ReactNode);
  children: React.ReactNode;
}) {
  const [confirme, setConfirme] = useState(false);

  // Une seule porte de sortie : libre, elle ferme ; retenue, elle demande.
  const sortir = useCallback(() => {
    if (retenue) setConfirme(true);
    else onFermer();
  }, [retenue, onFermer]);

  // La session peut se terminer pendant que la question est posée : la
  // confirmation n'a alors plus d'objet, elle se retire d'elle-même.
  useEffect(() => {
    if (!retenue) setConfirme(false);
  }, [retenue]);

  // Échap sort — au clavier comme au doigt, la même porte.
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") sortir();
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [sortir]);

  return (
    <div
      className="voile fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4"
      onClick={sortir}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="surgit flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-card border-t border-line bg-surface-raised md:max-h-[85dvh] md:rounded-card md:border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line py-3.5 pl-5 pr-3.5">
          <div className="min-w-0 flex-1">{entete}</div>
          <BoutonFermer onClick={sortir} libelle={libelleFermer} />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {(pied || confirme) && (
          <footer className="shrink-0 border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4">
            {confirme && retenue ? (
              <BarreArret retenue={retenue} onGarder={() => setConfirme(false)} />
            ) : (
              typeof pied === "function" ? pied(sortir) : pied
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
