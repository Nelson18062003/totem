// La géométrie de la marque TOTEM — décrite une seule fois pour les écrans.
//
// Le symbole est « La Tresse » : deux brins qui se croisent à chaque registre
// et se rejoignent aux deux bouts. Entre deux croisements, le vide dessine un
// losange — le treillis naît du tressage, il n'est pas posé dessus.
//
// Les tracés de référence sont produits par `brand/generer.py`, qui fait
// autorité. Ceci en est le relevé, partagé par la plateforme et le téléphone :
// le symbole ne se redessine pas, il se rend. Voir docs/IDENTITE.md.

export const BRIN_A =
  "M16 4.4C17.54 5.302 22.6 6.462 22.6 8.267C22.6 10.071 19.08 10.329 16 12.133" +
  "C12.92 13.938 9.4 14.196 9.4 16C9.4 17.804 12.92 18.062 16 19.867" +
  "C19.08 21.671 22.6 21.929 22.6 23.733C22.6 25.538 17.54 26.698 16 27.6";

export const BRIN_B =
  "M16 4.4C14.46 5.302 9.4 6.462 9.4 8.267C9.4 10.071 12.92 10.329 16 12.133" +
  "C19.08 13.938 22.6 14.196 22.6 16C22.6 17.804 19.08 18.062 16 19.867" +
  "C12.92 21.671 9.4 21.929 9.4 23.733C9.4 25.538 14.46 26.698 16 27.6";

export const EPAISSEUR = 4.8;

/** Les deux croisements intérieurs, et le brin qu'ils interrompent. */
export const CROISEMENTS = [
  { y: 12.133, dessous: "b" },
  { y: 19.867, dessous: "a" },
] as const;

/** La coupe qui donne le passage dessus-dessous. */
export const COUPE = {
  x: -7.68, y: -3.55, largeur: 15.36, hauteur: 7.1, rotation: 149.64,
} as const;

/** En dessous de cette taille, les jours du tressage tombent sous le pixel
 *  et se bouchent : on fond alors les deux brins. Même silhouette, le
 *  passage en moins. */
export const TAILLE_TISSAGE = 22;

export const VUE_BOITE = "0 0 32 32";
