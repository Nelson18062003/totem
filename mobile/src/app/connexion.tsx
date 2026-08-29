// Le verrou de l'application.
//
// Le mot de passe du propriétaire — PAS le code PIN Mobile Money. Celui-là ne
// se saisit qu'au moment d'une opération, sur un pavé de boutons, et ne
// s'enregistre nulle part. La note en bas de l'écran le dit, parce que c'est
// exactement là qu'on peut se tromper.
//
// Le mot de passe ne vit que dans l'état de cet écran, le temps de l'envoi.
// Ce qui se range dans le coffre, c'est le JETON rendu par la plateforme —
// jamais le mot de passe lui-même.

import { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Carte, MotTotem, Texte, couleurs, espaces, rayons, textes } from "@/ui";
import { Icone } from "@/icones";
import { useChangerLangue, useLangue } from "@/langue";
import { useSession } from "@/session";
import { textesConnexion } from "@noyau/textes/connexion";
import { autreLangue } from "@noyau/langue";
import { polices } from "@/theme/jetons";

export default function Connexion() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesConnexion[langue];
  const { ouvrir } = useSession();

  const [motdepasse, setMotdepasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const autre = autreLangue(langue);

  const valider = async () => {
    if (!motdepasse || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      await ouvrir(motdepasse, langue);
      setMotdepasse("");            // rien ne subsiste après l'envoi
    } catch (e) {
      // Le guichet rend déjà le message dans la bonne langue ; on ne le
      // réécrit pas ici, on ne fait que le montrer.
      const message = e instanceof Error ? e.message : "";
      setErreur(message || t.connexionImpossible);
      setEnCours(false);
    }
  };

  return (
    // La connexion est une SURFACE DE MARQUE : c'est le seul endroit, avec la
    // couverture, où le sable et la latérite ont le droit de tenir le fond.
    <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.sable }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: "center",
            padding: espaces.xl, gap: espaces.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: espaces.md }}>
            <MotTotem taille={22} />
            <Texte taille={textes.titre} poids="demi" style={{ textAlign: "center" }}>
              {t.titre}
            </Texte>
            <Texte ton="doux" style={{ textAlign: "center", lineHeight: 22 }}>
              {t.sousTitre}
            </Texte>
          </View>

          <Carte style={{ padding: espaces.lg, gap: espaces.md }}>
            <Texte taille={textes.petit} ton="doux" poids="moyen">
              {t.motDePasse}
            </Texte>

            <View style={{
              flexDirection: "row", alignItems: "center",
              borderWidth: 1, borderColor: erreur ? couleurs.negatif : couleurs.trait,
              borderRadius: rayons.bouton, backgroundColor: couleurs.surface,
              paddingHorizontal: espaces.md,
            }}>
              <TextInput
                value={motdepasse}
                onChangeText={(v) => { setMotdepasse(v); setErreur(null); }}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!enCours}
                onSubmitEditing={valider}
                returnKeyType="go"
                style={{
                  flex: 1, paddingVertical: espaces.md,
                  fontFamily: polices.corps, fontSize: textes.corps,
                  color: couleurs.encre,
                }}
              />
              <Pressable
                onPress={() => setVisible((v) => !v)}
                hitSlop={12}
                accessibilityLabel={visible ? "Masquer" : "Afficher"}
              >
                <Icone nom={visible ? "EyeOff" : "Eye"} couleur={couleurs.encrePale} />
              </Pressable>
            </View>

            {erreur ? (
              <Texte taille={textes.petit} ton="negatif">{erreur}</Texte>
            ) : null}

            <Pressable
              onPress={valider}
              disabled={!motdepasse || enCours}
              style={({ pressed }) => ({
                backgroundColor: !motdepasse
                  ? couleurs.surface3
                  : pressed ? couleurs.accentAppui : couleurs.accent,
                borderRadius: rayons.bouton,
                paddingVertical: espaces.md,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: espaces.sm,
              })}
            >
              {enCours ? <ActivityIndicator size="small" color={couleurs.surface} /> : null}
              <Texte poids="demi" style={{ color: couleurs.surfaceHaute }}>
                {enCours ? t.verification : t.seConnecter}
              </Texte>
            </Pressable>
          </Carte>

          <View style={{ gap: espaces.lg, alignItems: "center" }}>
            {/* La promesse sur le code secret. Elle vit ici, sur l'écran que
                tout le monde voit, et pas enfouie dans les réglages. */}
            <View style={{ flexDirection: "row", gap: espaces.sm, paddingHorizontal: espaces.sm }}>
              <Icone nom="Lock" taille={16} couleur={couleurs.encrePale} />
              <Texte taille={textes.legende} ton="pale" style={{ flex: 1, lineHeight: 18 }}>
                {t.notePin}
              </Texte>
            </View>

            {/* La bascule porte le nom de l'AUTRE langue, écrit dans cette
                langue : celle qui la cherche peut la lire. */}
            <Pressable
              onPress={() => changerLangue(autre.code)}
              style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}
              hitSlop={8}
            >
              <Icone nom="Globe" taille={16} couleur={couleurs.encreDouce} />
              <Texte taille={textes.petit} ton="doux">{autre.bascule}</Texte>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
