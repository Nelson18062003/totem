// Les comptes : chaque carte, la répartition, et ce qu'ont laissé les puces
// retirées.
//
// Le pendant mobile de `web/app/cartes/page.tsx`. Trois blocs, et le
// troisième n'apparaît que s'il a lieu d'être : retirer une carte ne perd
// rien — son journal reste consultable, et son total avec.

import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Accroc, Carte, Filet, Texte } from "@/ui";
import { Icone } from "@/icones";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { Entree } from "@/animations";
import { SqueletteCartes } from "@/squelettes";
import { useEcran } from "@/ecran";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { textesCartes } from "@noyau/textes/cartes";
import { fcfa, nombre, type Sim } from "@noyau/types";
import type { Langue } from "@noyau/langue";

export default function Comptes() {
  const langue = useLangue();
  const t = textesCartes[langue];
  const ecran = useEcran();
  // Le bilan des cartes retirées (nombre de paiements, total reçu) se
  // compte sur les SMS : la même profondeur que la page web (1000 lignes),
  // sinon le téléphone et le web affichent deux totaux différents.
  // COMPTER SANS RAPPORTER. Cet écran ne lit JAMAIS `donnees.paiements` — il
  // montre des soldes et des compteurs. Il demandait pourtant mille SMS pour
  // que le serveur compte sur la même profondeur que le web, et le serveur
  // les renvoyait tous, textes compris : 264 Ko sur une connexion mobile pour
  // afficher quatre cartes. Les compteurs restent justes ; les lignes
  // s'arrêtent au serveur.
  const { donnees, chargement, erreur, recharger } =
    useDonnees({ sms: 1000, recus: 0, sansLignes: true });

  const sims = donnees?.sims ?? [];
  const enPlace = sims.filter((s) => s.enPlace);
  const retirees = sims.filter((s) => !s.enPlace);
  const total = enPlace.reduce((s, x) => s + (x.solde ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: ecran.marge, paddingTop: espaces.md,
          paddingBottom: 108, gap: espaces.xl,
          maxWidth: 1100, width: "100%", alignSelf: "center",
        }}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger}
                                        tintColor={couleurs.encrePale} />}
      >
        <Entree montee={6}>
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </Entree>

        {/* La panne se dit AVANT l'état vide : sans cela, un téléphone hors
            ligne montrait « aucune carte » — une connexion en panne déguisée
            en terminal vide. */}
        {erreur ? <Accroc message={erreur} onReessayer={recharger} /> : null}

        {enPlace.length === 0 && chargement && !erreur ? (
          <SqueletteCartes combien={2} />
        ) : null}

        {enPlace.length === 0 && !chargement && !erreur ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                          borderStyle: "dashed" }}>
            <Texte poids="demi">{t.videTitre}</Texte>
            <Texte ton="doux" taille={textes.petit}
                   style={{ textAlign: "center", lineHeight: 20 }}>
              {t.videDetail}
            </Texte>
          </Carte>
        ) : null}

        {/* Une carte par SIM. La PREMIÈRE est sombre : c'est la caisse de
            tête, celle qu'on lit d'abord. Les suivantes restent claires —
            deux surfaces sombres côte à côte se disputeraient l'œil. */}
        {/* En colonne, chaque carte prend TOUTE la largeur ; côte à côte
            dès qu'il y a la place. Sans `alignSelf`, un enfant d'une colonne
            qui enveloppe se dimensionne sur son contenu — les cartes
            s'arrêtaient aux deux tiers de l'écran. */}
        <View style={{ flexDirection: ecran.deuxColonnes ? "row" : "column",
                       flexWrap: ecran.deuxColonnes ? "wrap" : "nowrap",
                       gap: espaces.md }}>
          {enPlace.map((s, i) => (
            <Entree key={s.iccid} delai={60 + i * 60}
                    style={ecran.deuxColonnes
                      ? { flex: 1, minWidth: 280 }
                      : { alignSelf: "stretch" }}>
              <CarteCompte sim={s} tete={i === 0} langue={langue} t={t} />
            </Entree>
          ))}
        </View>

        {/* La répartition n'a de sens qu'à plusieurs. */}
        {enPlace.length > 1 && total > 0 ? (
          <Entree delai={200}>
            <View style={{ gap: espaces.sm }}>
              <Texte taille={textes.intertitre} poids="demi">{t.repartition}</Texte>
              <Carte style={{ padding: espaces.lg, gap: espaces.lg }}>
                {/* Une seule barre, partagée : les proportions se lisent
                    d'un coup, sans chercher les pourcentages. */}
                <View style={{ flexDirection: "row", height: 8,
                               borderRadius: rayons.petit, overflow: "hidden" }}>
                  {enPlace.map((s, i) => (
                    <View key={s.iccid}
                          style={{ flex: (s.solde ?? 0) / total,
                                   backgroundColor: i === 0 ? couleurs.encre : couleurs.surface3 }} />
                  ))}
                </View>
                <View>
                  {enPlace.map((s, i) => (
                    <View key={s.iccid}>
                      {i > 0 ? <Filet /> : null}
                      <View style={{ flexDirection: "row", alignItems: "center",
                                     gap: espaces.sm, paddingVertical: espaces.sm }}>
                        <View style={{ width: 10, height: 10, borderRadius: rayons.petit,
                                       backgroundColor: i === 0 ? couleurs.encre : couleurs.surface3 }} />
                        <Texte style={{ flex: 1 }} numberOfLines={1}>{s.libelle}</Texte>
                        <Texte ton="doux" chiffresAlignes taille={textes.petit}>
                          {fcfa(s.solde ?? 0, langue)} · {Math.round(((s.solde ?? 0) / total) * 100)}%
                        </Texte>
                      </View>
                    </View>
                  ))}
                </View>
              </Carte>
            </View>
          </Entree>
        ) : null}

        {/* Les puces retirées. Leur journal reste entier — c'est la règle
            de la maison : retirer une carte ne perd rien. */}
        {retirees.length ? (
          <Entree delai={260}>
            <View style={{ gap: espaces.sm }}>
              <Texte taille={textes.intertitre} poids="demi">{t.retireesTitre}</Texte>
              <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
                {t.retireesDetail}
              </Texte>
              <Carte>
                {retirees.map((s, i) => (
                  <View key={s.iccid}>
                    {i > 0 ? <Filet /> : null}
                    <View style={{ flexDirection: "row", alignItems: "center",
                                   gap: espaces.md, padding: espaces.lg }}>
                      <View style={{ width: 36, height: 36, borderRadius: rayons.rond,
                                     borderWidth: 1, borderStyle: "dashed",
                                     borderColor: couleurs.trait,
                                     alignItems: "center", justifyContent: "center" }}>
                        <Icone nom="Wallet" taille={16} couleur={couleurs.encrePale} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Texte poids="moyen" ton="doux" numberOfLines={1}>{s.libelle}</Texte>
                        <Texte taille={textes.petit} ton="pale" chiffresAlignes numberOfLines={1}>
                          {t.bilanRetiree(s.nbPaiements, s.derniereVue)}
                        </Texte>
                      </View>
                      <Texte ton="pale" chiffresAlignes taille={textes.petit}>
                        {fcfa(s.totalRecu, langue)}
                      </Texte>
                    </View>
                  </View>
                ))}
              </Carte>
            </View>
          </Entree>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Une carte du compte : sombre pour la caisse de tête, claire ensuite. */
function CarteCompte({ sim: s, tete, langue, t }: {
  sim: Sim; tete: boolean; langue: Langue; t: (typeof textesCartes)["fr"];
}) {
  const sombre = tete;
  const encre = sombre ? "#ffffff" : couleurs.encre;
  const doux = sombre ? "rgba(255,255,255,0.55)" : couleurs.encreDouce;
  const pale = sombre ? "rgba(255,255,255,0.45)" : couleurs.encrePale;

  // Un solde très long descend d'un cran plutôt que de casser la ligne.
  const long = s.solde != null && nombre(s.solde, langue).length > 12;

  return (
    <View style={{
      borderRadius: rayons.carte,
      padding: espaces.lg,
      backgroundColor: sombre ? "#1e1e1e" : couleurs.surfaceHaute,
      borderWidth: sombre ? 0 : 1,
      borderColor: couleurs.trait,
      gap: espaces.md,
    }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start",
                     justifyContent: "space-between", gap: espaces.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                       flex: 1, minWidth: 0 }}>
          <LogoOperateur operateur={s.operateur} taille={20} />
          {!operateurReconnu(s.operateur) ? (
            <Texte taille={textes.legende} numberOfLines={1}
                   style={{ color: doux, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {s.libelle}
            </Texte>
          ) : null}
        </View>
        {s.signal != null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs,
                         paddingHorizontal: espaces.sm, paddingVertical: 3,
                         borderRadius: rayons.petit,
                         backgroundColor: sombre ? "rgba(255,255,255,0.1)" : couleurs.surface2 }}>
            <View style={{ width: 6, height: 6, borderRadius: rayons.rond,
                           backgroundColor: couleurs.positifVif }} />
            <Texte taille={textes.legende} chiffresAlignes style={{ color: doux }}>
              {s.signal}/31
            </Texte>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 2 }}>
        {/* « adjustsFontSizeToFit » : le solde RÉTRÉCIT pour tenir sur sa
            ligne au lieu de se tronquer — que la pression vienne d'un nombre
            très long OU du réglage « grand texte » d'Android. Sans lui,
            numberOfLines={1} coupait, et un solde coupé est un solde faux. */}
        <Texte poids="demi" chiffresAlignes numberOfLines={1} adjustsFontSizeToFit
               taille={long ? textes.intertitre : textes.display}
               style={{ color: encre, letterSpacing: -0.5 }}>
          {s.solde == null ? "—" : fcfa(s.solde, langue)}
        </Texte>
        {s.solde != null && s.soldeMaj ? (
          <Texte taille={textes.legende} chiffresAlignes style={{ color: pale }}>
            {t.soldeLe(s.soldeMaj)}
          </Texte>
        ) : null}
      </View>

      <View style={{ gap: 2 }}>
        <Texte taille={textes.petit} chiffresAlignes style={{ color: doux }}>
          {s.numero || t.numeroAbsent}
        </Texte>
        {/* L'ICCID est ce qui distingue deux cartes du MÊME opérateur : sans
            lui, deux SIM MTN se confondraient à l'écran. */}
        <Texte taille={textes.legende} chiffresAlignes style={{ color: pale }}>
          {t.carte(s.iccid.slice(-8))}
          {s.itinerance && s.reseau ? ` · ${t.itinerance(s.reseau)}` : ""}
        </Texte>
      </View>
    </View>
  );
}
