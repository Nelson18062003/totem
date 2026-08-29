// La fenêtre, et ce qu'on en déduit.
//
// Android ne garantit plus la taille de l'écran, et depuis Android 16 il ne
// garantit même plus l'ORIENTATION : au-delà de 600 dp de large — tablette,
// écran intérieur d'un pliable, fenêtre de bureau — le système IGNORE
// `orientation: portrait` et rend l'application redimensionnable. Sous
// l'API 37, il n'y aura plus d'échappatoire du tout.
//
// Conséquence pratique : on ne peut RIEN figer. Une fenêtre change de taille
// pendant qu'on la regarde (on déplie, on fait pivoter, on partage l'écran),
// et la mise en page doit suivre à l'image près.
//
// D'où `useWindowDimensions` partout, et jamais `Dimensions.get()` : le
// premier se remet à jour tout seul, le second fige la valeur du démarrage.
//
// Les seuils ci-dessous sont ceux de Google (window size classes), pas des
// nôtres : autant parler la langue du système sur lequel on tourne.

import { PixelRatio, useWindowDimensions } from "react-native";

/** Les classes de largeur de Google, en dp. */
export const SEUILS = {
  moyenne: 600,      // tablette en portrait, pliable ouvert
  etendue: 840,      // tablette en paysage
  large: 1200,       // bureau
} as const;

export type ClasseLargeur = "compacte" | "moyenne" | "etendue" | "large";
export type ClasseHauteur = "courte" | "moyenne" | "haute";

export type Ecran = {
  largeur: number;
  hauteur: number;
  classe: ClasseLargeur;
  hauteurClasse: ClasseHauteur;
  paysage: boolean;
  /** Vrai dès qu'on a la place d'une seconde colonne. */
  deuxColonnes: boolean;
  /** La largeur utile du contenu : bornée, pour qu'une ligne de texte ne
   *  s'étire jamais sur toute une tablette — au-delà, l'œil perd la ligne. */
  largeurContenu: number;
  /** La marge extérieure, plus généreuse quand l'écran grandit. */
  marge: number;
  /** Met un corps de texte à l'échelle de l'écran, sans jamais suivre
   *  aveuglément le réglage système. */
  corps: (base: number) => number;
};

// Au-delà de cette largeur, on cesse d'élargir le contenu : une colonne de
// texte de 700 points ne se lit plus, elle se balaie.
const CONTENU_MAX = 640;

// Le réglage « taille du texte » d'Android va jusqu'à 2× (et davantage en
// accessibilité). On le RESPECTE — c'est une aide réelle — mais on le borne :
// au-delà, les chiffres d'un solde ne tiennent plus sur la carte et le
// montant devient illisible, ce qui dessert précisément la personne qui a
// demandé du plus gros.
const ECHELLE_MAX = 1.35;

export function useEcran(): Ecran {
  const { width, height } = useWindowDimensions();

  const classe: ClasseLargeur =
    width >= SEUILS.large ? "large"
    : width >= SEUILS.etendue ? "etendue"
    : width >= SEUILS.moyenne ? "moyenne"
    : "compacte";

  const hauteurClasse: ClasseHauteur =
    height >= 900 ? "haute" : height >= 480 ? "moyenne" : "courte";

  const marge = classe === "compacte" ? 16 : classe === "moyenne" ? 24 : 32;
  const echelle = Math.min(PixelRatio.getFontScale(), ECHELLE_MAX);

  return {
    largeur: width,
    hauteur: height,
    classe,
    hauteurClasse,
    paysage: width > height,
    deuxColonnes: width >= SEUILS.moyenne,
    largeurContenu: Math.min(width - marge * 2, CONTENU_MAX),
    marge,
    corps: (base) => Math.round(base * echelle),
  };
}
