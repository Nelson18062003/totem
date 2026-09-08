// Les quelques pièces dont tous les écrans se servent.
//
// Elles existent pour que la charte s'applique SANS y penser : un texte prend
// Inter et l'encre, une carte prend le rayon de 8 et la bordure fine, et
// personne n'a besoin de s'en souvenir écran par écran.
//
// Rappel de la charte, parce que c'est ici qu'on serait tenté de l'oublier :
// pas d'ombre. Les plans se séparent par les bordures et les fonds.

import {
  ScrollView, Text, TextInput, View,
  type ScrollViewProps, type TextInputProps, type TextProps, type ViewProps,
} from "react-native";
import { couleurs, espaces, polices, rayons, textes, INTERLETTRAGE_MARQUE } from "./theme/jetons";
import { ECHELLE_MAX } from "./ecran";

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
      // LE RÉGLAGE « TAILLE DU TEXTE » DU TÉLÉPHONE, RESPECTÉ MAIS BORNÉ.
      //
      // Sans cette borne, React Native applique l'agrandissement du système
      // SANS LIMITE : sur un iPhone dont la taille de texte est montée d'un
      // ou deux crans — un réglage courant, et légitime — l'application
      // devient « trop grosse » d'un bout à l'autre. C'est ce qui a été
      // constaté sur un iPhone 16 Pro Max, le plus GRAND écran de la gamme,
      // où tout aurait dû paraître plus petit.
      //
      // La borne était pourtant décidée depuis longtemps, et écrite :
      // `ECHELLE_MAX` dans `ecran.ts`, avec sa raison — au-delà, les
      // chiffres d'un solde ne tiennent plus sur la carte, ce qui dessert
      // précisément la personne qui a demandé du plus gros. Elle vivait
      // dans une fonction que PERSONNE n'appelait. **Une décision écrite et
      // jamais branchée ne protège de rien** ; elle fait pire, elle
      // rassure : on relit le code, on lit la borne, on croit le sujet
      // traité.
      //
      // Elle est posée AVANT `{...reste}` : un écran qui a une bonne raison
      // de la lever — un montant qui doit rester lisible d'un mètre — passe
      // devant.
      maxFontSizeMultiplier={ECHELLE_MAX}
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

/**
 * TOUT CE QUI SE SAISIT PASSE PAR ICI — pour la même raison que `Texte`.
 *
 * Un champ de saisie suit le réglage « taille du texte » du téléphone
 * exactement comme un texte, et sans limite : onze champs, aucun borné. La
 * moitié visible du défaut était traitée, l'autre pas.
 *
 * Et un champ qui déborde coûte plus cher qu'un texte qui déborde. On y tape
 * un numéro de téléphone à neuf chiffres, une adresse de plateforme, un code
 * d'opérateur : quand le texte dépasse sa boîte, on ne relit plus ce qu'on
 * vient d'écrire — sur un numéro vers lequel de l'argent va partir.
 *
 * La borne est la même que celle du texte, pour que les deux restent
 * d'accord. Rien d'autre n'est décidé ici : la capitalisation, le clavier, la
 * correction automatique se choisissent champ par champ, et n'ont pas de
 * bonne valeur commune.
 */
export function ChampTexte(props: TextInputProps) {
  return <TextInput maxFontSizeMultiplier={ECHELLE_MAX} {...props} />;
}

/**
 * TOUT CE QUI DÉFILE PASSE PAR ICI.
 *
 * L'application portait douze `ScrollView`, et pas un seul réglage. Les
 * corriger un par un, c'est en oublier un — et surtout le treizième, celui
 * qu'on écrira demain. C'est le même raisonnement que le verrou d'un geste
 * ou le toucher : on pose la règle à l'endroit par lequel tout passe.
 *
 * TROIS RÉGLAGES, ET CHACUN RÉPARE QUELQUE CHOSE DE PRÉCIS :
 *
 * `keyboardShouldPersistTaps="handled"` — ce n'est PAS du confort, c'est un
 * défaut. Sans lui, quand le clavier est ouvert, le premier appui sur un
 * bouton ne fait que refermer le clavier : il faut appuyer DEUX fois. Or
 * `verifier-les-gestes` garde précisément la promesse inverse — un geste
 * part une fois — et `verifier-la-reponse` explique pourquoi on appuie deux
 * fois : parce que le premier appui n'a rien répondu. Le clavier fabriquait
 * exactement cette situation.
 *
 * `keyboardDismissMode="on-drag"` — on fait défiler pour LIRE. Devoir
 * d'abord fermer le clavier pour voir ce qu'on tape est un pas de trop, et
 * c'est ce que fait n'importe quelle application du téléphone.
 *
 * `contentInsetAdjustmentBehavior="automatic"` — iOS uniquement : le
 * contenu s'écarte tout seul de l'encoche et de la barre d'accueil. Sans
 * lui, la dernière ligne se glisse sous la barre du bas.
 *
 * Les réglages sont posés AVANT `{...reste}` : un écran qui a une raison de
 * les lever passe devant.
 */
export function Defilement({ children, ...reste }: ScrollViewProps) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      {...reste}
    >
      {children}
    </ScrollView>
  );
}

/** Le mot TOTEM, et lui seul. Le logotype ne se recompose pas dans une
 *  autre police, et son interlettrage ne s'applique à rien d'autre. */
