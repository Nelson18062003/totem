/**
 * LES ÉTATS ET LE FEEDBACK — `docs/SYSTEME.md` § 5.6
 *
 * Ce que l'écran répond quand il compte, quand il prévient, quand il n'a rien
 * à montrer, quand il attend. Cinq objets, et un seul de chaque : l'état vide
 * était réécrit à la main QUATRE fois, avec quatre paddings verticaux
 * différents — 48, 40, 32 et 20 px — alors que `app/vide.tsx` existait déjà.
 *
 * Deux règles gouvernent tout ce fichier :
 *
 *   — AUCUN de ces objets n'est un contrôle. Un badge, une puce, un bandeau
 *     ne se touchent pas : ils portent `h-badge` (20) et `h-puce` (28), pas
 *     `h-controle`. Une puce sur laquelle ON CLIQUE n'est pas une puce
 *     d'information : elle prend 44 px, et elle vit ailleurs.
 *
 *   — LA COULEUR NE PORTE JAMAIS SEULE L'INFORMATION (WCAG 1.4.1). Crédit et
 *     débit sont à 1,21:1 l'un de l'autre : indiscernables en niveaux de gris.
 *     Un bandeau a donc une icône ET un texte ; une pastille a toujours son
 *     libellé pour le lecteur d'écran.
 *
 * On n'éteint jamais par l'opacité, et on ne réécrit jamais l'anneau de focus :
 * il est global (`:focus-visible` dans globals.css).
 */

import type { ReactNode } from "react";

/** Les tons de l'interface. `neutre` est le défaut : il ne dit rien de plus. */
export type Ton = "neutre" | "accent" | "positive" | "negative" | "alert";

/** Aplats — fond plein, encre `sur-couleur`. Tous au-dessus de 4,5:1. */
const APLAT: Record<Ton, string> = {
  neutre: "bg-surface-3 text-ink",
  accent: "bg-accent text-sur-couleur",
  positive: "bg-positive text-sur-couleur",
  negative: "bg-negative text-sur-couleur",
  alert: "bg-alert text-sur-couleur",
};

/** Tons doux — fond calme, encre colorée. Pour ce qui informe sans alerter. */
const DOUX: Record<Ton, string> = {
  neutre: "bg-surface-2 text-ink-soft",
  accent: "bg-accent-soft text-accent",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  alert: "bg-alert-soft text-alert",
};

