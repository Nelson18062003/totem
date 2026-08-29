// Les opérations : le guichet, et la sortie.
//
// Squelette de la phase 3 — la carte choisie et les gestes annoncés. Le vrai
// guichet (la session USSD sur la carte de Douala, le pavé du code secret)
// arrive en phase 4, et se relira à deux fois : c'est le seul endroit de
// l'application où un chiffre déplace de l'argent.

import { Alert, ScrollView, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Carte, Filet, Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue, useChangerLangue } from "@/langue";
import { useSession } from "@/session";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesCharpente } from "@noyau/textes/charpente";
import { autreLangue } from "@noyau/langue";

export default function Actions() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesGuichet[langue];
  const c = textesCharpente[langue];
  const { fermer } = useSession();
  const { donnees } = useDonnees({ sms: 0, recus: 0 });

  const cartes = (donnees?.sims ?? []).filter((s) => s.enPlace);
  const autre = autreLangue(langue);

  // Les cinq gestes, dans l'ordre de la plateforme.
  const gestes: { cle: string; titre: string; sous: string; icone: NomIcone }[] = [
    { cle: "depot", titre: t.depot, sous: t.depotSous, icone: "ArrowDown" },
    { cle: "retrait", titre: t.retrait, sous: t.retraitSous, icone: "Wallet" },
    { cle: "transfert", titre: t.transfert, sous: t.transfertSous, icone: "Transfer" },
    { cle: "solde", titre: t.consulterSolde, sous: t.consultation, icone: "Refresh" },
  ];

  const bientot = () =>
    Alert.alert("TOTEM", langue === "en"
      ? "The counter opens in the next step."
      : "Le guichet ouvre à l'étape suivante.");

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}>
        <Texte taille={textes.titre} poids="demi">{c.operations}</Texte>

        {cartes.length === 0 ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
            <Texte poids="demi">{t.aucuneCarte}</Texte>
          </Carte>
        ) : (
          <Carte>
            {gestes.map((g, i) => (
              <View key={g.cle}>
                {i > 0 ? <Filet /> : null}
                <Pressable
                  onPress={bientot}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center",
                    gap: espaces.md, padding: espaces.lg,
                    backgroundColor: pressed ? couleurs.surface2 : "transparent",
                  })}
                >
                  <Icone nom={g.icone} taille={22} couleur={couleurs.encreDouce} />
                  <View style={{ flex: 1 }}>
                    <Texte poids="demi">{g.titre}</Texte>
                    <Texte taille={textes.petit} ton="doux">{g.sous}</Texte>
                  </View>
                  <Icone nom="Chevron" taille={18} couleur={couleurs.encrePale} />
                </Pressable>
              </View>
            ))}
          </Carte>
        )}

        {/* Les réglages, en attendant leur écran : la langue et la sortie. */}
        <Carte>
          <Pressable
            onPress={() => changerLangue(autre.code)}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: espaces.md,
              padding: espaces.lg,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
            })}
          >
            <Icone nom="Globe" taille={20} couleur={couleurs.encreDouce} />
            <Texte style={{ flex: 1 }}>{autre.bascule}</Texte>
            <Icone nom="Chevron" taille={18} couleur={couleurs.encrePale} />
          </Pressable>
          <Filet />
          <Pressable
            onPress={fermer}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: espaces.md,
              padding: espaces.lg,
              backgroundColor: pressed ? couleurs.surface2 : "transparent",
            })}
          >
            <Icone nom="Lock" taille={20} couleur={couleurs.encreDouce} />
            <Texte style={{ flex: 1 }}>
              {langue === "en" ? "Sign out" : "Se déconnecter"}
            </Texte>
          </Pressable>
        </Carte>
      </ScrollView>
    </SafeAreaView>
  );
}
