"use client";

import { useId, type ReactNode } from "react";

import { IconCheck } from "@/app/icons";

/*
 * SÉLECTEURS ET CONTRÔLES — la famille 5.5 du système (docs/SYSTEME.md).
 *
 * Cinq objets, une seule règle de dimension : ce sur quoi on appuie fait 44 px.
 *
 * Ce que ce fichier corrige, mesuré dans l'application :
 *
 *   — L'interrupteur faisait 40 × 24 sans aucune zone étendue : sous la cible
 *     sur les deux axes. Il fait maintenant 48 × 28 de piste, dans une région
 *     d'appui de 48 × 44.
 *   — Sa piste éteinte était à 1,22:1 sur du blanc et sa pastille blanche à
 *     1,22:1 sur la piste. WCAG 1.4.11 demande 3:1 pour la piste ET pour la
 *     pastille : l'état est une information, pas une décoration. La piste au
 *     repos prend `contour` (3,39:1 sur blanc), la pastille reste blanche
 *     (3,39:1 sur la piste).
 *   — La pastille sautait d'un bord à l'autre par `justify-start` /
 *     `justify-end` : aucune position à animer. Elle TRANSLATE désormais.
 *   — Les puces sélectionnables existaient en trois hauteurs (28, 32, 40) et
 *     deux rayons. Une puce sur laquelle on clique n'est pas un badge : elle
 *     prend `h-controle` comme tout le reste.
 *   — Les segments de langue changeaient de hauteur selon l'état (38 actif,
 *     40 inactif) parce que seul l'inactif portait une bordure. La hauteur est
 *     posée par le GROUPE ; les segments l'occupent, quel que soit leur état.
 *   — Aucun de ces contrôles n'avait d'état éteint ni de focus propre.
 *
 * Deux principes qu'on ne réécrit pas ici :
 *
 *   LA CIBLE N'EST PAS LE DESSIN. Une case fait 20 px visibles ; la région qui
 *   accepte l'appui en fait 44. C'est admis : la cible est la surface qui
 *   réagit, pas le trait qu'on voit.
 *
 *   LE FOCUS EST GLOBAL (`:focus-visible` dans globals.css). Aucun composant
 *   ne pose `outline-none`. Là où le visuel est plus petit que la cible,
 *   l'élément qui reçoit le focus est le VISUEL — la zone étendue est portée
 *   par un parent ou un pseudo-élément, jamais par l'élément focusable — pour
 *   que l'anneau cerne le dessin et non du vide.
 */

/** La région d'appui : 44 × 44 autour d'un visuel plus petit. */
const CIBLE = "grid size-controle shrink-0 place-items-center";

/** Ce que tout contrôle porte. Le libellé n'est jamais facultatif. */
type Commun = {
  /** Obligatoire : un contrôle sans libellé n'est annonçable par personne. */
  libelle: string;
  /** Le libellé reste annoncé, mais ne s'affiche pas (rangée déjà titrée). */
  libelleMasque?: boolean;
  /** Précision affichée sous le libellé, rattachée par `aria-describedby`. */
  description?: string;
  /** Éteint : inerte mais lisible. Jamais par l'opacité. */
  eteint?: boolean;
  /** Classes de mise en page posées sur l'enveloppe (largeur, alignement). */
  classe?: string;
};

