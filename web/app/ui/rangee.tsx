"use client";

import Link from "next/link";
import { Children, createContext, isValidElement, useContext } from "react";
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
 *
 * ─── v2 · LA RANGÉE DE PAIEMENT ─────────────────────────────────────────────
 *
 * Une rangée qui porte un montant n'est pas une rangée de réglage : c'est un
 * ÉCRAN D'ARGENT, et le montant y est la donnée. Quatre choses changent, toutes
 * mesurées (docs/REFONTE-V2.md §2 et §5) :
 *
 *   1. LE DISQUE DÉCORATIF TOMBE. Il faisait 32 px, plus 12 de gouttière : les
 *      44 px qui manquaient exactement au titre pour ne pas se tronquer. En
 *      390 px, « Orange · 23:06 » (94 px) devenait « Orange · … ». Il était
 *      `aria-hidden` : il ne disait rien à personne, et il coûtait le seul
 *      renseignement qui ne soit pas répété dans le SMS d'en dessous.
 *   2. LE MONTANT VIENT EN PREMIER — dans l'ordre du DOM, donc dans l'ordre où
 *      un lecteur d'écran l'annonce. Il reste à droite à l'œil (`order-last`) :
 *      c'est là que se lit une colonne de chiffres. Il venait en troisième,
 *      derrière une décoration.
 *   3. LE POIDS SUIT LA DONNÉE. « MTN » en 16 px et « +150 000 FCFA » en 16 px :
 *      l'étiquette pesait autant que le chiffre. Le montant passe à
 *      `text-heading` (17), l'opérateur et l'heure à `text-small` (14) en
 *      `ink-soft`.
 *   4. LA COLONNE DE TEXTE EST PLAFONNÉE. En 1440 px, le titre finissait à
 *      x=538 et le montant commençait à x=1130 : 592 px de vide entre deux
 *      renseignements de la même ligne.
 *
 * ─── L'ALIGNEMENT NE VIENT PAS DE LA TYPOGRAPHIE ────────────────────────────
 *
 * DM Sans n'a AUCUNE fonction `tnum` — sa table GSUB contient `calt ccmp dnom
 * frac kern liga locl mark mkmk numr`. `font-variant-numeric: tabular-nums`
 * (et donc la classe `.tabnums` que portaient tous les montants) est INERTE :
 * les chasses vont de 312 pour le « 1 » à 684 pour le « 0 », soit 5,95 px
 * d'écart à 16 px. L'alignement vient de la MISE EN PAGE — une colonne de
 * largeur fixe, texte calé à droite (`.colonne-montant`).
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

/**
 * Le signe fait partie du montant. Il n'est jamais facultatif — et ce n'est pas
 * n'importe quel trait : U+2212, le MOINS MATHÉMATIQUE, a la même chasse que le
 * plus (550) là où le trait d'union U+002D en fait 541. Neuf pixels de moins par
 * montant débité, c'est une colonne qui bouge d'une ligne à l'autre.
 *
 * On l'écrit par son point de code et non par le glyphe : un éditeur, un
 * copier-coller ou une normalisation Unicode remplace un « − » par un « - »
 * sans rien dire. `−` ne peut pas être aplati en silence — c'est la même
 * précaution que `lib/types.ts` prend pour l'espace insécable.
 */
const SIGNE: Record<SensMontant, string> = {
  credit: "+",
  debit: "\u2212",
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

  // LA LISTE D'ARGENT. C'est la liste qui le dit, pas la rangée : dans une
  // liste d'encaissements, un SMS que le robot n'a pas su lire n'a PAS de
  // montant (`analyse_sms.py` renvoie `None` dans le doute, et n'invente
  // jamais un chiffre). Si chaque rangée décidait seule, cette rangée-là
  // garderait son disque et sa pleine largeur : son titre commencerait 44 px
  // plus loin que ceux d'au-dessus, et la colonne serait ébréchée par la seule
  // ligne qui avoue son ignorance. La liste tranche pour toutes ses rangées —
  // même mécanisme que la place de queue réservée, juste en dessous.
  const colonneMontant = useContext(ContexteMontant);
  const queueReservee = useContext(ContexteQueue);

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
  //
  // ET LA PLACE RÉSERVÉE SE PAIE PAREIL. Le corps ne regardait que `action` :
  // une rangée dont la place de queue est seulement TENUE gardait `pr-4`, et son
  // montant se posait 12 px à gauche de celui de la rangée du dessus. Mesuré en
  // 390 px : bords droits à 270 et à 258. La colonne réservée pour aligner
  // désalignait. Ce qui compte n'est pas qu'il y ait une action, c'est que la
  // place soit prise.
  const placeTenue = queueReservee && !action;
  const corps = `flex h-full min-w-0 flex-1 items-center gap-3 pl-4 ${
    action || placeTenue ? "pr-1" : "pr-4"
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
      {/* LE DISQUE NE PARAÎT PAS SUR UN ÉCRAN D'ARGENT. Il est `aria-hidden` :
          il ne dit rien, et il prend 32 px plus 12 de gouttière — exactement
          les 44 px qui manquaient au titre pour ne pas se tronquer en 390. */}
      {pastille && !colonneMontant && (
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
          raison — le composant avait généralisé un peu trop vite.

          LE PLAFOND DE LA COLONNE DE TEXTE (`max-w-sm`, 384). En 1440 px, le
          titre finissait à x=538 et le montant commençait à x=1130 : 592 px de
          vide entre deux renseignements de la même ligne. Deux données qui se
          lisent ensemble se posent côte à côte ; ce n'est pas la largeur de la
          fenêtre qui décide de l'écart entre elles. */}
      <span
        className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
          colonneMontant ? "max-w-sm" : ""
        }`}
      >
        <span className="flex items-baseline gap-3">
          {/* LE MONTANT VIENT EN PREMIER — dans le DOM, donc dans l'ordre où un
              lecteur d'écran annonce la rangée : « +150 000 FCFA, Orange ·
              23:06, … ». Sur un écran d'argent, c'est la donnée ; le reste la
              qualifie. `order-last` le remet à droite à l'œil, parce qu'une
              colonne de chiffres se lit par son bord droit.

              LA COLONNE EST FIXE ET CALÉE À DROITE (`.colonne-montant`). Pas
              `tabnums` : DM Sans n'a pas la fonction, la classe ne faisait rien.
              Une largeur fixe aligne les bords droits ET les bords gauches ;
              sans elle, chaque montant redécoupe la place laissée au titre, et
              deux rangées voisines n'ont pas la même colonne de texte.

              DEUX LARGEURS, ET C'EST UN ARBITRAGE MESURÉ. 144 (`sm:w-36`) tient
              le plus long montant que l'application sache produire —
              « −1 248 500 FCFA », 131,8 px mesurés à 17 px. Mais en 390 px la
              colonne de texte ne fait que 221 : 144 + 12 de gouttière n'y
              laisseraient que 65 px au titre, et « Orange · 23:06 » (94 px)
              redeviendrait « Orange · … ». Or l'heure est le seul renseignement
              qui ne soit pas répété dans le SMS d'en dessous : c'est LUI qu'on
              protège. Au téléphone la colonne vaut donc 112 (`w-28`), ce qui
              laisse 97 px au titre — et `min-w-fit` la laisse s'élargir pour le
              montant à sept chiffres, qui ne sera JAMAIS rogné. Ce jour-là,
              c'est ce titre-là qui se tronque, sur cette rangée-là seulement :
              le bord droit, lui, ne bouge pas d'un pixel. */}
          {montant && (
            <span
              className={`order-last w-28 min-w-fit shrink-0 sm:w-36 colonne-montant text-heading ${TEINTE_MONTANT[montant.sens]}`}
            >
              {SIGNE[montant.sens]}
              {montant.texte}
            </span>
          )}
          {/* La place de la colonne est tenue même quand le robot n'a pas lu de
              montant : sinon le titre de CETTE rangée-là serait le seul à
              courir jusqu'au bout, et la colonne aurait une brèche. */}
          {!montant && !valeur && colonneMontant && (
            <span aria-hidden className="order-last w-28 shrink-0 sm:w-36" />
          )}

          {/* LE POIDS SUIT LA DONNÉE. « MTN » et « +150 000 FCFA » étaient tous
              deux en 16 px : l'étiquette pesait autant que le chiffre. Sur une
              rangée d'argent, l'opérateur et l'heure passent au second rang. */}
          <span
            className={`min-w-0 flex-1 truncate ${
              colonneMontant ? "text-small text-ink-soft" : "text-body"
            }`}
          >
            {titre}
          </span>
          {/* Une valeur libre dans une liste d'argent prend la MÊME colonne que
              les montants : sinon la rangée « Virement bancaire — hier » ouvre
              une brèche à l'endroit précis où l'œil descend le long des
              chiffres. Ailleurs, elle reste ce qu'elle était : une valeur qui
              se pose au bout de sa ligne. */}
          {valeur &&
            (colonneMontant ? (
              <span className="order-last w-28 min-w-fit shrink-0 colonne-montant text-small text-ink-soft sm:w-36">
                {valeur}
              </span>
            ) : (
              <span className="shrink-0 text-small text-ink-soft">{valeur}</span>
            ))}
        </span>

        {/* S'IL FAUT COUPER, ON COUPE LE SMS — jamais l'heure. L'heure est le
            seul renseignement de la rangée qui ne soit pas répété dans le texte
            d'en dessous ; le SMS, lui, s'ouvre en entier dans la fiche. C'est
            pourquoi la troncature vit ici, et que le titre a la place. */}
        {sousTitre && (
          <span className={`${clampSousTitre} break-words text-small text-ink-soft`}>
            {sousTitre}
          </span>
        )}
      </span>

      {/* Le chevron reste au bord de la rangée : c'est l'affordance de la
          rangée entière, pas celle du texte. `ml-auto` absorbe le vide que
          laisse la colonne de texte plafonnée — sans lui, il flotterait au
          milieu de la ligne. */}
      {chevron && (
        <span aria-hidden className="ml-auto shrink-0 text-ink-faint">
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
 * LA COLONNE DE MONTANTS — décidée par la liste, elle aussi.
 *
 * Une rangée ne peut pas savoir seule qu'elle appartient à un écran d'argent :
 * dans une liste d'encaissements, le SMS que le robot n'a pas su lire arrive
 * SANS montant. S'il décidait seul, il garderait son disque décoratif et sa
 * pleine largeur, et son titre commencerait 44 px plus loin que celui de la
 * rangée du dessus. La liste tranche donc pour toutes ses rangées.
 */
const ContexteMontant = createContext(false);

/**
 * Une liste est une liste d'argent dès qu'UNE de ses rangées DÉCLARE un
 * montant — la prop suffit, même si sa valeur est `undefined` : c'est
 * précisément le cas de la rangée dont le montant n'a pas pu être lu, et c'est
 * celle qu'il ne faut surtout pas traiter à part.
 *
 * On le lit dans les enfants plutôt que de le demander à l'appelant : les trois
 * écrans qui consomment cette liste n'ont rien à réapprendre, et la liste ne
 * peut pas se retrouver en désaccord avec ce qu'elle contient.
 */
function porteUnMontant(children: ReactNode): boolean {
  return Children.toArray(children).some(
    (enfant) =>
      isValidElement(enfant) &&
      typeof enfant.props === "object" &&
      enfant.props !== null &&
      "montant" in enfant.props,
  );
}

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
  monnaie,
  ...reste
}: ComponentPropsWithoutRef<"ul"> & {
  /** Vrai dès qu'UNE SEULE rangée peut porter une action de queue. */
  queue?: boolean;
  /**
   * Liste d'argent : colonne de montants fixe, disque décoratif retiré, colonne
   * de texte plafonnée. Se DEVINE des rangées ; ne s'écrit que pour forcer la
   * mise en page d'une liste qui parle d'argent sans afficher de montant.
   */
  monnaie?: boolean;
}) {
  const argent = monnaie ?? porteUnMontant(children);
  return (
    <ContexteQueue.Provider value={queue}>
    <ContexteMontant.Provider value={argent}>
    <ul
      {...reste}
      className={`[&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-line [&>*+*]:before:content-[''] ${className}`}
    >
      {children}
    </ul>
    </ContexteMontant.Provider>
    </ContexteQueue.Provider>
  );
}
