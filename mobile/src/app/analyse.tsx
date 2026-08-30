// L'analyse : la semaine, les meilleurs jours, les principaux clients.
//
// Le pendant mobile de `web/app/analyse/page.tsx` — mêmes calculs, sur les
// vrais paiements : aucun chiffre n'est écrit à la main. Les jours se
// découpent dans le fuseau DU TERMINAL (envoyé par la plateforme) : la
// caisse peut être à Douala et le téléphone à Paris, un encaissement de
// 23 h reste dans son jour.
//
// L'export CSV du bilan reste sur la plateforme : un téléphone partage mal
// un fichier qu'aucune application n'attend, et le comptable travaille sur
// un ordinateur.

import { RefreshControl, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { Entree } from "@/animations";
import { useEcran } from "@/ecran";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesAnalyse } from "@noyau/textes/analyse";
import { textesUssd } from "@noyau/textes/ussd";
import { fcfa, jourLocal, nombre, FUSEAU_DEFAUT, type Paiement } from "@noyau/types";
import type { Langue } from "@noyau/langue";

/** Les encaissements des 7 derniers jours, jour par jour. */
function septDerniersJours(paiements: Paiement[], langue: Langue, fuseau: string) {
  const jours: { jour: string; montant: number }[] = [];
  const present = Date.now();
  const locale = langue === "en" ? "en-GB" : "fr-FR";
  for (let i = 6; i >= 0; i--) {
    const d = new Date(present - i * 86_400_000);
    const cle = jourLocal(d, fuseau);
    const montant = paiements
      .filter((p) => p.sens === "in" && p.montant != null
                     && jourLocal(new Date(p.recuLe), fuseau) === cle)
      .reduce((s, p) => s + (p.montant ?? 0), 0);
    const nom = new Intl.DateTimeFormat(locale, { timeZone: fuseau, weekday: "short" })
      .format(d).replace(".", "");
    jours.push({ jour: nom.charAt(0).toUpperCase() + nom.slice(1), montant });
  }
  return jours;
}

/** Le total encaissé entre deux bornes, en jours avant maintenant. */
function semaine(paiements: Paiement[], debut: number, fin: number) {
  const present = Date.now();
  return paiements
    .filter((p) => {
      const t = new Date(p.recuLe).getTime();
      return p.sens === "in" && p.montant != null
             && t > present - debut * 86_400_000 && t <= present - fin * 86_400_000;
    })
    .reduce((s, p) => s + (p.montant ?? 0), 0);
}

export default function Analyse() {
  const langue = useLangue();
  const t = textesAnalyse[langue];
  const ecran = useEcran();
  // La même profondeur que la page web (1000 lignes) : à 200, la semaine
  // PRÉCÉDENTE est la première tronquée sur une caisse active, et le
  // pourcentage d'évolution ment — en bien, ce qui est pire.
  const { donnees, chargement, recharger } = useDonnees({ sms: 1000, recus: 0 });

  const paiements = donnees?.paiements ?? [];
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;

  const septJours = septDerniersJours(paiements, langue, fuseau);
  const total = septJours.reduce((s, d) => s + d.montant, 0);
  const moyenne = Math.round(total / 7);
  const meilleur = septJours.reduce((a, b) => (b.montant > a.montant ? b : a));
  const max = Math.max(...septJours.map((d) => d.montant), 1);

  // La semaine précédente, pour situer celle-ci — calculée, pas décrétée.
  const precedente = semaine(paiements, 14, 7);
  const evolution = precedente > 0
    ? Math.round(((total - precedente) / precedente) * 100) : null;

  // Les clients qui reviennent, sur tout l'historique chargé. Le client,
  // c'est « tiers » — la personne qui a payé ; « nom » est l'expéditeur du
  // SMS, le même pour tout un opérateur (voir web/app/analyse/page.tsx).
  const parClient = new Map<string, { nb: number; total: number }>();
  for (const p of paiements.filter((x) => x.sens === "in" && x.montant != null)) {
    const cle = p.tiers || p.nom;
    const c = parClient.get(cle) ?? { nb: 0, total: 0 };
    c.nb += 1; c.total += p.montant ?? 0;
    parClient.set(cle, c);
  }
  const topClients = [...parClient.entries()]
    .map(([nom, v]) => ({ nom, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

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
            <Pressable onPress={() => router.back()} hitSlop={12}
                       accessibilityLabel={textesUssd[langue].fermerEcran}>
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <Icone nom="Chevron" taille={22} couleur={couleurs.encreDouce} />
              </View>
            </Pressable>
            <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
          </View>
        </Entree>

        {paiements.length === 0 && !chargement ? (
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
                        <Texte taille={10} chiffresAlignes numberOfLines={1}
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