/** Le libellé et sa précision, communs aux cinq contrôles. */
function Etiquette({
  id,
  libelle,
  libelleMasque,
  description,
  eteint,
}: Commun & { id: string }) {
  return (
    <span className="flex flex-col">
      <span
        id={`${id}-libelle`}
        className={
          libelleMasque
            ? "sr-only"
            : `text-body ${eteint ? "text-ink-eteint" : "text-ink"}`
        }
      >
        {libelle}
      </span>
      {description && (
        <span
          id={`${id}-description`}
          className={`text-small ${eteint ? "text-ink-eteint" : "text-ink-soft"}`}
        >
          {description}
        </span>
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1 · L'INTERRUPTEUR
 *
 * Piste 48 × 28, pastille 24, course 20. Le rapport 48/28 = 1,71 : tous les
 * systèmes qui publient la valeur sont entre 1,6 et 2,0.
 *
 * La géométrie ferme d'elle-même : le retrait `optique` (2 px) tout autour
 * laisse 24 px de haut — la pastille, exactement — et 44 px de large. La
 * course ne se choisit donc pas, elle se calcule : 48 − 24 − 2 × 2 = 20,
 * c'est-à-dire le jeton `course`.
 *
 * La zone d'appui (48 × 44) est portée par un pseudo-élément : elle ne déplace
 * rien dans la page, et l'anneau de focus reste sur la piste — sur ce qu'on
 * voit, pas sur la région invisible.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Interrupteur({
  libelle,
  libelleMasque,
  description,
  actif,
  surChangement,
  eteint,
  classe,
}: Commun & {
  actif: boolean;
  surChangement: (actif: boolean) => void;
}) {
  const id = useId();
  return (
    <span className={`inline-flex items-center gap-3 ${classe ?? ""}`}>
      <Etiquette
        id={id}
        libelle={libelle}
        libelleMasque={libelleMasque}
        description={description}
        eteint={eteint}
      />
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-labelledby={`${id}-libelle`}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={eteint}
        onClick={() => surChangement(!actif)}
        className={`relative flex h-piste-h w-piste shrink-0 items-center rounded-full p-optique transition-teintes before:absolute before:left-0 before:top-1/2 before:h-controle before:w-piste before:-translate-y-1/2 before:content-[''] ${
          eteint
            ? "bg-surface-eteint"
            : actif
              ? "bg-accent hover:bg-accent-hover"
              : "bg-contour"
        }`}
      >
        <span
          className={`size-pastille rounded-full bg-sur-couleur transition-transform duration-200 ease-out motion-reduce:transition-none ${
            eteint ? "border border-ink-eteint" : ""
          } ${actif ? "translate-x-course" : "translate-x-0"}`}
        />
      </button>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2 · LA CASE À COCHER
 *
 * 20 × 20 visibles, rayon 6, cible 44 × 44 portée par l'enveloppe. Vraie
 * `<input type="checkbox">` : l'état, le clavier et l'annonce viennent du
 * navigateur, pas d'une imitation.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Case({
  libelle,
  libelleMasque,
  description,
  cochee,
  surChangement,
  eteint,
  classe,
}: Commun & {
  cochee: boolean;
  surChangement: (cochee: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      className={`inline-flex items-center gap-2 ${
        eteint ? "cursor-not-allowed" : "cursor-pointer"
      } ${classe ?? ""}`}
    >
      <span className={CIBLE}>
        <span className="relative grid size-case place-items-center">
          <input
            type="checkbox"
            checked={cochee}
            disabled={eteint}
            aria-describedby={description ? `${id}-description` : undefined}
            onChange={(e) => surChangement(e.target.checked)}
            className="peer size-case appearance-none rounded-sm border border-contour bg-surface-raised transition-teintes checked:border-accent checked:bg-accent disabled:border-contour disabled:bg-surface-eteint checked:disabled:border-ink-eteint checked:disabled:bg-ink-eteint"
          />
          <IconCheck className="pointer-events-none absolute left-1/2 top-1/2 size-icone-sm -translate-x-1/2 -translate-y-1/2 text-sur-couleur opacity-0 peer-checked:opacity-100" />
        </span>
      </span>
      <Etiquette
        id={id}
        libelle={libelle}
        libelleMasque={libelleMasque}
        description={description}
        eteint={eteint}
      />
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3 · LE BOUTON RADIO
 *
 * Même dessin que la case, en rond, et le même écart : 20 visibles, 44 de
 * cible. Vrai `<input type="radio">` : c'est lui qui donne la navigation par
 * flèches à l'intérieur d'un même `nom`.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Radio({
  libelle,
  libelleMasque,
  description,
  nom,
  valeur,
  choisi,
  surChangement,
  eteint,
  classe,
}: Commun & {
  /** Le nom du groupe : deux radios de même `nom` s'excluent. */
  nom: string;
  valeur: string;
  choisi: boolean;
  surChangement: (valeur: string) => void;
}) {
  const id = useId();
  return (
    <label
      className={`inline-flex items-center gap-2 ${
        eteint ? "cursor-not-allowed" : "cursor-pointer"
      } ${classe ?? ""}`}
    >
      <span className={CIBLE}>
        <span className="relative grid size-case place-items-center">
          <input
            type="radio"
            name={nom}
            value={valeur}
            checked={choisi}
            disabled={eteint}
            aria-describedby={description ? `${id}-description` : undefined}
            onChange={() => surChangement(valeur)}
            className="peer size-case appearance-none rounded-full border border-contour bg-surface-raised transition-teintes checked:border-accent checked:bg-accent disabled:border-contour disabled:bg-surface-eteint checked:disabled:border-ink-eteint checked:disabled:bg-ink-eteint"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sur-couleur opacity-0 peer-checked:opacity-100"
          />
        </span>
      </span>
      <Etiquette
        id={id}
        libelle={libelle}
        libelleMasque={libelleMasque}
        description={description}
        eteint={eteint}
      />
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4 · LA PUCE SÉLECTIONNABLE — EN FIN DE VIE POUR LE FILTRAGE
 *
 * Elle reste ce qu'elle était : un objet qu'on clique, donc `h-controle` (44),
 * un seul rayon, une bordure dans tous les états pour que la largeur ne bouge
 * pas quand la sélection change.
 *
 * MAIS ELLE NE DOIT PLUS SERVIR À FILTRER UNE LISTE. Mesuré sur l'écran des
 * encaissements et sur un téléphone de 390 px : sept puces réclamaient 637 px
 * pour 358 disponibles. Elles passaient sur deux rangées, et la dernière
 * restait seule avec 261 px de vide. Ce n'est pas une affaire de largeur de
 * puce : le nombre de choix grandit avec les données, la largeur de l'écran
 * non — AUCUNE FORME DE PUCE NE TIENDRA JAMAIS SUR UNE RANGÉE.
 *
 * Ce qui filtre désormais : `app/ui/filtre.tsx` — un déclencheur compact qui
 * affiche son état (« Opérateur : MTN ») et une feuille basse qui déplie les
 * choix. La largeur d'une barre de filtres ne dépend plus du nombre de choix.
 *
 * La puce garde donc UN emploi : un choix binaire, isolé, dont le libellé
 * tient — jamais une série de sept.
 * ──────────────────────────────────────────────────────────────────────────── */
export function PuceFiltre({
  libelle,
  selectionnee,
  surChangement,
  icone,
  eteint,
  classe,
}: {
  libelle: string;
  selectionnee: boolean;
  surChangement: (selectionnee: boolean) => void;
  /** Icône `size-icone` (20) posée avant le libellé. */
  icone?: ReactNode;
  eteint?: boolean;
  classe?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selectionnee}
      disabled={eteint}
      onClick={() => surChangement(!selectionnee)}
      className={`inline-flex h-controle shrink-0 items-center justify-center gap-2 rounded-full border px-4 text-small font-medium transition-teintes ${
        eteint
          ? "cursor-not-allowed border-contour bg-surface-eteint text-ink-eteint"
          : selectionnee
            ? "border-accent bg-accent text-sur-couleur hover:bg-accent-hover"
            : "border-contour bg-surface-raised text-ink hover:bg-surface-2"
      } ${classe ?? ""}`}
    >
      {icone}
      {libelle}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5 · LE GROUPE DE SEGMENTS
 *
 * Le choix de la langue en est un. La hauteur est posée UNE fois, par le
 * groupe ; chaque segment l'occupe entièrement (`h-full`). Aucun état
 * n'ajoute ni ne retire de bordure extérieure : c'est ce qui faisait un actif
 * de 38 px à côté d'un inactif de 40.
 *
 * Le cadre du groupe est un ANNEAU INTÉRIEUR, pas une bordure. Une bordure de
 * 1 px prend sa place DANS la boîte : le groupe restait à 44, mais les
 * segments en `h-full` n'héritaient plus que de 42 — mesuré — et tombaient
 * sous le plancher de R2. L'anneau ne prend aucune place : le groupe fait 44,
 * chaque segment fait 44.
 *
 * Un seul rayon pour tout le groupe : `rounded-btn` au cadre, que l'anneau
 * suit, et que reprennent les deux segments des extrémités. Pas de
 * `overflow-hidden` — il rognerait l'anneau de focus du segment.
 * ──────────────────────────────────────────────────────────────────────────── */
export type OptionSegment = {
  valeur: string;
  libelle: string;
  eteint?: boolean;
};

export function GroupeSegments({
  libelle,
  options,
  valeur,
  surChangement,
  pleineLargeur,
  eteint,
  classe,
}: {
  /** Obligatoire : ce que le groupe choisit (« Langue », « Période »). */
  libelle: string;
  options: readonly OptionSegment[];
  valeur: string;
  surChangement: (valeur: string) => void;
  /** Les segments se partagent la largeur disponible, à parts égales. */
  pleineLargeur?: boolean;
  eteint?: boolean;
  classe?: string;
}) {
  return (
    <div
      role="group"
      aria-label={libelle}
      className={`${pleineLargeur ? "flex w-full" : "inline-flex"} h-controle items-stretch rounded-btn ring-1 ring-inset ring-contour ${
        eteint ? "bg-surface-eteint" : "bg-surface-raised"
      } ${classe ?? ""}`}
    >
      {options.map((option, rang) => {
        const choisi = option.valeur === valeur;
        const inerte = Boolean(eteint || option.eteint);
        return (
          <button
            key={option.valeur}
            type="button"
            aria-pressed={choisi}
            disabled={inerte}
            onClick={() => surChangement(option.valeur)}
            className={`flex h-full items-center justify-center gap-2 px-4 text-small font-medium transition-teintes first:rounded-l-btn last:rounded-r-btn ${
              pleineLargeur ? "flex-1" : ""
            } ${rang > 0 ? "border-l border-contour" : ""} ${
              inerte
                ? `cursor-not-allowed text-ink-eteint ${choisi ? "bg-surface-3" : ""}`
                : choisi
                  ? "bg-accent text-sur-couleur hover:bg-accent-hover"
                  : "text-ink hover:bg-surface-2"
            }`}
          >
            {option.libelle}
          </button>
        );
      })}
    </div>
  );
}
