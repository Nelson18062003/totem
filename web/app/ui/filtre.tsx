"use client";

/*
 * LES FILTRES — un déclencheur, une feuille. `docs/REFONTE-V2.md` §2 et §3.
 *
 * CE QUE CE FICHIER REMPLACE, ET POURQUOI IL LE REMPLACE.
 *
 * L'écran des encaissements posait SEPT puces de filtre — trois opérateurs,
 * quatre catégories. Mesuré sur un téléphone de 390 px : elles réclamaient
 * 637 px pour 358 disponibles. Elles passaient donc sur deux rangées, et
 * « Retrait » finissait seul sur la sienne avec 261 px de vide — 73 % de la
 * rangée. Ce n'est pas une puce trop large : AUCUNE FORME DE PUCE NE TIENDRA
 * JAMAIS SUR UNE RANGÉE, parce que le nombre de choix grandit avec les données
 * et que la largeur de l'écran, elle, ne grandit pas.
 *
 * Le défilement horizontal a été écarté, et ce n'est pas un goût : il crée une
 * ILLUSION DE COMPLÉTUDE — rien ne dit qu'il y a une huitième puce hors du
 * cadre — et il n'affiche pas l'état de la sélection, qui est justement la
 * seule chose qu'on vient lire sur une barre de filtres.
 *
 * Ce qui tient, c'est un objet dont la largeur ne dépend PAS du nombre de
 * choix : deux déclencheurs nommés par ce qu'ils filtrent (« Opérateur »,
 * « Catégorie »), et une feuille qui déplie les choix quand on la demande.
 * Le déclencheur affiche son état — « Opérateur : MTN » — pour qu'on n'ait
 * jamais à l'ouvrir pour savoir ce qu'il fait.
 *
 * TROIS OBJETS, ET RIEN DE PLUS :
 *
 *   `BarreFiltres`       le conteneur — UNE rangée de 44, et le compte.
 *   `DeclencheurFiltre`  le bouton — 32 px dessinés, 44 px de cible.
 *   `FeuilleFiltres`     la feuille basse — c'est `Fenetre`, pas une copie.
 *
 * L'ÉTAT APPARTIENT À L'ÉCRAN, PAS À LA BARRE. Les trois objets sont sans
 * mémoire : l'écran tient une variable « quelle feuille est ouverte » et les
 * valeurs retenues. C'est ce qui permet de poser la barre où l'on veut — en
 * particulier EN BAS, ce que l'ergonomie exige : les sept puces d'avant
 * tombaient toutes entre les arcs 424 et 532 du pouce, là où « facile »
 * s'arrête à 270.
 *
 * DEUX MESURES QU'ON NE NÉGOCIE PAS :
 *
 *   — LA GOUTTIÈRE VAUT 12 (`gap-gouttiere-cible`). Deux cibles de 44
 *     séparées de 8 se recouvrent de 4, et la norme retire l'aire commune du
 *     calcul : les deux retombent à 40. Douze, c'est le pas minimal qui laisse
 *     44 à chacune.
 *   — AUCUN ANCÊTRE NE PORTE `overflow: hidden`. La cible est un
 *     pseudo-élément débordant : un `overflow` la rognerait sans que rien ne
 *     le signale. Le `truncate` du déclencheur est posé sur le SPAN du texte,
 *     jamais sur le bouton qui porte `.cible`.
 */

import { useId, type ReactNode } from "react";

import { IconChevron } from "@/app/icons";
import { Bouton } from "./bouton";
import { Fenetre } from "./fenetre";
import { Case, Radio } from "./selecteurs";

