// Les quatre onglets, dans une BARRE FLOTTANTE.
//
// Ce n'est pas la barre standard : une pilule blanche qui flotte au-dessus
// du contenu, l'onglet actif posé sur un fond sombre. L'écran garde toute sa
// hauteur, et on voit toujours où l'on est.
//
// CHAQUE ONGLET DIT SON NOM, TOUT LE TEMPS. Seul l'onglet choisi le disait ;
// les trois autres étaient des icônes muettes, et ceux à qui le propriétaire
// a montré l'application ne savaient pas où menaient « l'enveloppe » ni « la
// grille ». Une icône seule ne se lit que si on la connaît déjà. Les icônes
// ont changé aussi, pour ce que chacun reconnaît sans apprendre : un
// portefeuille pour les comptes, une bulle de message pour les SMS, deux
// flèches qui se croisent pour les opérations.
//
// LE PASSAGE SE VOIT. Le propriétaire : « quand je passe de l'Accueil à
// Comptes, à SMS ou à Opérations, il n'y a pas de transition, rien ». Deux
// mouvements, courts, dans le sens de la barre :
//
//   — l'écran glisse de vingt points en se révélant, depuis le côté de son
//     onglet (`transitionDesOnglets`, 240 ms) ;
//   — dans la barre, UNE pastille sombre glisse d'un onglet à l'autre, au
//     lieu que chaque onglet s'allume et s'éteigne sur place.
//
// « Réduire les animations » : un fondu de 120 ms, et la pastille saute.
//
// Quatre entrées, pas une de plus : ce qu'un propriétaire vient faire.
// L'Analyse et la console USSD se rejoignent depuis les écrans qui les
// appellent, pas depuis la barre.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSequence, withTiming,
  FadeIn, FadeOut, type SharedValue,
} from "react-native-reanimated";
import { Tabs, useIsFocused } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HAUTEUR_BARRE_ONGLETS, Texte } from "@/ui";
import { styleDeScene } from "@/scene-onglet";
import { Icone, type NomIcone } from "@/icones";
import { textesCharpente } from "@noyau/textes/charpente";
import { ageVu } from "@noyau/types";
import { useLangue } from "@/langue";
import { useAgeDesChiffres, useMaintenant } from "@/donnees";
import { toucherChoix } from "@/toucher";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import {
  COURBE, DUREE_ONGLET, DUREE_REDUITE, transitionDesOnglets, useMouvementReduit,
} from "@/animations";

const ONGLETS: { nom: string; cle: keyof ReturnType<typeof libelles>; icone: NomIcone }[] = [
  { nom: "index", cle: "accueil", icone: "Home" },
  { nom: "cartes", cle: "comptes", icone: "Wallet" },
  { nom: "encaissements", cle: "smsCourt", icone: "Bubble" },
  { nom: "actions", cle: "operations", icone: "Transfer" },
];

function libelles(langue: "en" | "fr") {
  return textesCharpente[langue];
}

export default function Onglets() {
  const langue = useLangue();
  const t = libelles(langue);
  const reduit = useMouvementReduit();

  return (
    <>
    <Tabs
      tabBar={(props) => <BarreFlottante {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: couleurs.surface },
        ...transitionDesOnglets(reduit),
      }}
      screenLayout={({ children }) => <SceneDOnglet reduit={reduit}>{children}</SceneDOnglet>}
    >
      {ONGLETS.map((o) => (
        <Tabs.Screen key={o.nom} name={o.nom} options={{ title: t[o.cle] as string }} />
      ))}
    </Tabs>
    <BandeauHorsLigne />
    </>
  );
}

/**
 * « CES CHIFFRES DATENT » — une pastille au-dessus de la barre, une seule fois.
 *
 * Sans réseau, l'application montre ce qu'elle avait au dernier passage
 * plutôt qu'un écran vide. C'est un progrès — et un DANGER si elle se tait :
 * un solde d'hier présenté comme celui de maintenant, c'est de l'argent
 * qu'on remet à quelqu'un en croyant qu'il est arrivé.
 *
 * DEUX DÉFAUTS, et le propriétaire voyait les deux :
 *
 *   — Il s'affichait à CHAQUE OUVERTURE, même bien connecté : il suivait la
 *     PROVENANCE des chiffres (relus du téléphone), pas une panne. Pendant
 *     la seconde de la première requête, « Pas de réseau » apparaissait…
 *     puis disparaissait. Il ne parle plus qu'après un ÉCHEC réel, ou après
 *     huit secondes sans réponse (voir `useAgeDesChiffres`).
 *   — Il était posé AU-DESSUS des onglets, dans le flux : tout l'écran
 *     descendait à son apparition et remontait à sa disparition, et la
 *     marge de l'encoche était comptée deux fois. C'était le « tout part
 *     vers le bas ». Il FLOTTE maintenant au-dessus de la barre d'onglets,
 *     sans rien pousser, et ne capte aucun doigt.
 *
 * Il ne demande RIEN au guichet : il lit l'état du cahier.
 */
