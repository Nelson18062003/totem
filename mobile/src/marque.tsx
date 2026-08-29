// La marque TOTEM, dessinée pour le téléphone.
//
// La géométrie vient de `@noyau/marque` — les mêmes tracés que la
// plateforme. « La Tresse » : deux brins qui se croisent à chaque registre.
// Le vide entre deux croisements dessine le losange ; le treillis naît du
// tressage, il n'est pas posé dessus.

import Svg, { Defs, G, Mask, Path, Rect } from "react-native-svg";
import type { ColorValue } from "react-native";
import {
  BRIN_A, BRIN_B, COUPE, CROISEMENTS, EPAISSEUR, TAILLE_TISSAGE, VUE_BOITE,
} from "@noyau/marque";
import { couleurs } from "./theme/jetons";

/** La coupe qui donne le passage dessus-dessous. */
function Coupe({ y }: { y: number }) {
  return (
    <Rect
      x={COUPE.x} y={COUPE.y} width={COUPE.largeur} height={COUPE.hauteur}
      fill="#000" transform={`translate(16,${y}) rotate(${COUPE.rotation})`}
    />
  );
}

/**
 * Le symbole seul.
 *
 * En dessous de 22 points, les jours du tressage tombent sous le pixel et se
 * bouchent : on fond alors les deux brins. Même silhouette, le passage en
 * moins.
 */
export function Symbole({
  taille = 26, couleur = couleurs.laterite, opacite = 1,
}: { taille?: number; couleur?: ColorValue; opacite?: number }) {
  const tisse = taille >= TAILLE_TISSAGE;
  const brin = {
    fill: "none" as const,
    stroke: couleur as string,
    strokeWidth: EPAISSEUR,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <Svg width={taille} height={taille} viewBox={VUE_BOITE} opacity={opacite}>
      {tisse ? (
        <Defs>
          {(["a", "b"] as const).map((id) => (
            <Mask key={id} id={`brin-${id}`} maskUnits="userSpaceOnUse"
                  x={-0.2} y={-0.4} width={32.4} height={32.8}>
              <Rect x={-0.2} y={-0.4} width={32.4} height={32.8} fill="#fff" />
              {CROISEMENTS.filter((c) => c.dessous === id).map((c) => (
                <Coupe key={c.y} y={c.y} />
              ))}
            </Mask>
          ))}
        </Defs>
      ) : null}
      <G>
        <Path d={BRIN_A} {...brin} mask={tisse ? "url(#brin-a)" : undefined} />
        <Path d={BRIN_B} {...brin} mask={tisse ? "url(#brin-b)" : undefined} />
      </G>
    </Svg>
  );
}