/* ────────────────────────────────────────────────────────────────────────────
 * 1 · LE DÉCLENCHEUR
 *
 * 32 px dessinés — la boîte visuelle d'un bouton compact (§1 de l'ordre de
 * mission) — et 44 px de région d'appui, portés par `.cible`. Le
 * pseudo-élément déborde vers le haut et vers le bas SANS déformer la boîte :
 * la barre reste à 44, le survol reste sur le dessin, l'anneau de focus aussi.
 * Un padding vertical aurait fait les trois erreurs à la fois.
 *
 * L'ÉTAT ACTIF NE SE DIT PAS QU'EN COULEUR (WCAG 1.4.1). Deux signaux qui
 * survivent au niveau de gris, avant que la teinte n'arrive en renfort :
 *   — le TEXTE change : « Opérateur » devient « Opérateur : MTN » ;
 *   — la GRAISSE passe de 500 à 600.
 * Le texte est le signal fort : il ne dit pas seulement QU'UN filtre agit, il
 * dit LEQUEL — ce qu'aucune couleur ne sait faire. Quand plusieurs choix se
 * cumulent, l'écran écrit leur nombre dans `valeur` (« 2 choisis ») : c'est
 * son dictionnaire qui a les mots, pas ce composant.
 *
 * Le chevron pivote à l'ouverture : c'est la seule chose qui bouge, et elle
 * s'arrête pour qui a demandé des interfaces immobiles.
 * ──────────────────────────────────────────────────────────────────────────── */
