/**
 * LES BOUTONS — la seule fabrique de boutons de l'application.
 *
 * Un bouton POSE sa hauteur et CENTRE son contenu (règle R3). Il ne l'obtient
 * jamais en empilant des paddings verticaux : c'est de là que venaient les neuf
 * hauteurs différentes d'un même écran. Ici, aucune classe `py-*` — et il ne
 * doit jamais y en avoir.
 *
 * Le même objet sert pour une action (`<button>`) et pour un déplacement
 * (`<Link>` interne, `<a>` externe) : on passe `href`, le reste est identique.
 * L'application recopiait ces habits à la main sur ses liens ; elle n'a plus à
 * le faire.
 *
 * Cinq états : repos · survol · focus · pressé · éteint.
 *   — Le focus est GLOBAL (anneau indigo de 2 px, décalé de 2 px, posé dans
 *     globals.css). On ne le réécrit pas, et on n'écrit jamais `outline-none`.
 *   — L'éteint change de COULEUR, il ne s'efface pas : éteindre par l'opacité
 *     donne 2,6:1, du texte que personne ne lit. Fond `surface-eteint`, texte
 *     `ink-eteint` — inerte, mais lisible.
 *
 * Toutes les valeurs viennent des jetons de `globals.css`. Aucun nombre écrit
 * à la main. Voir docs/SYSTEME.md, section 5.1.
 */

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { IconRefresh } from "@/app/icons";

export type VarianteBouton = "primaire" | "secondaire" | "discret" | "danger";

/* ── Ce qui est commun à toutes les variantes ────────────────────────────────
 * Padding horizontal `px-4`, écart icône ↔ texte `gap-2`, rayon `rounded-btn`,
 * texte `text-small` en 500, contenu centré. `relative` sert de repère à
 * l'indicateur de chargement, qui se pose PAR-DESSUS le libellé pour que le
 * bouton garde exactement sa largeur pendant qu'il travaille.
 */
const SOCLE =
  "relative inline-flex items-center justify-center gap-2 rounded-btn " +
  "text-small font-medium transition-colors";

/* La hauteur est une décision. 48 pour ce qui coûte cher à rater, 44 partout
 * ailleurs — jamais une conséquence du contenu. */
const HAUTEUR: Record<VarianteBouton, string> = {
  primaire: "h-controle-fort",
  secondaire: "h-controle",
  discret: "h-controle",
  danger: "h-controle-fort",
};

/* Repos · survol · pressé — trois tons distincts par variante, jamais deux.
 * L'indigo porte l'action ; le secondaire s'affirme par un contour porteur
 * (3,04:1), pas par un filet décoratif. Les deux variantes neutres descendent
 * l'échelle des surfaces : `surface-raised` → `surface-2` → `surface-3`. */
const HABITS: Record<VarianteBouton, string> = {
  primaire:
    "bg-accent text-sur-couleur hover:bg-accent-hover active:bg-accent-presse",
  secondaire:
    "border border-contour bg-surface-raised text-ink " +
    "hover:bg-surface-2 active:bg-surface-3",
  discret: "bg-transparent text-ink hover:bg-surface-2 active:bg-surface-3",
  danger:
    "bg-negative text-sur-couleur hover:bg-negative-hover active:bg-negative-presse",
};

/**
 * Le ton du pressé, épinglé. RÉSERVÉ À LA GALERIE : un état qui n'existe que
 * sous le doigt ne se photographie pas, et une capture qui ne le montre pas ne
 * prouve rien. Ces classes portent le `!` pour passer devant le fond de repos ;
 * elles n'ont aucune raison d'apparaître dans un écran.
 */
export const FOND_PRESSE: Record<VarianteBouton, string> = {
  primaire: "bg-accent-presse!",
  secondaire: "bg-surface-3!",
  discret: "bg-surface-3!",
  danger: "bg-negative-presse!",
};

/* Éteint. Le secondaire garde son contour : sans lui, il ne reste plus rien
 * qui dise « ceci est un bouton ». Les autres n'en ont jamais eu. */
