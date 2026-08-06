"use client";

/**
 * LA NAVIGATION — les primitives.
 *
 * Ce fichier ne dessine pas la barre de l'application : il donne les quatre
 * pièces avec lesquelles on la monte. Élément de menu du rail, onglet de la
 * barre flottante, bouton de repli, badge de non-lus.
 *
 * Trois choses que ces pièces réparent, et qui sont écrites dans
 * docs/SYSTEME.md (section 5.4) :
 *
 *   1. UNE HAUTEUR NE SE SUBIT PAS. Le rail perdait 4 px en se repliant
 *      (38 → 34) parce que la hauteur des liens suivait le texte : plus de
 *      texte, plus de hauteur. Ici chaque pièce POSE `h-controle` (44) et
 *      centre son contenu — déplié comme replié, actif comme inactif.
 *
 *   2. UN BADGE, PAS TROIS. Le compteur de non-lus était réécrit à la main
 *      trois fois, à trois tailles. Il n'existe plus qu'ici, sous deux
 *      formes : le point muet et le compteur chiffré.
 *
 *   3. UNE ICÔNE SANS MOT N'EST PAS UN MENU. Replié, un élément n'a plus de
 *      libellé visible : il porte alors `aria-label` ET `title`, sinon la
 *      navigation devient muette pour qui l'écoute comme pour qui la survole.
 *
 * Le focus est global (`:focus-visible` dans globals.css) : on ne le réécrit
 * pas, et on ne pose jamais `outline-none`.
 */

import Link from "next/link";
import type { ComponentType } from "react";
import { IconChevron } from "@/app/icons";

/** Une icône de la maison : `app/icons.tsx`, trait 1,5 px, grille 24×24. */
export type ComposantIcone = ComponentType<{ size?: number; className?: string }>;

/**
 * Ce qu'il faut pour annoncer des non-lus : le compte, et la phrase qui le
 * dit. La phrase vient du dictionnaire de l'appelant (`t.nonLus(n)`) — un
 * composant ne traduit pas.
 */
export type NonLus = { nombre: number; libelle: string };

/** Les deux formes du badge, et il n'y en aura pas de troisième. */
export type FormeBadge = "point" | "compteur";

export type ProprietesBadge = {
  /** En dessous de 1, le badge ne rend rien : zéro non-lu n'est pas une nouvelle. */
  nombre: number;
  /** `compteur` par défaut. `point` quand la place manque (rail replié, icône). */
  forme?: FormeBadge;
  /** La phrase annoncée : « 3 messages non lus ». Sans elle, le badge est muet. */
  libelle?: string;
  className?: string;
};

/**
 * LE BADGE DE NON-LUS — un seul composant, deux formes.
 *
 * `compteur` : hauteur `h-badge` (20), largeur au moins autant, donc rond sur
 * un chiffre et pilule au-delà. Chiffres tabulaires : le badge ne saute pas
 * quand 9 devient 10.
 *
 * `point` : `size-2` (8 px), rien d'autre. Le chiffre n'a plus la place,
 * l'information reste.
 *
 * Dans les deux cas le dessin est `aria-hidden` et c'est `libelle` qui parle :
 * un lecteur d'écran qui annonce « 3 » tout seul n'a rien annoncé.
 *
 * Il reste NEUTRE (`bg-ink`), jamais rouge : des messages non lus sont une
 * information, pas une alarme. Le rouge est réservé à ce qui va mal.
 */
