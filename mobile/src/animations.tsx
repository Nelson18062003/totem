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
  FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming,
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
