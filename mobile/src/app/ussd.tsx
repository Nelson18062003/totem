// Le cadran USSD : composer un code comme sur un téléphone.
//
// Le pendant mobile de `web/app/ussd/console.tsx`, à une différence près :
// ici la session elle-même vit dans `OperationPopup` — le même écran qui
// conduit les gestes du guichet, avec ses règles (le pavé pour le code
// secret, la confirmation avant de raccrocher). Cet écran-ci n'est que le
// CADRAN : la carte visée, le champ où composer, le catalogue relevé sur le
// terrain, et les boutons appris par le robot.
//
// RANGÉ, ET NON PLUS RÉPÉTÉ. Le cadran montrait le champ « *126# », puis
// une rangée « Menu *126# » qui le répétait, puis « VOS BOUTONS » : Solde,
// Depot, Retrait, Transfert — chacun affichant « *126# ». On ne savait pas
// ce que faisait chaque bouton (ils commencent tous par le même menu), ni
// ce qu'était un code USSD. Maintenant : une phrase qui le dit, la carte
// (les puces de l'accueil, le MÊME choix), le cadran, puis « Raccourcis » —
// le menu de l'opérateur et les raccourcis personnels, chacun avec son
// TRAJET entier (« *126# › 1 › [numéro] »). Les gestes du guichet (dépôt,
// retrait…) ne sont plus listés ici : ce sont les tuiles d'Opérations, qui
// jouent déjà le raccourci appris ; leurs codes se règlent aux Réglages.
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

import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import {
  useMargeDuBas, ChampTexte, Defilement, Accroc, BoutonIcone, Carte, Filet, LigneAction, Texte,
  avecAppui,
} from "@/ui";
import { Squelette } from "@/animations";
import { Icone } from "@/icones";
import { carteRetiree } from "@/reglages-cartes";
import { cartesAMontrer, choisirCarte, useCarteChoisie } from "@/carte-choisie";
import { ChoixDeLaCarte } from "@/puces-cartes";
import { OperationPopup, type ChampOperation, type Operation } from "@/operation";
import { carteEnPause, FicheTerminalHorsLigne, silenceDepuis } from "@/terminal-hors-ligne";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { AjouterMaCarteCourt } from "@/ajouter-ma-carte";
import { CLES_GUICHET, etapesGeste, variablesDe } from "@noyau/codes";
import { textesUssd } from "@noyau/textes/ussd";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesGuichet } from "@noyau/textes/guichet";
import { FUSEAU_DEFAUT } from "@noyau/types";

/** La rangée du cadran — le champ et « Composer », ou l'état du boîtier qui
 *  se tait — a une hauteur FIXE : l'une prend la place de l'autre sans que
 *  rien, dessous, ne bouge. Assez pour le champ sous le plus grand texte
 *  permis (18 × 1,35, et ses marges). */
const HAUTEUR_CADRAN = 54;

/** Le nom du service d'argent de l'opérateur, pour « Ouvrir le menu … ». */
function service(operateur: string): string {
  const o = operateur.toUpperCase();
  if (o.startsWith("ORANGE")) return "Orange Money";
  if (o.startsWith("MTN")) return "MoMo";
  return operateur;
}

