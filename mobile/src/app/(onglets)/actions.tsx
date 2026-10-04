// L'onglet Opérations : les gestes, sur la carte choisie.
//
// Le pendant mobile de `web/app/actions/guichet.tsx`. Les codes viennent du
// catalogue relevé sur le terrain et des boutons appris par le robot
// (`@noyau/codes`) — jamais devinés : deviner des chiffres qui déplacent de
// l'argent serait irresponsable. Un geste sans code connu ne s'affiche pas.
//
// RANGÉ, ET NON PLUS ÉTALÉ. Le propriétaire : « c'est éclaté, mal organisé,
// il y a trop d'informations, ça manque de structuration ». L'écran posait
// neuf rangées presque identiques — mêmes ronds, mêmes chevrons, une phrase
// sous chacune —, si bien qu'un DÉPÔT avait exactement le poids de « Mon
// numéro » ; et une étiquette en capitales (« CARTE DES OPÉRATIONS ») qui
// se lisait comme un réglage. De haut en bas, maintenant :
//
//   — « Depuis la carte » : d'où partira l'argent (les puces de l'accueil) ;
//   — LES TROIS GESTES D'ARGENT, en tuiles pleines, sans phrase : Dépôt,
//     Retrait, Transfert — le même nom que les ronds de l'accueil ;
//   — « Consulter » : Mon solde, Mon numéro, en demi-tuiles plus légères ;
//   — « Outils » : Recevoir de l'argent, Bénéficiaires, Code USSD — des
//     lignes discrètes, parce qu'un outil n'est pas un geste.
//
// Ce que disaient les phrases n'est pas perdu : chaque bouton les dit encore
// à l'aide vocale (`accessibilityHint`).

import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useMargeSousLaBarre, Defilement, Accroc, Carte, Filet, LigneAction, Texte } from "@/ui";
import { Animated, useAppui, useMouvementReduit } from "@/animations";
import { AjouterMaCarteCourt } from "@/ajouter-ma-carte";
import { Coordonnees } from "@/coordonnees";
import { FeuilleReleve } from "@/releve";
import { textesReleve } from "@noyau/textes/releve";
import { cartesAMontrer, useCarteChoisie } from "@/carte-choisie";
import { ChoixDeLaCarte } from "@/puces-cartes";
import { carteRetiree } from "@/reglages-cartes";
import { SqueletteOperations } from "@/squelettes";
import {
  carteEnPause, FicheTerminalHorsLigne, PastilleHorsLigne, silenceDepuis,
} from "@/terminal-hors-ligne";
import { Icone, type NomIcone } from "@/icones";
import {
  HAUTEUR_DEMI, HAUTEUR_TUILE, HAUTEUR_TUILE_COLONNE, tuilesEnColonne,
} from "@/mesures-accueil";
import { couleurOperateur, couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { OperationPopup, type ChampOperation, type Operation } from "@/operation";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { serviceMobileMoney } from "@noyau/coordonnees";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { clientsRecents } from "@noyau/recents";
import { aQui } from "@noyau/beneficiaires";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesUssd } from "@noyau/textes/ussd";
import { FUSEAU_DEFAUT } from "@noyau/types";

type Geste = {
  cle: string; titre: string; aide: string; icone: NomIcone; fabrique: () => Operation;
};

