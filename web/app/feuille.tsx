"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
 * sortie est libre (sans perte) ou retenue (une session vivante à raccrocher,
 * une saisie à ne pas jeter par mégarde).
 */

/** Le bouton de fermeture : cible de 44 px, bord visible, étiquette exacte. */
export function BoutonFermer({
  onClick,
  libelle,
  disabled = false,
}: {
  onClick: () => void;
  libelle: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={libelle}
      title={libelle}
      disabled={disabled}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface-raised text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-40"
    >
      <IconClose size={18} />
    </button>
  );
}

/** La sortie retenue : ce qu'il faut dire, et quoi faire si on arrête. */
export type SortieRetenue = {
  question: string;   // « Raccrocher la session ? », « Jeter la saisie ? »
  arreter: string;    // « Raccrocher », « Jeter »
  garder: string;     // « La garder ouverte », « Continuer la saisie »
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
 *
 * Le clavier reste DANS la fenêtre : le focus est piégé tant qu'elle est
 * ouverte, et rendu à son propriétaire à la fermeture.
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
  const boite = useRef<HTMLDivElement>(null);
  // Un glisser commencé DANS la feuille et lâché sur le voile n'est pas un
  // appui sur le voile : seule une pression née sur le voile compte.
  const pressionNeeSurVoile = useRef(false);
  const idTitre = useId();

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

  // Le piège à focus : le clavier entre dans la fenêtre à l'ouverture, y
  // circule en boucle, et revient d'où il venait à la fermeture.
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    boite.current?.focus();
    const focusables = (): HTMLElement[] =>
      [...(boite.current?.querySelectorAll<HTMLElement>(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((e) => !e.hasAttribute("disabled") && e.offsetParent !== null);
    const piege = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const actif = document.activeElement;
      const dedans = boite.current?.contains(actif as Node);
      if (!dedans) { e.preventDefault(); els[0].focus(); return; }
      if (e.shiftKey && (actif === els[0] || actif === boite.current)) {
        e.preventDefault(); els[els.length - 1].focus();
      } else if (!e.shiftKey && actif === els[els.length - 1]) {
        e.preventDefault(); els[0].focus();
      }
    };
    window.addEventListener("keydown", piege, true);
    return () => {
      window.removeEventListener("keydown", piege, true);
      avant?.focus?.();
    };
  }, []);

  return (
    <div
      className="voile fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4"
      onMouseDown={(e) => { pressionNeeSurVoile.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressionNeeSurVoile.current) sortir();
      }}
    >
      <div
        ref={boite}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        className="surgit flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-card border-t border-line bg-surface-raised outline-none md:max-h-[85dvh] md:rounded-card md:border"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line py-3.5 pl-5 pr-3.5">
          <div id={idTitre} className="min-w-0 flex-1">{entete}</div>
          <BoutonFermer onClick={sortir} libelle={libelleFermer} />
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

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