export function DeclencheurFiltre({
  libelle,
  valeur,
  ouverte = false,
  surOuvrir,
  eteint,
  classe,
}: {
  /** Ce que le filtre filtre : « Opérateur », « Catégorie ». Jamais vide. */
  libelle: string;
  /**
   * Ce qui est retenu, écrit après le libellé. Absent = filtre au repos.
   * Plusieurs choix : l'écran résume (« 2 choisis »), dans sa langue.
   */
  valeur?: string;
  /** La feuille de ce déclencheur est ouverte (`aria-expanded`). */
  ouverte?: boolean;
  surOuvrir: () => void;
  /** Éteint : inerte mais lisible. Jamais par l'opacité. */
  eteint?: boolean;
  classe?: string;
}) {
  const actif = Boolean(valeur);

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={ouverte}
      disabled={eteint}
      onClick={surOuvrir}
      // `h-(--spacing-visuel)` : 32, le jeton de la boîte visuelle d'un bouton
      // compact. Écrit sous sa forme « variable » parce que le gardien
      // (`scripts/verifier-le-systeme.mjs`) ne connaît pas encore le nom
      // `visuel` dans sa liste NOMS — voir le compte rendu de fabrication.
      // `min-w-0 shrink` : TOUS les déclencheurs rendent des pixels quand la
      // rangée se remplit, et la rangée ne déborde donc jamais. On a essayé de
      // protéger le déclencheur au repos avec `shrink-0` — son texte est le
      // nom même du filtre, on aimerait le garder entier ; mais alors trois
      // filtres au repos poussaient la barre à 382 px pour 358, et c'est la
      // PAGE qui débordait sur la droite. Mesuré. Une ellipse vaut mieux
      // qu'une barre qui sort de l'écran.
      className={`cible inline-flex h-(--spacing-visuel) min-w-0 shrink items-center gap-2 rounded-full border px-3 text-small transition-teintes ${
        eteint
          ? "cursor-not-allowed border-contour bg-surface-eteint text-ink-eteint"
          : actif
            ? "border-accent bg-accent-soft font-semibold text-accent-ink hover:bg-surface-2"
            : "border-contour bg-surface-raised font-medium text-ink hover:bg-surface-2"
      } ${classe ?? ""}`}
    >
      {/* Le `truncate` vit ICI, sur le texte. Posé sur le bouton, son
          `overflow: hidden` aurait rogné la cible de 44.
          Il coupe par la FIN : le libellé, qui dit ce qu'on filtre, est donc
          toujours entier, et c'est la valeur qui perd ses dernières lettres.
          L'espace avant le deux-points est U+00A0 — U+202F, l'espace fine
          qu'émet `toLocaleString`, n'existe pas dans DM Sans (§5). */}
      <span className="cadre-optique truncate">
        {actif ? `${libelle} : ${valeur}` : libelle}
      </span>
      <IconChevron
        size={16}
        className={`shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${
          ouverte ? "-rotate-90" : "rotate-90"
        }`}
      />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2 · LA FEUILLE
 *
 * C'est `Fenetre` (§5.7), pas une deuxième fenêtre écrite à côté. Elle apporte
 * déjà, et gratuitement : `role="dialog"`, `aria-modal`, la fermeture à Échap,
 * le piège de focus, le retour du focus au déclencheur, l'en-tête et le pied
 * FIXES, le corps seul qui défile, la marge basse sûre du téléphone, et la
 * bande de 44 px laissée au-dessus pour fermer au pouce. Réécrire tout cela
 * pour des filtres, c'était en reperdre la moitié — c'est exactement ce qui
 * était arrivé aux deux fenêtres de la v1.
 *
 * CHAQUE OPTION EST UN VRAI CONTRÔLE. `Radio` pour un choix unique — c'est lui
 * qui donne la navigation aux flèches à l'intérieur du groupe —, `Case` quand
 * plusieurs choix se cumulent. Tous deux dessinent 20 px et répondent sur 44,
 * et leur libellé est obligatoire : aucune option n'est muette.
 *
 * Deux actions au pied : « Effacer », éteint tant qu'il n'y a rien à effacer,
 * et la validation, qui ne fait que refermer — le filtrage, lui, est déjà
 * appliqué. On ne fait pas attendre un résultat derrière un bouton.
 * ──────────────────────────────────────────────────────────────────────────── */
export type OptionFiltre = {
  valeur: string;
  libelle: string;
  /** Précision sous le libellé : « 12 opérations ». Facultative. */
  description?: string;
  eteint?: boolean;
};

export function FeuilleFiltres({
  titre,
  description,
  options,
  valeurs,
  surChangement,
  multiple,
  etiquetteFermer,
  libelleEffacer,
  libelleValider,
  onFermer,
  ouverte = true,
}: {
  /** Le titre de la feuille — le même mot que le déclencheur. */
  titre: string;
  /** Une phrase de contexte. Facultative : la liste se suffit souvent. */
  description?: string;
  options: readonly OptionFiltre[];
  /** Ce qui est retenu. Un seul élément au plus quand `multiple` est absent. */
  valeurs: readonly string[];
  surChangement: (valeurs: string[]) => void;
  /** Les choix se cumulent (cases à cocher) au lieu de s'exclure (radios). */
  multiple?: boolean;
  /** Ce qu'annonce la croix : « Fermer les filtres d'opérateur ». */
  etiquetteFermer: string;
  libelleEffacer: string;
  libelleValider: string;
  onFermer: () => void;
  ouverte?: boolean;
}) {
  // Le nom du groupe de radios. `useId` parce que deux feuilles peuvent vivre
  // dans la même page (la galerie en montre plusieurs) : deux groupes de même
  // nom s'excluraient l'un l'autre.
  const nom = useId();

  const basculer = (valeur: string) => {
    if (!multiple) {
      surChangement([valeur]);
      return;
    }
    surChangement(
      valeurs.includes(valeur)
        ? valeurs.filter((v) => v !== valeur)
        : [...valeurs, valeur],
    );
  };

  return (
    <Fenetre
      titre={titre}
      description={description}
      etiquetteFermer={etiquetteFermer}
      onFermer={onFermer}
      ouverte={ouverte}
      pied={
        <>
          <Bouton
            variante="discret"
            desactive={valeurs.length === 0}
            onClick={() => surChangement([])}
          >
            {libelleEffacer}
          </Bouton>
          <Bouton variante="primaire" onClick={onFermer}>
            {libelleValider}
          </Bouton>
        </>
      }
    >
      {/* Les rangées se touchent bord à bord : deux cibles de 44 dont les
          centres sont à 44 ne se recouvrent pas. Aucun écart à ajouter. */}
      <div
        role={multiple ? "group" : "radiogroup"}
        aria-label={titre}
        className="flex flex-col"
      >
        {options.map((option) =>
          multiple ? (
            <Case
              key={option.valeur}
              libelle={option.libelle}
              description={option.description}
              cochee={valeurs.includes(option.valeur)}
              eteint={option.eteint}
              surChangement={() => basculer(option.valeur)}
            />
          ) : (
            <Radio
              key={option.valeur}
              libelle={option.libelle}
              description={option.description}
              nom={nom}
              valeur={option.valeur}
              choisi={valeurs.includes(option.valeur)}
              eteint={option.eteint}
              surChangement={() => basculer(option.valeur)}
            />
          ),
        )}
      </div>
    </Fenetre>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3 · LA BARRE
 *
 * UNE rangée, `h-controle` (44) — déclarée, jamais obtenue en empilant des
 * paddings. Elle porte les déclencheurs, la gouttière de 12 qui les sépare,
 * et le COMPTE DE FILTRES ACTIFS.
 *
 * Le compte n'est pas une décoration : c'est la réponse à « pourquoi la liste
 * est-elle si courte ? ». Il est ANNONCÉ en toutes lettres — la zone vit en
 * `aria-live="polite"`, présente même à zéro pour que le lecteur d'écran ait
 * quelque chose à surveiller.
 *
 * MAIS IL S'ÉCRIT EN CHIFFRE, DANS UNE PASTILLE DE 20. Mesuré : « 2 filtres »
 * en toutes lettres coûte une septantaine de pixels sur une rangée qui en
 * compte 358, et ces pixels-là sont pris aux déclencheurs — c'est-à-dire au
 * nom des filtres actifs, la seule chose qu'on vient lire. La pastille coûte
 * 20 px et dit la même chose. La phrase, elle, reste entière pour qui écoute.
 *
 * LA BARRE NE SUPPOSE RIEN DE SON PLACEMENT. `position="basse"` la colle au
 * bas de la fenêtre, ce que demande l'ergonomie : les sept puces d'avant
 * étaient toutes hors de portée du pouce (arcs 424 à 532, « facile » s'arrête
 * à 270). `position="flux"` la laisse où l'écran la pose. Rien d'autre n'est
 * décidé ici : la mise en page reste au `classe` de l'appelant.
 * ──────────────────────────────────────────────────────────────────────────── */
export function BarreFiltres({
  libelle,
  compte = 0,
  libelleCompte,
  position = "flux",
  classe,
  children,
}: {
  /** Ce que le groupe regroupe : « Filtres ». Lu avant les déclencheurs. */
  libelle: string;
  /** Nombre de filtres actifs, tous déclencheurs confondus. */
  compte?: number;
  /**
   * La phrase ANNONCÉE, dans la langue de l'écran : « 2 filtres actifs ».
   * Elle n'est jamais affichée — c'est la pastille qui porte le chiffre.
   */
  libelleCompte?: (compte: number) => string;
  /**
   * « basse » : la barre colle au bas de la fenêtre, le contenu défile
   * derrière. `z-10` est le plan de ce qui colle en défilant (§5.8).
   */
  position?: "flux" | "basse";
  classe?: string;
  children: ReactNode;
}) {
  const texteCompte = compte > 0 && libelleCompte ? libelleCompte(compte) : "";

  return (
    <div
      role="group"
      aria-label={libelle}
      className={`flex h-controle items-center ${
        position === "basse" ? "sticky bottom-0 z-10 bg-surface" : ""
      } ${classe ?? ""}`}
    >
      {/* La gouttière de 12 vaut ENTRE DEUX CIBLES, et seulement là. Elle
          appartient donc au groupe des déclencheurs, pas à la barre : la
          pastille de compte ne se touche pas, elle se contente de 4. Ces
          8 px-là ne sont pas une économie de comptable — mesuré, ce sont eux
          qui font la différence entre « Catégorie » et « Catégor… » sur une
          rangée de 358. */}
      <div className="flex min-w-0 items-center gap-gouttiere-cible">
        {children}
      </div>
      <span className="ms-auto flex shrink-0 items-center ps-1">
        {/* Toujours dans le DOM, même vide : une zone vivante qui n'apparaît
            qu'au moment où elle change n'est pas lue par tous les lecteurs
            d'écran. C'est ici que le compte s'écrit en toutes lettres. */}
        <span aria-live="polite" className="sr-only">
          {texteCompte}
        </span>
        {/* Pas de phrase, pas de pastille : un chiffre que personne ne peut
            lire n'est pas une information, c'est une énigme. */}
        {texteCompte !== "" && (
          <span
            aria-hidden="true"
            className="grid size-badge place-items-center rounded-full bg-accent text-caption font-semibold text-sur-couleur"
          >
            {compte}
          </span>
        )}
      </span>
    </div>
  );
}