export default function Actions() {
  // Ce que la barre d'onglets flottante recouvre — voir `useMargeSousLaBarre`.
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesGuichet[langue];
  const tu = textesUssd[langue];
  const tb = textesBeneficiaires[langue];
  const { width, fontScale } = useWindowDimensions();
  const colonne = tuilesEnColonne(width, fontScale);
  // Aucune ligne demandée : l'accueil, toujours monté, en met déjà trente
  // au cahier partagé — les clients récents se lisent là, sans que cet
  // onglet devienne un écran lourd qui ferait attendre.
  const { donnees, attente, erreur, recharger, actualiser, duCahier } =
    useDonnees({ sms: 0, recus: 0 });
  const roue = useRoue();
  const maintenant = useMaintenant();
  const [ficheTerminal, setFicheTerminal] = useState(false);

  const [operation, setOperation] = useState<Operation | null>(null);
  // LA MÊME CARTE QUE L'ACCUEIL ET LE CADRAN (`carte-choisie.ts`).
  const choisie = useCarteChoisie();
  const [coordonnees, setCoordonnees] = useState(false);
  const [releve, setReleve] = useState(false);
  const tr = textesReleve[langue];

  // LA MÊME RÈGLE DE CARTES QUE LE CADRAN : toutes, sauf celles qu'on SAIT
  // retirées. L'écran ne gardait que les cartes « en place » — et quand le
  // boîtier se taisait, il n'en restait aucune : « Aucune carte dans le
  // terminal », alors que la seule panne était un boîtier muet. Une carte
  // dont on ne sait plus rien reste là, ses gestes en pause.
  const cartes = cartesAMontrer(donnees?.sims ?? []).filter((s) => !carteRetiree(s));
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  // Le boîtier se tait : composer déposerait une demande qu'il exécuterait
  // à son retour, des heures plus tard. L'appui explique, comme sur l'accueil.
  // Seulement si le boîtier QUI PORTE cette carte se tait (`carteEnPause`).
  const seTait = carteEnPause(donnees, duCahier, carte ?? null);
  const enPause = seTait || (carte ? !carte.enPlace : false);
  const depuisSilence = silenceDepuis(donnees, duCahier, carte ?? null);
  const expliquer = () => { setFicheTerminal(true); actualiser(); };
  useEffect(() => { if (ficheTerminal && !seTait) setFicheTerminal(false); }, [ficheTerminal, seTait]);
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;
  const raccourcis = donnees?.raccourcis ?? {};

  // PAS DE CASCADE À L'ENTRÉE. Les quatre groupes entraient l'un après
  // l'autre (0, 40, 80, 120 ms, puis 260 ms chacun) — PAR-DESSUS le
  // glissement de l'onglet : la première ouverture d'Opérations durait
  // 410 ms, quand toute animation de l'application s'arrête à 280. Le
  // passage d'onglet est déjà le mouvement ; un second, dedans, se lit comme
  // un écran qui traîne. `verifier-les-transitions` mesure cette première
  // ouverture.

  // Le titre, et — quand le boîtier se tait — la pastille dans la MÊME
  // rangée, à hauteur fixe. Posée en tête de l'écran, l'alerte apparaissait
  // à la réponse de la plateforme et poussait les gestes d'argent sous le
  // doigt qui s'en approchait.
  const entete = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.md,
                   minHeight: 44 }}>
      <Texte taille={textes.titre} poids="demi" accessibilityRole="header" style={{ flex: 1 }}>
        {t.titre}
      </Texte>
      {seTait ? <PastilleHorsLigne langue={langue} onPress={expliquer} /> : null}
    </View>
  );

  if (!carte) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <Defilement
          contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg, paddingBottom: margeBas }}
          refreshControl={roue}
        >
          {entete}
          {/* La panne AVANT tout : hors ligne, « aucune carte » serait un
              mensonge. Puis LE CHARGEMENT : au premier rendu, `donnees` est
              nul — l'écran annonçait « Aucune carte dans le terminal » le
              temps de la requête, puis il ne montrait plus rien du tout. Il
              montre maintenant la forme de l'écran qui arrive. */}
          {erreur ? (
            <Accroc message={erreur} onReessayer={() => void recharger()} />
          ) : attente ? (
            <SqueletteOperations />
          ) : donnees?.proprietaire === false && !(donnees.sims ?? []).length ? (
            // Un compte sans carte : le chemin vers « Ajouter ma carte ».
            <AjouterMaCarteCourt langue={langue} />
          ) : (
            <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                            borderStyle: "dashed" }}>
              <Texte poids="demi">{t.aucuneCarte}</Texte>
              <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
                {t.aucuneCarteDetail}
              </Texte>
            </Carte>
          )}
        </Defilement>
        {ficheTerminal ? (
          <FicheTerminalHorsLigne vuLe={depuisSilence} maintenant={maintenant}
                                  fuseau={fuseau} langue={langue} onReverifier={recharger}
                                  onFermer={() => setFicheTerminal(false)}
                                  chezTotem={donnees?.proprietaire === false} />
        ) : null}
      </SafeAreaView>
    );
  }

  const op = carte.operateur;
  const appris = raccourcis[op] ?? [];

  // Le bouton défini par le propriétaire d'abord, sinon le catalogue, sinon
  // la porte du menu de l'opérateur.
  const operationDe = (cle: string, titre: string, icone: NomIcone,
                       champs: ChampOperation[]): Operation => {
    const et = etapesGeste(op, cle, appris);
    return {
      titre, icone, code: et[0] ?? "", etapes: et, champs,
      carte: carte.iccid, terminal: donnees?.terminal?.id ?? null,
      carteLibelle: carte.libelle, operateur: carte.operateur,
      recents: aQui(donnees?.beneficiaires,
                    clientsRecents(donnees?.paiements ?? [], carte.iccid), carte.iccid),
    };
  };

  // Le tableau est typé AVANT le filtre : sans cela, TypeScript élargit
  // « icone » en simple chaîne et ne vérifie plus qu'elle existe au jeu.
  // Un geste dont on ne connaît pas le code ne s'affiche PAS : un bouton
  // qui composerait au hasard vaut moins que pas de bouton du tout.
  const tousLesGestes: Geste[] = [
    {
      cle: "depot", titre: t.depot, aide: t.depotSous, icone: "ArrowDown",
      fabrique: () => operationDe("depot", t.depot, "ArrowDown", [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      cle: "retrait", titre: t.retrait, aide: t.retraitSous, icone: "Billet",
      fabrique: () => operationDe("retrait", t.retrait, "Billet", [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      cle: "transfert", titre: t.transfert, aide: t.transfertSous, icone: "ArrowUp",
      fabrique: () => operationDe("transfert", t.transfert, "ArrowUp", [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleCinquanteMille, type: "montant" },
      ]),
    },
  ];
  const gestes = tousLesGestes.filter((g) => g.fabrique().code);

  const toutesLesConsultations: Geste[] = [
    { cle: "solde", titre: t.monSolde, aide: t.soldeSous, icone: "Refresh",
      fabrique: () => operationDe("solde", t.monSolde, "Refresh", []) },
    { cle: "mon_numero", titre: t.monNumero, aide: t.monNumeroSous, icone: "Phone",
      fabrique: () => operationDe("mon_numero", t.monNumero, "Phone", []) },
  ];
  const consultations = toutesLesConsultations.filter((c) => c.fabrique().code);
  const lancer = (g: Geste) => (enPause ? expliquer() : setOperation(g.fabrique()));
  // LE MENU DE L'OPÉRATEUR — un bouton à part entière. Il n'était qu'un
  // chiffre à droite de « Code USSD », et le propriétaire passait par le
  // cadran pour tout ce que les trois gestes ne couvrent pas (le « Float »
  // d'un agent, par exemple). Son code s'affiche à droite : celui qu'on
  // taperait sur le téléphone — le raccourci appris d'abord, comme les gestes.
  const codeMenu = etapesGeste(op, "menu", appris)[0];
  const menu: Geste | null = codeMenu ? {
    cle: "menu", titre: t.menu, aide: t.menuSous, icone: "Grid",
    fabrique: () => operationDe("menu", t.menu, "Grid", []),
  } : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg, paddingBottom: margeBas }}
        refreshControl={roue}
      >
        {entete}

        {/* D'où partira l'argent. Avec deux cartes, c'est ICI que se décide
            sur laquelle on compose — se tromper enverrait l'argent depuis la
            mauvaise caisse. */}
        <ChoixDeLaCarte cartes={cartes} active={carte} langue={langue} marge={espaces.lg} />

        {/* LES GESTES D'ARGENT : la première chose sous le pouce, et la plus
            lourde de l'écran. Sans intertitre — ils n'en ont pas besoin. */}
        {gestes.length === 0 ? (
          <Carte style={{ padding: espaces.lg, borderStyle: "dashed" }}>
            <Texte taille={textes.petit} ton="pale" style={{ textAlign: "center", lineHeight: 20 }}>
              {t.aucunCodeReleve(op)}
            </Texte>
          </Carte>
        ) : (
          <View style={{ flexDirection: colonne ? "column" : "row", gap: espaces.sm }}>
            {gestes.map((g) => (
              <TuileArgent key={g.cle} titre={g.titre} aide={g.aide} icone={g.icone}
                           colonne={colonne} enPause={enPause} onPress={() => lancer(g)} />
            ))}
          </View>
        )}

        {menu ? (
          <TuileMenu titre={menu.titre} aide={menu.aide} operateur={op} code={codeMenu ?? ""}
                     enPause={enPause} onPress={() => lancer(menu)} />
        ) : null}

        {/* « Consulter » est toujours là : le relevé n'attend aucun code. */}
        <View style={{ gap: espaces.sm }}>
            <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
              {t.groupeConsulter}
            </Texte>
            {consultations.length ? <View style={{ flexDirection: colonne ? "column" : "row", gap: espaces.sm }}>
              {consultations.map((c) => (
                <DemiTuile key={c.cle} titre={c.titre} aide={c.aide} icone={c.icone}
                           colonne={colonne} enPause={enPause} onPress={() => lancer(c)} />
              ))}
            </View> : null}
            {/* LE RELEVÉ DE COMPTE de cette carte. Il ne vivait que dans la
                fiche « Recevoir de l'argent » et dans l'Analyse : « où est-ce
                que je le retrouve ? ». Il ne passe pas par le boîtier (c'est
                la plateforme qui l'établit) : il ne pâlit jamais. */}
            <DemiTuile titre={tr.titre} aide={tr.explication} icone="Doc"
                       colonne enPause={false} onPress={() => setReleve(true)} />
        </View>

        {/* LES OUTILS : ce qui ne déplace pas d'argent. Plus bas, plus
            légers. Recevoir ne passe pas par le boîtier (le nom et le numéro
            à donner) ; le cadran s'ouvre sur LA carte choisie ici.
            LE CADRAN SE COMPORTE COMME SUR L'ACCUEIL : quand le boîtier de
            la carte se tait, la ligne pâlit et l'appui explique. Elle
            restait vive ici et ouvrait un cadran qui ne pouvait rien
            composer — le même objet, deux conduites selon l'écran. */}
        <View style={{ gap: espaces.sm }}>
          <Texte taille={textes.intertitre} poids="demi" accessibilityRole="header">
            {t.groupeOutils}
          </Texte>
          <Carte>
            <LigneAction discret titre={t.recevoir} sous={t.recevoirSous} icone="Identite"
                         onPress={() => setCoordonnees(true)} />
            <Filet />
            <LigneAction discret titre={tb.titre} sous={tb.sous} icone="Personnes"
                         onPress={() => router.push("/beneficiaires")} />
            <Filet />
            <LigneAction discret titre={tu.titre} sous={tu.composerSous} icone="Hash"
                         enPause={seTait}
                         onPress={() => (seTait ? expliquer()
                           : router.push({ pathname: "/ussd", params: { carte: carte.iccid } }))} />
          </Carte>
        </View>
      </Defilement>

      {releve ? (
        <FeuilleReleve langue={langue} fuseau={donnees?.fuseau || FUSEAU_DEFAUT}
                       onFermer={() => setReleve(false)}
                       cartes={[{ iccid: carte.iccid, numero: carte.numero, libelle: carte.libelle,
                                  operateur: carte.operateur }]} />
      ) : null}

      {coordonnees ? (
        <Coordonnees langue={langue} fuseau={fuseau} onFermer={() => setCoordonnees(false)}
                     carte={{ iccid: carte.iccid, nom: carte.nom, numero: carte.numero,
                              operateur: carte.operateur, libelle: carte.libelle }} />
      ) : null}

      {operation ? (
        <OperationPopup
          operation={operation}
          onFermer={() => setOperation(null)}
          // Une session aboutie a pu changer le solde : on relit — EN
          // SILENCE, et encore trois fois pour attraper le SMS de
          // l'opérateur, qui arrive quelques secondes après.
          onTermine={() => actualiser({ suivi: true })}
          onRefus={() => actualiser()}
        />
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

/** Le boîtier se tait : le geste pâlit EN DOUCEUR, sans changer de taille
 *  — rien ne bouge sous le doigt —, et l'appui explique au lieu de composer. */
function usePause(enPause: boolean) {
  const reduit = useMouvementReduit();
  const opacite = useSharedValue(enPause ? 0.45 : 1);
  useEffect(() => {
    opacite.value = withTiming(enPause ? 0.45 : 1, { duration: reduit ? 0 : 200 });
  }, [enPause, reduit, opacite]);
  return useAnimatedStyle(() => ({ opacity: opacite.value }));
}

/**
 * UN GESTE D'ARGENT — une tuile pleine, le rond sombre, le nom. Ni phrase ni
 * chevron : « Dépôt » se comprend seul, et la phrase reste pour l'aide
 * vocale. Côte à côte d'ordinaire ; en colonne sur un écran étroit ou un
 * texte agrandi — jamais un nom coupé, jamais un texte rétréci.
 */
function TuileArgent({ titre, aide, icone, colonne, enPause, onPress }: {
  titre: string; aide: string; icone: NomIcone; colonne: boolean; enPause: boolean;
  onPress: () => void;
}) {
  const appui = useAppui();
  const pause = usePause(enPause);
  return (
    <Animated.View style={[colonne ? null : { flex: 1 }, appui.style, pause]}>
      <Pressable onPressIn={appui.onPressIn} onPressOut={appui.onPressOut} onPress={onPress}
                 accessibilityRole="button" accessibilityLabel={titre}
                 accessibilityHint={aide}
                 style={({ pressed }) => ({
                   height: colonne ? HAUTEUR_TUILE_COLONNE : HAUTEUR_TUILE,
                   flexDirection: colonne ? "row" : "column",
                   alignItems: "center",
                   justifyContent: colonne ? "flex-start" : "center",
                   gap: colonne ? espaces.md : espaces.sm,
                   paddingHorizontal: colonne ? espaces.lg : espaces.xs,
                   borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
                   backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                 })}>
        <View style={{
          width: colonne ? 36 : 44, height: colonne ? 36 : 44, borderRadius: rayons.rond,
          backgroundColor: couleurs.accent, alignItems: "center", justifyContent: "center",
        }}>
          <Icone nom={icone} taille={colonne ? 18 : 20} couleur={couleurs.surfaceHaute} />
        </View>
        <Texte poids="demi" style={{ textAlign: colonne ? "left" : "center" }}>{titre}</Texte>
      </Pressable>
    </Animated.View>
  );
}

/** LE MENU DE L'OPÉRATEUR — la porte de tout ce que les trois gestes ne
 *  couvrent pas. La première version était une demi-tuile grise, une icône
 *  de grille et un code pâle : « on ne voit même pas ce qui est écrit ». Il
 *  porte maintenant la marque de l'opérateur (son logo, un cadre à sa
 *  couleur — un liseré, jamais un aplat), son nom en clair, et le code dans
 *  une pastille foncée, lisible d'un coup d'œil. Même hauteur qu'avant : la
 *  forme d'attente ne bouge pas. */
function TuileMenu({ titre, aide, operateur, code, enPause, onPress }: {
  titre: string; aide: string; operateur: string; code: string; enPause: boolean;
  onPress: () => void;
}) {
  const appui = useAppui();
  const pause = usePause(enPause);
  const service = serviceMobileMoney(operateur);
  return (
    <Animated.View style={[appui.style, pause]}>
      <Pressable onPressIn={appui.onPressIn} onPressOut={appui.onPressOut} onPress={onPress}
                 accessibilityRole="button" accessibilityLabel={`${titre}, ${service}`}
                 accessibilityHint={aide}
                 style={({ pressed }) => ({
                   minHeight: HAUTEUR_DEMI,
                   flexDirection: "row", alignItems: "center", gap: espaces.md,
                   paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
                   borderRadius: rayons.bouton, borderWidth: 2,
                   borderColor: couleurOperateur(operateur),
                   backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                 })}>
        {operateurReconnu(operateur)
          ? <LogoOperateur operateur={operateur} taille={26} />
          : <Icone nom="Grid" taille={22} couleur={couleurs.encre} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte poids="demi" taille={textes.intertitre}>{titre}</Texte>
          <Texte taille={textes.legende} ton="doux">{service}</Texte>
        </View>
        {code ? (
          <View style={{ paddingHorizontal: espaces.sm, paddingVertical: 4,
                         borderRadius: rayons.petit, backgroundColor: couleurs.encre }}>
            <Texte taille={textes.petit} poids="demi" chiffresAlignes
                   style={{ color: couleurs.surfaceHaute }}>{code}</Texte>
          </View>
        ) : null}
        <Icone nom="Chevron" taille={18} couleur={couleurs.encreDouce} />
      </Pressable>
    </Animated.View>
  );
}

/** Une consultation — plus légère qu'un geste d'argent : un contour, une
 *  icône au trait, le nom. Elle ne déplace rien. */
function DemiTuile({ titre, aide, icone, colonne, enPause, onPress, valeur }: {
  titre: string; aide: string; icone: NomIcone; colonne: boolean; enPause: boolean;
  onPress: () => void;
  /** Ce qu'on lit à droite — le code du menu (« *126# »). */
  valeur?: string;
}) {
  const appui = useAppui();
  const pause = usePause(enPause);
  return (
    <Animated.View style={[colonne ? null : { flex: 1 }, appui.style, pause]}>
      <Pressable onPressIn={appui.onPressIn} onPressOut={appui.onPressOut} onPress={onPress}
                 accessibilityRole="button" accessibilityLabel={titre}
                 accessibilityHint={aide}
                 style={({ pressed }) => ({
                   minHeight: HAUTEUR_DEMI,
                   flexDirection: "row", alignItems: "center", gap: espaces.sm,
                   paddingHorizontal: espaces.md,
                   borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
                   backgroundColor: pressed ? couleurs.surface2 : "transparent",
                 })}>
        <Icone nom={icone} taille={18} couleur={couleurs.encreDouce} />
        <Texte poids="moyen" style={{ flexShrink: 1, flexGrow: 1 }}>{titre}</Texte>
        {valeur ? (
          <Texte taille={textes.petit} ton="pale" style={{ fontVariant: ["tabular-nums"] }}>
            {valeur}
          </Texte>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
