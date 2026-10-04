// Le style de la scène d'un onglet quitté — une règle à part, sans aucune
// dépendance, pour que `verifier-la-roue` puisse l'exécuter telle quelle.
//
// `display: none` sur le WEB seulement. Sur iPhone (nouvelle architecture
// de React Native), `display: none` marque la vue « cachée » et le moteur
// de rendu la SAUTE au montage (`ConcreteViewShadowNode.h`,
// `sliceChildShadowNodeViewPairs.cpp`) : les vues natives de l'onglet
// quitté — la liste des SMS et sa position, la roue de « tirer pour
// rafraîchir », les champs — seraient détruites, puis refaites au retour.
// Sur le téléphone, c'est react-native-screens qui détache l'onglet quitté
// de la fenêtre, sans rien détruire. Voir `SceneDOnglet` dans
// `app/(onglets)/_layout.tsx`.

export type StyleDeScene = { flex: 1; display?: "none" };

export function styleDeScene(visible: boolean, plateforme: string): StyleDeScene {
  if (plateforme === "web" && !visible) return { flex: 1, display: "none" };
  return { flex: 1 };
}
