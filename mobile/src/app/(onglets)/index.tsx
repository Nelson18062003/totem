// L'accueil : les caisses, et ce que le terminal a à dire.
//
// C'est l'écran qu'on ouvre vingt fois par jour. Il montre donc, sans un clic
// de plus : combien il y a sur chaque carte, et si le boîtier de Douala
// respire encore. Le reste attend.

import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Carte, Filet, MotTotem, Pastille, Texte } from "@/ui";
import { Icone } from "@/icones";
import { couleurs, couleurOperateur, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesAccueil } from "@noyau/textes/accueil";
import { fcfa } from "@noyau/types";
import type { Sim } from "@noyau/types";

export default function Accueil() {
  const langue = useLangue();
  const t = textesAccueil[langue];
  // L'accueil se contente de trente SMS : en charger mille pour n'en montrer
  // aucun se paierait sur la facture de données du téléphone.
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 30, recus: 60 });

  const sims = donnees?.sims ?? [];
  const enPlace = sims.filter((s) => s.enPlace);
  // Si plus aucune carte n'est « en place » (terminal muet, nuage en retard),
  // on montre quand même les cartes connues, avec leur état dit franchement :
  // un accueil vide alors que l'écran Comptes les liste ferait chercher au
  // mauvais endroit.
  const cartes = enPlace.length ? enPlace : sims;
  const terminal = donnees?.terminal ?? null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}
        refreshControl={
          <RefreshControl refreshing={chargement} onRefresh={recharger}
                          tintColor={couleurs.encrePale} />
        }
      >
        <View style={{ gap: espaces.xs }}>
          <MotTotem taille={13} />
          <Texte taille={textes.petit} ton="doux">{t.bonjour}</Texte>
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </View>

        {erreur ? (
          <Carte style={{ padding: espaces.lg, borderColor: couleurs.negatif }}>
            <Texte ton="negatif" taille={textes.petit}>{erreur}</Texte>
          </Carte>
        ) : null}

        {cartes.length === 0 && !chargement && !erreur ? (
          <Carte style={{
            padding: espaces.xl, alignItems: "center", gap: espaces.sm,
            borderStyle: "dashed",
          }}>
            <Texte poids="demi">{t.aucuneCarte}</Texte>
            <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucuneCarteDetail}
            </Texte>
          </Carte>
        ) : null}

        {cartes.map((sim) => <Caisse key={sim.iccid} sim={sim} t={t} langue={langue} />)}

        {terminal ? <EtatTerminal terminal={terminal} t={t} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Une carte SIM et son solde. Le chiffre prend toute la place : c'est ce
 *  qu'on vient voir. */
function Caisse({ sim, t, langue }: {
  sim: Sim;
  t: (typeof textesAccueil)["fr"];
  langue: "en" | "fr";
}) {
  return (
    <Carte style={{ overflow: "hidden" }}>
      {/* La couleur de l'opérateur : un liseré de 3 px, jamais un aplat.
          C'est une donnée, pas la marque. */}
      <View style={{ height: 3, backgroundColor: couleurOperateur(sim.operateur) }} />

      <View style={{ padding: espaces.lg, gap: espaces.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <Icone nom="PuceSim" taille={18} couleur={couleurs.encreDouce} />
          <Texte poids="demi">{sim.libelle}</Texte>
          {!sim.enPlace ? (
            <View style={{
              marginLeft: "auto", flexDirection: "row",
              alignItems: "center", gap: espaces.xs,
            }}>
              <Pastille couleur={couleurs.alerte} />
              <Texte taille={textes.legende} ton="alerte">{sim.derniereVue}</Texte>
            </View>
          ) : null}
        </View>

        <View>
          {sim.solde == null ? (
            <Texte taille={textes.intertitre} ton="pale">{t.aucunSoldeConnu}</Texte>
          ) : (
            <Texte taille={textes.display} poids="demi" chiffresAlignes>
              {fcfa(sim.solde, langue)}
            </Texte>
          )}
          {sim.soldeMaj ? (
            <Texte taille={textes.legende} ton="pale">{t.soldeMaj(sim.soldeMaj)}</Texte>
          ) : null}
        </View>

        {sim.numero || sim.nom ? (
          <>
            <Filet />
            <View style={{ gap: espaces.xs }}>
              {sim.nom ? (
                <Texte taille={textes.petit} ton="doux">{sim.nom}</Texte>
              ) : null}
              {sim.numero ? (
                <Texte taille={textes.petit} ton="doux" chiffresAlignes>{sim.numero}</Texte>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    </Carte>
  );
}

/** Le boîtier de Douala : respire-t-il ? */
function EtatTerminal({ terminal, t }: {
  terminal: NonNullable<ReturnType<typeof useDonnees>["donnees"]>["terminal"];
  t: (typeof textesAccueil)["fr"];
}) {
  if (!terminal) return null;
  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.terminal}</Texte>
      <Carte style={{ padding: espaces.lg, gap: espaces.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <Pastille vif={terminal.enLigne} />
          <Texte>{terminal.enLigne ? t.enLigne : t.muet}</Texte>
          <Texte taille={textes.petit} ton="pale" chiffresAlignes
                 style={{ marginLeft: "auto" }}>
            {terminal.majTexte}
          </Texte>
        </View>
        {terminal.sante ? (
          <>
            <Filet />
            <Texte taille={textes.petit} ton="doux">{terminal.sante}</Texte>
          </>
        ) : null}
      </Carte>
    </View>
  );
}
