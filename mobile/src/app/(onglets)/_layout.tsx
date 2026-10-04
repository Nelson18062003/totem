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
// Quatre entrées, pas une de plus : ce qu'un propriétaire vient faire.
// L'Analyse et la console USSD se rejoignent depuis les écrans qui les
// appellent, pas depuis la barre.

import { Platform, Pressable, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, {
  interpolateColor, useAnimatedStyle, useDerivedValue, withTiming, Easing, FadeIn, FadeOut,
} from "react-native-reanimated";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HAUTEUR_BARRE_ONGLETS, Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { textesCharpente } from "@noyau/textes/charpente";
import { ageVu } from "@noyau/types";
import { useLangue } from "@/langue";
import { useAgeDesChiffres, useMaintenant } from "@/donnees";
import { toucherChoix } from "@/toucher";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";

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

  return (
    <>
    <Tabs
      tabBar={(props) => <BarreFlottante {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: couleurs.surface },
      }}
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
  const { horsLigne, quand } = useAgeDesChiffres();
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
          {t.horsLigne} · {t.horsLigneDetail(ageVu(quand, maintenant, langue))}
        </Texte>
      </View>
    </Animated.View>
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
        {state.routes.map((route, i) => {
          const onglet = ONGLETS.find((o) => o.nom === route.name);
          if (!onglet) return null;
          const actif = state.index === i;
          const libelle = descriptors[route.key]?.options.title ?? route.name;

          return (
            <Pilule
              key={route.key}
              actif={actif}
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

/** Un onglet : son icône, et son nom dessous — toujours. L'onglet choisi
 *  se pose sur un fond sombre ; le passage est glissé, pas sauté. */
function Pilule({ actif, libelle, icone, onPress }: {
  actif: boolean; libelle: string; icone: NomIcone; onPress: () => void;
}) {
  // SUR LE FIL DE L'INTERFACE, ET NON SUR CELUI DU JAVASCRIPT : on change
  // d'onglet au moment précis où le JavaScript part chercher des données, et
  // une animation ordinaire saccaderait à cet instant-là (voir
  // `animations.tsx`). Reanimated anime la couleur hors de son chemin.
  const ouvert = useDerivedValue(
    () => withTiming(actif ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }),
    [actif],
  );

  const fond = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      ouvert.value, [0, 1], ["rgba(0,0,0,0)", couleurs.accent],
    ),
  }));

  // QUATRE NOMS DOIVENT TENIR SUR 320 POINTS. Chaque onglet prend sa part
  // de la largeur (jamais plus de 84 points) ; « Opérations », le plus long,
  // tient en 11 points sur 76.
  const { width } = useWindowDimensions();
  const largeur = Math.min(84, Math.floor((width - 2 * espaces.lg - 12) / 4));

  return (
    <Pressable
      // Le toucher part à l'APPUI, avant même que l'écran change : c'est la
      // première réponse que le doigt reçoit.
      onPress={() => { toucherChoix(); onPress(); }}
      accessibilityRole="tab"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={libelle}
      // LA PASTILLE NE RÉPOND PAS À L'APPUI, elle répond au CHOIX : elle ne
      // se remplit qu'une fois l'écran changé. Entre les deux, l'onglet
      // restait immobile — mesuré à zéro pixel par `verifier-la-reponse`.
      // L'opacité, elle, répond tout de suite.
      style={({ pressed }) => ({
        borderRadius: 22, overflow: "hidden",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Animated.View
        style={[{
          width: largeur, height: HAUTEUR_ONGLET,
          alignItems: "center", justifyContent: "center", gap: 2,
          borderRadius: 22,
        }, fond]}
      >
        <Icone nom={icone} taille={22}
               couleur={actif ? couleurs.surfaceHaute : couleurs.encreDouce} />
        <Texte poids={actif ? "demi" : "moyen"} taille={11}
               style={{ color: actif ? couleurs.surfaceHaute : couleurs.encreDouce,
                        textAlign: "center" }}>
          {libelle}
        </Texte>
      </Animated.View>
    </Pressable>
  );
}

/** La hauteur d'un onglet : l'icône, son nom, et de quoi respirer. La barre
 *  entière (`HAUTEUR_BARRE_ONGLETS` dans `ui.tsx`) en découle. */
const HAUTEUR_ONGLET = 54;
