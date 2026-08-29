// Les comptes : toutes les cartes connues, en place ou retirées.
//
// Squelette de la phase 3 — la liste et les soldes. Les détails (répartition,
// bilan d'une carte retirée) viennent avec la phase 4.

import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Carte, Filet, Pastille, Texte } from "@/ui";
import { Icone } from "@/icones";
import { couleurs, couleurOperateur, espaces, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesCartes } from "@noyau/textes/cartes";
import { fcfa } from "@noyau/types";

export default function Cartes() {
  const langue = useLangue();
  const t = textesCartes[langue];
  const { donnees, chargement, recharger } = useDonnees();
  const sims = donnees?.sims ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.md }}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger} />}
      >
        <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>

        {sims.length === 0 && !chargement ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
            <Texte poids="demi">{t.videTitre}</Texte>
            <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center" }}>
              {t.videDetail}
            </Texte>
          </Carte>
        ) : null}

        {sims.map((sim) => (
          <Carte key={sim.iccid} style={{ overflow: "hidden" }}>
            <View style={{ height: 3, backgroundColor: couleurOperateur(sim.operateur) }} />
            <View style={{ padding: espaces.lg, gap: espaces.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                <Icone nom="PuceSim" taille={18} couleur={couleurs.encreDouce} />
                <Texte poids="demi">{sim.libelle}</Texte>
                <View style={{ marginLeft: "auto", flexDirection: "row",
                               alignItems: "center", gap: espaces.xs }}>
                  <Pastille vif={sim.enPlace} couleur={sim.enPlace ? undefined : couleurs.encrePale} />
                  <Texte taille={textes.legende} ton="pale">
                    {sim.enPlace ? sim.derniereVue : t.retireesTitre}
                  </Texte>
                </View>
              </View>

              <Texte taille={textes.intertitre} poids="demi" chiffresAlignes>
                {sim.solde == null ? "—" : fcfa(sim.solde, langue)}
              </Texte>

              <Filet />
              <Texte taille={textes.petit} ton="doux" chiffresAlignes>
                {sim.numero || t.numeroAbsent}
              </Texte>
              <Texte taille={textes.legende} ton="pale">{t.carte(sim.iccid.slice(-4))}</Texte>
              {sim.itinerance && sim.reseau ? (
                <Texte taille={textes.legende} ton="alerte">{t.itinerance(sim.reseau)}</Texte>
              ) : null}
            </View>
          </Carte>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
