"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { IconChevron } from "@/app/icons";

/**
 * LES RANGÉES DE LISTE — famille 5.3 du système (docs/SYSTEME.md).
 *
 * UNE RANGÉE DÉCLARE SA HAUTEUR, et c'est tout l'objet de ce fichier.
 *
 * Trois hauteurs, les seules qu'un système de référence publie (Material) :
 * 56 pour une ligne, 72 pour deux, 88 pour trois. Elles sont FERMES — `h-`,
 * jamais `min-h-` : une rangée qui grandit avec son contenu est une rangée
 * dont personne n'a choisi la hauteur.
 *
 * C'est le défaut qu'on corrige. La liste des encaissements rendait le SMS
 * entier en `whitespace-pre-wrap` : 76 px au minimum, sans plafond, 142 px
 * pour un SMS de quatre lignes. Une colonne de rangées n'avait plus de rythme.
 * Ici le texte long se TRONQUE (`line-clamp`) au nombre de lignes annoncé, et
 * le message entier s'ouvre dans la fiche — c'est là qu'on vient le lire.
 *
 * Le nombre de lignes n'est pas une décoration : il commande à la fois la
 * hauteur et la troncature, et le typage interdit un sous-titre sur une
 * rangée d'une seule ligne. On ne peut pas déborder par distraction.
 *
 * Une rangée cliquable dépasse partout les 44 px du plancher : la plus basse
 * en fait 56.
 */

/**
 * Le sens d'un montant. `neutre` quand le robot n'a pas établi le sens : on
 * n'invente pas un signe.
 */
export type SensMontant = "credit" | "debit" | "neutre";

/**
 * Un montant de rangée. C'EST LE COMPOSANT QUI POSE LE SIGNE, pas l'appelant :
 * crédit (#17603F) et débit (#8A2020) sont à 1,21:1 l'un de l'autre, donc
 * indiscernables en niveaux de gris. La couleur ne peut pas porter seule
 * l'information (WCAG 1.4.1). En passant `sens`, on obtient le `+` ou le `−`
 * dans la chaîne, toujours — il n'y a pas de moyen de l'oublier.
 */
export type MontantRangee = {
  /** Le montant déjà mis en forme, SANS signe : « 12 500 FCFA ». */
  texte: string;
  sens: SensMontant;
};

/** Une action de queue : un vrai contrôle, 44×44, pas une décoration. */
export type ActionRangee = {
  /** L'icône du contrôle — dimensionnée à 20 par la rangée. */
  icone: ReactNode;
  /** Ce que fait l'action, en toutes lettres : c'est le nom accessible. */
  libelle: string;
  onClick?: () => void;
  href?: string;
  /** Un lien qui sort de l'application (un reçu PDF) s'ouvre à côté. */
  externe?: boolean;
};

/** L'objet de tête. Une icône nue OU une pastille — jamais les deux. */
type Tete =
  | { icone?: ReactNode; pastille?: never }
  | { pastille?: ReactNode; icone?: never };

/**
 * Le corps, et le plafond de hauteur.
 * Une rangée d'une ligne n'a PAS de sous-titre : le type l'interdit, faute de
 * quoi la rangée déborderait sa hauteur annoncée.
 */
type Corps =
  | { lignes?: 1; sousTitre?: never }
  | { lignes: 2 | 3; sousTitre?: ReactNode };

/** La colonne de droite : un montant signé OU une valeur libre. */
type Droite =
  | { montant?: MontantRangee; valeur?: never }
  | { valeur?: ReactNode; montant?: never };

type Base = {
  /** Le titre de la rangée. Tronqué à une ligne, toujours. */
  titre: ReactNode;
  /** Le chevron du « ça s'ouvre ». N'a de sens que sur une rangée cliquable. */
  chevron?: boolean;
  /** L'action de queue — hors du bouton principal : on n'imbrique pas deux contrôles. */
  action?: ActionRangee;
  /** Rangée cliquable : bouton. */
  onClick?: () => void;
  /** Rangée cliquable : lien. Prioritaire sur `onClick` s'il est seul. */
  href?: string;
  /** Le lien sort de l'application. */
  externe?: boolean;
  /** Nom accessible du corps cliquable, si le titre ne suffit pas. */
  libelle?: string;
  className?: string;
};

export type ProprietesRangee = Base & Tete & Corps & Droite;

