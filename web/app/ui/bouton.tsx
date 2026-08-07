/**
 * LES BOUTONS — la seule fabrique de boutons de l'application.
 *
 * Un bouton POSE sa hauteur et CENTRE son contenu (règle R3). Il ne l'obtient
 * jamais en empilant des paddings verticaux : c'est de là que venaient les neuf
 * hauteurs différentes d'un même écran. Ici, aucune classe `py-*` — et il ne
 * doit jamais y en avoir.
 *
 * ── ON DESSINE PETIT, ON VISE GRAND ─────────────────────────────────────────
 * La v1 dessinait tout bouton à 44 ou 48 px : le seuil de WCAG 2.5.5, qui est
 * de niveau AAA, appliqué à tort — le seuil AA (2.5.8) vaut 24. L'interface en
 * est ressortie épaisse : sept puces de filtre réclamaient 637 px pour 358
 * disponibles sur un téléphone.
 *
 * La v2 sépare la BOÎTE VISUELLE (ce qu'on dessine) de la CIBLE (la région qui
 * accepte l'appui, selon les termes mêmes de la norme). Trois tailles :
 *
 *   compacte  boîte 32  ·  cible 44 par `.cible`   ·  px-3  ·  text-small
 *   courante  boîte 40  ·  cible 44 par `.cible`   ·  px-4  ·  text-small
 *   forte     boîte 44  ·  sa propre hauteur       ·  px-4  ·  text-body
 *
 * L'action PRIMAIRE et l'action DESTRUCTIVE restent en `forte` : ce qui coûte
 * cher à rater mérite d'être vu autant qu'atteint.
 *
 * Quatre règles qui ne se négocient pas :
 *
 *   1. JAMAIS de padding pour atteindre 44. Le padding déplace le survol,
 *      l'anneau de focus et la mise en page — les trois à la fois. Le
 *      pseudo-élément de `.cible`, et lui seul.
 *   2. `.cible` n'étend QUE la verticale. Deux boutons compacts posés côte à
 *      côte avec 8 px de gouttière verraient leurs cibles se recouvrir de
 *      4 px, et la norme retire l'aire commune du calcul : ils retomberaient
 *      tous les deux à 40. La gouttière minimale entre deux cibles voisines
 *      est de 12 px — `gap-3`, jeton `--spacing-gouttiere-cible`.
 *   3. AUCUN ANCÊTRE NE DOIT PORTER `overflow: hidden`. Il rognerait la zone
 *      d'appui en silence : le bouton continuerait de s'afficher à 32 px et
 *      ne répondrait plus que sur 32 px. Rien ne le signalerait.
 *   4. Un bouton d'icône est ISOLÉ, donc `.cible-libre` : il n'a pas de voisin
 *      à recouvrir, l'extension se fait sur les deux axes.
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
export type TailleBouton = "compacte" | "courante" | "forte";

/* ── Ce qui est commun à toutes les variantes ────────────────────────────────
 * Écart icône ↔ texte `gap-2`, rayon `rounded-btn`, graisse 500, contenu
 * centré. `relative` sert de repère à l'indicateur de chargement, qui se pose
 * PAR-DESSUS le libellé pour que le bouton garde exactement sa largeur pendant
 * qu'il travaille — et c'est aussi le repère du pseudo-élément de cible.
 *
 * La hauteur, le padding horizontal et le corps du libellé ne sont PAS ici :
 * ils appartiennent à la taille.
 *
 * `transition-teintes`, et jamais les deux utilitaires génériques que Tailwind
 * v4 propose à sa place : depuis la v4 ils animent aussi `outline-color`, donc
 * l'anneau de focus arrive à la couleur du texte et vire à l'indigo pendant
 * qu'on le regarde (mesuré : #16171a à 0 ms, indigo à 600 ms).
 */
const SOCLE =
  "relative inline-flex items-center justify-center gap-2 rounded-btn " +
  "font-medium transition-teintes";

/* La taille est une décision : une boîte qu'on dessine, et une cible qu'on
 * atteint. Les deux premières dessinent sous 44 et RATTRAPENT les 44 par le
 * pseudo-élément de `.cible`. La troisième dessine 44 : elle n'a rien à
 * rattraper, et poser `.cible` dessus ne ferait qu'ajouter un pseudo-élément
 * de la taille exacte de la boîte. Aucune classe `py-*` nulle part. */
