// Les quelques pièces dont tous les écrans se servent.
//
// Elles existent pour que la charte s'applique SANS y penser : un texte prend
// Inter et l'encre, une carte prend le rayon de 8 et la bordure fine, et
// personne n'a besoin de s'en souvenir écran par écran.
//
// Rappel de la charte, parce que c'est ici qu'on serait tenté de l'oublier :
// pas d'ombre. Les plans se séparent par les bordures et les fonds.

import { Text, View, type TextProps, type ViewProps } from "react-native";
import { couleurs, espaces, polices, rayons, textes, INTERLETTRAGE_MARQUE } from "./theme/jetons";

type TonTexte = "normal" | "doux" | "pale" | "positif" | "negatif" | "alerte" | "marque";
type PoidsTexte = "normal" | "moyen" | "demi" | "gras";

const TONS: Record<TonTexte, string> = {
  normal: couleurs.encre,
  doux: couleurs.encreDouce,
  pale: couleurs.encrePale,
  positif: couleurs.positif,
  negatif: couleurs.negatif,
  alerte: couleurs.alerte,
  marque: couleurs.laterite,
};

const POIDS: Record<PoidsTexte, string> = {
  normal: polices.corps,
  moyen: polices.moyen,
  demi: polices.demi,
  gras: polices.gras,
};

export function Texte({
  taille = textes.corps, ton = "normal", poids = "normal",
  chiffresAlignes = false, style, ...reste
}: TextProps & {
  taille?: number;
  ton?: TonTexte;
  poids?: PoidsTexte;
  /** Pour les colonnes de chiffres : ils gardent la même largeur. */
  chiffresAlignes?: boolean;
}) {
  return (
    <Text
      {...reste}
      style={[
        {
          fontFamily: POIDS[poids],
          fontSize: taille,
          color: TONS[ton],
          ...(chiffresAlignes ? { fontVariant: ["tabular-nums" as const] } : {}),
        },
        style,
      ]}
    />
  );
}

/** Le mot TOTEM, et lui seul. Le logotype ne se recompose pas dans une
 *  autre police, et son interlettrage ne s'applique à rien d'autre. */
export function MotTotem(
  { taille = textes.petit, couleur = couleurs.laterite }:
  { taille?: number; couleur?: string } = {},
) {
  return (
    <Text style={{
      fontFamily: polices.marque, fontSize: taille, color: couleur,
      letterSpacing: (INTERLETTRAGE_MARQUE / textes.petit) * taille,
    }}>
      TOTEM
    </Text>
  );
}

/** Une surface posée sur le fond : bordure fine, rayon de 8, aucune ombre. */
export function Carte({ style, ...reste }: ViewProps) {
  return (
    <View
      {...reste}
      style={[
        {
          backgroundColor: couleurs.surfaceHaute,
          borderColor: couleurs.trait,
          borderWidth: 1,
          borderRadius: rayons.carte,
        },
        style,
      ]}
    />
  );
}

/** Un filet de séparation — le trait, jamais une ombre. */
export function Filet({ style }: { style?: ViewProps["style"] }) {
  return <View style={[{ height: 1, backgroundColor: couleurs.trait }, style]} />;
}

/** Le point d'état : vert s'il respire, rouge s'il s'est tu. */
export function Pastille({ vif, couleur }: { vif?: boolean; couleur?: string }) {
  return (
    <View style={{
      width: 8, height: 8, borderRadius: rayons.rond,
      backgroundColor: couleur ?? (vif ? couleurs.positifVif : couleurs.negatif),
    }} />
  );
}

export { couleurs, espaces, rayons, textes, polices };