function BandeauHorsLigne() {
  const langue = useLangue();
  const bas = useSafeAreaInsets().bottom;
  const maintenant = useMaintenant();
  const { horsLigne, quand, panne } = useAgeDesChiffres();
  if (!horsLigne || quand == null) return null;
  const t = textesCharpente[langue];
  return (
    <Animated.View
      entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute", left: 0, right: 0,
        bottom: Math.max(bas, espaces.md) + HAUTEUR_BARRE_ONGLETS + espaces.sm,
        alignItems: "center", paddingHorizontal: espaces.lg,
      }}
    >
      <View style={{
        flexDirection: "row", alignItems: "center", gap: espaces.sm,
        paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
        borderRadius: rayons.rond, maxWidth: 520,
        backgroundColor: couleurs.accent,
      }}>
        <Icone nom="Refresh" taille={13} couleur={couleurs.surfaceHaute} />
        <Texte taille={textes.legende} style={{ color: couleurs.surfaceHaute, flexShrink: 1 }}
               numberOfLines={2}>
          {panne === "plateforme" ? t.plateformeEnPanneCourt : t.horsLigne}
          {" · "}{t.horsLigneDetail(ageVu(quand, maintenant, langue))}
        </Texte>
      </View>
    </Animated.View>
  );
}

/**
 * UN ÉCRAN QUITTÉ SE RETIRE, UNE FOIS LE PASSAGE FINI — SANS ÊTRE DÉTRUIT.
 *
 * Dès qu'une transition est demandée, le navigateur des onglets confie le
 * retrait de l'écran quitté à react-native-screens : une valeur animée
 * (`activityState`) qui tombe à « inactif » quand le passage est joué. Sur
 * le téléphone, cela DÉTACHE l'écran de la fenêtre — ses vues restent
 * vivantes, sa position dans la liste aussi. Sur l'aperçu web, cette valeur
 * animée n'est jamais relue : l'écran quitté restait AFFICHÉ, à opacité
 * nulle, sous l'écran actif (mesuré par `verifier-les-transitions` :
 * l'Accueil sous Opérations, et l'inverse), trouvé par un harnais qui
 * cherchait « Dépôt ». Sur le web, on le retire donc nous-mêmes.
 *
 * JAMAIS `display: none` SUR LE TÉLÉPHONE. Une première version le posait
 * partout. Sur iPhone (nouvelle architecture), `display: none` marque la
 * vue « cachée » et le moteur de rendu la SAUTE au montage : toute la vue
 * native de l'onglet quitté — la liste des SMS, sa position, la roue de
 * « tirer pour rafraîchir » — était DÉTRUITE trois cents millisecondes après
 * le départ, puis refaite au retour (`ConcreteViewShadowNode.h`,
 * `sliceChildShadowNodeViewPairs.cpp`). On revenait en haut de la liste, la
 * liste entière se reconstruisait au moment où l'on demandait de la
 * fluidité, et une roue recréée en pleine relecture pouvait réapparaître sans
 * geste — le « tout part vers le bas ». Aucun harnais du navigateur ne peut
 * le voir : sur le web, `display: none` garde la position.
 *
 * Partout, l'écran quitté se tait pour l'aide vocale dès le départ.
 */
function SceneDOnglet({ reduit, children }: { reduit: boolean; children: ReactNode }) {
  const focalise = useIsFocused();
  const [montre, setMontre] = useState(focalise);
  useEffect(() => {
    if (focalise) { setMontre(true); return; }
    const minuteur = setTimeout(() => setMontre(false),
                                (reduit ? DUREE_REDUITE : DUREE_ONGLET) + 60);
    return () => clearTimeout(minuteur);
  }, [focalise, reduit]);
  return (
    <View style={styleDeScene(focalise || montre, Platform.OS)}
          importantForAccessibility={focalise ? "auto" : "no-hide-descendants"}
          accessibilityElementsHidden={!focalise}>
      {children}
    </View>
  );
}

// Ce que la barre reçoit de la navigation. On le décrit ici plutôt que
// d'ajouter une dépendance entière pour trois champs.
type ProprietesBarre = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true })
      => { defaultPrevented: boolean };
    navigate: (nom: string) => void;
  };
};