/** Hauteur et troncature vont ensemble : une seule table, aucune exception. */
const GABARIT = {
  1: { hauteur: "h-rangee", clampSousTitre: "" },
  2: { hauteur: "h-rangee-2", clampSousTitre: "line-clamp-1" },
  3: { hauteur: "h-rangee-3", clampSousTitre: "line-clamp-2" },
} as const;

const TEINTE_MONTANT: Record<SensMontant, string> = {
  credit: "text-positive",
  debit: "text-negative",
  neutre: "text-ink-soft",
};

/** Le signe fait partie du montant. Il n'est jamais facultatif. */
const SIGNE: Record<SensMontant, string> = {
  credit: "+",
  debit: "−",
  neutre: "",
};

/**
 * Une rangée de liste. Inerte (div), cliquable (bouton), ou navigante (lien).
 * Elle vit dans une `Liste`, qui pose les séparateurs.
 */
export function Rangee({
  titre,
  sousTitre,
  lignes = 1,
  icone,
  pastille,
  montant,
  valeur,
  chevron,
  action,
  onClick,
  href,
  externe,
  libelle,
  className = "",
}: ProprietesRangee) {
  const { hauteur, clampSousTitre } = GABARIT[lignes];

  // Padding horizontal `px-4`, écart entre éléments `gap-3`.
  //
  // LA GOUTTIÈRE. Quand une action de queue suit, les 12 px qui la séparent du
  // contenu ne peuvent pas être pris DANS le corps cliquable : le padding
  // appartient à la cible, les deux rectangles se touchent alors bord à bord,
  // et le doigt qui vise la rangée pour l'ouvrir télécharge le reçu. R2 impose
  // 8 px ENTRE deux cibles voisines qui font des choses différentes. On les
  // pose donc en `gap-2` sur la rangée (hors des deux cibles), et le corps ne
  // garde que `pr-1` : 4 + 8 = les 12 px du rythme, dont 8 de vide.
  //
  // À gauche, rien ne change : le corps va jusqu'au bord et garde toute la
  // hauteur. La gouttière ne se prend qu'entre deux cibles, jamais sur elles.
  const corps = `flex h-full min-w-0 flex-1 items-center gap-3 pl-4 ${
    action ? "pr-1" : "pr-4"
  } text-left`;
  const cliquable = "transition-teintes hover:bg-surface-2";

  const dedans = (
    <>
      {/* Objet de tête. L'icône nue prend la taille des rangées de liste (24) ;
          la pastille prend `size-disque` (32) et porte une icône de 16. Ni
          l'une ni l'autre ne fait 44 : ce qui a la taille d'un contrôle se
          clique, et le disque décoratif ne se clique pas. */}
      {icone && (
        <span className="grid size-icone-lg shrink-0 place-items-center text-ink-soft [&>svg]:size-icone-lg">
          {icone}
        </span>
      )}
      {pastille && (
        <span
          aria-hidden
          className="grid size-disque shrink-0 place-items-center rounded-full border border-line text-body text-ink-soft [&>svg]:size-icone-sm"
        >
          {pastille}
        </span>
      )}

      {/* LE CORPS. Le montant partage la PREMIÈRE LIGNE avec le titre ; le
          sous-titre passe dessous et prend toute la largeur.

          Trois colonnes rigides sur toute la hauteur — ce que faisait la
          première version — étranglaient le titre sur un téléphone de 390 px :
          « Orange · 23:31 » devenait « Orange · … » pour laisser passer
          « +150 000 FCFA ». Or ces deux-là ne se disputent qu'une ligne, pas
          la rangée entière : le texte du SMS, lui, n'a personne à sa droite.
          C'est ainsi que l'écran était composé avant la refonte, et il avait
          raison — le composant avait généralisé un peu trop vite. */}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-body">{titre}</span>

          {/* Les montants portent `.tabnums` : une colonne de montants
              s'aligne à la virgule. Le signe est écrit ici, jamais laissé au
              hasard de l'appelant. */}
          {montant && (
            <span
              className={`shrink-0 text-body font-medium tabnums ${TEINTE_MONTANT[montant.sens]}`}
            >
              {SIGNE[montant.sens]}
              {montant.texte}
            </span>
          )}
          {valeur && <span className="shrink-0 text-small text-ink-soft">{valeur}</span>}
        </span>

        {sousTitre && (
          <span className={`${clampSousTitre} break-words text-small text-ink-soft`}>
            {sousTitre}
          </span>
        )}
      </span>

      {chevron && (
        <span aria-hidden className="shrink-0 text-ink-faint">
          <IconChevron size={20} />
        </span>
      )}
    </>
  );

  let interieur: ReactNode;
  if (onClick) {
    interieur = (
      <button type="button" onClick={onClick} aria-label={libelle}
        className={`${corps} ${cliquable}`}>
        {dedans}
      </button>
    );
  } else if (href && externe) {
    interieur = (
      <a href={href} target="_blank" rel="noopener" aria-label={libelle}
        className={`${corps} ${cliquable}`}>
        {dedans}
      </a>
    );
  } else if (href) {
    interieur = (
      <Link href={href} aria-label={libelle} className={`${corps} ${cliquable}`}>
        {dedans}
      </Link>
    );
  } else {
    interieur = <div className={corps}>{dedans}</div>;
  }

  const queueReservee = useContext(ContexteQueue);

  // La place de l'action est tenue même quand il n'y a pas d'action : sinon la
  // colonne des montants se décale d'une rangée à l'autre.
  const placeTenue = queueReservee && !action;

  return (
    <li
      className={`relative flex ${hauteur} items-center ${
        action || placeTenue ? "gap-2 pr-4" : ""
      } ${className}`}
    >
      {interieur}
      {action && <ActionDeQueue {...action} />}
      {placeTenue && <span aria-hidden className="size-controle shrink-0" />}
    </li>
  );
}

