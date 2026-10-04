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
import {
  AccessibilityInfo, Animated as AnimatedRN, Easing as EasingRN, View, type ViewProps,
} from "react-native";
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
  Easing,
} from "react-native-reanimated";

/** LA DURÉE D'UN CHANGEMENT D'ONGLET. Assez pour que l'œil suive d'où vient
 *  l'écran ; assez peu pour qu'on n'attende jamais l'écran. */
export const DUREE_ONGLET = 240;
/** Avec « réduire les animations » : un fondu seul, plus court encore. Rien
 *  ne glisse, rien ne grossit — mais l'écran ne « claque » pas non plus. */
export const DUREE_REDUITE = 120;

/** LA COURBE DE TOUT CE QUI SE DÉPLACE : part vite, se pose. La moitié du
 *  chemin est faite très tôt — l'écran qui part disparaît presque aussitôt,
 *  celui qui arrive prend le temps de se poser. */
export const COURBE_RN = EasingRN.bezier(0.2, 0, 0, 1);
/** La même, pour Reanimated (barre d'onglets, parcours d'une opération). */
export const COURBE = Easing.bezier(0.2, 0, 0, 1);

type ProgressionScene = { current: { progress: AnimatedRN.Value } };

/**
 * LE PASSAGE D'UN ONGLET À L'AUTRE — glissé, pas sauté.
 *
 * Le propriétaire : « quand je passe de l'Accueil à Comptes, à SMS ou à
 * Opérations, il n'y a pas de transition, rien ». L'écran était remplacé
 * d'un coup, sans dire d'où il venait.
 *
 * `progress` vaut −1 pour un onglet à GAUCHE de l'onglet actif, 0 pour
 * l'actif, +1 pour un onglet à DROITE. Aller de l'Accueil à Opérations fait
 * donc arriver l'écran par la droite, et le retour par la gauche — le sens
 * de la barre, sans rien calculer.
 *
 * Jamais deux écrans l'un sur l'autre, même à demi : celui qui part
 * s'efface sur la première moitié du trajet, celui qui arrive se révèle sur
 * la seconde — avec ou sans « Réduire les animations ».
 * Vingt points de glissement, pas un écran entier : un tableau de bord
 * d'argent ne se feuillette pas comme un album.
 *
 * Ce sont les objets `Animated` de React Native — ceux que le navigateur
 * des onglets anime lui-même, sur le fil natif. Aucune brique nouvelle : la
 * transition part par une mise à jour à distance.
 */
export function transitionDesOnglets(reduit: boolean) {
  return {
    animation: "shift" as const,
    transitionSpec: {
      animation: "timing" as const,
      config: { duration: reduit ? DUREE_REDUITE : DUREE_ONGLET, easing: COURBE_RN },
    },
    sceneStyleInterpolator: ({ current }: ProgressionScene) => ({
      sceneStyle: {
        // La MÊME règle d'opacité avec ou sans « Réduire les animations » :
        // l'écran qui part s'éteint sur la première moitié, celui qui
        // arrive s'allume sur la seconde. Le mode réduit faisait un fondu
        // ENCHAÎNÉ (`[0, 1, 0]`) : à mi-chemin, les deux écrans mêlés à
        // l'écran — l'Accueil à 0,65 et Opérations à 0,35, mesuré.
        opacity: current.progress.interpolate(
          { inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 0, 1, 0, 0] }),
        transform: [{
          translateX: reduit ? 0 : current.progress.interpolate(
            { inputRange: [-1, 0, 1], outputRange: [-20, 0, 20] }),
        }],
      },
    }),
  };
}

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
 *
 * UNE ENTRÉE NE SE JOUE QU'UNE FOIS — à la COMPOSITION de l'écran.
 * `anime={false}` : le bloc est là tout de suite, sans fondu ni délai.
 *
 * Dans la liste des SMS, chaque jour reposé (loin de l'écran) puis remonté,
 * chaque lot ajouté en descendant, se REMONTAIT — et rejouait son entrée :
 * un délai, puis un fondu. En remontant vite, des journées entières
 * passaient en blanc sous les yeux et apparaissaient une demi-seconde plus
 * tard : on croyait l'application à la peine, ou les SMS perdus. Ce qui
 * revient à l'écran n'« entre » pas : il était déjà là.
 *
 * Le choix se fait AU MONTAGE, et il tient pour toute la vie du bloc : un
 * bloc qui a commencé son entrée la finit, même si l'écran a décidé
 * entre-temps que la composition était terminée ; et un bloc monté sans
 * entrée ne se met jamais à en jouer une.
 */
export function Entree({
  anime = true, ...proprietes
}: ViewProps & { delai?: number; montee?: number; anime?: boolean; children?: ReactNode }) {
  const [animer] = useState(anime);
  if (!animer) {
    // Une vue ordinaire : aucun crochet d'animation, aucune question au
    // système sur « réduire les animations » — une liste en monte des
    // dizaines en descendant.
    const { delai: _delai, montee: _montee, ...reste } = proprietes;
    return <View {...reste} />;
  }
  return <EntreeAnimee {...proprietes} />;
}

function EntreeAnimee({
  delai = 0, montee = 10, children, style, ...reste
}: ViewProps & { delai?: number; montee?: number; children?: ReactNode }) {
  const reduit = useMouvementReduit();
  const avancement = useSharedValue(reduit ? 1 : 0);

  useEffect(() => {
    if (reduit) { avancement.value = 1; return; }
    // LE DÉLAI EST DANS LE MOUVEMENT, pas à côté. La montée partait dès le
    // montage, et le délai ne retardait que l'APPARITION : un bloc attendu à
    // 260 ms ou plus se montrait d'un coup, déjà arrivé, sans avoir bougé —
    // la moitié de l'accueil « sautait » à sa place au lieu de s'y poser.
    // C'était une bonne part de l'impression de raideur.
    // Borné : la trentième ligne d'une liste n'attend pas une seconde et
    // demie pour se montrer — au-delà de 400 ms, on attend l'écran.
    avancement.value = withDelay(Math.min(delai, 400), withTiming(1, {
      duration: 260,
      // Sortie douce : rapide au départ, freinée à l'arrivée. C'est ce qui
      // donne l'impression d'un objet qui se pose.
      easing: Easing.out(Easing.cubic),
    }));
  }, [reduit, avancement, delai]);

  const anime = useAnimatedStyle(() => ({
    opacity: avancement.value,
    transform: [{ translateY: (1 - avancement.value) * montee }],
  }));

  return (
    <Animated.View {...reste} style={[style, anime]}>
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
