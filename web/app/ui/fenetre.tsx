"use client";

/**
 * LA FENÊTRE — `docs/SYSTEME.md` § 5.7
 *
 * Ce n'est pas une famille de plus, c'est une correction de défauts réels. Les
 * deux fenêtres de l'application — la fiche d'un SMS et la fenêtre d'opération
 * — se sont écrites deux fois, séparément, et chacune a perdu quelque chose :
 *
 *   1. LA FICHE N'AVAIT NI HAUTEUR MAXIMALE NI DÉFILEMENT. Un SMS de quatre
 *      lignes poussait les boutons d'action sous le bord de l'écran, sans
 *      aucun moyen de les atteindre : ni molette, ni glissement — la feuille
 *      dépassait, simplement. Ici, le CORPS SEUL défile.
 *
 *   2. LA FENÊTRE D'OPÉRATION METTAIT SON EN-TÊTE DANS LA ZONE DÉFILANTE.
 *      `overflow-y-auto` englobait tout : au troisième échange USSD, le bouton
 *      de fermeture était parti vers le haut. Ici, l'en-tête et le pied sont
 *      fixes, et ne bougent jamais.
 *
 *   3. AUCUNE DES DEUX N'ÉTAIT UNE FENÊTRE POUR QUI NE VOIT PAS L'ÉCRAN. Ni
 *      `role="dialog"`, ni `aria-modal`, ni fermeture à la touche Échap, ni
 *      piège de focus : la tabulation continuait tranquillement dans la page
 *      cachée derrière le voile. Les quatre sont là, et le focus revient à
 *      l'élément qui a ouvert la fenêtre quand elle se referme.
 *
 *   4. LE BOUTON DE FERMETURE FAISAIT 18×18. Il fait 44×44.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/app/icons";

/**
 * LA HAUTEUR NE SE TROUVE PAS À L'ŒIL.
 *
 * `max-h-[92dvh]` et `min-h-[70dvh]` n'étaient pas des mesures : c'étaient
 * deux nombres qui « rendaient bien » sur un téléphone donné, un jour donné.
 * Ici la hauteur se calcule, et le calcul a un nom :
 *
 *     hauteur de la fenêtre = écran visible
 *                           − zone de fermeture
 *                           − marge basse sûre
 *
 * — La ZONE DE FERMETURE est la bande de voile laissée au-dessus de la
 *   feuille. Sur mobile, c'est le seul endroit où l'on peut appuyer pour
 *   fermer sans viser le bouton : elle vaut donc une cible, `h-controle` (44).
 *   C'est elle qui interdit à la feuille de couvrir tout l'écran.
 *
 * — La MARGE BASSE SÛRE est la barre système du téléphone
 *   (`env(safe-area-inset-bottom)`), zéro partout ailleurs.
 *
 * Sur grand écran la feuille est centrée dans un voile qui porte `md:p-6` :
 * `md:max-h-full` la borne alors à la boîte de contenu de ce voile, soit
 * l'écran moins deux fois 24 px. Là encore, aucun nombre écrit à la main.
 */
const MESURES = {
  "--zone-fermeture": "var(--spacing-controle)",
  "--marge-basse-sure": "env(safe-area-inset-bottom, 0px)",
  "--hauteur-fenetre": "calc(100dvh - var(--zone-fermeture) - var(--marge-basse-sure))",
} as React.CSSProperties;

