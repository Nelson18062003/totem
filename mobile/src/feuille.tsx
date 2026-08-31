// La feuille : le panneau qui monte du bas de l'écran.
//
// Le pendant mobile de `web/app/feuille.tsx`, et il en garde la règle
// importante : quand une session est VIVANTE, toute sortie — la croix, le
// voile, le bouton retour d'Android — mène à la MÊME confirmation.
// Raccrocher ne doit jamais arriver d'un frôlement, parce qu'une session
// USSD abandonnée à moitié laisse une opération dans un état incertain chez
// l'opérateur.

import type { ReactNode } from "react";
import {
  Alert, BackHandler, KeyboardAvoidingView, Modal, Pressable, ScrollView, View,
} from "react-native";
import { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Texte } from "@/ui";
import { Icone } from "@/icones";
import { couleurs, espaces, rayons } from "@/theme/jetons";

/** Ce qui retient la sortie tant qu'une session est vivante. */
export type Retenue = {
  question: string;
  arreter: string;
  garder: string;
  onArreter: () => void;
};

export function Feuille({
  visible, entete, onFermer, retenue, pied, children, libelleFermer,
}: {
  visible: boolean;
  entete: ReactNode;
  onFermer: () => void;
  retenue?: Retenue | null;
  pied?: ReactNode;
  children: ReactNode;
  libelleFermer: string;
}) {
  // Une seule porte de sortie, quelle que soit la façon dont on la pousse.
  const sortir = () => {
    if (!retenue) return onFermer();
    Alert.alert(retenue.question, undefined, [
      { text: retenue.garder, style: "cancel" },
      { text: retenue.arreter, style: "destructive", onPress: retenue.onArreter },
    ]);
  };

  // Le bouton retour d'Android passe par la même porte que la croix. Sans
  // cela, il fermerait la feuille sans rien demander — et la session
  // resterait pendue sur la carte de Douala.
  useEffect(() => {
    if (!visible) return;
    const abonnement = BackHandler.addEventListener("hardwareBackPress", () => {
      sortir();
      return true;      // on a traité le geste : Android ne ferme rien lui-même
    });
    return () => abonnement.remove();
  });

  return (
    <Modal visible={visible} animationType="slide" transparent
           onRequestClose={sortir} statusBarTranslucent>
      {/* LE CLAVIER NE COUVRE JAMAIS LA FEUILLE. L'application vit bord à
          bord (edgeToEdgeEnabled) : Android ne redimensionne RIEN tout seul
          quand le clavier monte — et les champs d'une feuille vivent
          précisément en bas, là où le clavier se pose. Sans cette enveloppe,
          taper un nom de carte ou une réponse d'opérateur se faisait à
          l'aveugle, le champ ET son bouton sous le clavier. « padding » sur
          les deux plateformes, pour la même raison que l'écran de
          connexion : sur Android, « height » se bat avec la barre d'état
          translucide ; « undefined » ne fait rien du tout. */}
      <KeyboardAvoidingView behavior="padding"
        style={{ flex: 1, backgroundColor: "rgba(30,30,30,0.45)", justifyContent: "flex-end" }}>
        {/* Le voile : le toucher passe par la même confirmation. */}
        <Pressable style={{ flex: 1 }} onPress={sortir} accessibilityLabel={libelleFermer} />

        <SafeAreaView edges={["bottom"]} style={{
          backgroundColor: couleurs.surface,
          borderTopLeftRadius: rayons.carte * 2,
          borderTopRightRadius: rayons.carte * 2,
          maxHeight: "92%",
        }}>
          <View style={{
            flexDirection: "row", alignItems: "flex-start", gap: espaces.md,
            paddingHorizontal: espaces.lg, paddingTop: espaces.lg,
            paddingBottom: espaces.md,
            borderBottomWidth: 1, borderBottomColor: couleurs.trait,
          }}>
            <View style={{ flex: 1 }}>{entete}</View>
            <Pressable onPress={sortir} hitSlop={12} accessibilityLabel={libelleFermer}>
              <Icone nom="Close" taille={22} couleur={couleurs.encreDouce} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: espaces.lg, gap: espaces.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {pied ? (
            <View style={{
              padding: espaces.lg, gap: espaces.sm,
              borderTopWidth: 1, borderTopColor: couleurs.trait,
              backgroundColor: couleurs.surfaceHaute,
            }}>
              {pied}
            </View>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
