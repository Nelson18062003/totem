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
//
// QUAND LE BOÎTIER SE TAIT, ON LE DIT AVANT DE COMPOSER. Sans cela, on tapait
// un code, « le terminal compose… » tournait trente secondes, puis « le
// terminal n'a pas répondu — est-il allumé ? ». Une attente pour apprendre
// ce que l'écran savait déjà : la plateforme avait dit, au dernier passage,
// que le boîtier ne donnait plus de nouvelles. Composer ouvre maintenant
// l'explication au lieu de déposer une demande qu'il exécuterait à son
// retour, des heures plus tard.
//
// ET ON LE DIT À LA PLACE DU CHAMP, PAS AU-DESSUS. Un premier jet posait un
// bandeau en tête, de cent points : il apparaissait et disparaissait au gré
// des relectures silencieuses, et tout le catalogue descendait puis remontait
// d'autant — un appui visé sur une rangée tombait sur la suivante et
// composait un autre code. L'état se dit maintenant dans la rangée du champ,
// à hauteur fixe : le catalogue ne bouge plus, quoi qu'il arrive au boîtier.

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Pressable, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { useMargeDuBas, ChampTexte, Defilement, Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui } from "@/ui";
import { Squelette } from "@/animations";
import { Icone } from "@/icones";
import { carteRetiree } from "@/reglages-cartes";
import { OperationPopup, type Operation } from "@/operation";
import { carteEnPause, FicheTerminalHorsLigne, silenceDepuis } from "@/terminal-hors-ligne";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { aDesVariables, codesUssd } from "@noyau/codes";
import { textesUssd } from "@noyau/textes/ussd";
import { textesAccueil } from "@noyau/textes/accueil";
import { FUSEAU_DEFAUT } from "@noyau/types";

/** La rangée du cadran — le champ et « Composer », ou l'état du boîtier qui
 *  se tait — a une hauteur FIXE : l'une prend la place de l'autre sans que
 *  rien, dessous, ne bouge. Assez pour le champ sous le plus grand texte
 *  permis (16 × 1,35, et ses marges). */
const HAUTEUR_CADRAN = 54;

