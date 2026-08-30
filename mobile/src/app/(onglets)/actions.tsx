// Le guichet : les gestes, sur la carte choisie.
//
// Le pendant mobile de `web/app/actions/guichet.tsx`. Les codes viennent du
// catalogue relevé sur le terrain et des boutons appris par le robot
// (`@noyau/codes`) — jamais devinés : deviner des chiffres qui déplacent de
// l'argent serait irresponsable. Un geste sans code connu ne s'affiche pas.

import { useState } from "react";
import { RefreshControl, ScrollView, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Carte, Filet, Texte } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { OperationPopup, type ChampOperation, type Operation } from "@/operation";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesUssd } from "@noyau/textes/ussd";

export default function Actions() {
  const langue = useLangue();
  const t = textesGuichet[langue];
  const tu = textesUssd[langue];
  const { donnees, chargement, recharger } = useDonnees({ sms: 0, recus: 0 });

  const [operation, setOperation] = useState<Operation | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);

  const cartes = (donnees?.sims ?? []).filter((s) => s.enPlace);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const raccourcis = donnees?.raccourcis ?? {};

  if (!carte) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}
          refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger} />}
        >
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
            <Texte poids="demi">{t.aucuneCarte}</Texte>
            <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucuneCarteDetail}
            </Texte>
          </Carte>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const op = carte.operateur;

  // Le bouton défini par le propriétaire d'abord, sinon le catalogue, sinon
  // la porte du menu de l'opérateur.
  const operationDe = (cle: string, titre: string, champs: ChampOperation[]): Operation => {
    const et = etapesGeste(op, cle, raccourcis[op] ?? []);
    return {
      titre, code: et[0] ?? "", etapes: et, champs,
      carte: carte.iccid, terminal: donnees?.terminal?.id ?? null,
    };
  };

  type Geste = { titre: string; sous?: string; icone: NomIcone; fabrique: () => Operation };

  // Le tableau est typé AVANT le filtre : sans cela, TypeScript élargit
  // « icone » en simple chaîne et ne vérifie plus qu'elle existe au jeu.
  const tousLesGestes: Geste[] = [
    {
      titre: t.depot, sous: t.depotSous, icone: "ArrowDown",
      fabrique: () => operationDe("depot", t.depotTitre, [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      titre: t.retrait, sous: t.retraitSous, icone: "Wallet",
      fabrique: () => operationDe("retrait", t.retraitTitre, [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      titre: t.transfert, sous: t.transfertSous, icone: "ArrowUp",
      fabrique: () => operationDe("transfert", t.transfertTitre, [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleCinquanteMille, type: "montant" },
      ]),
    },
    // Un geste dont on ne connaît pas le code ne s'affiche PAS : un bouton
    // qui composerait au hasard vaut moins que pas de bouton du tout.
  ];
  const gestes = tousLesGestes.filter((g) => g.fabrique().code);

  const toutesLesConsultations: Geste[] = [
    { titre: t.consulterSolde, icone: "Refresh",
      fabrique: () => operationDe("solde", t.consulterSolde, []) },
    { titre: t.monNumero, icone: "Phone",
      fabrique: () => operationDe("mon_numero", t.monNumero, []) },
  ];
  const consultations = toutesLesConsultations.filter((c) => c.fabrique().code);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger} />}
      >
        <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>

        {/* La carte visée. Avec deux SIM en place, c'est ICI que se décide sur
            laquelle on compose — se tromper enverrait l'argent depuis la
            mauvaise caisse. */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.legende} ton="pale"
                 style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {t.carteVisee}
          </Texte>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
            {cartes.map((c) => {
              const active = c.iccid === carte.iccid;
              return (
                <Pressable
                  key={c.iccid}
                  onPress={() => setChoisie(c.iccid)}
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                    borderRadius: rayons.bouton,
                    borderWidth: active ? 0 : 1, borderColor: couleurs.trait,
                    backgroundColor: active ? couleurs.accent : couleurs.surfaceHaute,
                  }}
                >
                  <Texte taille={textes.petit} poids="moyen"
                         style={active ? { color: couleurs.surfaceHaute } : undefined}
                         ton={active ? "normal" : "doux"}>
                    {c.libelle}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        </View>

        {gestes.length === 0 ? (
          <Carte style={{ padding: espaces.lg, borderStyle: "dashed" }}>
            <Texte taille={textes.petit} ton="pale" style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucunCodeReleve(op)}
            </Texte>
          </Carte>
        ) : (
          <Carte>
            {gestes.map((g, i) => (
              <View key={g.titre}>
                {i > 0 ? <Filet /> : null}
                <Ligne titre={g.titre} sous={g.sous} icone={g.icone}
                       onPress={() => setOperation(g.fabrique())} />
              </View>
            ))}
          </Carte>
        )}

        {consultations.length ? (
          <View style={{ gap: espaces.sm }}>
            <Texte taille={textes.intertitre} poids="demi">{t.consultation}</Texte>
            <Carte>
              {consultations.map((c, i) => (
                <View key={c.titre}>
                  {i > 0 ? <Filet /> : null}
                  <Ligne titre={c.titre} icone={c.icone}
                         onPress={() => setOperation(c.fabrique())} />
                </View>
              ))}
            </Carte>
          </View>
        ) : null}

        {/* Le cadran : composer n'importe quel code, comme sur un téléphone.
            Le web l'a en page à part (« Code USSD ») ; ici il s'ouvre d'une
            ligne — c'est le geste de secours quand aucun bouton ne convient. */}
        <Carte>
          <Ligne titre={tu.titre} sous={tu.composerSous} icone="Hash"
                 onPress={() => router.push("/ussd")} />
        </Carte>
      </ScrollView>

      {operation ? (
        <OperationPopup
          operation={operation}
          onFermer={() => setOperation(null)}
          // Une session aboutie a pu changer le solde : on relit.
          onTermine={recharger}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Ligne({ titre, sous, icone, onPress }: {
  titre: string; sous?: string; icone: NomIcone; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: espaces.md,
        padding: espaces.lg,
        backgroundColor: pressed ? couleurs.surface2 : "transparent",
      })}
    >
      <View style={{
        width: 40, height: 40, borderRadius: rayons.rond,
        borderWidth: 1, borderColor: couleurs.trait,
        alignItems: "center", justifyContent: "center",
      }}>
        <Icone nom={icone} taille={18} couleur={couleurs.encreDouce} />
      </View>
      <View style={{ flex: 1 }}>
        <Texte poids="moyen">{titre}</Texte>
        {sous ? <Texte taille={textes.petit} ton="pale">{sous}</Texte> : null}
      </View>
      <Icone nom="Chevron" taille={18} couleur={couleurs.encrePale} />
    </Pressable>
  );
}