export function Badge({ nombre, forme = "compteur", libelle, className = "" }: ProprietesBadge) {
  if (nombre < 1) return null;

  if (forme === "point") {
    return (
      <span className={`inline-flex ${className}`}>
        <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
        {libelle ? <span className="sr-only">{libelle}</span> : null}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-badge min-w-badge items-center justify-center rounded-full bg-ink px-1 text-caption text-sur-couleur tabnums ${className}`}
    >
      <span aria-hidden={libelle ? "true" : undefined}>{nombre > 99 ? "99+" : nombre}</span>
      {libelle ? <span className="sr-only">{libelle}</span> : null}
    </span>
  );
}

export type ProprietesElementMenu = {
  href: string;
  libelle: string;
  icone: ComposantIcone;
  /** La page en cours. Signalée par le fond, la graisse ET `aria-current`. */
  actif?: boolean;
  /** Rail replié : l'icône seule, mais la même hauteur. */
  replie?: boolean;
  badge?: NonLus;
  className?: string;
};

/**
 * UN ÉLÉMENT DE MENU DU RAIL.
 *
 * `h-controle` (44) des deux côtés — c'est tout l'objet de la règle R3. Icône
 * `size-icone-lg` (24), padding `px-3`, écart `gap-3`, rayon `rounded-btn`.
 *
 * L'état actif ne se signale jamais par la seule couleur (WCAG 1.4.1) : il
 * porte le fond `accent-soft`, la graisse moyenne, et `aria-current="page"`.
 *
 * Replié, le libellé disparaît de l'écran mais pas de la page : `aria-label`
 * pour qui écoute, `title` pour qui survole, et les non-lus sont dits dans le
 * même souffle puisque le point, lui, ne parle pas.
 */
export function ElementMenu({
  href,
  libelle,
  icone: Icone,
  actif = false,
  replie = false,
  badge,
  className = "",
}: ProprietesElementMenu) {
  const nonLus = badge && badge.nombre > 0 ? badge : undefined;
  // Replié : le nom accessible porte tout, puisque rien n'est écrit.
  const nomAccessible = nonLus ? `${libelle} · ${nonLus.libelle}` : libelle;

  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      aria-label={replie ? nomAccessible : undefined}
      title={replie ? nomAccessible : undefined}
      className={[
        "flex h-controle items-center gap-3 rounded-btn px-3 text-body transition-colors",
        replie ? "justify-center" : "",
        actif
          ? "bg-accent-soft font-medium text-accent"
          : "text-ink-soft hover:bg-surface-2 hover:text-ink",
        className,
      ].join(" ")}
    >
      <span className="relative flex shrink-0">
        <Icone size={24} className="size-icone-lg" />
        {replie && nonLus ? (
          <Badge nombre={nonLus.nombre} forme="point" className="absolute -right-1 -top-1" />
        ) : null}
      </span>
      {replie ? null : (
        <>
          <span className="truncate">{libelle}</span>
          {nonLus ? (
            <Badge nombre={nonLus.nombre} libelle={nonLus.libelle} className="ml-auto" />
          ) : null}
        </>
      )}
    </Link>
  );
}

export type ProprietesPiluleOnglet = {
  href: string;
  libelle: string;
  icone: ComposantIcone;
  actif?: boolean;
  /**
   * Les non-lus, en point sur l'icône. Rendus seulement quand l'onglet est
   * inactif : sur la pilule active, le libellé est là et dit déjà où l'on est.
   */
  badge?: NonLus;
  className?: string;
};

/**
 * UN ONGLET DE LA BARRE FLOTTANTE — mobile.
 *
 * Actif : pilule pleine, icône + libellé, `h-controle` (44) et `px-4`.
 * Inactif : icône seule, `size-controle` (44×44).
 *
 * Les deux font 44. C'est le point : l'un faisait 40 et l'autre 44, et la
 * rangée montait et descendait au fil de la page où l'on se trouvait.
 *
 * L'ombre de la barre appartient à la barre, pas à l'onglet : c'est la seule
 * du système (docs/IDENTITE.md §9) et elle se pose une fois, sur le conteneur.
 */
export function PiluleOnglet({
  href,
  libelle,
  icone: Icone,
  actif = false,
  badge,
  className = "",
}: ProprietesPiluleOnglet) {
  const nonLus = !actif && badge && badge.nombre > 0 ? badge : undefined;
  const nomAccessible = nonLus ? `${libelle} · ${nonLus.libelle}` : libelle;

  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      aria-label={actif ? undefined : nomAccessible}
      title={actif ? undefined : nomAccessible}
      className={[
        "flex items-center justify-center gap-2 rounded-btn transition-colors",
        actif
          ? "h-controle bg-accent px-4 text-sur-couleur"
          : "size-controle text-ink-soft active:bg-surface-2",
        className,
      ].join(" ")}
    >
      <span className="relative flex shrink-0">
        <Icone size={24} className="size-icone-lg" />
        {nonLus ? (
          <Badge nombre={nonLus.nombre} forme="point" className="absolute -right-1 -top-1" />
        ) : null}
      </span>
      {actif ? <span className="text-small font-medium">{libelle}</span> : null}
    </Link>
  );
}

export type ProprietesBoutonRail = {
  replie: boolean;
  /** Ce qu'on fait quand on appuie : le repli lui-même appartient à l'appelant. */
  surBascule: () => void;
  /** « Replier le menu » / « Déplier le menu » — la phrase entière, traduite. */
  libelleReplier?: string;
  libelleDeplier?: string;
  /** Le mot écrit à côté de la flèche quand le rail est déplié. */
  libelleCourt?: string;
  className?: string;
};

/**
 * LE BOUTON DE REPLI DU RAIL.
 *
 * `h-controle` (44) dans les deux états — il faisait 34 déplié et 32 replié,
 * pour la même raison que les liens : sa hauteur venait de son texte.
 *
 * Le mot disparaît en se repliant, jamais le nom accessible : `aria-label` et
 * `title` sont posés dans les deux états.
 */
export function BoutonRail({
  replie,
  surBascule,
  libelleReplier = "Replier le menu",
  libelleDeplier = "Déplier le menu",
  libelleCourt = "Replier",
  className = "",
}: ProprietesBoutonRail) {
  const nom = replie ? libelleDeplier : libelleReplier;

  return (
    <button
      type="button"
      onClick={surBascule}
      aria-label={nom}
      aria-expanded={!replie}
      title={nom}
      className={[
        "flex h-controle w-full items-center gap-3 rounded-btn px-3 text-small text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink",
        replie ? "justify-center" : "",
        className,
      ].join(" ")}
    >
      <IconChevron
        size={24}
        className={`size-icone-lg shrink-0 transition-transform duration-300 ${replie ? "" : "rotate-180"}`}
      />
      {replie ? null : <span>{libelleCourt}</span>}
    </button>
  );
}
