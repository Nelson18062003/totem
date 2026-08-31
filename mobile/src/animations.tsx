// Le mouvement de l'application, sur Reanimated 4.
//
// Pourquoi Reanimated et non l'API `Animated` de React Native : Reanimated
// exécute l'animation sur le fil de l'INTERFACE, pas sur celui du JavaScript.
// Conséquence concrète — quand l'écran charge ses données, le JavaScript est
// occupé ; une animation ordinaire saccade précisément à ce moment-là. Celle
// d'ici ne le sent pas.
//
// Trois bornes, parce qu'une animation ratée coûte plus cher qu'aucune :
//
//   — courte. 260 ms, jamais plus : au-delà, on ATTEND l'écran.
//   — discrète. Une montée de quelques points et un fondu. Rien ne rebondit,
//     rien ne tourne : c'est un tableau de bord d'argent, pas un jeu.
//   — respectueuse. Qui a demandé « moins d'animations » dans les réglages
//     du téléphone n'en reçoit aucune.

import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, type ViewProps } from "react-native";
import Animated, {
  FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming,
  Easing,
} from "react-native-reanimated";

/** Le réglage système « réduire les animations ». */
export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => { if (vivant) setReduit(r); })
      .catch(() => {});
    const abonnement = AccessibilityInfo.addEventListener(
      "reduceMotionChanged", setReduit);
    return () => { vivant = false; abonnement.remove(); };
  }, []);
  return reduit;
}

/**
 * L'entrée d'un bloc : il monte de quelques points en se révélant.
 *
 * Les blocs entrent dans l'ordre où l'œil les prendrait, ce qui donne à
 * l'écran le temps de se composer au lieu d'apparaître d'un coup.
 */
export function Entree({
  delai = 0, montee = 10, children, style, ...reste
}: ViewProps & { delai?: number; montee?: number; children?: ReactNode }) {
  const reduit = useMouvementReduit();
  const avancement = useSharedValue(reduit ? 1 : 0);

  useEffect(() => {
    if (reduit) { avancement.value = 1; return; }
    avancement.value = withTiming(1, {
      duration: 260,
      // Sortie douce : rapide au départ, freinée à l'arrivée. C'est ce qui
      // donne l'impression d'un objet qui se pose.
      easing: Easing.out(Easing.cubic),
    });
  }, [reduit, avancement]);

  const anime = useAnimatedStyle(() => ({
    opacity: avancement.value,
    transform: [{ translateY: (1 - avancement.value) * montee }],
  }));

  return (
    <Animated.View
      {...reste}
      entering={reduit ? undefined : FadeIn.delay(delai).duration(1)}
      style={[style, anime]}
    >
      {children}
    </Animated.View>
  );
}

/** L'appui d'une surface : elle s'enfonce très légèrement. Le doigt doit
 *  SENTIR qu'il a touché, avant même que l'écran change. */
export function useAppui() {
  const echelle = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));
  return {
    style,
    // Ressort sans rebond : ce n'est pas un jouet.
    onPressIn: () => { echelle.value = withSpring(0.97, { damping: 20, stiffness: 400 }); },
    onPressOut: () => { echelle.value = withSpring(1, { damping: 20, stiffness: 400 }); },
  };
}

export { Animated };

/**
 * UNE FORME EN ATTENTE — ce qu'on montre pendant que les chiffres arrivent.
 *
 * POURQUOI CE COMPOSANT EXISTE. Pendant le premier chargement, les écrans
 * principaux ne montraient RIEN : `!chargement ? (contenu) : null`. Un écran
 * blanc, sans un mot, sans un indice — pendant une à trois secondes sur une
 * bonne connexion, bien plus à Douala. Le propriétaire ne peut pas
 * distinguer « ça arrive » de « c'est cassé », et la seule chose qu'il puisse
 * faire est de retirer le doigt ou de relancer l'application.
 *
 * Une forme grise à la bonne place répond aux deux questions d'un coup :
 * l'écran travaille, et voici où les chiffres vont se poser. Rien n'a changé
 * dans la vitesse réelle ; tout a changé dans l'attente.
 *
 * LE BATTEMENT EST LENT ET FAIBLE — 1,1 s, de 0,45 à 0,8 d'opacité. Un
 * scintillement rapide sur un tableau de bord d'argent donne l'impression que
 * quelque chose ne va pas. Ce n'est pas un chargeur qui s'agite, c'est une
 * place qui attend.
 *
 * Qui a demandé « moins d'animations » voit la forme, immobile.
 */
// `dataSet` est une propriété de react-native-web, absente des types de
// React Native : on la passe par un objet à part plutôt que d'affaiblir le
// typage de tout le composant. Sur Android elle n'existe pas et n'est pas
// transmise à la vue native.
const MARQUE_HARNAIS = { dataSet: { squelette: "1" } } as object;

export function Squelette({
  largeur = "100%", hauteur = 16, rayon = 8, style, ...reste
}: ViewProps & {
  largeur?: number | `${number}%`;
  hauteur?: number;
  rayon?: number;
}) {
  const reduit = useMouvementReduit();
  const battement = useSharedValue(0.6);

  useEffect(() => {
    if (reduit) { battement.value = 0.6; return; }
    battement.value = withRepeat(
      withTiming(0.85, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,      // sans fin : elle s'arrête quand la donnée arrive
      true,    // et revient sur ses pas plutôt que de sauter
    );
  }, [reduit, battement]);

  const anime = useAnimatedStyle(() => ({ opacity: battement.value }));

  return (
    <Animated.View
      accessible={false}
      // Une forme d'attente n'est pas un contenu : les lecteurs d'écran
      // n'ont rien à y lire, et l'annoncer serait pire que de se taire.
      importantForAccessibility="no-hide-descendants"
      // UNE MARQUE POUR LES HARNAIS, et elle a une raison d'être précise.
      // Le gris de ces formes est `surface2` — le même que les champs, les
      // pastilles et les surfaces d'appui, employé à trente-trois endroits.
      // Un contrôle qui comptait « les blocs de cette couleur » comptait donc
      // aussi l'interface ordinaire : l'écran des Actions, qui n'a AUCUNE
      // forme d'attente, en annonçait sept. Le vert ne voulait rien dire.
      //
      // `dataSet` n'existe que sur le web (react-native-web le rend en
      // « data-squelette ») ; sur Android il est simplement ignoré. Rien
      // n'est embarqué dans le paquet du magasin.
      {...MARQUE_HARNAIS}
      {...reste}
      style={[
        { width: largeur, height: hauteur, borderRadius: rayon,
          backgroundColor: "#e6e6e6" },
        style,
        anime,
      ]}
    />
  );
}
