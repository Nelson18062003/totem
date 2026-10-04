// LES MESURES DE L'ACCUEIL, écrites UNE fois.
//
// L'accueil et ses formes d'attente (`squelettes.tsx`) les lisent toutes
// deux : une forme d'attente à la mauvaise hauteur fait SAUTER l'écran au
// moment où les chiffres arrivent — c'est la leçon de `verifier-l-attente`.
// Recopiées à la main, les deux finissent toujours par diverger.

/** Une puce de carte (logo + chiffres), et l'écart entre deux. */
export const HAUTEUR_PUCE = 36;
export const ECART_PUCES = 6;

/** La ligne sous la carte : l'âge du solde, et « Actualiser ». Une ou deux
 *  lignes de texte y tiennent sans changer sa hauteur. */
export const HAUTEUR_ETAT = 32;

/** Un rond d'action : le cercle, l'écart, puis son nom — sur DEUX lignes
 *  réservées, pour qu'un nom long (« Transfert » sur 320 points) passe à la
 *  ligne sans rien pousser. */
export const ROND = 54;
export const ECART_ROND = 6;
export const LIGNE_ROND = 15;
export const NOM_ROND = LIGNE_ROND * 2;

/** Les derniers mouvements montrés sur l'accueil. */
export const LIGNES_MOUVEMENTS = 3;
export const LIGNES_MOUVEMENTS_LARGE = 6;

// --- L'onglet Opérations ----------------------------------------------------
//
// Les mêmes raisons que l'accueil : la forme d'attente (`SqueletteOperations`)
// et l'écran lisent ces mesures, une fois.

/** Une tuile de geste d'argent (Dépôt, Retrait, Transfert), côte à côte. */
export const HAUTEUR_TUILE = 96;
/** La même, en COLONNE — écran étroit ou texte agrandi : une rangée pleine
 *  largeur, le rond à gauche, le nom à côté. Jamais un nom coupé. */
export const HAUTEUR_TUILE_COLONNE = 60;
/** Une demi-tuile de « Consulter » (Mon solde, Mon numéro). */
export const HAUTEUR_DEMI = 56;

/** Les tuiles passent en colonne sous 340 points de large, ou dès que le
 *  réglage « taille du texte » dépasse 1,2 : trois noms côte à côte ne
 *  tiendraient plus entiers. */
export const tuilesEnColonne = (largeur: number, echelleTexte: number): boolean =>
  largeur < 340 || echelleTexte > 1.2;
