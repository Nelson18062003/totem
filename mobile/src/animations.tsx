// Le mouvement de l'application.
//
// Une règle, et elle tient en une phrase : le mouvement SERT LA LECTURE, il
// ne la décore pas. Les blocs entrent dans l'ordre où l'œil les prendrait —
// l'en-tête, la caisse, les gestes, les messages — ce qui donne à l'écran le
// temps de se composer au lieu d'apparaître d'un bloc.
//
// Trois bornes, parce qu'une animation ratée coûte plus qu'aucune :
//
//   — court. 260 ms, jamais plus : au-delà, on ATTEND l'écran.
//   — discret. Huit points de montée et un fondu. Rien ne rebondit, rien ne
//     tourne : c'est un tableau de bord d'argent, pas un jeu.
//   — respectueux. Qui a demandé « moins d'animations » dans les réglages du
//     téléphone n'en reçoit aucune — seulement l'affichage, tout de suite.

import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, type ViewProps } from "react-native";

/** L'entrée d'un bloc : il monte de huit points en se révélant. */
export function Entree({
  delai = 0, children, style, ...reste
}: ViewProps & { delai?: number }) {
  const avancement = useRef(new Animated.Value(0)).current;
  const reduit = useRef(false);

  useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        if (!vivant) return;
        reduit.current = r;
        if (r) {
          // Pas d'animation du tout : on affiche, point.
          avancement.setValue(1);
          return;
        }
        Animated.timing(avancement, {
          toValue: 1,
          duration: 260,
          delay: delai,
          // Sortie douce : rapide au départ, freinée à l'arrivée. C'est ce
          // qui donne l'impression d'un objet qui se pose, pas d'un écran
          // qui clignote.
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      })
      .catch(() => avancement.setValue(1));
    return () => { vivant = false; };
  }, [avancement, delai]);

  return (
    <Animated.View
      {...reste}
      style={[
        style,
        {
          opacity: avancement,
          transform: [{
            translateY: avancement.interpolate({
              inputRange: [0, 1], outputRange: [8, 0],
            }),
          }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** L'appui d'une surface : elle s'enfonce très légèrement. Le doigt doit
 *  SENTIR qu'il a touché, avant même que l'écran change. */
export function useAppui() {
  const echelle = useRef(new Animated.Value(1)).current;
  const vers = (v: number) =>
    Animated.spring(echelle, {
      toValue: v, useNativeDriver: true,
      speed: 40, bounciness: 0,      // aucun rebond : ce n'est pas un jouet
    }).start();
  return {
    echelle,
    onPressIn: () => vers(0.975),
    onPressOut: () => vers(1),
  };
}