export default function CadranUssd() {
  // La barre de navigation d'Android couvrait la dernière ligne du catalogue.
  const margeBas = useMargeDuBas();
  const langue = useLangue();
  const t = textesUssd[langue];
  const { donnees, attente, erreur, recharger, actualiser, duCahier } =
    useDonnees({ sms: 0, recus: 0 });
  const maintenant = useMaintenant();
  // Tirer pour revérifier : la fiche « hors ligne » le dit, il faut que le
  // geste existe aussi ici.
  const roue = useRoue();
  const [ficheTerminal, setFicheTerminal] = useState(false);

  // Une carte dont le boîtier se tait reste au cadran : on ne la SAIT pas
  // retirée, et la retirer ferait dire « aucune carte » à un écran dont le
  // seul souci est un boîtier muet.
  const cartes = (donnees?.sims ?? []).filter((s) => !carteRetiree(s));
  // Arriver depuis l'accueil, c'est arriver SUR la carte qu'on y regardait :
  // le bouton « Code USSD » passe son ICCID.
  const { carte: demandee } = useLocalSearchParams<{ carte?: string }>();
  const [choisie, setChoisie] = useState<string | null>(
    typeof demandee === "string" ? demandee : null);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [saisie, setSaisie] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);

  const raccourcis = carte ? (donnees?.raccourcis?.[carte.operateur] ?? []) : [];
  const catalogue = carte ? (codesUssd[carte.operateur] ?? []) : [];
  // LE BOÎTIER SE TAIT — d'après la plateforme à son dernier passage, ou
  // d'après la carte elle-même, dont on ne sait plus rien. La même règle que
  // l'accueil et les Opérations (`terminal-hors-ligne.tsx`) : un écran qui
  // dirait autre chose qu'eux serait cru à tort.
  // Seulement si le boîtier QUI PORTE cette carte se tait — et la fiche
  // donne SON heure, jamais celle d'un autre boîtier (voir `carteEnPause`).
  const seTait = carteEnPause(donnees, duCahier, carte);
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;
  const depuisSilence = silenceDepuis(donnees, duCahier, carte);
  // « Revérifier » a parlé, et le boîtier est revenu : la fiche se referme.
  useEffect(() => { if (ficheTerminal && !seTait) setFicheTerminal(false); }, [ficheTerminal, seTait]);
  const expliquer = () => { setFicheTerminal(true); actualiser(); };

  // Composer, c'est ouvrir la MÊME session que les gestes du guichet :
  // l'ICCID voyage avec le code, le robot compose sur CETTE carte.
  const ouvrir = (titre: string, etapes: string[]) => {
    if (!carte || !etapes.length) return;
    // Rien ne part vers un boîtier muet : on explique, au lieu de laisser
    // trente secondes de « le terminal compose… » pour finir en échec.
    if (seTait) { expliquer(); return; }
    setOperation({
      titre, code: etapes[0], etapes, champs: [],
      carte: carte.iccid, terminal: donnees?.terminal?.id ?? null,
      carteLibelle: carte.libelle, operateur: carte.operateur,
    });
  };

  const composer = () => {
    const code = saisie.trim();
    if (!code) return;
    // Le code tapé reste dans le champ : au retour du boîtier, un appui suffit.
    if (seTait) { expliquer(); return; }
    setSaisie("");
    ouvrir(code, [code]);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      {/* Bord à bord : le clavier ne pousse rien tout seul (voir
          feuille.tsx). Le cadran vit en haut, mais un téléphone couché n'a
          que quelques lignes au-dessus du clavier. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Defilement refreshControl={roue}
                  contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg,
                                           paddingBottom: margeBas }}
                  keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
          <BoutonIcone nom="Chevron" etiquette={t.fermerEcran}
                       onPress={() => router.back()}
                       style={{ transform: [{ rotate: "180deg" }] }} />
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </View>

        {/* Le chargement ne s'annonce pas comme une panne : au premier rendu
            `donnees` est nul, et cet écran déclarait « Aucune carte dans le
            terminal » le temps de la requête, à chaque ouverture. Il montre
            maintenant la forme du cadran. Et un boîtier qui se tait n'a pas
            « aucune carte » : il ne dit plus rien — la rangée du cadran dit
            pourquoi. */}
        {erreur ? (
          <Accroc message={erreur} onReessayer={() => void recharger()} />
        ) : !carte && attente ? (
          <>
            <Squelette hauteur={HAUTEUR_CADRAN} />
            <Carte>
              {[0, 1, 2, 3].map((i) => (
                <View key={i}>
                  {i > 0 ? <Filet /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center",
                                 padding: espaces.lg, gap: espaces.md }}>
                    <View style={{ flex: 1 }}>
                      <Squelette largeur="55%" hauteur={16} />
                    </View>
                    <Squelette largeur={56} hauteur={14} />
                  </View>
                </View>
              ))}
            </Carte>
          </>
        ) : !carte && seTait ? (
          <BoitierMuet onPress={expliquer} />
        ) : !carte ? (
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
                d'autre — ce qu'un cadran de téléphone accepte. Le boîtier se
                tait : la rangée le dit à sa place, à la même hauteur. Le
                code déjà tapé reste en mémoire : au retour du boîtier, il
                est encore là. */}
            {seTait ? (
              <BoitierMuet onPress={expliquer} />
            ) : (
              <View style={{ flexDirection: "row", gap: espaces.sm, height: HAUTEUR_CADRAN }}>
                <View style={{
                  flex: 1, flexDirection: "row", alignItems: "center", gap: espaces.sm,
                  borderWidth: 1, borderColor: couleurs.trait,
                  borderRadius: rayons.bouton, paddingHorizontal: espaces.md,
                  backgroundColor: couleurs.surfaceHaute,
                }}>
                  <Icone nom="Hash" taille={16} couleur={couleurs.encrePale} />
                  <ChampTexte
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
            )}

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
      </Defilement>
      </KeyboardAvoidingView>

      {operation ? (
        <OperationPopup operation={operation} onFermer={() => setOperation(null)}
                        // Un code a pu changer le solde : on relit EN SILENCE,
                        // et encore trois fois pour attraper le SMS de
                        // l'opérateur, qui arrive quelques secondes après.
                        onTermine={() => actualiser({ suivi: true })}
                        onRefus={() => actualiser()} />
      ) : null}

      {ficheTerminal ? (
        <FicheTerminalHorsLigne vuLe={depuisSilence} maintenant={maintenant}
                                fuseau={fuseau} langue={langue} onReverifier={recharger}
                                onFermer={() => setFicheTerminal(false)} />
      ) : null}
    </SafeAreaView>
  );
}

/** Le boîtier se tait — dit dans la rangée du cadran, à sa hauteur exacte.
 *  Une ligne, jamais deux : le libellé se resserre plutôt que de pousser le
 *  catalogue. L'appui ouvre l'explication. */
function BoitierMuet({ onPress }: { onPress: () => void }) {
  const ta = textesAccueil[useLangue()];
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
               accessibilityHint={ta.horsLigneVoir}
               style={avecAppui({
                 height: HAUTEUR_CADRAN,
                 flexDirection: "row", alignItems: "center", gap: espaces.md,
                 paddingHorizontal: espaces.lg, borderRadius: rayons.bouton,
                 borderWidth: 1, borderColor: couleurs.alerte,
                 backgroundColor: couleurs.surfaceHaute,
               })}>
      <View style={{ width: 10, height: 10, borderRadius: 5,
                     backgroundColor: couleurs.alerte }} />
      <Texte poids="demi" ton="alerte" numberOfLines={1}
             adjustsFontSizeToFit minimumFontScale={0.7} style={{ flex: 1 }}>
        {ta.terminalMuetCourt}
      </Texte>
      <Icone nom="Chevron" taille={14} couleur={couleurs.alerte} />
    </Pressable>
  );
}
