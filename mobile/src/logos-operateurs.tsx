// Les marques des opérateurs, dessinées pour le téléphone.
//
// Les tracés viennent de `@noyau/logos-operateurs` — les mêmes que la
// plateforme. C'est de la DONNÉE : le logo dit quelle caisse, et il le dit
// tout seul. Jamais un ornement, jamais un aplat de fond.

import Svg, { Path, Rect } from "react-native-svg";
import { MTN, ORANGE, TRACES_MTN, TRACES_ORANGE } from "@noyau/logos-operateurs";
import { couleurs } from "./theme/jetons";

/** Le logo officiel d'Orange — le carré, le mot en blanc. */
export function LogoOrange({ taille = 24 }: { taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox={ORANGE.vueBoite}>
      <Rect x={0} y={0} width={ORANGE.cote} height={ORANGE.cote} fill={ORANGE.fond} rx={12} />
      {TRACES_ORANGE.map((d, i) => <Path key={i} d={d} fill={ORANGE.encre} />)}
    </Svg>
  );
}

/** Le logo officiel de MTN (2022) — l'ovale et le sigle, sur le jaune. */
export function LogoMtn({ taille = 24 }: { taille?: number }) {
  return (
    <Svg width={taille * MTN.rapport} height={taille} viewBox={MTN.vueBoite}>
      <Rect x={-128} y={-64} width={1536} height={768} rx={MTN.rayon} fill={MTN.fond} />
      {TRACES_MTN.map((d, i) => <Path key={i} d={d} fill={MTN.encre} />)}
    </Svg>
  );
}

/** Le logo de l'opérateur, quand on le connaît. */
export function LogoOperateur({ operateur, taille = 24 }: {
  operateur: string; taille?: number;
}) {
  const o = operateur.toUpperCase();
  if (o.startsWith("MTN")) return <LogoMtn taille={taille} />;
  if (o.startsWith("ORANGE")) return <LogoOrange taille={taille} />;
  return null;
}

export function operateurReconnu(operateur: string): boolean {
  const o = operateur.toUpperCase();
  return o.startsWith("MTN") || o.startsWith("ORANGE");
}

/** La couleur de sertissage d'une carte — le cadre, jamais un fond. */
export function couleurOperateur(operateur: string): string | null {
  const o = operateur.toUpperCase();
  if (o.startsWith("MTN")) return couleurs.opMtn;
  if (o.startsWith("ORANGE")) return couleurs.opOrange;
  return null;
}
