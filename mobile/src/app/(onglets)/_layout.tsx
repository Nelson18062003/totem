// Les quatre onglets — les mêmes que la barre de la plateforme, dans le même
// ordre : l'accueil, les comptes, les SMS, les opérations. Quatre entrées,
// pas une de plus : ce qu'un propriétaire vient faire.
//
// L'Analyse et la console USSD existent aussi, mais elles se rejoignent
// depuis les écrans qui les appellent — pas depuis la barre, qui n'a pas la
// place et n'a pas à porter ce qu'on ouvre une fois par semaine.

import type { ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { textesCharpente } from "@noyau/textes/charpente";
import { useLangue } from "@/langue";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, polices, textes } from "@/theme/jetons";

export default function Onglets() {
  const langue = useLangue();
  const t = textesCharpente[langue];

  // React Native donne une `ColorValue` (parfois une couleur native opaque,
  // pas une chaîne) : on la laisse passer telle quelle jusqu'à l'icône.
  const onglet = (nom: NomIcone) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Icone nom={nom} taille={focused ? 23 : 22} couleur={color} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // L'action est neutre : l'onglet actif se dit à l'encre, jamais à la
        // latérite. La latérite ne porte que la marque.
        tabBarActiveTintColor: couleurs.encre,
        tabBarInactiveTintColor: couleurs.encrePale,
        tabBarStyle: {
          backgroundColor: couleurs.surfaceHaute,
          borderTopColor: couleurs.trait,
          borderTopWidth: 1,
          // Pas d'ombre : la barre se sépare du contenu par son filet.
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: { fontFamily: polices.moyen, fontSize: textes.legende },
        sceneStyle: { backgroundColor: couleurs.surface },
      }}
    >
      <Tabs.Screen name="index"
        options={{ title: t.accueil, tabBarIcon: onglet("Home") }} />
      <Tabs.Screen name="cartes"
        options={{ title: t.comptes, tabBarIcon: onglet("Card") }} />
      <Tabs.Screen name="encaissements"
        options={{ title: t.smsCourt, tabBarIcon: onglet("Inbox") }} />
      <Tabs.Screen name="actions"
        options={{ title: t.operations, tabBarIcon: onglet("Grid") }} />
    </Tabs>
  );
}