/**
 * L'action de queue. Elle fait `size-controle` (44) et porte un
 * `border-contour` : ce qui se clique le dit. La pastille de tête fait 32 et
 * porte un filet décoratif — dans l'application, les deux faisaient 36 et rien
 * ne distinguait la décoration du contrôle.
 */
function ActionDeQueue({ icone, libelle, onClick, href, externe }: ActionRangee) {
  const classes =
    "grid size-controle shrink-0 place-items-center rounded-btn border border-contour text-ink-soft transition-teintes hover:text-ink [&>svg]:size-icone";
  if (href) {
    return externe ? (
      <a href={href} target="_blank" rel="noopener" title={libelle}
        aria-label={libelle} className={classes}>
        {icone}
      </a>
    ) : (
      <Link href={href} title={libelle} aria-label={libelle} className={classes}>
        {icone}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} title={libelle} aria-label={libelle}
      className={classes}>
      {icone}
    </button>
  );
}

/**
 * LA COLONNE DE QUEUE, réservée ou non — décidée par la liste, pas par la
 * rangée.
 *
 * Sans elle, une liste où seules CERTAINES rangées portent une action voit sa
 * colonne de montants se décaler de 52 px d'une ligne à l'autre : les reçus
 * n'existent que pour les paiements qui en ont un. La charte est pourtant
 * formelle — « une colonne de montants doit s'aligner à la virgule »
 * (docs/IDENTITE.md §8). C'est la première chose que l'œil vérifie sur un
 * écran d'argent, et c'était juste AVANT la refonte.
 *
 * La liste réserve donc la place pour tout le monde dès qu'une seule de ses
 * rangées peut porter une action.
 */
const ContexteQueue = createContext(false);

/**
 * LA LISTE — le conteneur des rangées.
 *
 * Elle ne pose qu'une chose : le séparateur. 1 px du filet décoratif, EN
 * RETRAIT de 16 px de chaque bord, aligné sur le `px-4` des rangées — un trait
 * qui court jusqu'au bord coupe la liste au lieu de la découper. Il est tracé
 * par un pseudo-élément et non par une bordure : une bordure ajouterait 1 px à
 * la hauteur de chaque rangée, et les 56 px annoncés en vaudraient 57.
 *
 * La première rangée n'a pas de séparateur : on sépare, on n'encadre pas.
 */
export function Liste({
  children,
  className = "",
  queue = false,
  ...reste
}: ComponentPropsWithoutRef<"ul"> & {
  /** Vrai dès qu'UNE SEULE rangée peut porter une action de queue. */
  queue?: boolean;
}) {
  return (
    <ContexteQueue.Provider value={queue}>
    <ul
      {...reste}
      className={`[&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-line [&>*+*]:before:content-[''] ${className}`}
    >
      {children}
    </ul>
    </ContexteQueue.Provider>
  );
}