const HABITS_ETEINT: Record<VarianteBouton, string> = {
  primaire: "bg-surface-eteint text-ink-eteint",
  secondaire: "border border-contour bg-surface-eteint text-ink-eteint",
  discret: "bg-surface-eteint text-ink-eteint",
  danger: "bg-surface-eteint text-ink-eteint",
};

function joindre(...morceaux: Array<string | false | undefined>) {
  return morceaux.filter(Boolean).join(" ");
}

/** Un lien qui sort de l'application (ou descend dans la page) reste un `<a>`. */
function sortDeLApplication(href: string) {
  return /^(https?:|mailto:|tel:|sms:|#)/.test(href);
}

/* ── Les propriétés ──────────────────────────────────────────────────────── */

type Commun = {
  variante?: VarianteBouton;
  /** Icône posée avant le libellé. Les icônes maison sortent à 20 px par défaut. */
  icone?: ReactNode;
  /** Icône posée après le libellé (chevron, flèche…). */
  iconeFin?: ReactNode;
  /** Le bouton travaille : même hauteur, même largeur, plus aucun clic. */
  enCours?: boolean;
  /** Éteint : inerte, mais lisible. */
  desactive?: boolean;
  /** Pleine largeur — la hauteur, elle, ne bouge pas. */
  pleineLargeur?: boolean;
  className?: string;
};

type RestesBouton = Omit<
  ComponentPropsWithoutRef<"button">,
  keyof Commun | "disabled"
>;
type RestesLien = Omit<ComponentPropsWithoutRef<"a">, keyof Commun | "href">;

type ProprietesBouton = Commun &
  RestesBouton & { href?: never; children?: ReactNode };

type ProprietesLien = Commun &
  RestesLien & { href: string; children?: ReactNode };

function estUnLien(
  p: ProprietesBouton | ProprietesLien,
): p is ProprietesLien {
  return typeof p.href === "string";
}

/* ── La coque : ce qui décide de la balise rendue ────────────────────────── */

type Coque = {
  habits: string;
  eteint: boolean;
  enCours: boolean;
  contenu: ReactNode;
} & (
  | { sorte: "lien"; href: string; restes: RestesLien }
  | { sorte: "bouton"; restes: RestesBouton }
);

function Coque(p: Coque) {
  if (p.sorte === "bouton") {
    return (
      <button
        type="button"
        {...p.restes}
        className={p.habits}
        disabled={p.eteint}
        aria-busy={p.enCours || undefined}
      >
        {p.contenu}
      </button>
    );
  }

  // Un lien éteint perd son `href` : il n'est plus ni cliquable ni tabulable,
  // et il l'annonce. C'est le seul équivalent honnête de `disabled` sur un `<a>`.
  if (p.eteint) {
    return (
      <a
        {...p.restes}
        className={p.habits}
        role="link"
        aria-disabled="true"
        aria-busy={p.enCours || undefined}
      >
        {p.contenu}
      </a>
    );
  }

  if (sortDeLApplication(p.href)) {
    return (
      <a {...p.restes} href={p.href} className={p.habits}>
        {p.contenu}
      </a>
    );
  }

  return (
    <Link {...p.restes} href={p.href} className={p.habits}>
      {p.contenu}
    </Link>
  );
}

/* Le libellé reste dans la page pendant le chargement — invisible, mais il
 * occupe toujours sa place. L'indicateur se pose par-dessus : le bouton ne
 * rétrécit pas, la mise en page ne saute pas. */
function Contenu({
  icone,
  iconeFin,
  enCours,
  children,
}: {
  icone?: ReactNode;
  iconeFin?: ReactNode;
  enCours: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <span
        className={joindre(
          "inline-flex items-center justify-center gap-2",
          enCours && "invisible",
        )}
      >
        {icone}
        {children}
        {iconeFin}
      </span>
      {enCours && (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <IconRefresh size={20} className="animate-spin" />
        </span>
      )}
    </>
  );
}

/**
 * Le bouton. Rend un `<button>`, ou un `<Link>` / `<a>` dès qu'on lui donne
 * un `href` — mêmes habits, mêmes hauteurs, mêmes états.
 */
export function Bouton(proprietes: ProprietesBouton | ProprietesLien) {
  const {
    variante = "secondaire",
    icone,
    iconeFin,
    enCours = false,
    desactive = false,
    pleineLargeur = false,
    className,
    children,
  } = proprietes;

  const eteint = desactive || enCours;
  const habits = joindre(
    SOCLE,
    HAUTEUR[variante],
    "px-4",
    eteint ? HABITS_ETEINT[variante] : HABITS[variante],
    pleineLargeur && "w-full",
    className,
  );
  const contenu = (
    <Contenu icone={icone} iconeFin={iconeFin} enCours={enCours}>
      {children}
    </Contenu>
  );

  if (estUnLien(proprietes)) {
    const {
      variante: _v,
      icone: _i,
      iconeFin: _if,
      enCours: _e,
      desactive: _d,
      pleineLargeur: _p,
      className: _c,
      children: _enfants,
      href,
      ...restes
    } = proprietes;
    return (
      <Coque
        sorte="lien"
        href={href}
        restes={restes}
        habits={habits}
        eteint={eteint}
        enCours={enCours}
        contenu={contenu}
      />
    );
  }

  const {
    variante: _v,
    icone: _i,
    iconeFin: _if,
    enCours: _e,
    desactive: _d,
    pleineLargeur: _p,
    className: _c,
    children: _enfants,
    href: _h,
    ...restes
  } = proprietes;
  return (
    <Coque
      sorte="bouton"
      restes={restes}
      habits={habits}
      eteint={eteint}
      enCours={enCours}
      contenu={contenu}
    />
  );
}

/* ── Le bouton d'icône ───────────────────────────────────────────────────── */

type CommunIcone = Omit<Commun, "icone" | "iconeFin" | "pleineLargeur"> & {
  /** L'icône, seule. À 20 px : c'est la taille d'un contrôle de 44. */
  icone: ReactNode;
  /** Obligatoire : sans libellé visible, c'est la seule chose qui s'annonce. */
  "aria-label": string;
};

type ProprietesBoutonIcone = CommunIcone &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommunIcone | "disabled"> & {
    href?: never;
  };

type ProprietesLienIcone = CommunIcone &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommunIcone | "href"> & {
    href: string;
  };

function estUnLienIcone(
  p: ProprietesBoutonIcone | ProprietesLienIcone,
): p is ProprietesLienIcone {
  return typeof p.href === "string";
}

/**
 * Bouton carré, icône seule : 44 × 44 quelle que soit la variante. Le libellé
 * (`aria-label`) est exigé par le typage — un bouton muet n'existe pas.
 */
export function BoutonIcone(
  proprietes: ProprietesBoutonIcone | ProprietesLienIcone,
) {
  const {
    variante = "discret",
    icone,
    enCours = false,
    desactive = false,
    className,
  } = proprietes;

  const eteint = desactive || enCours;
  const habits = joindre(
    SOCLE,
    "size-controle",
    eteint ? HABITS_ETEINT[variante] : HABITS[variante],
    className,
  );
  const contenu = enCours ? (
    <IconRefresh size={20} className="animate-spin" />
  ) : (
    icone
  );

  if (estUnLienIcone(proprietes)) {
    const {
      variante: _v,
      icone: _i,
      enCours: _e,
      desactive: _d,
      className: _c,
      href,
      ...restes
    } = proprietes;
    return (
      <Coque
        sorte="lien"
        href={href}
        restes={restes}
        habits={habits}
        eteint={eteint}
        enCours={enCours}
        contenu={contenu}
      />
    );
  }

  const {
    variante: _v,
    icone: _i,
    enCours: _e,
    desactive: _d,
    className: _c,
    href: _h,
    ...restes
  } = proprietes;
  return (
    <Coque
      sorte="bouton"
      restes={restes}
      habits={habits}
      eteint={eteint}
      enCours={enCours}
      contenu={contenu}
    />
  );
}
