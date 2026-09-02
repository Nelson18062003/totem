// Le cadran USSD : composer un code comme sur un téléphone.
//
// Le pendant mobile de `web/app/ussd/console.tsx`, à une différence près :
// ici la session elle-même vit dans `OperationPopup` — le même écran qui
// conduit les gestes du guichet, avec ses règles (le pavé pour le code
// secret, la confirmation avant de raccrocher). Cet écran-ci n'est que le
// CADRAN : la carte visée, le champ où composer, le catalogue relevé sur le
// terrain, et les boutons appris par le robot.
//
// Rien n'est simulé : chaque code part dans la base, le terminal de Douala
// le tape sur la carte, et la réponse de l'opérateur revient telle quelle.

import { useState } from "react";
import {
  KeyboardAvoidingView, Pressable, ScrollView, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui } from "@/ui";
import { Icone } from "@/icones";
import { OperationPopup, type Operation } from "@/operation";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { aDesVariables, codesUssd } from "@noyau/codes";
import { textesUssd } from "@noyau/textes/ussd";

export default function CadranUssd() {
  const langue = useLangue();
  const t = textesUssd[langue];
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 0, recus: 0 });

  const cartes = (donnees?.sims ?? []).filter((s) => s.enPlace);
  const [choisie, setChoisie] = useState<string | null>(null);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [saisie, setSaisie] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);

  const raccourcis = carte ? (donnees?.raccourcis?.[carte.operateur] ?? []) : [];
  const catalogue = carte ? (codesUssd[carte.operateur] ?? []) : [];

  // Composer, c'est ouvrir la MÊME session que les gestes du guichet :
  // l'ICCID voyage avec le code, le robot compose sur CETTE carte.
  const ouvrir = (titre: string, etapes: string[]) => {
    if (!carte || !etapes.length) return;
    setOperation({
      titre, code: etapes[0], etapes, champs: [],
      carte: carte.iccid, terminal: donnees?.terminal?.id ?? null,
    });
  };

  const composer = () => {
    const code = saisie.trim();
    if (!code) return;
    setSaisie("");
    ouvrir(code, [code]);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      {/* Bord à bord : le clavier ne pousse rien tout seul (voir
          feuille.tsx). Le cadran vit en haut, mais un téléphone couché n'a
          que quelques lignes au-dessus du clavier. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg }}
                  keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <BoutonIcone nom="Chevron" etiquette={t.fermerEcran}
                       onPress={() => router.back()}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </View>

        {/* Le chargement ne s'annonce pas comme une panne : au premier rendu
            `donnees` est nul, et cet écran déclarait « Aucune carte dans le
            terminal » le temps de la requête, à chaque ouverture. */}
        {erreur && !carte ? (
          <Accroc message={erreur} onReessayer={recharger} />
        ) : !carte && chargement ? null : !carte ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                          borderStyle: "dashed" }}>
            <Texte poids="demi">{t.aucuneCarte}</Texte>
            <Texte ton="doux" taille={textes.petit}
                   style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucuneCarteDetail}
            </Texte>
          </Carte>
        ) : (
          <>
            {/* Pas de mode d'emploi : les pastilles disent la carte, le champ
                dit le geste. Un cadran de téléphone ne s'explique pas. */}
            {/* La carte du cadran. Se tromper composerait sur la mauvaise
                caisse — le choix se voit avant de taper. */}
            {cartes.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.sm }}>
                {cartes.map((c) => {
                  const active = c.iccid === carte.iccid;
                  return (
                    <Pressable
                               accessibilityRole="button" key={c.iccid} onPress={() => setChoisie(c.iccid)}
                               accessibilityState={{ selected: active }}
                               style={avecAppui({
                                 paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                                 borderRadius: rayons.bouton,
                                 borderWidth: active ? 0 : 1, borderColor: couleurs.trait,
                                 backgroundColor: active ? couleurs.accent : couleurs.surfaceHaute,
                               })}>
                      <Texte taille={textes.petit} poids="moyen"
                             style={active ? { color: couleurs.surfaceHaute } : undefined}
                             ton={active ? "normal" : "doux"}>
                        {c.libelle}
                      </Texte>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Le champ du cadran : des chiffres, « * » et « # », rien
                d'autre — ce qu'un cadran de téléphone accepte. */}
            <View style={{ flexDirection: "row", gap: espaces.sm }}>
              <View style={{
                flex: 1, flexDirection: "row", alignItems: "center", gap: espaces.sm,
                borderWidth: 1, borderColor: couleurs.trait,
                borderRadius: rayons.bouton, paddingHorizontal: espaces.md,
                backgroundColor: couleurs.surfaceHaute,
              }}>
                <Icone nom="Hash" taille={16} couleur={couleurs.encrePale} />
                <TextInput
                  value={saisie}
                  onChangeText={(v) => setSaisie(v.replace(/[^0-9#*]/g, ""))}
                  keyboardType="phone-pad"
                  placeholder={catalogue[0]?.code ?? "#148#"}
                  placeholderTextColor={couleurs.encrePale}
                  onSubmitEditing={composer}
                  style={{
                    flex: 1, paddingVertical: espaces.md,
                    fontFamily: polices.corps, fontSize: 16,
                    color: couleurs.encre,
                  }}
                />
              </View>
              <Pressable
                         accessibilityRole="button" onPress={composer} disabled={!saisie.trim()}
                         style={({ pressed }) => ({
                           justifyContent: "center", paddingHorizontal: espaces.lg,
                           borderRadius: rayons.bouton,
                           backgroundColor: pressed ? couleurs.accentAppui : couleurs.accent,
                           opacity: saisie.trim() ? 1 : 0.35,
                         })}>
                <Texte poids="demi" taille={textes.petit}
                       style={{ color: couleurs.surfaceHaute }}>
                  {t.composer}
                </Texte>
              </Pressable>
            </View>

            {/* Le catalogue relevé sur le terrain : un code par ligne,
                taillé pour le pouce. Le libellé suit la langue ; le code,
                jamais. */}
            {catalogue.length ? (
              <Carte>
                {catalogue.map((c, i) => (
                  <View key={c.code}>
                    {i > 0 ? <Filet /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => ouvrir(t.libelleCode(c.cle, c.libelle), [c.code])}
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center", gap: espaces.md,
                        padding: espaces.lg,
                        backgroundColor: pressed ? couleurs.surface2 : "transparent",
                      })}>
                      <Texte poids="moyen" style={{ flex: 1 }}>
                        {t.libelleCode(c.cle, c.libelle)}
                      </Texte>
                      <Texte taille={textes.petit} ton="pale" chiffresAlignes>
                        {c.code}
                      </Texte>
                    </Pressable>
                  </View>
                ))}
              </Carte>
            ) : null}

            {/* Les boutons appris par le robot — le même carnet que Telegram.
                Un bouton à trous (« {numero} ») ne se rejoue pas d'ici : ce
                cadran ne demande rien avant de composer, et un trou parti tel
                quel au réseau est un code faux. Il se lance depuis
                Opérations, qui pose les questions d'abord. */}
            {raccourcis.length ? (
              <View style={{ gap: espaces.sm }}>
                <Texte taille={textes.legende} ton="pale"
                       style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                  {t.boutonsAppris}
                </Texte>
                <Carte>
                  {raccourcis.map((r, i) => {
                    const aTrous = aDesVariables(r.etapes);
                    return (
                      <View key={r.nom}>
                        {i > 0 ? <Filet /> : null}
                        <Pressable
                          accessibilityRole="button"
                          disabled={aTrous}
                          onPress={() => ouvrir(r.libelle || r.nom, r.etapes)}
                          style={({ pressed }) => ({
                            padding: espaces.lg, gap: 2,
                            opacity: aTrous ? 0.45 : 1,
                            backgroundColor: pressed ? couleurs.surface2 : "transparent",
                          })}>
                          <Texte poids="moyen">{r.libelle || r.nom}</Texte>
                          <Texte taille={textes.legende} ton="pale" chiffresAlignes
                                 numberOfLines={1}>
                            {aTrous ? t.boutonAVariables : r.etapes[0]}
                          </Texte>
                        </Pressable>
                      </View>
                    );
                  })}
                </Carte>
              </View>
            ) : null}

          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {operation ? (
        <OperationPopup operation={operation} onFermer={() => setOperation(null)} />
      ) : null}
    </SafeAreaView>
  );
}