export default function CadranUssd() {
  // La barre de navigation d'Android couvrait la dernière ligne du catalogue.
  const margeBas = useMargeDuBas();
  const langue = useLangue();
  const t = textesUssd[langue];
  const tg = textesGuichet[langue];
  const { donnees, attente, erreur, recharger, actualiser, duCahier } =
    useDonnees({ sms: 0, recus: 0 });
  const maintenant = useMaintenant();
  // Tirer pour revérifier : la fiche « hors ligne » le dit, il faut que le
  // geste existe aussi ici.
  const roue = useRoue();
  const [ficheTerminal, setFicheTerminal] = useState(false);

  // LA MÊME RÈGLE DE CARTES QU'OPÉRATIONS : toutes, sauf celles qu'on SAIT
  // retirées. Une carte dont le boîtier se tait reste au cadran : la
  // retirer ferait dire « aucune carte » à un écran dont le seul souci est
  // un boîtier muet.
  const cartes = cartesAMontrer(donnees?.sims ?? []).filter((s) => !carteRetiree(s));
  // Arriver depuis l'accueil ou Opérations, c'est arriver SUR la carte
  // qu'on y regardait — et le choix fait ICI se retrouve là-bas : un seul
  // choix pour les trois écrans (`carte-choisie.ts`). Le cadran gardait le
  // sien, et l'on composait sur l'Orange après avoir choisi la MTN.
  const { carte: demandee } = useLocalSearchParams<{ carte?: string }>();
  const choisie = useCarteChoisie();
  const demandeLue = useRef(false);
  useEffect(() => {
    if (demandeLue.current || typeof demandee !== "string") return;
    if (!cartes.some((c) => c.iccid === demandee)) return;
    demandeLue.current = true;
    choisirCarte(demandee);
  }, [demandee, cartes]);
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [saisie, setSaisie] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);

  const appris = carte ? (donnees?.raccourcis?.[carte.operateur] ?? []) : [];
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
  // l'ICCID voyage avec le code, le robot compose sur CETTE carte. Un
  // raccourci à trous pose d'abord ses questions (`champs`), puis les
  // remplit — il était grisé ici, « lancez-le depuis Opérations ».
  const ouvrir = (titre: string, etapes: string[], champs: ChampOperation[] = []) => {
    if (!carte || !etapes.length) return;
    // Rien ne part vers un boîtier muet : on explique, au lieu de laisser
    // trente secondes de « le terminal compose… » pour finir en échec.
    if (seTait) { expliquer(); return; }
    setOperation({
      titre, icone: "Hash", code: etapes[0], etapes, champs,
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
    ouvrir(t.titreCode(code), [code]);
  };

  /** Les questions qu'un raccourci à trous pose avant de composer. */
  const champsDe = (etapes: string[]): ChampOperation[] =>
    variablesDe(etapes).map((v): ChampOperation => (
      v === "montant"
        ? { cle: "montant", label: tg.montantFcfa, aide: tg.exempleVingtMille, type: "montant" }
        : v === "point"
          ? { cle: "point", label: tg.numeroAgent, aide: "650 00 00 00", type: "numero" }
          : { cle: v, label: tg.champNumero, aide: "699 12 34 56", type: "numero" }));

  const menu = carte ? etapesGeste(carte.operateur, "menu", appris) : [];
  const exemple = menu[0] ?? "#148#";
  // Les raccourcis PERSONNELS seulement : ceux du guichet (dépôt, retrait,
  // solde…) sont les tuiles d'Opérations — les relister ici, c'était quatre
  // rangées « *126# » qu'on ne distinguait pas.
  const personnels = appris.filter(
    (r) => r.etapes.length && !(CLES_GUICHET as readonly string[]).includes(r.nom));

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
        <View style={{ gap: espaces.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md }}>
            <BoutonIcone nom="Chevron" etiquette={t.fermerEcran}
                         onPress={() => router.back()}
                         style={{ transform: [{ rotate: "180deg" }] }} />
            <Texte taille={textes.titre} poids="demi" accessibilityRole="header">{t.titre}</Texte>
          </View>
          {/* LA SEULE EXPLICATION DE L'ÉCRAN : ce qu'est un code USSD, pour
              qui n'en a jamais tapé — et que la réponse revient ICI. */}
          <Texte taille={textes.petit} ton="doux" style={{ lineHeight: 20 }}>
            {t.explication}
          </Texte>
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
        ) : !carte && donnees?.proprietaire === false && !(donnees.sims ?? []).length ? (
          // Un compte sans carte n'a pas de boîtier : ni « muet », ni
          // « aucune carte dans le terminal » — le chemin pour en ajouter une.
          <AjouterMaCarteCourt langue={langue} />
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
            {/* La carte du cadran. Se tromper composerait sur la mauvaise
                caisse — le choix se voit avant de taper. */}
            <ChoixDeLaCarte cartes={cartes} active={carte} langue={langue} marge={espaces.lg} />

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
                    placeholder={t.exempleCodeCourt(exemple)}
                    placeholderTextColor={couleurs.encrePale}
                    onSubmitEditing={composer}
                    accessibilityLabel={t.exempleCode(exemple)}
                    style={{
                      flex: 1, minWidth: 0, paddingVertical: espaces.md,
                      fontFamily: polices.corps, fontSize: saisie ? 18 : 15,
                      fontVariant: ["tabular-nums"],
                      color: couleurs.encre,
                    }}
                  />
                </View>
                {/* « Composer » ne change jamais de libellé, donc jamais de
                    largeur. Vide, il est GRIS — pas à demi transparent :
                    l'ancien bouton pâli faisait croire à une panne. */}
                <Pressable
                  accessibilityRole="button" onPress={composer} disabled={!saisie.trim()}
                  accessibilityState={{ disabled: !saisie.trim() }}
                  style={({ pressed }) => ({
                    minWidth: 96, alignItems: "center",
                    justifyContent: "center", paddingHorizontal: espaces.lg,
                    borderRadius: rayons.bouton,
                    backgroundColor: !saisie.trim() ? couleurs.surface3
                      : pressed ? couleurs.accentAppui : couleurs.accent,
                  })}>
                  <Texte poids="demi" taille={textes.petit}
                         style={{ color: saisie.trim() ? couleurs.surfaceHaute : couleurs.encreDouce }}>
                    {t.composer}
                  </Texte>
                </Pressable>
              </View>
            )}

            {/* LES RACCOURCIS : le menu de l'opérateur, puis les raccourcis
                personnels — chacun avec son TRAJET entier, pas seulement le
                premier code, qui est le même pour tous. */}
            {menu.length || personnels.length ? (
              <View style={{ gap: espaces.sm }}>
                <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
                  {t.raccourcis}
                </Texte>
                <Carte>
                  {menu.length ? (
                    <RangeeRaccourci titre={t.ouvrirMenu(service(carte.operateur))}
                                     trajet={t.trajet(menu)} enPause={seTait}
                                     onPress={() => ouvrir(t.ouvrirMenu(service(carte.operateur)),
                                                           menu)} />
                  ) : null}
                  {personnels.map((r, i) => {
                    const trous = variablesDe(r.etapes);
                    const nom = r.libelle || r.nom;
                    return (
                      <View key={r.nom}>
                        {i > 0 || menu.length ? <Filet /> : null}
                        <RangeeRaccourci titre={nom} trajet={t.trajet(r.etapes)}
                                         enPause={seTait}
                                         demande={trous.length ? t.demandeUneValeur(trous) : undefined}
                                         onPress={() => ouvrir(nom, r.etapes, champsDe(r.etapes))} />
                      </View>
                    );
                  })}
                </Carte>
              </View>
            ) : null}

            {/* Le pied : le code secret ne passe jamais par ce champ, et les
                codes des boutons se règlent ailleurs — au propriétaire. */}
            <View style={{ gap: espaces.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm,
                             paddingHorizontal: espaces.xs }}>
                <Icone nom="Lock" taille={14} couleur={couleurs.encrePale} />
                <Texte taille={textes.legende} ton="pale" style={{ flex: 1, lineHeight: 16 }}>
                  {t.noteCodeSecret}
                </Texte>
              </View>
              {donnees?.proprietaire !== false ? (
                <Carte>
                  <LigneAction discret titre={t.reglerCodes} icone="Settings"
                               onPress={() => router.push("/reglages")} />
                </Carte>
              ) : null}
            </View>
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
                                onFermer={() => setFicheTerminal(false)}
                                chezTotem={donnees?.proprietaire === false} />
      ) : null}
    </SafeAreaView>
  );
}

/** Un raccourci : son nom, et dessous son trajet entier, pâle — une liste,
 *  il peut se couper. Un raccourci à trous dit ce qu'il va demander. */
function RangeeRaccourci({ titre, trajet, demande, enPause, onPress }: {
  titre: string; trajet: string; demande?: string; enPause: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={titre} accessibilityHint={trajet}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: espaces.md,
        paddingHorizontal: espaces.lg, paddingVertical: espaces.md + 2,
        opacity: enPause ? 0.45 : 1,
        backgroundColor: pressed ? couleurs.surface2 : "transparent",
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Texte poids="moyen">{titre}</Texte>
        <Texte taille={textes.legende} ton="pale" chiffresAlignes numberOfLines={1}>
          {trajet}
        </Texte>
      </View>
      {demande ? (
        <View style={{ paddingHorizontal: espaces.sm, paddingVertical: 2,
                       borderRadius: rayons.rond, backgroundColor: couleurs.surface2,
                       maxWidth: "45%" }}>
          <Texte taille={textes.legende} ton="doux" numberOfLines={1}>{demande}</Texte>
        </View>
      ) : null}
      <Icone nom="Chevron" taille={16} couleur={couleurs.encrePale} />
    </Pressable>
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
