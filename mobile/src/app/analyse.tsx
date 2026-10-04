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
// LE RELEVÉ DE COMPTE vit ici aussi (`releve.tsx`) : toutes les cartes, ou
// une, sur la période qu'on veut, en PDF ou en CSV. Le bilan de la semaine,
// du mois ou du trimestre reste à côté — c'est un autre objet, l'export de
// cet écran.
//
// L'export CSV passe par le navigateur du système, muni d'un lien signé :
// c'est lui qui sait TÉLÉCHARGER un fichier — l'application ne sait que
// l'afficher. Même chemin que le reçu et la fiche des coordonnées.
//
// LES FORMES GRISES NE VIENNENT QUE SI L'ÉCRAN N'A VRAIMENT RIEN. Rouvrir
// l'Analyse deux minutes après l'avoir quittée la faisait repartir des
// formes grises, roue en haut, pour retélécharger mille SMS. Le cahier garde
// maintenant ce qui vient d'être servi (voir `donnees.tsx`) : l'écran
// retrouve sa semaine tout de suite, et la relit en silence. La roue, elle,
// ne tourne que sous le doigt (`useRoue`).

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { nomDeFichier, partagerDocument } from "@/partage";

import { Defilement, Accroc, BoutonIcone, Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { Entree } from "@/animations";
import { SqueletteAnalyse } from "@/squelettes";
import { useEcran } from "@/ecran";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { lienBilan } from "@/api/guichet";
import { FeuilleReleve } from "@/releve";
import { textesReleve } from "@noyau/textes/releve";
import { textesAnalyse } from "@noyau/textes/analyse";
import { textesUssd } from "@noyau/textes/ussd";
import { resumeSemaine } from "@noyau/analyse";
import type { Langue } from "@noyau/langue";
import { fcfa, jourLocal, nombre, FUSEAU_DEFAUT } from "@noyau/types";

export default function Analyse() {
  const langue = useLangue();
  const t = textesAnalyse[langue];
  const ecran = useEcran();
  // La même profondeur que la page web (1000 lignes) : à 200, la semaine
  // PRÉCÉDENTE est la première tronquée sur une caisse active, et le
  // pourcentage d'évolution ment — en bien, ce qui est pire.
  const { donnees, attente, erreur, recharger } = useDonnees({ sms: 1000, recus: 0 });
  const roue = useRoue();

  const paiements = donnees?.paiements;
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;
  const sims = donnees?.sims ?? [];
  const [releve, setReleve] = useState(false);

  // LA SEMAINE TOURNE À MINUIT, MÊME ÉCRAN OUVERT. Le calcul prenait
  // `Date.now()` au moment du rendu : restée ouverte depuis la veille,
  // l'Analyse comptait encore la semaine d'hier. Il suit maintenant l'heure
  // de l'écran — et ne se refait que quand le JOUR change, pas à chaque
  // minute : mille paiements à reclasser, ce n'est pas rien sur un petit
  // téléphone.
  const maintenant = useMaintenant();
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);

  // Tout le comptage d'un coup, UNE fois par jeu de données et par jour —
  // pas à chaque rendu : mille paiements se reclassent vite, mais pas au
  // point de le refaire pour un simple changement d'état d'écran. C'est
  // `aujourdhui`, et non `maintenant`, qui décide de refaire le calcul.
  const { jours: septJours, total, moyenne, meilleur, max, evolution,
          clients: topClients } =
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useMemo(() => resumeSemaine(paiements ?? [], langue, fuseau, maintenant),
            [paiements, langue, fuseau, aujourdhui]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        contentContainerStyle={{
          paddingHorizontal: ecran.marge, paddingTop: espaces.md,
          paddingBottom: espaces.xl, gap: espaces.xl,
          maxWidth: 1100, width: "100%", alignSelf: "center",
        }}
        refreshControl={roue}
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

        {/* Trois états qui ne se mélangent pas : RIEN encore (des formes
            grises), RIEN et la plateforme ne répond pas (la panne, avec
            « Réessayer »), ou la semaine — vide ou pleine. Une semaine sans
            encaissement n'est dite vide que sur des chiffres REÇUS. */}
        {!paiements ? (
          erreur ? (
            <Accroc message={erreur} onReessayer={() => void recharger()} />
          ) : attente ? (
            <SqueletteAnalyse />
          ) : null
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

        {/* LE RELEVÉ DE COMPTE — même quand la semaine est calme : un
            trimestre passé se relève quand même. */}
        {sims.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setReleve(true)}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: espaces.md,
              padding: espaces.lg, borderRadius: rayons.bouton, borderWidth: 1,
              borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
            })}
          >
            <Icone nom="Doc" taille={18} couleur={couleurs.encre} />
            <View style={{ flex: 1, gap: 2 }}>
              <Texte poids="demi">{textesReleve[langue].titre}</Texte>
              <Texte taille={textes.legende} ton="pale">{textesReleve[langue].explication}</Texte>
            </View>
          </Pressable>
        ) : null}
      </Defilement>

      {releve ? (
        <FeuilleReleve langue={langue} fuseau={fuseau} onFermer={() => setReleve(false)}
                       cartes={sims.map((s) => ({ iccid: s.iccid, numero: s.numero,
                                                  libelle: s.libelle, operateur: s.operateur }))} />
      ) : null}
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
      // Le fichier lui-même, par la feuille de partage — au comptable par
      // courriel, dans Drive — et non une page à télécharger.
      await partagerDocument(url, nomDeFichier(`Bilan-TOTEM-${jours}-jours`, "csv"),
                             "csv", t.exporterBilan);
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
