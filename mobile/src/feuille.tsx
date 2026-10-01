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
  Alert, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Pressable, View,
} from "react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SlideInDown } from "react-native-reanimated";
import { BarreClavier, ContexteClavier, Defilement, BoutonIcone, Texte } from "@/ui";
import { Animated, useMouvementReduit } from "@/animations";
import { useLangue } from "@/langue";
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
  const bas = useSafeAreaInsets().bottom;
  const langue = useLangue();
  const reduit = useMouvementReduit();

  // LE CLAVIER SE FERME QUAND LA FEUILLE S'OUVRE. On lançait une opération
  // depuis le cadran, clavier ouvert : la feuille montait PAR-DESSUS, et
  // l'enveloppe ci-dessous la poussait encore de la hauteur du clavier — son
  // bas (le message de l'opérateur, « Annuler ») sortait de l'écran. Fermé
  // ICI, pendant le premier rendu, avant que les champs de la feuille ne se
  // montent : un `useEffect` passerait APRÈS eux, et refermerait le clavier
  // qu'un champ de la feuille vient justement d'ouvrir.
  useState(() => { Keyboard.dismiss(); return true; });

  // Le clavier est-il ouvert ? Deux choses en dépendent : le voile, et la
  // marge du bas.
  const [clavier, setClavier] = useState(false);
  useEffect(() => {
    const monte = Keyboard.addListener("keyboardDidShow", () => setClavier(true));
    const descend = Keyboard.addListener("keyboardDidHide", () => setClavier(false));
    return () => { monte.remove(); descend.remove(); };
  }, []);

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
    // LE VOILE APPARAÎT EN FONDU, LA FEUILLE MONTE. La fenêtre entière
    // glissait d'un bloc — voile compris : un rideau gris qui monte du bas,
    // le mouvement qui faisait « bizarre ». Le voile se fond, et seule la
    // feuille monte, comme dans toute application du téléphone.
    <Modal visible={visible} animationType="fade" transparent
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
        {/* Le voile : le toucher passe par la même confirmation.
            SEUL BOUTON DE L'APPLICATION QUI NE RÉPOND PAS SOUS LE DOIGT, et
            c'est voulu — il occupe tout le haut de l'écran ; le voir pâlir
            se lirait comme un écran qui s'efface, pas comme un appui pris. */}
        {/* CLAVIER OUVERT, LE VOILE NE FAIT QUE LE REFERMER. Toucher à côté
            pour fermer le clavier est le geste de tout le monde ; il
            proposait ici d'ABANDONNER l'opération en cours. */}
        <Pressable accessibilityRole="button" style={{ flex: 1 }}
                   onPress={() => (clavier ? Keyboard.dismiss() : sortir())}
                   accessibilityLabel={libelleFermer} />

        <ContexteClavier.Provider value="totem-clavier-feuille">
        <Animated.View
          entering={reduit ? undefined : SlideInDown.duration(260)}
          style={{
            backgroundColor: couleurs.surface,
            borderTopLeftRadius: rayons.carte * 2,
            borderTopRightRadius: rayons.carte * 2,
            maxHeight: "92%",
            // LA BARRE D'ACCUEIL DE L'IPHONE, mais pas sous le clavier : la
            // marge restait quand le clavier montait, et laissait un vide de
            // trente-quatre points entre le bas de la feuille et le clavier.
            paddingBottom: clavier ? 0 : bas,
          }}
        >
          <View style={{
            flexDirection: "row", alignItems: "flex-start", gap: espaces.md,
            paddingHorizontal: espaces.lg, paddingTop: espaces.lg,
            paddingBottom: espaces.md,
            borderBottomWidth: 1, borderBottomColor: couleurs.trait,
          }}>
            <View style={{ flex: 1 }}>{entete}</View>
            <BoutonIcone nom="Close" etiquette={libelleFermer} onPress={sortir} />
          </View>

          {/* UNE PLACE GARANTIE POUR LE CORPS. Le pied (le pavé du code
              secret, quatre rangées) pouvait réduire le corps à rien : le
              message de l'opérateur — « Entrez votre code » — disparaissait
              au moment précis où il fallait le lire. Le web lui réserve sa
              hauteur depuis toujours. */}
          <Defilement
            style={{ minHeight: 112, flexShrink: 1 }}
            contentContainerStyle={{ padding: espaces.lg, gap: espaces.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </Defilement>

          {pied ? (
            <View style={{
              padding: espaces.lg, gap: espaces.sm,
              borderTopWidth: 1, borderTopColor: couleurs.trait,
              backgroundColor: couleurs.surfaceHaute,
            }}>
              {pied}
            </View>
          ) : null}
        </Animated.View>
        <BarreClavier id="totem-clavier-feuille" langue={langue} />
        </ContexteClavier.Provider>
      </KeyboardAvoidingView>
    </Modal>
  );
}
