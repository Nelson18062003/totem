// L'accueil : la caisse choisie, ses gestes, et les derniers SMS.
//
// Le pendant mobile de `web/app/page.tsx` + `accueil-client.tsx`. Une SEULE
// carte est montrée à la fois : avec deux SIM, on CHOISIT sa caisse au lieu
// de serrer deux cartes dans une demi-largeur. La carte choisie garde alors
// l'écran entier — c'est là que le chiffre se lit.

import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Caisse } from "@/caisse";
import { Carte, Filet, MotTotem, Pastille, Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { Entree } from "@/animations";
import { OperationPopup, type Operation } from "@/operation";
import * as Coffre from "@/api/coffre";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useChangerLangue, useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { fcfa, type Paiement, type Sim } from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import { LANGUES } from "@noyau/langue";

// Le choix tient à l'APPAREIL, pas au compte : c'est un réglage d'écran.
const CLE_SOLDE_CACHE = "totem.solde.cache";

export default function Accueil() {
  const langue = useLangue();
  const changerLangue = useChangerLangue();
  const t = textesAccueil[langue];
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 30, recus: 60 });

  const sims = donnees?.sims ?? [];
  const enPlace = sims.filter((s) => s.enPlace);
  const cartes = enPlace.length ? enPlace : sims;
  const raccourcis = donnees?.raccourcis ?? {};

  const [choisie, setChoisie] = useState<string | null>(null);
  const active = cartes.find((c) => c.iccid === choisie) ?? cartes[0];

  const [operation, setOperation] = useState<Operation | null>(null);

  // Masqué par défaut tant que le choix n'est pas lu : le solde ne doit
  // jamais APPARAÎTRE puis se cacher — dans ce sens-là, c'est trop tard.
  const [soldeCache, setSoldeCache] = useState(true);
  useEffect(() => {
    Coffre.lire(CLE_SOLDE_CACHE).then((v) => setSoldeCache(v === "1")).catch(() => {});
  }, []);
  const basculerSolde = () => {
    setSoldeCache((c) => {
      void Coffre.ecrire(CLE_SOLDE_CACHE, c ? "0" : "1").catch(() => {});
      return !c;
    });
  };

  const geste = (c: Sim, cle: string): string[] =>
    etapesGeste(c.operateur, cle, raccourcis[c.operateur] ?? []);

  const operationDe = (cle: string, titre: string, champs: Operation["champs"]): Operation => {
    const et = active ? geste(active, cle) : [];
    return { titre, code: et[0] ?? "", etapes: et, champs,
             carte: active?.iccid, terminal: donnees?.terminal?.id ?? null };
  };

  type Geste = { label: string; icone: NomIcone; fabrique: () => Operation };
  const tous: Geste[] = active == null ? [] : [
    { label: t.depot, icone: "ArrowDown", fabrique: () => operationDe("depot", t.depotTitre, [
      { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
      { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { label: t.retrait, icone: "Wallet", fabrique: () => operationDe("retrait", t.retraitTitre, [
      { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
      { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { label: t.transfert, icone: "ArrowUp", fabrique: () => operationDe("transfert", t.transfertTitre, [
      { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
      { cle: "montant", label: t.montantFcfa, aide: "50 000", type: "montant" }]) },
    { label: t.solde, icone: "Refresh", fabrique: () => operationDe("solde", t.consulterSolde, []) },
    { label: t.monNumero, icone: "Phone", fabrique: () => operationDe("mon_numero", t.monNumero, []) },
  ];
  // Un geste dont on ne connaît pas le code ne s'affiche pas : un bouton qui
  // composerait au hasard vaut moins que pas de bouton du tout.
  const gestes = tous.filter((g) => g.fabrique().code);

  const derniers = (donnees?.paiements ?? []).slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          padding: espaces.lg, gap: espaces.xl,
          // La barre flottante mange le bas de l'écran : le contenu se
          // termine au-dessus d'elle, jamais dessous.
          paddingBottom: 108,
        }}
        refreshControl={
          <RefreshControl refreshing={chargement} onRefresh={recharger}
                          tintColor={couleurs.encrePale} />
        }
      >
        <Entree>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <MotTotem taille={13} />
              <Texte taille={textes.petit} ton="doux" style={{ marginTop: espaces.xs }}>
                {t.bonjour}
              </Texte>
              <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
            </View>
            {/* La langue, en évidence dès l'accueil : les deux choix côte à
                côte, écrits en toutes lettres. C'est le geste le plus
                demandé, il ne doit pas se chercher dans les réglages. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md,
                           paddingTop: espaces.xs }}>
              <View style={{
                flexDirection: "row", borderRadius: rayons.rond, padding: 3,
                borderWidth: 1, borderColor: couleurs.trait,
                backgroundColor: couleurs.surfaceHaute,
              }}>
                {LANGUES.map((l) => {
                  const sel = l.code === langue;
                  return (
                    <Pressable key={l.code} onPress={() => changerLangue(l.code)}
                               accessibilityState={{ selected: sel }}
                               style={{
                                 paddingHorizontal: espaces.md, paddingVertical: 5,
                                 borderRadius: rayons.rond,
                                 backgroundColor: sel ? couleurs.accent : "transparent",
                               }}>
                      <Texte taille={textes.legende} poids="moyen"
                             ton={sel ? "normal" : "doux"}
                             style={sel ? { color: couleurs.surfaceHaute } : undefined}>
                        {l.libelle}
                      </Texte>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => router.push("/reglages")} hitSlop={12}
                         accessibilityLabel={t.reglages}>
                <Icone nom="Settings" taille={22} couleur={couleurs.encreDouce} />
              </Pressable>
            </View>
          </View>
        </Entree>

        {erreur ? (
          <Carte style={{ padding: espaces.lg, borderColor: couleurs.negatif }}>
            <Texte ton="negatif" taille={textes.petit}>{erreur}</Texte>
          </Carte>
        ) : null}

        {/* LE sélecteur : avec deux SIM, on choisit sa caisse. */}
        {cartes.length > 1 && active ? (
          <Entree delai={60}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
              {cartes.map((c) => {
                const sel = c.iccid === active.iccid;
                return (
                  <Pressable
                    key={c.iccid}
                    onPress={() => setChoisie(c.iccid)}
                    accessibilityState={{ selected: sel }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: espaces.sm,
                      paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                      borderRadius: rayons.bouton,
                      borderWidth: sel ? 0 : 1, borderColor: couleurs.trait,
                      backgroundColor: sel ? couleurs.accent : couleurs.surfaceHaute,
                    }}
                  >
                    {operateurReconnu(c.operateur)
                      ? <LogoOperateur operateur={c.operateur} taille={18} />
                      : null}
                    <Texte poids="moyen" taille={textes.petit}
                           ton={sel ? "normal" : "doux"}
                           style={sel ? { color: couleurs.surfaceHaute } : undefined}>
                      {c.libelle}
                    </Texte>
                  </Pressable>
                );
              })}
            </View>
          </Entree>
        ) : null}

        {active ? (
          <Entree delai={120}>
            <Caisse
              carte={active}
              langue={langue}
              soldeCache={soldeCache}
              basculerSolde={basculerSolde}
              onSolde={() => setOperation(operationDe("solde", t.consulterSolde, []))}
              onCoordonnees={() => router.push("/reglages")}
            />
          </Entree>
        ) : !chargement ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                          borderStyle: "dashed" }}>
            <Texte poids="demi">{t.aucuneCarte}</Texte>
            <Texte ton="doux" taille={textes.petit}
                   style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucuneCarteDetail}
            </Texte>
          </Carte>
        ) : null}

        {/* Les gestes, sur la carte choisie — deux par ligne. */}
        {gestes.length && active ? (
          <Entree delai={180}>
            <View style={{ gap: espaces.sm }}>
              <Texte taille={textes.legende} ton="pale"
                     style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                {t.gestesSur(active.libelle)}
              </Texte>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
                {gestes.map((g) => (
                  <Pressable
                    key={g.label}
                    onPress={() => setOperation(g.fabrique())}
                    style={({ pressed }) => ({
                      // Deux par ligne : la moitié, moins la moitié du jeu.
                      width: "48.5%",
                      flexDirection: "row", alignItems: "center", gap: espaces.sm,
                      paddingHorizontal: espaces.md, paddingVertical: espaces.lg,
                      borderRadius: rayons.carte,
                      borderWidth: 1,
                      borderColor: pressed ? couleurs.encrePale : couleurs.trait,
                      backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                    })}
                  >
                    <Icone nom={g.icone} taille={18} couleur={couleurs.encreDouce} />
                    <Texte poids="moyen" numberOfLines={1} style={{ flex: 1 }}>
                      {g.label}
                    </Texte>
                  </Pressable>
                ))}
              </View>
            </View>
          </Entree>
        ) : null}

        {/* Les derniers SMS — comme une boîte de réception. */}
        {derniers.length ? (
          <Entree delai={240}>
            <View style={{ gap: espaces.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Texte taille={textes.intertitre} poids="demi" style={{ flex: 1 }}>
                  {t.derniersSms}
                </Texte>
                <Pressable onPress={() => router.push("/encaissements")} hitSlop={8}
                           style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
                  <Texte taille={textes.petit} ton="doux">{t.toutVoir}</Texte>
                  <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
                </Pressable>
              </View>
              <Carte>
                {derniers.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 ? <Filet /> : null}
                    <LigneSms paiement={p} langue={langue} />
                  </View>
                ))}
              </Carte>
            </View>
          </Entree>
        ) : null}

        {/* Le terminal. */}
        {donnees?.terminal ? (
          <Entree delai={300}>
            <View style={{ gap: espaces.sm }}>
              <Texte taille={textes.intertitre} poids="demi">{t.terminal}</Texte>
              <Carte style={{ padding: espaces.lg, gap: espaces.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                  <Pastille vif={donnees.terminal.enLigne} />
                  <Texte>{donnees.terminal.enLigne ? t.enLigne : t.muet}</Texte>
                  <Texte taille={textes.petit} ton="pale" chiffresAlignes
                         style={{ marginLeft: "auto" }}>
                    {donnees.terminal.majTexte}
                  </Texte>
                </View>
                {donnees.terminal.sante ? (
                  <>
                    <Filet />
                    <Texte taille={textes.petit} ton="doux">{donnees.terminal.sante}</Texte>
                  </>
                ) : null}
              </Carte>
            </View>
          </Entree>
        ) : null}
      </ScrollView>

      {operation ? (
        <OperationPopup operation={operation}
                        onFermer={() => setOperation(null)}
                        onTermine={recharger} />
      ) : null}
    </SafeAreaView>
  );
}

/** Une ligne de la boîte de réception : la pastille de nature, le nom,
 *  le montant. Le SMS lui-même reste lisible en dessous. */
function LigneSms({ paiement: p, langue }: { paiement: Paiement; langue: "en" | "fr" }) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  // La pastille dit la NATURE d'un coup d'œil, avant même de lire.
  const fond = entree ? "#e7f5ec" : p.categorie === "publicite" ? "#fdf3d6" : couleurs.surface2;
  const icone: NomIcone = entree ? "ArrowDown"
    : sortie ? "ArrowUp"
    : p.categorie === "publicite" ? "Megaphone" : "Bubble";
  const teinte = entree ? couleurs.positif
    : p.categorie === "publicite" ? couleurs.alerte : couleurs.encreDouce;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md,
                   padding: espaces.lg }}>
      <View style={{
        width: 36, height: 36, borderRadius: rayons.petit,
        backgroundColor: fond, alignItems: "center", justifyContent: "center",
      }}>
        <Icone nom={icone} taille={16} couleur={teinte} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          {p.nonLu ? (
            <View style={{ width: 6, height: 6, borderRadius: rayons.rond,
                           backgroundColor: couleurs.accent }} />
          ) : null}
          <Texte poids={p.nonLu ? "demi" : "moyen"} numberOfLines={1} style={{ flex: 1 }}>
            {p.tiers || p.nom}
          </Texte>
        </View>
        <Texte taille={textes.petit} ton="pale" numberOfLines={1}>
          {p.sim} · {p.heure} · {p.smsBrut}
        </Texte>
      </View>

      {p.montant != null ? (
        <Texte poids="demi" chiffresAlignes taille={textes.petit}
               ton={entree ? "positif" : sortie ? "negatif" : "doux"}>
          {entree ? "+" : sortie ? "−" : ""}{fcfa(p.montant, langue)}
        </Texte>
      ) : null}
    </View>
  );
}
