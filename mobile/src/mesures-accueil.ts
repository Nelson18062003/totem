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