const TAILLES: Record<TailleBouton, string> = {
  compacte: "h-visuel cible px-3 text-small",
  courante: "h-visuel-lg cible px-4 text-small",
  forte: "h-controle px-4 text-body",
};

/* La taille que prend une variante quand on ne lui en impose pas. L'action
 * primaire et l'action destructive dessinent leurs 44 px ; tout le reste
 * dessine 40 et vise 44. */
const TAILLE_PAR_DEFAUT: Record<VarianteBouton, TailleBouton> = {
  primaire: "forte",
  secondaire: "courante",
  discret: "courante",
  danger: "forte",
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

/**
 * Une adresse qui rend un FICHIER, pas une page : on ne la précharge jamais.
 *
 * Next précharge tout `<Link>` de même origine dès qu'il paraît à l'écran.
 * Sur un reçu (`/api/recu/…`), cela veut dire fabriquer et télécharger le PDF
 * à chaque ouverture d'une fiche — un appel réseau que personne n'a demandé,
 * payé en données mobiles par le propriétaire. L'ancien `<a target="_blank">`
 * ne le faisait pas ; le composant l'a introduit sans le vouloir.
 */
function estUnFichier(href: string) {
  return href.startsWith("/api/") || /\.(pdf|png|jpe?g|csv|zip)(\?|$)/.test(href);
}

/* ── Les propriétés ──────────────────────────────────────────────────────── */

type Commun = {
  variante?: VarianteBouton;
  /**
   * La boîte visuelle : 32 · 40 · 44. La cible fait 44 dans les trois cas.
   * Par défaut, `forte` pour le primaire et le danger, `courante` ailleurs.
   */
  taille?: TailleBouton;
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
  /**
   * Force un `<a>` nu au lieu du `<Link>` de Next : aucun préchargement,
   * aucune navigation côté client. Déduit tout seul pour une adresse d'API ou
   * un fichier ; à poser à la main dans les autres cas qui téléchargent.
   */
  externe?: boolean;
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
  | { sorte: "lien"; href: string; externe?: boolean; restes: RestesLien }
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

  if (p.externe || sortDeLApplication(p.href) || estUnFichier(p.href)) {
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
 * rétrécit pas, la mise en page ne saute pas.
 *
 * Le libellé porte `.cadre-optique`, et lui seul — pas les icônes, qui sont
 * déjà centrées sur leur propre boîte. Mesuré sur DM Sans (upm 1000, ascendante
 * 992, descendante −310, capitale 700, hauteur d'x 504), un libellé bas-de-casse
 * paraît 1,42 px trop bas dans un bouton à 16 px : la hauteur de ligne se
 * répartit également au-dessus et au-dessous, le bloc de glyphes non. */
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
        {children != null && children !== false && (
          <span className="cadre-optique">{children}</span>
        )}
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
    taille = TAILLE_PAR_DEFAUT[variante],
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
    TAILLES[taille],
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
      taille: _t,
      icone: _i,
      iconeFin: _if,
      enCours: _e,
      desactive: _d,
      pleineLargeur: _p,
      className: _c,
      children: _enfants,
      href,
      externe,
      ...restes
    } = proprietes;
    return (
      <Coque
        sorte="lien"
        href={href}
        externe={externe}
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
    taille: _t,
    icone: _i,
    iconeFin: _if,
    enCours: _e,
    desactive: _d,
    pleineLargeur: _p,
    className: _c,
    children: _enfants,
    href: _h,
    externe: _x,
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

type CommunIcone = Omit<
  Commun,
  "icone" | "iconeFin" | "pleineLargeur" | "taille"
> & {
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
 * Bouton carré, icône seule : **32 × 32 dessinés, 44 × 44 atteints**, quelle
 * que soit la variante. L'icône reste à 20 px — elle occupe alors 62 % de sa
 * boîte au lieu de 45 %, ce qui la rend plus lisible, pas moins.
 *
 * Il est ISOLÉ par nature (un coin d'en-tête, une queue de rangée), donc
 * `.cible-libre` : l'extension se fait sur les deux axes, puisqu'il n'a pas de
 * voisin dont il recouvrirait la cible. Deux boutons d'icône côte à côte
 * demandent 12 px de gouttière (`gap-3`), comme partout ailleurs.
 *
 * Le libellé (`aria-label`) est exigé par le typage — un bouton muet n'existe
 * pas.
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
    "size-visuel cible-libre",
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
      externe,
      ...restes
    } = proprietes;
    return (
      <Coque
        sorte="lien"
        href={href}
        externe={externe}
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
    externe: _x,
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