/* ────────────────────────────────────────────────────────────────────────────
 * PASTILLE — `h-badge` (20). NON interactive.
 *
 * Deux formes, un seul objet : avec un compte, c'est le badge de la boîte de
 * réception ; sans compte, c'est le point muet d'une ligne non lue. Le point
 * fait 8 px (un cran de l'échelle) et se centre dans les 20 px du badge, pour
 * que les deux formes s'alignent sur la même colonne.
 *
 * `etiquette` n'est pas décorative : c'est la seule chose qu'entend un lecteur
 * d'écran. « 3 » ne veut rien dire ; « 3 messages non lus », si.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Pastille({
  compte,
  etiquette,
  ton = "accent",
}: {
  /** Le nombre à afficher. Absent : point muet. */
  compte?: number;
  /** Ce que le lecteur d'écran annonce. Obligatoire. */
  etiquette: string;
  ton?: Ton;
}) {
  if (compte === undefined) {
    return (
      <span className="inline-flex h-badge min-w-badge items-center justify-center">
        <span className={`size-2 rounded-full ${APLAT[ton]}`} aria-hidden />
        <span className="sr-only">{etiquette}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-badge min-w-badge items-center justify-center rounded-full px-1 text-caption tabnums ${APLAT[ton]}`}
    >
      <span aria-hidden>{compte}</span>
      <span className="sr-only">{etiquette}</span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * PUCE D'INFORMATION — `h-puce` (28). NON interactive.
 *
 * Elle dit un état, une catégorie, un opérateur. Elle ne se clique pas : si on
 * peut appuyer dessus, ce n'est plus une puce d'information mais un contrôle,
 * et un contrôle fait 44 px.
 *
 * L'icône, si elle est là, est une `size-icone-sm` (16) : c'est la taille en
 * ligne dans du texte, et 20 px déborderait des 28 px de la puce.
 * ──────────────────────────────────────────────────────────────────────────── */
export function PuceInfo({
  icone,
  ton = "neutre",
  children,
}: {
  /** Une icône du jeu, en 16 : `<IconDoc size={16} />`. */
  icone?: ReactNode;
  ton?: Ton;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-puce max-w-full items-center gap-2 rounded-full px-3 text-small ${DOUX[ton]}`}
    >
      {icone && (
        <span className="flex size-icone-sm shrink-0 items-center justify-center" aria-hidden>
          {icone}
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * BANDEAU — `min-h-controle-fort` (48), `p-4`, icône 20.
 *
 * `min-h` et non `h` : le texte peut faire trois lignes, le bandeau grandit.
 * Mais il ne descend jamais sous 48 px, sinon un bandeau d'une ligne se lit
 * comme une note en passant.
 *
 * L'ICÔNE EST OBLIGATOIRE, et c'est délibéré : sans elle, le ton serait la
 * seule chose qui distingue une réussite d'un échec — et le ton, en niveaux de
 * gris, n'existe plus. Chaque ton a désormais SON dessin dans le jeu d'icônes :
 * `IconCheck`, `IconError`, `IconAlert`, `IconInfo`.
 *
 * Le fond est le ton doux (`positive-soft`, `negative-soft`, `alert-soft`,
 * `accent-soft`) : à peine détaché du blanc, assez pour poser un bloc, pas
 * assez pour crier. Le filet du ton porte le bord à 3:1.
 * ──────────────────────────────────────────────────────────────────────────── */
export type TonBandeau = "alert" | "negative" | "positive" | "accent";

const FOND: Record<TonBandeau, string> = {
  alert: "border-alert bg-alert-soft",
  negative: "border-negative bg-negative-soft",
  positive: "border-positive bg-positive-soft",
  accent: "border-accent bg-accent-soft",
};

const ENCRE: Record<TonBandeau, string> = {
  alert: "text-alert",
  negative: "text-negative",
  positive: "text-positive",
  accent: "text-accent",
};

export function Bandeau({
  ton,
  icone,
  titre,
  children,
}: {
  ton: TonBandeau;
  /** L'icône du ton, en 20 : `<IconAlert size={20} />`. Obligatoire. */
  icone: ReactNode;
  titre?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`flex min-h-controle-fort items-start gap-3 rounded-card border p-4 ${FOND[ton]}`}
    >
      <span
        className={`flex size-icone shrink-0 items-center justify-center ${ENCRE[ton]}`}
        aria-hidden
      >
        {icone}
      </span>
      <div className="min-w-0 max-w-lecture">
        {titre && <p className={`text-body font-medium ${ENCRE[ton]}`}>{titre}</p>}
        <div className={titre ? "mt-1 text-small text-ink-soft" : "text-small text-ink-soft"}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * VIDE — `p-6` (24). UN SEUL composant.
 *
 * Une liste vide n'est pas une erreur : c'est souvent la situation normale (un
 * dimanche sans client, une recherche trop étroite). Le ton reste calme, et on
 * dit quoi faire ensuite plutôt que de laisser un blanc.
 *
 * Un seul padding, `p-6`, et il ne se discute pas — c'est exactement ce que les
 * quatre copies à la main n'avaient pas.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Vide({
  titre,
  detail,
  action,
  icone,
}: {
  /**
   * `ReactNode` et non `string` : certaines phrases du dictionnaire portent un
   * LIEN EN LEUR MILIEU — « ajoutez-les dans les [Réglages] ». Contraint à une
   * chaîne, le composant obligeait à sortir le lien de la phrase et à en faire
   * un bouton à part : l'écran affichait alors « ajoutez-les dans les », point
   * final, et un bouton en dessous. Une phrase amputée est pire qu'un mauvais
   * alignement — surtout pour quelqu'un qui n'est pas informaticien.
   */
  titre: ReactNode;
  detail?: ReactNode;
  /** Le bouton « et maintenant ? ». Optionnel : parfois il n'y a rien à faire. */
  action?: ReactNode;
  /** Une icône du jeu, en 24 : `<IconInbox size={24} />`. */
  icone?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface-raised p-6 text-center">
      {icone && (
        <div className="mb-4 flex justify-center text-ink-faint" aria-hidden>
          {icone}
        </div>
      )}
      <p className="text-heading">{titre}</p>
      {detail && <p className="mx-auto mt-2 max-w-lecture text-body text-ink-soft">{detail}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CHARGEMENT — `size-icone-lg` (24).
 *
 * Une attente qui ne se dit pas n'existe pas : `role="status"` annonce le texte
 * au lecteur d'écran, que ce texte soit visible ou non. Le mot lui-même vient
 * de l'appelant — l'application est bilingue, un composant ne choisit pas la
 * langue.
 *
 * La rotation passe par `motion-safe:` : qui a demandé moins d'animations voit
 * un anneau immobile, et le texte reste annoncé. On n'écrit pas de nouvelle
 * animation pour ça.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Chargement({
  texte,
  visible = false,
}: {
  /** Ce qu'on annonce : « Chargement des messages… ». Obligatoire. */
  texte: string;
  /** Afficher le texte à côté de l'anneau, et pas seulement l'annoncer. */
  visible?: boolean;
}) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3">
      {/* 2 px de trait : de l'optique, pas de la mise en page — le seul endroit
          où le 2 px a le droit d'exister. */}
      <span
        className="size-icone-lg shrink-0 rounded-full border-2 border-surface-3 border-t-accent motion-safe:animate-spin"
        aria-hidden
      />
      <span className={visible ? "text-small text-ink-soft" : "sr-only"}>{texte}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SQUELETTE — les blocs d'attente.
 *
 * POINT CRITIQUE : un squelette qui ment est pire qu'un écran blanc. Ceux de
 * `app/loading.tsx` annoncent 48 px là où le vrai contrôle en fait 42, et
 * 56 px là où la vraie rangée en fait 68 : la page saute au moment où les
 * données arrivent, c'est-à-dire exactement au moment où l'œil se pose.
 *
 * Un squelette ne choisit donc PAS sa hauteur : il porte celle du composant
 * qu'il remplace, prise dans le même vocabulaire que lui. `h-controle` pour un
 * bouton, `h-rangee-2` pour une rangée de deux lignes, et les trois jetons de
 * LIGNE DE TEXTE pour du texte — `h-ligne-sm` (20), `h-ligne` (24),
 * `h-ligne-lg` (28). Ces trois-là ne viennent pas de l'échelle d'espacement
 * mais de l'échelle typographique : un écart et une ligne de texte ne se
 * mesurent pas au même mètre.
 *
 * Il est `aria-hidden` : il ne dit rien. C'est `<Chargement>` qui parle.
 * ──────────────────────────────────────────────────────────────────────────── */
export type HauteurSquelette =
  | "h-4" // 16 — une ligne de text-caption
  | "h-ligne-sm" // 20 — une ligne de text-small
  | "h-ligne" // 24 — une ligne de text-body
  | "h-ligne-lg" // 28 — une ligne de text-title
  | "h-badge" // 20 — une pastille
  | "h-puce" // 28 — une puce d'information
  | "h-controle-compact" // 40
  | "h-controle" // 44
  | "h-controle-fort" // 48
  | "h-rangee" // 56 — rangée d'une ligne
  | "h-rangee-2" // 72 — rangée de deux lignes
  | "h-rangee-3" // 88 — rangée de trois lignes
  | "h-8" // 32
  | "h-12" // 48
  | "h-16"; // 64

export type LargeurSquelette = "w-full" | "w-1/2" | "w-1/3" | "w-2/3" | "w-1/4";

export function Squelette({
  hauteur,
  largeur = "w-full",
  rayon = "rounded-card",
  nombre = 1,
}: {
  /** La hauteur du VRAI composant remplacé. Pas une approximation. */
  hauteur: HauteurSquelette;
  largeur?: LargeurSquelette;
  rayon?: "rounded-card" | "rounded-btn" | "rounded-sm" | "rounded-full";
  /** Combien de blocs empilés, séparés de 8 px. */
  nombre?: number;
}) {
  const blocs = Array.from({ length: Math.max(1, nombre) }, (_, i) => (
    <div
      key={i}
      className={`${hauteur} ${largeur} ${rayon} bg-surface-2 motion-safe:animate-pulse`}
    />
  ));
  return (
    <div aria-hidden className={nombre > 1 ? "space-y-2" : undefined}>
      {blocs}
    </div>
  );
}