function BarreFlottante({ state, descriptors, navigation }: ProprietesBarre) {
  const bas = useSafeAreaInsets().bottom;
  const reduit = useMouvementReduit();
  // QUATRE NOMS DOIVENT TENIR SUR 320 POINTS. Chaque onglet prend sa part
  // de la largeur (jamais plus de 84 points) ; « Opérations », le plus long,
  // tient en 11 points sur 76.
  const { width } = useWindowDimensions();
  const largeur = Math.min(84, Math.floor((width - 2 * espaces.lg - 12) / 4));

  // LA PASTILLE QUI GLISSE. Une seule, sous les quatre onglets : elle va
  // de l'onglet quitté à l'onglet choisi, à la vitesse de l'écran — l'œil
  // suit le doigt jusqu'à sa destination. Rien ne glisse au premier rendu.
  const pas = largeur + espaces.xs;
  const x = useSharedValue(state.index * pas);
  const premier = useRef(true);
  useEffect(() => {
    const cible = state.index * pas;
    if (premier.current || reduit) { x.value = cible; premier.current = false; return; }
    x.value = withTiming(cible, { duration: DUREE_ONGLET, easing: COURBE });
  }, [state.index, pas, reduit, x]);
  const glisse = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute", left: 0, right: 0,
        bottom: Math.max(bas, espaces.md),
        alignItems: "center",
      }}
    >
      <Coque
        style={{
          flexDirection: "row", alignItems: "center", gap: espaces.xs,
          padding: 6,
          borderRadius: rayons.rond,
          borderWidth: 1, borderColor: couleurs.trait,
          // Une ombre TRÈS légère, et la seule de l'application : la barre
          // flotte au-dessus du contenu, il faut qu'on le voie. Ailleurs, la
          // règle tient — pas d'ombre, les plans se séparent au trait.
          ...Platform.select({
            android: { elevation: 3 },
            default: {
              shadowColor: "#000", shadowOpacity: 0.06,
              shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
            },
          }),
        }}
      >
        <Animated.View pointerEvents="none" style={[{
          position: "absolute", left: 6, top: 6,
          width: largeur, height: HAUTEUR_ONGLET, borderRadius: 22,
          backgroundColor: couleurs.accent,
        }, glisse]} />
        {state.routes.map((route, i) => {
          const onglet = ONGLETS.find((o) => o.nom === route.name);
          if (!onglet) return null;
          const actif = state.index === i;
          const libelle = descriptors[route.key]?.options.title ?? route.name;

          return (
            <Pilule
              key={route.key}
              actif={actif}
              rang={i}
              pas={pas}
              x={x}
              largeur={largeur}
              reduit={reduit}
              libelle={String(libelle)}
              icone={onglet.icone}
              onPress={() => {
                const evenement = navigation.emit({
                  type: "tabPress", target: route.key, canPreventDefault: true,
                });
                if (!actif && !evenement.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </Coque>
    </View>
  );
}

/**
 * LA COQUE DE LA BARRE : du verre quand iOS sait en faire, une surface
 * pleine partout ailleurs.
 *
 * `expo-glass-effect` était dans les dépendances de ce dépôt sans qu'une
 * seule ligne ne l'importe — comme `expo-symbols` et `@expo/ui`. Trois
 * paquets qui pèsent dans le paquet installé et n'apportent rien : les
 * laisser là était le seul mauvais choix, entre s'en servir et les retirer.
 *
 * ON S'EN SERT ICI, ET NULLE PART AILLEURS. Une barre qui flotte AU-DESSUS
 * du contenu est exactement ce que le verre est fait pour rendre : on
 * devine ce qui passe dessous, donc on comprend qu'elle flotte. Partout
 * ailleurs dans l'application, les plans se séparent au trait — la charte
 * ne bouge pas pour un effet.
 *
 * `isLiquidGlassAvailable()` répond faux sur Android, sur le web, et sur
 * les iPhone trop anciens. On retombe alors sur la surface pleine, à
 * l'identique de ce qui existait : personne ne perd un écran parce qu'un
 * effet n'était pas disponible.
 */
function Coque({ style, children }: { style: ViewStyle; children: React.ReactNode }) {
  if (isLiquidGlassAvailable()) {
    // Le verre porte son propre fond : lui en donner un l'éteindrait.
    return <GlassView style={style} glassEffectStyle="regular">{children}</GlassView>;
  }
  return <View style={[style, { backgroundColor: couleurs.surfaceHaute }]}>{children}</View>;
}

/** Un onglet : son icône, et son nom dessous — toujours. La pastille
 *  sombre de l'onglet choisi glisse dessous (`BarreFlottante`) ; l'onglet
 *  qui la reçoit marque l'arrivée d'un rien : son icône grossit et revient.
 *
 *  LA COULEUR SUIT LA PASTILLE, PAS LE DOIGT. Le nom de l'onglet choisi
 *  passait au BLANC dès l'appui, alors que la pastille noire mettait 240 ms
 *  à arriver : pendant ce temps, « Opérations » était blanc sur la barre
 *  blanche — invisible, icône comprise —, et le nom qu'on quittait devenait
 *  gris sur noir. À chaque changement d'onglet, l'onglet qu'on venait de
 *  toucher clignotait. Chaque onglet porte maintenant DEUX couches, la
 *  sombre (sur la barre) et la claire (sur la pastille), et c'est la
 *  position de la pastille, image par image, qui décide laquelle se voit. */
function Pilule({ actif, rang, pas, x, libelle, icone, largeur, reduit, onPress }: {
  actif: boolean; rang: number; pas: number; x: SharedValue<number>;
  libelle: string; icone: NomIcone; largeur: number; reduit: boolean;
  onPress: () => void;
}) {
  // SUR LE FIL DE L'INTERFACE, ET NON SUR CELUI DU JAVASCRIPT : on change
  // d'onglet au moment précis où le JavaScript part chercher des données, et
  // une animation ordinaire saccaderait à cet instant-là (voir
  // `animations.tsx`).
  const echelle = useSharedValue(1);
  const avant = useRef(actif);
  useEffect(() => {
    const devenuActif = actif && !avant.current;
    avant.current = actif;
    if (!devenuActif || reduit) return;
    echelle.value = withSequence(withTiming(1.08, { duration: 100 }),
                                 withTiming(1, { duration: 120 }));
  }, [actif, reduit, echelle]);
  const pouls = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));
  // Combien la pastille recouvre cet onglet : 1 posée dessus, 0 à un pas
  // ou plus. La couche claire prend le relais quand la pastille passe le
  // MILIEU de l'onglet — là où se trouvent l'icône et le nom —, sur une
  // bande étroite : un nom court (« SMS ») est vite couvert, et une bande
  // plus large le laissait à demi éclairci sur la barre blanche (contraste
  // 2,96 sur une image, mesuré par `verifier-les-transitions`).
  const clair = useAnimatedStyle(() => {
    const couverture = 1 - Math.min(1, Math.abs(x.value - rang * pas) / pas);
    return { opacity: interpolate(couverture, [0.45, 0.55], [0, 1], Extrapolation.CLAMP) };
  });
  const sombre = useAnimatedStyle(() => {
    const couverture = 1 - Math.min(1, Math.abs(x.value - rang * pas) / pas);
    return { opacity: interpolate(couverture, [0.45, 0.55], [1, 0], Extrapolation.CLAMP) };
  });

  const couche = (couleur: string, poids: "demi" | "moyen") => (
    <>
      <Animated.View style={pouls}>
        <Icone nom={icone} taille={22} couleur={couleur} />
      </Animated.View>
      <Texte poids={poids} taille={11} style={{ color: couleur, textAlign: "center" }}>
        {libelle}
      </Texte>
    </>
  );

  return (
    <Pressable
      // Le toucher part à l'APPUI, avant même que l'écran change : c'est la
      // première réponse que le doigt reçoit.
      onPress={() => { toucherChoix(); onPress(); }}
      accessibilityRole="tab"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={libelle}
      // LA PASTILLE NE RÉPOND PAS À L'APPUI, elle répond au CHOIX : elle ne
      // glisse qu'une fois l'écran changé. Entre les deux, l'onglet restait
      // immobile — mesuré à zéro pixel par `verifier-la-reponse`. L'opacité,
      // elle, répond tout de suite.
      style={({ pressed }) => ({
        borderRadius: 22, overflow: "hidden",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <View style={{ width: largeur, height: HAUTEUR_ONGLET, borderRadius: 22 }}>
        <Animated.View style={[styles.couche, sombre]}>
          {couche(couleurs.encreDouce, "moyen")}
        </Animated.View>
        {/* La couche claire répète le nom : elle se tait pour l'aide vocale
            (l'onglet s'annonce déjà par `accessibilityLabel`). */}
        <Animated.View pointerEvents="none" style={[styles.couche, clair]}
                       importantForAccessibility="no-hide-descendants"
                       accessibilityElementsHidden>
          {couche(couleurs.surfaceHaute, "demi")}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  couche: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center", gap: 2,
  },
});

/** La hauteur d'un onglet : l'icône, son nom, et de quoi respirer. La barre
 *  entière (`HAUTEUR_BARRE_ONGLETS` dans `ui.tsx`) en découle. */
const HAUTEUR_ONGLET = 54;
