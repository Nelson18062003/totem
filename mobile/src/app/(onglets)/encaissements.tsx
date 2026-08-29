// La boîte de réception : les SMS reçus par les cartes.
//
// Squelette de la phase 3 — la liste. La fiche d'un SMS, les filtres et les
// reçus viennent avec la phase 4.

import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Carte, Filet, Texte } from "@/ui";
import { couleurs, espaces, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesSms } from "@noyau/textes/sms";
import { fcfa } from "@noyau/types";

export default function Encaissements() {
  const langue = useLangue();
  const t = textesSms[langue];
  const { donnees, chargement, recharger } = useDonnees({ sms: 200 });
  const paiements = donnees?.paiements ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.md }}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger} />}
      >
        <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>

        {paiements.length === 0 && !chargement ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center" }}>
            <Texte ton="doux">{t.aucunSmsTitre}</Texte>
          </Carte>
        ) : null}

        {paiements.length ? (
          <Carte>
            {paiements.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Filet /> : null}
                <View style={{ padding: espaces.lg, gap: espaces.xs }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                    {/* Le point du non-lu : discret, à gauche, comme une
                        messagerie. */}
                    {p.nonLu ? (
                      <View style={{ width: 6, height: 6, borderRadius: 999,
                                     backgroundColor: couleurs.accent }} />
                    ) : null}
                    <Texte poids={p.nonLu ? "demi" : "normal"}>{p.nom}</Texte>
                    <Texte taille={textes.legende} ton="pale" chiffresAlignes
                           style={{ marginLeft: "auto" }}>
                      {p.heure}
                    </Texte>
                  </View>

                  {p.montant != null ? (
                    <Texte
                      poids="demi"
                      chiffresAlignes
                      ton={p.sens === "in" ? "positif" : p.sens === "out" ? "negatif" : "doux"}
                    >
                      {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}
                      {fcfa(p.montant, langue)}
                    </Texte>
                  ) : null}

                  {/* Le SMS de l'opérateur, mot pour mot. On ne le traduit
                      jamais : le traduire serait le trahir. */}
                  <Texte taille={textes.petit} ton="doux" numberOfLines={2}
                         style={{ lineHeight: 20 }}>
                    {p.smsBrut}
                  </Texte>

                  <Texte taille={textes.legende} ton="pale">{p.sim} · {p.date}</Texte>
                </View>
              </View>
            ))}
          </Carte>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
