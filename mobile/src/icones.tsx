// Le jeu d'icônes, dessiné pour le TÉLÉPHONE.
//
// La géométrie vient de `@noyau/icones` — exactement les mêmes coordonnées
// que la plateforme web. Seul l'outil de dessin change : ici react-native-svg
// au lieu du <svg> du navigateur.
//
// Une icône ne porte pas sa couleur : elle prend celle qu'on lui donne, et
// par défaut celle du texte autour d'elle. C'est ce qui lui permet de vivre
// dans un bouton sombre comme sur un fond clair sans être redessinée.

import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { ICONES, TRAIT, type Forme, type NomIcone } from "@noyau/icones";
import { couleurs } from "./theme/jetons";

type Props = {
  /** Le côté du carré, en points. 20 comme sur la plateforme. */
  taille?: number;
  /** La couleur du trait. Par défaut l'encre — jamais la latérite : une
   *  icône est du texte, pas de la marque.
   *  `ColorValue` et non `string` : la barre d'onglets de React Native donne
   *  parfois une couleur opaque (une valeur native), pas une chaîne. */
  couleur?: ColorValue;
};

function tracer(forme: Forme, i: number) {
  if (forme.f === "path") return <Path key={i} d={forme.d} />;
  if (forme.f === "rect") {
    return (
      <Rect key={i} x={forme.x} y={forme.y} width={forme.w} height={forme.h}
            {...(forme.r ? { rx: forme.r } : {})} />
    );
  }
  return <Circle key={i} cx={forme.cx} cy={forme.cy} r={forme.r} />;
}

/** Une icône du jeu, par son nom. */
export function Icone({
  nom, taille = 20, couleur = couleurs.encre,
}: Props & { nom: NomIcone }) {
  const formes = ICONES[nom] as readonly Forme[];
  return (
    <Svg width={taille} height={taille} viewBox={TRAIT.vueBoite} fill="none"
         stroke={couleur as string} strokeWidth={TRAIT.epaisseur}
         strokeLinecap={TRAIT.bout} strokeLinejoin={TRAIT.jointure}>
      {formes.map(tracer)}
    </Svg>
  );
}

export type { NomIcone };
