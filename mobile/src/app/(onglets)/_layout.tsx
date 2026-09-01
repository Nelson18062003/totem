// Les quatre onglets, dans une BARRE FLOTTANTE.
//
// Ce n'est pas la barre standard : la plateforme pose une pilule blanche qui
// flotte au-dessus du contenu, l'onglet actif prenant la forme d'une pilule
// sombre AVEC son nom. Les autres restent des icônes muettes. C'est la même
// idée ici — l'écran garde toute sa hauteur, et on voit toujours où l'on est.
//
// Quatre entrées, pas une de plus : ce qu'un propriétaire vient faire.
// L'Analyse et la console USSD se rejoignent depuis les écrans qui les
// appellent, pas depuis la barre.

import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSafeAreaInsets as useMarges } from "react-native-safe-area-context";
import { Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { textesCharpente } from "@noyau/textes/charpente";
import { ageVu } from "@noyau/types";
import { useLangue } from "@/langue";
import { useAgeDesChiffres } from "@/donnees";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";

const ONGLETS: { nom: string; cle: keyof ReturnType<typeof libelles>; icone: NomIcone }[] = [
  { nom: "index", cle: "accueil", icone: "Home" },
  { nom: "cartes", cle: "comptes", icone: "Card" },
  { nom: "encaissements", cle: "smsCourt", icone: "Inbox" },
  { nom: "actions", cle: "operations", icone: "Grid" },
];

function libelles(langue: "en" | "fr") {
  return textesCharpente[langue];
}

export default function Onglets() {
  const langue = useLangue();
  const t = libelles(langue);

  return (
    <>
    <BandeauHorsLigne />
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
    </>
  );
}

/**
 * « CES CHIFFRES DATENT » — au-dessus des quatre onglets, une seule fois.
 *
 * Sans réseau, l'application montre ce qu'elle avait au dernier passage
 * plutôt qu'un écran vide. C'est un progrès — et un DANGER si elle se tait :
 * un solde d'hier présenté comme celui de maintenant, c'est de l'argent
 * qu'on remet à quelqu'un en croyant qu'il est arrivé.
 *
 * Le bandeau ne s'affiche donc QUE dans ce cas : ce qui est à l'écran vient
 * du téléphone, et la plateforme n'a pas répondu depuis. Dès qu'elle répond,
 * il disparaît sans un geste.
 *
 * Il ne demande RIEN au guichet : il lit l'âge de ce qui est déjà au cahier,
 * et ne s'inscrit à aucun besoin — passer par `useDonnees` avec des bornes à
 * zéro marchait, mais le faisait passer pour un écran qui lit les données
 * sans jamais dire la panne (voir `verifier-les-ecrans`).
 */
function BandeauHorsLigne() {
  const langue = useLangue();
  const marges = useMarges();
  const { duCahier, quand } = useAgeDesChiffres();
  if (!duCahier || quand == null) return null;
  const t = textesCharpente[langue];
  return (
    <View style={{
      paddingTop: marges.top + espaces.sm,
      paddingBottom: espaces.sm,
      paddingHorizontal: espaces.lg,
      backgroundColor: couleurs.surface2,
      borderBottomWidth: 1, borderBottomColor: couleurs.trait,
      flexDirection: "row", alignItems: "center", gap: espaces.sm,
    }}>
      <Icone nom="Refresh" taille={14} couleur={couleurs.encreDouce} />
      <Texte taille={textes.legende} ton="doux" style={{ flex: 1 }}>
        {t.horsLigne} · {t.horsLigneDetail(ageVu(quand, Date.now(), langue))}
      </Texte>
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

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute", left: 0, right: 0,
        bottom: Math.max(bas, espaces.md),
        alignItems: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row", alignItems: "center", gap: espaces.xs,
          padding: 6,
          borderRadius: rayons.rond,
          borderWidth: 1, borderColor: couleurs.trait,
          backgroundColor: couleurs.surfaceHaute,
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
      </View>
    </View>
  );
}

/** Un onglet : icône seule au repos, pilule sombre avec son nom une fois
 *  choisi. Le passage de l'un à l'autre est glissé, pas sauté. */
function Pilule({ actif, libelle, icone, onPress }: {
  actif: boolean; libelle: string; icone: NomIcone; onPress: () => void;
}) {
  const ouvert = useRef(new Animated.Value(actif ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(ouvert, {
      toValue: actif ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      // On anime une largeur : le pilote natif ne sait pas la prendre.
      useNativeDriver: false,
    }).start();
  }, [actif, ouvert]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={libelle}
      // LA PASTILLE NE RÉPOND PAS À L'APPUI, elle répond au CHOIX : elle ne
      // se remplit qu'une fois `actif` changé, donc une fois l'écran changé.
      // Entre les deux, l'onglet restait parfaitement immobile — mesuré à
      // zéro pixel par `verifier-la-reponse`. Sur un téléphone lent, c'est
      // là qu'on appuie deux fois.
      style={({ pressed }) => ({
        borderRadius: rayons.rond, overflow: "hidden",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Animated.View
        style={{
          flexDirection: "row", alignItems: "center",
          height: 44,
          paddingHorizontal: espaces.lg,
          borderRadius: rayons.rond,
          backgroundColor: ouvert.interpolate({
            inputRange: [0, 1],
            outputRange: ["rgba(0,0,0,0)", couleurs.accent],
          }),
        }}
      >
        <Icone nom={icone} taille={22}
               couleur={actif ? couleurs.surfaceHaute : couleurs.encrePale} />
        {/* Le nom n'apparaît que sur l'onglet choisi : les quatre noms côte
            à côte ne tiendraient pas sur un écran étroit. */}
        <Animated.View style={{
          overflow: "hidden",
          opacity: ouvert,
          maxWidth: ouvert.interpolate({ inputRange: [0, 1], outputRange: [0, 140] }),
          marginLeft: ouvert.interpolate({ inputRange: [0, 1], outputRange: [0, espaces.sm] }),
        }}>
          <Texte poids="demi" taille={textes.petit} numberOfLines={1}
                 style={{ color: couleurs.surfaceHaute }}>
            {libelle}
          </Texte>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
