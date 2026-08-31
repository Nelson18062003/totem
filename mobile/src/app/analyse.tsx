// L'analyse : la semaine, les meilleurs jours, les principaux clients.
//
// Le pendant mobile de `web/app/analyse/page.tsx`. Les deux écrans ne
// calculent plus rien : ils demandent les chiffres à `noyau/analyse.ts` et
// les montrent. Tant que le calcul était écrit des deux côtés, les deux
// copies se sont trompées ENSEMBLE — et personne ne pouvait le voir, puisque
// le propriétaire regarde la page ou le téléphone, jamais les deux côte à
// côte.
//
// Les jours se découpent dans le fuseau DU TERMINAL (envoyé par la
// plateforme) : la caisse peut être à Douala et le téléphone à Paris, un
// encaissement de 23 h reste dans son jour.
//
// L'export CSV passe par le navigateur du système, muni d'un lien signé :
// c'est lui qui sait TÉLÉCHARGER un fichier — l'application ne sait que
// l'afficher. Même chemin que le reçu et la fiche des coordonnées.

import { useMemo, useState } from "react";
import { RefreshControl, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Navigateur from "expo-web-browser";

import { Accroc, BoutonIcone, Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { Entree } from "@/animations";
import { SqueletteAnalyse } from "@/squelettes";
import { useEcran } from "@/ecran";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { lienBilan } from "@/api/guichet";
import { textesAnalyse } from "@noyau/textes/analyse";
import { textesUssd } from "@noyau/textes/ussd";
import { resumeSemaine } from "@noyau/analyse";
import type { Langue } from "@noyau/langue";
import { fcfa, nombre, FUSEAU_DEFAUT } from "@noyau/types";

export default function Analyse() {
  const langue = useLangue();
  const t = textesAnalyse[langue];
  const ecran = useEcran();
  // La même profondeur que la page web (1000 lignes) : à 200, la semaine
  // PRÉCÉDENTE est la première tronquée sur une caisse active, et le
  // pourcentage d'évolution ment — en bien, ce qui est pire.
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 1000, recus: 0 });

  const paiements = donnees?.paiements ?? [];
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;

  // Tout le comptage d'un coup, UNE fois par jeu de données — pas à chaque
  // rendu : mille paiements se reclassent vite, mais pas au point de le
  // refaire pour un simple changement d'état d'écran.
  const { jours: septJours, total, moyenne, meilleur, max, evolution,
          clients: topClients } =
    useMemo(() => resumeSemaine(paiements, langue, fuseau),
            [paiements, langue, fuseau]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: ecran.marge, paddingTop: espaces.md,
          paddingBottom: espaces.xl, gap: espaces.xl,
          maxWidth: 1100, width: "100%", alignSelf: "center",
        }}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger}
                                        tintColor={couleurs.encrePale} />}
      >
        <Entree montee={6}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
            {/* La flèche retour : une icône nue, donc rien à teindre —
                c'est l'échelle qui répond au doigt. Voir `BoutonIcone`. */}
            <BoutonIcone nom="Chevron" etiquette={textesUssd[langue].fermerEcran}
                         onPress={() => router.back()}
                         style={{ transform: [{ rotate: "180deg" }] }} />
            <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
          </View>
        </Entree>

        {erreur ? (
          <Accroc message={erreur} onReessayer={recharger} />
        ) : paiements.length === 0 && chargement ? (
          <SqueletteAnalyse />
        ) : paiements.length === 0 ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                          borderStyle: "dashed" }}>
            <Texte poids="demi">{t.rienTitre}</Texte>
            <Texte ton="doux" taille={textes.petit}
                   style={{ textAlign: "center", lineHeight: 20 }}>
              {t.rienDetail}
            </Texte>
          </Carte>
        ) : (
          <>
            {/* Le chiffre principal : la semaine. */}
            <Entree delai={60}>
              <View style={{ gap: espaces.xs }}>
                <Texte taille={textes.petit} ton="doux">{t.encaissementsSemaine}</Texte>
                <Texte taille={34} poids="demi" chiffresAlignes
                       style={{ letterSpacing: -0.8 }}>
                  {fcfa(total, langue)}
                </Texte>
                {evolution != null ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
                    <Texte taille={textes.petit} poids="moyen"
                           ton={evolution >= 0 ? "positif" : "negatif"}>
                      {evolution >= 0 ? "+" : ""}{evolution} %
                    </Texte>
                    <Texte taille={textes.petit} ton="pale">
                      {t.parRapportSemainePrecedente}
                    </Texte>
                  </View>
                ) : null}
              </View>
            </Entree>

            {/* Les deux repères, côte à côte. */}
            <Entree delai={120}>
              <Carte style={{ flexDirection: "row" }}>
                <View style={{ flex: 1, padding: espaces.lg, gap: espaces.xs }}>
                  <Texte taille={textes.legende} ton="pale">{t.moyenneParJour}</Texte>
                  <Texte poids="demi" chiffresAlignes numberOfLines={1}>
                    {fcfa(moyenne, langue)}
                  </Texte>
                </View>
                <View style={{ width: 1, backgroundColor: couleurs.trait }} />
                <View style={{ flex: 1, padding: espaces.lg, gap: espaces.xs }}>
                  <Texte taille={textes.legende} ton="pale">{t.meilleurJour}</Texte>
                  <Texte poids="demi" chiffresAlignes numberOfLines={1}>
                    {meilleur.jour} · {nombre(meilleur.montant, langue)}
                  </Texte>
                </View>
              </Carte>
            </Entree>

            {/* Le graphique — monochrome, montants complets au-dessus des
                barres : un montant abrégé est un montant flou. */}
            <Entree delai={180}>
              <View style={{ gap: espaces.md }}>
                <Texte taille={textes.intertitre} poids="demi">
                  {t.encaissementsParJour}
                </Texte>
                <View style={{ flexDirection: "row", alignItems: "flex-end",
                               gap: espaces.xs, height: 165 }}>
                  {septJours.map((d, i) => {
                    const h = Math.round((d.montant / max) * 110) + 6;
                    const fort = d.montant === meilleur.montant && d.montant > 0;
                    return (
                      <View key={i} style={{ flex: 1, alignItems: "center", gap: espaces.xs }}>
                        {/* UN MONTANT TRONQUÉ EST UN MONTANT FAUX — la règle
                            de la maison, que ce graphique enfreignait. Sept
                            colonnes égales sur un écran de 320 dp font 38 dp
                            chacune : « 287 000 » n'y tient déjà pas, et sous
                            le réglage « grand texte » d'Android tout se
                            coupait en « 1 23… ». Comme la caisse, on refuse
                            l'agrandissement système et on laisse le chiffre
                            se réduire pour rester ENTIER. */}
                        <Texte taille={10} chiffresAlignes numberOfLines={1}
                               allowFontScaling={false}
                               adjustsFontSizeToFit
                               minimumFontScale={0.6}
                               poids={fort ? "moyen" : "normal"}
                               ton={fort ? "normal" : "pale"}>
                          {d.montant > 0 ? nombre(d.montant, langue) : ""}
                        </Texte>
                        <View style={{
                          alignSelf: "stretch", height: h,
                          borderRadius: rayons.petit,
                          backgroundColor: fort ? couleurs.encre : couleurs.surface3,
                        }} />
                        <Texte taille={textes.legende} ton="pale">{d.jour}</Texte>
                      </View>
                    );
                  })}
                </View>
              </View>
            </Entree>

            {/* Le bilan en CSV, prêt pour Excel ou la comptabilité — les
                mêmes colonnes que l'export du robot. Le fichier se
                télécharge par le navigateur du système, muni d'un lien
                signé : c'est lui qui sait enregistrer un fichier. */}
            <Entree delai={210}>
              <ExportBilan langue={langue} />
            </Entree>

            {/* Les principaux clients. Toucher un nom ouvre la boîte de
                réception, déjà filtrée sur lui. */}
            {topClients.length ? (
              <Entree delai={240}>
                <View style={{ gap: espaces.sm }}>
                  <Texte taille={textes.intertitre} poids="demi">
                    {t.principauxClients}
                  </Texte>
                  <Carte>
                    {topClients.map((c, i) => (
                      <View key={c.nom}>
                        {i > 0 ? <Filet /> : null}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push({
                            pathname: "/encaissements",
                            // « moment » distingue deux appuis sur le MÊME
                            // nom : sans lui, revenir toucher le même client
                            // après avoir vidé la recherche ne ferait rien.
                            params: { recherche: c.nom, moment: String(Date.now()) },
                          })}
                          style={({ pressed }) => ({
                            flexDirection: "row", alignItems: "center", gap: espaces.md,
                            padding: espaces.lg,
                            backgroundColor: pressed ? couleurs.surface2 : "transparent",
                          })}
                        >
                          <Texte taille={textes.petit} ton="pale" chiffresAlignes
                                 style={{ width: 16 }}>
                            {i + 1}
                          </Texte>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Texte poids="moyen" numberOfLines={1}>{c.nom}</Texte>
                            <Texte taille={textes.legende} ton="pale">
                              {t.nbPaiements(c.nb)}
                            </Texte>
                          </View>
                          <Texte poids="demi" chiffresAlignes taille={textes.petit}>
                            {fcfa(c.total, langue)}
                          </Texte>
                        </Pressable>
                      </View>
                    ))}
                  </Carte>
                </View>
              </Entree>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** L'export du bilan : la semaine pour le quotidien, 30 et 90 jours pour le
 *  bilan du mois ou du trimestre — les mêmes trois portes que le web. */
function ExportBilan({ langue }: { langue: Langue }) {
  const t = textesAnalyse[langue];
  const [occupe, setOccupe] = useState<number | null>(null);
  const [refus, setRefus] = useState(false);

  const exporter = async (jours: number) => {
    if (occupe != null) return;
    setOccupe(jours);
    setRefus(false);
    try {
      const { url } = await lienBilan(jours);
      await Navigateur.openBrowserAsync(url);
    } catch {
      setRefus(true);
    } finally {
      setOccupe(null);
    }
  };

  const portes = [
    { jours: 7, libelle: t.exportSemaine },
    { jours: 30, libelle: t.exportJours(30) },
    { jours: 90, libelle: t.exportJours(90) },
  ];

  return (
    <View style={{ gap: espaces.sm }}>
      <Texte taille={textes.intertitre} poids="demi">{t.exporterBilan}</Texte>
      <View style={{ flexDirection: "row", gap: espaces.sm }}>
        {portes.map((p) => (
          <Pressable
            accessibilityRole="button"
            key={p.jours}
            onPress={() => void exporter(p.jours)}
            disabled={occupe != null}
            style={({ pressed }) => ({
              flex: 1, alignItems: "center", paddingVertical: espaces.md,
              borderRadius: rayons.bouton, borderWidth: 1,
              borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
              opacity: occupe != null && occupe !== p.jours ? 0.5 : 1,
            })}
          >
            <Texte taille={textes.petit} poids="moyen">
              {occupe === p.jours ? "…" : p.libelle}
            </Texte>
          </Pressable>
        ))}
      </View>
      {refus ? (
        <Texte taille={textes.legende} ton="negatif">{t.exportImpossible}</Texte>
      ) : null}
      <Texte taille={textes.legende} ton="pale">{t.exportNote}</Texte>
    </View>
  );
}