export function MotTotem(
  { taille = textes.petit, couleur = couleurs.laterite }:
  { taille?: number; couleur?: string } = {},
) {
  return (
    // UN LOGOTYPE NE SE MET PAS À L'ÉCHELLE. « TOTEM » est un dessin, pas
    // une phrase : son interlettrage est calculé pour sa taille, et le
    // grossir le déforme au lieu de le rendre plus lisible. Aucune autre
    // marque ne grossit quand on monte la taille du texte du téléphone.
    <Text allowFontScaling={false} style={{
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

// L'ACCROC : la vérité quand la plateforme ne répond pas. Chaque écran de
// données doit la dire — sans elle, un téléphone hors ligne montrait
// « Aucun SMS », « Aucune carte », « Rien à analyser » : une connexion en
// panne déguisée en commerce vide. Le message vient du guichet (déjà dans
// la langue de l'écran) ; le bouton relance la lecture.
import { Pressable, type ViewStyle } from "react-native";
import { Animated, useAppui } from "./animations";
import { Icone, type NomIcone } from "./icones";
import { useLangue } from "./langue";
import { textesConnexion } from "@noyau/textes/connexion";

export function Accroc({ message, onReessayer }: {
  message: string;
  onReessayer: () => void;
}) {
  const langue = useLangue();
  return (
    <View style={{
      borderWidth: 1, borderColor: couleurs.negatif,
      borderRadius: rayons.carte, backgroundColor: couleurs.surfaceHaute,
      padding: espaces.lg, gap: espaces.md,
    }}>
      <Texte taille={textes.petit} ton="negatif" style={{ lineHeight: 20 }}>
        {message}
      </Texte>
      <Pressable
        accessibilityRole="button"
        onPress={onReessayer}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          paddingHorizontal: espaces.lg, paddingVertical: espaces.sm,
          borderRadius: rayons.bouton, borderWidth: 1,
          borderColor: couleurs.trait,
          backgroundColor: pressed ? couleurs.surface2 : couleurs.surface,
        })}
      >
        <Texte taille={textes.petit} poids="moyen">
          {textesConnexion[langue].reessayer}
        </Texte>
      </Pressable>
    </View>
  );
}

/** LA RÉPONSE D'UN LIEN OU D'UNE PASTILLE : il pâlit sous le doigt.
 *
 *  Mesuré dans l'application qui tourne (`verifier-la-reponse`) : « tout
 *  voir », l'œil du mot de passe, les onglets ne remuaient PAS UN PIXEL tant
 *  que le doigt restait posé. Or « tout voir » mène à un autre écran, et
 *  changer d'écran prend du temps : pendant ce temps, rien ne dit que
 *  l'appui a été pris. On réappuie — et c'est normal.
 *
 *  Pourquoi l'opacité, et non l'échelle de `useAppui` : un mot souligné qui
 *  RÉTRÉCIT se lit comme un défaut d'affichage. Les surfaces s'enfoncent,
 *  les mots pâlissent.
 *
 *  Et le changement est INSTANTANÉ : `pressed` vient du rendu de `Pressable`
 *  lui-même, pas d'un état React qui n'arriverait qu'à l'image suivante —
 *  c'est la faute que `verifier-les-gestes` garde de l'autre côté.
 */
export const appuiTexte = ({ pressed }: { pressed: boolean }): ViewStyle =>
  ({ opacity: pressed ? 0.5 : 1 });

/** La même réponse, posée SUR un style déjà écrit. Les pastilles et les
 *  cartes ont leur fond et leur bordure : on n'en refait pas une copie, on y
 *  ajoute l'opacité. */
export const avecAppui = (base: ViewStyle) =>
  ({ pressed }: { pressed: boolean }): ViewStyle =>
    ({ ...base, opacity: pressed ? 0.5 : 1 });

/**
 * UN BOUTON À ICÔNE NUE — la flèche retour, la croix d'une feuille,
 * l'engrenage des réglages.
 *
 * POURQUOI IL EXISTE. Ces boutons-là n'ont aucune surface : rien à teindre
 * au moment de l'appui. Les autres boutons de l'application réagissent par
 * la couleur (`style={({ pressed }) => …}`) — une icône posée sur le fond de
 * l'écran ne le peut pas, et restait donc parfaitement immobile sous le
 * doigt.
 *
 * Or c'est exactement là que le retour manque le plus : ce sont les plus
 * PETITES cibles de l'écran. Quand rien ne bouge, on ne sait pas si on a
 * touché à côté — et le geste naturel est de réappuyer. C'est ainsi qu'on
 * ouvre deux fois un écran, ou qu'on dépose deux fois une demande.
 *
 * La réponse est donc une ÉCHELLE, pas une couleur : l'icône s'enfonce de
 * 3 %, sans rebond, sur le fil de l'interface (voir `useAppui`). Elle est
 * insensible au JavaScript occupé — c'est-à-dire au moment précis où l'écran
 * charge et où l'on appuie sans être sûr.
 *
 * L'ÉTIQUETTE EST OBLIGATOIRE, par le type. Une icône ne se lit pas : sans
 * étiquette, un lecteur d'écran n'annonce rien du tout — un bouton muet dans
 * les deux sens.
 */
export function BoutonIcone({
  nom, taille = 22, couleur = couleurs.encreDouce, etiquette, onPress,
  style, ...reste
}: Omit<React.ComponentProps<typeof Pressable>, "children" | "accessibilityLabel"> & {
  nom: NomIcone;
  taille?: number;
  couleur?: string;
  /** Ce qu'un lecteur d'écran annonce. Jamais facultatif. */
  etiquette: string;
}) {
  // Le style animé va sur la VUE, jamais sur le Pressable : le répandre en
  // bloc y ferait atterrir un style qu'on écrase à la ligne suivante.
  const { style: styleAnime, onPressIn, onPressOut } = useAppui();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      // Une icône de 22 points est plus petite que le bout d'un doigt : la
      // zone sensible déborde de douze points tout autour.
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={etiquette}
      {...reste}
      style={style}
    >
      <Animated.View style={styleAnime}>
        <Icone nom={nom} taille={taille} couleur={couleur} />
      </Animated.View>
    </Pressable>
  );
}