// Ce qui peut recevoir le focus à l'intérieur de la fenêtre. Sert au piège de
// focus : la tabulation tourne en rond dedans, elle ne s'échappe pas derrière.
const FOCUSABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Fenetre({
  titre,
  description,
  etiquetteFermer,
  onFermer,
  pied,
  children,
  ouverte = true,
}: {
  /** Le titre lu à l'ouverture. Il nomme la fenêtre (`aria-labelledby`). */
  titre: string;
  /** Une phrase de contexte sous le titre. Optionnelle. */
  description?: string;
  /** Ce qu'annonce le bouton de fermeture : « Fermer la fiche ». Obligatoire. */
  etiquetteFermer: string;
  onFermer: () => void;
  /** Les actions, dans le pied FIXE : elles ne partent jamais au défilement. */
  pied?: ReactNode;
  children: ReactNode;
  ouverte?: boolean;
}) {
  // Un portail vise `document.body`, qui n'existe pas au rendu serveur :
  // on n'ouvre la fenêtre qu'une fois montée dans le navigateur.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  const idTitre = useId();
  const idDescription = useId();
  const boite = useRef<HTMLDivElement>(null);

  // Échap ferme. C'est écouté sur le document : où que soit le focus, la
  // touche sort de la fenêtre.
  useEffect(() => {
    if (!ouverte) return;
    const auDocument = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFermer();
      }
    };
    document.addEventListener("keydown", auDocument);
    return () => document.removeEventListener("keydown", auDocument);
  }, [ouverte, onFermer]);

  // Le focus entre dans la fenêtre à l'ouverture, et REVIENT À SON POINT DE
  // DÉPART à la fermeture — sinon il repart du haut de la page, et l'on perd
  // la ligne sur laquelle on travaillait.
  //
  // L'effet DOIT attendre le montage. Le portail introduit un premier rendu où
  // le composant renvoie `null` : la boîte n'existe pas encore, `boite.current`
  // vaut `null`, et un effet qui ne dépendrait que de `ouverte` s'exécuterait
  // dans ce vide — le focus n'entrerait jamais. Mesuré avant correction : il
  // fallait 15 tabulations pour atteindre « Fermer », et les 14 arrêts
  // traversés étaient masqués aux lecteurs d'écran par `aria-modal`.
  //
  // Réparer l'atteinte au doigt et casser l'atteinte au clavier dans le même
  // geste : c'est exactement ce que le contrôle adversarial doit trouver.
  useEffect(() => {
    if (!ouverte || !monte) return;
    const declencheur = document.activeElement as HTMLElement | null;
    boite.current?.focus();
    return () => declencheur?.focus?.();
  }, [ouverte, monte]);

  // Le fond ne défile pas pendant qu'une fenêtre est ouverte : sinon la page
  // glisse derrière le voile et l'on ne retrouve plus où l'on en était.
  useEffect(() => {
    if (!ouverte) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // ET LE FOND DEVIENT INERTE. `aria-modal` dit aux lecteurs d'écran
    // d'ignorer ce qu'il y a derrière — mais il ne retire rien du parcours de
    // tabulation. Résultat mesuré : quatorze arrêts traversables derrière le
    // voile, et masqués aux lecteurs d'écran. On tabulait dans un contenu que
    // rien n'annonçait plus. `inert` ferme les deux à la fois.
    const endormis: Element[] = [];
    for (const enfant of Array.from(document.body.children)) {
      if (enfant.contains(boite.current) || enfant.hasAttribute("inert")) continue;
      enfant.setAttribute("inert", "");
      endormis.push(enfant);
    }

    return () => {
      document.body.style.overflow = avant;
      for (const e of endormis) e.removeAttribute("inert");
    };
  }, [ouverte, monte]);

  if (!ouverte) return null;

  // Le piège de focus : la tabulation boucle du dernier au premier élément.
  const auClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const cible = boite.current;
    if (!cible) return;
    const liste = Array.from(cible.querySelectorAll<HTMLElement>(FOCUSABLES));
    if (liste.length === 0) {
      e.preventDefault();
      cible.focus();
      return;
    }
    const premier = liste[0];
    const dernier = liste[liste.length - 1];
    const actif = document.activeElement;
    if (e.shiftKey && (actif === premier || actif === cible)) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && actif === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  // LA FENÊTRE SE POSE SUR LE CORPS DU DOCUMENT, PAS DANS LA PAGE.
  //
  // `z-30` ne suffisait pas, et le défaut était invisible à la lecture : la
  // classe `.entree` de la coquille anime l'opacité de `<main>` avec un
  // remplissage `both`, ce qui en fait un CONTEXTE D'EMPILEMENT. Tout ce qui
  // vit dedans est alors prisonnier de ce contexte : le voile en `z-30`
  // passait SOUS la barre flottante en `z-20`, qui est posée à la racine.
  //
  // Conséquence mesurée : sur un téléphone, le pied de la fiche d'un SMS —
  // « Télécharger le PDF », « Établir le reçu » — était recouvert par la barre
  // de navigation. `elementFromPoint` renvoyait l'icône de la barre. Le reçu
  // était donc intouchable, et personne ne l'avait vu parce que le code, lui,
  // était juste.
  //
  // Un portail replace la fenêtre à la racine du document : elle retrouve le
  // plan que son `z-30` annonçait depuis le début.
  if (!monte) return null;

  return createPortal(
    <div
      // `z-30` est LE plan du voile et de la fenêtre (§5.8) : au-dessus de ce
      // qui colle en défilant (10) et de la barre flottante (20). Rien ici ne
      // porte d'ombre — l'ombre du système appartient à la barre, et à elle
      // seule ; c'est le voile qui dit qu'on a changé de plan.
      className="voile fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-6"
      style={MESURES}
      // Appuyer sur le voile ferme — mais seulement le voile lui-même : un
      // glissement de sélection parti du contenu ne doit pas fermer la fenêtre.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        ref={boite}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={description ? idDescription : undefined}
        tabIndex={-1}
        onKeyDown={auClavier}
        className="surgit flex max-h-[var(--hauteur-fenetre)] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-line bg-surface-raised pb-[var(--marge-basse-sure)] md:max-h-full md:rounded-card md:pb-0"
      >
        {/* EN-TÊTE — FIXE. Hors de la zone défilante : le bouton de fermeture
            reste sous le pouce quel que soit le contenu. */}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-4">
          <div className="min-w-0">
            <h2 id={idTitre} className="text-heading">
              {titre}
            </h2>
            {description && (
              <p id={idDescription} className="mt-1 text-small text-ink-soft">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label={etiquetteFermer}
            className="flex size-controle shrink-0 items-center justify-center rounded-btn text-ink-soft transition-teintes hover:bg-surface-2 hover:text-ink"
          >
            <IconClose size={20} />
          </button>
        </header>

        {/* CORPS — LA SEULE ZONE QUI DÉFILE. `min-h-0` est indispensable : sans
            lui, un enfant de flex refuse de rétrécir sous sa taille de contenu
            et le défilement ne s'active jamais. */}
        <div className="min-h-0 grow overflow-y-auto p-4">{children}</div>

        {/* PIED — FIXE. Les actions ne partent pas avec le défilement : c'était
            tout le défaut de la fiche SMS. */}
        {pied && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line p-4">
            {pied}
          </footer>
        )}
      </div>
    </div>
    ,
    document.body,
  );
}
