// L'ONGLET PAIEMENTS — ce qui est entré et sorti de chaque carte, et rien
// d'autre.
//
// Un module à part des SMS : la boîte de réception garde tout ce qui arrive
// (codes, publicités, consultations), les Paiements ne gardent que l'argent
// qui bouge. La règle vit dans le noyau (`@noyau/flux`) : le téléphone et le
// site rangent, comptent, vérifient et trient de la même façon.
//
// CE QUE LE PROPRIÉTAIRE A DEMANDÉ, ET POURQUOI C'EST AINSI :
//
//   — « Entrées » et « Sorties » en tête « ne servent à rien » : retirés.
//     L'écran commence par ce qu'on vient y faire — chercher, filtrer.
//   — UNE VRAIE BARRE DE RECHERCHE, toujours visible (elle était cachée
//     derrière une loupe) : un nom, un numéro avec ou sans espaces, un
//     montant, une référence.
//   — LES FILTRES D'AVANT, ceux des SMS (`filtres.tsx`) : la date (et des
//     jours choisis au calendrier), la carte, le type — et le TRI.
//   — Une période que le cahier ne couvre pas se demande à la plateforme,
//     comme aux SMS (`periode-demandee.ts`) : filtrée sur le téléphone,
//     « le mois dernier » s'afficherait vide sans un mot.
//   — TOUT L'HISTORIQUE, DÈS LE PREMIER JOUR. TOTEM tourne déjà, avec des
//     mois de caisse en base ; l'écran s'arrêtait aux deux cents derniers
//     SMS. En bas de la liste, les plus anciens se chargent page après page
//     (`historique.ts`), et la fin se dit : « Début de l'historique ».
//
// UNE LIGNE DIT QUI ET COMBIEN ; le type et l'heure dessous, en petit ; tout
// le reste vit dans la fiche — avec le reçu PDF et le SMS d'origine.
//
// LE SIGNE ET LA COULEUR DISENT CE QUE L'OPÉRATION FAIT AU SOLDE : « + » en
// vert, « − » à l'encre (sortir de l'argent électronique est le métier d'un
// agent, pas un danger). Le ROUGE n'est que pour les soldes qui ne se
// suivent pas ; l'AMBRE, que pour ce qui attend une décision.

import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import {
  useMargeSousLaBarre, ChampTexte, Defilement, Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui,
} from "@/ui";
import { Icone } from "@/icones";
import { Entree } from "@/animations";
import { SqueletteListe } from "@/squelettes";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { Calendrier } from "@/calendrier";
import { BoutonFiltre, FeuilleChoix } from "@/filtres";
import { usePeriodeDemandee } from "@/periode-demandee";
import { useHistorique } from "@/historique";
import { FicheFlux, FeuilleEcart, FeuilleCorriger, RondFlux } from "@/flux-fiches";
import { textesFlux, NOMS_TYPES } from "@noyau/textes/flux";
import { textesSms } from "@noyau/textes/sms";
import {
  fluxDe, totauxFlux, correspondFlux, dansFamille, montantSigne, parDate, parJour, surLaCarte,
  trierFlux,
  FAMILLES_FLUX, TRIS_FLUX, type Flux, type FamilleFlux, type Ecart, type TriFlux,
} from "@noyau/flux";
import { FUSEAU_DEFAUT, jourLocal, nombre, type Paiement } from "@noyau/types";
import {
  bornesDe, dansBornes, depuisPourLaBase, jourCourt, libelleJour, nomDesJours, type Bornes,
  type Periode,
} from "@noyau/periodes";
import { formaterNumero } from "@noyau/numero";
import { jusquAu } from "@noyau/historique";

// Ce que l'écran demande au cahier : les deux cents derniers SMS, comme
// l'onglet SMS — le même besoin, donc une seule descente pour les deux. Les
// consultations de solde comprises servent de repères à la suite des soldes.
const SMS_ECRAN = 200;
const AUCUN: Paiement[] = [];

// ON NE REND PAS CE QUE PERSONNE NE REGARDE : soixante lignes d'abord, puis
// soixante de plus à l'approche du bas (la leçon des SMS, `verifier-les-
// listes`). Un mois de caisse peut en faire mille.
const LIGNES_PAR_LOT = 60;

// Les teintes de fond, tirées des couleurs sémantiques de la charte.
const FOND_ATTENTE = "rgba(151, 81, 2, 0.10)";
const FOND_ECART = "rgba(192, 15, 12, 0.06)";

type Feuilles =
  | { genre: "date" } | { genre: "carte" } | { genre: "type" } | { genre: "tri" }
  | { genre: "fiche"; f: Flux } | { genre: "corriger"; f: Flux }
  | { genre: "ecart"; f: Flux; e: Ecart }
  | null;

export default function Paiements() {
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesFlux[langue];
  const ts = textesSms[langue];
  const { donnees, attente, erreur, recharger, actualiser, quand } = useDonnees({ sms: SMS_ECRAN });
  const roue = useRoue();
  const maintenant = useMaintenant();
  const fuseau = donnees?.fuseau ?? FUSEAU_DEFAUT;
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);

  const [periode, setPeriode] = useState<Periode>({ genre: "tout" });
  const [calendrier, setCalendrier] = useState(false);
  const [carte, setCarte] = useState<string | null>(null);
  const [famille, setFamille] = useState<FamilleFlux | null>(null);
  const [tri, setTri] = useState<TriFlux>("recentes");
  // « À regarder » : les lignes à vérifier et celles qui bordent un écart.
  const [aRegarder, setARegarder] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [feuille, setFeuille] = useState<Feuilles>(null);
  // « Ce numéro », depuis une fiche : la recherche arrive par l'adresse, sur
  // toutes les dates.
  const params = useLocalSearchParams<{ recherche?: string; moment?: string }>();
  useEffect(() => {
    if (typeof params.recherche === "string" && params.recherche) {
      setRecherche(params.recherche);
      setPeriode({ genre: "tout" });
    }
  }, [params.recherche, params.moment]);

  // LES BORNES SUIVENT LE JOUR, PAS LA MINUTE (voir l'onglet SMS).
  const calculees = bornesDe(periode, maintenant, fuseau);
  const deCalcule = calculees?.de;
  const aCalcule = calculees?.a;
  const bornes = useMemo<Bornes | null>(
    () => (deCalcule && aCalcule ? { de: deCalcule, a: aCalcule } : null),
    [deCalcule, aCalcule]);
  const lus = useMemo(() => (Array.isArray(donnees?.paiements) ? donnees.paiements : AUCUN),
                      [donnees]);
  const recents = useMemo(
    () => (lus.length > SMS_ECRAN ? lus.slice(0, SMS_ECRAN) : lus), [lus]);
  const periodeP = usePeriodeDemandee(bornes, recents, SMS_ECRAN, quand);

  // LES PLUS ANCIENS, PAGE APRÈS PAGE. Sans période, la suite est celle du
  // cahier — valable pour TOUT ce qu'il a rapporté (`lus`), pas seulement
  // les deux cents qu'on montre ; avec une période, celle de la période,
  // qui ne remonte pas avant son premier jour.
  const cleHistorique = bornes == null ? `tout|${langue}`
    : periodeP.suite !== undefined ? `${bornes.de}…${bornes.a}|${langue}` : null;
  const histoire = useHistorique(cleHistorique, periodeP.paiements,
                                 bornes == null ? lus : periodeP.paiements,
                                 bornes == null ? donnees?.suite : periodeP.suite,
                                 bornes ? depuisPourLaBase(bornes) : undefined);

  const sims = donnees?.sims ?? [];
  const carteChoisie = carte == null ? null
    : { iccid: carte, libelle: sims.find((x) => x.iccid === carte)?.libelle ?? carte };
  // TOUTE la suite des soldes se juge sur ce que l'écran porte : un filtre
  // ne doit pas inventer un écart en retirant une ligne du milieu.
  const tous = useMemo(() => fluxDe(histoire.paiements), [histoire.paiements]);
  const dansLaVue = useMemo(() => tous.filter((f) =>
    dansBornes(f.p, bornes)
    && surLaCarte(f.p, carteChoisie)
    && dansFamille(f, famille)
    && correspondFlux(f, recherche)),
  // `carteChoisie` se résume à `carte` et aux libellés des cartes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tous, bornes, carte, carteChoisie?.libelle, famille, recherche]);
  const totaux = totauxFlux(dansLaVue);
  const vus = useMemo(() => trierFlux(aRegarder
    ? dansLaVue.filter((f) => f.etat === "a_verifier" || f.ecartAvant || f.ecartApres)
    : dansLaVue, tri), [dansLaVue, aRegarder, tri]);
  const chronologique = parDate(tri);

  // LE BUDGET, remis au départ quand les CRITÈRES changent — jamais quand
  // les données bougent sous le doigt (la leçon de l'onglet SMS).
  const criteres = [recherche, carte ?? "", famille ?? "", tri, aRegarder ? "1" : "",
                    bornes?.de ?? "", bornes?.a ?? ""].join("\u0000");
  const [budget, setBudget] = useState({ criteres, n: LIGNES_PAR_LOT });
  if (budget.criteres !== criteres) setBudget({ criteres, n: LIGNES_PAR_LOT });
  const montres = vus.length > budget.n ? vus.slice(0, budget.n) : vus;
  const filtre = periode.genre !== "tout" || carte != null || famille != null;
  const cherche = recherche.trim() !== "";
  // LA SUITE SE CHARGE TOUTE SEULE en descendant — seulement sur la liste
  // nue, des plus récents aux plus anciens. Filtrée ou cherchée, quelques
  // lignes laissent toujours le bas en vue : la liste tirerait page après
  // page, tout l'historique, sans qu'on l'ait demandé. Là, c'est un bouton.
  const suiteAuto = !filtre && !cherche && !aRegarder && tri === "recentes";
  const allonger = () => {
    if (budget.n < vus.length) setBudget({ criteres, n: budget.n + LIGNES_PAR_LOT });
    else if (suiteAuto && !histoire.refus) histoire.plus();
  };
  const jours = useMemo(() => (chronologique ? parJour(montres) : []), [chronologique, montres]);

  const nomDePeriode = periode.genre === "tout" || !bornes ? null
    : periode.genre === "jours" ? nomDesJours(bornes, langue)
    : periode.genre === "aujourdhui" ? ts.periodeAujourdhui
    : periode.genre === "hier" ? ts.periodeHier
    : periode.genre === "semaine" ? ts.periodeSemaine
    : ts.periodeMois;
  const nomCarte = (cle: string) => sims.find((x) => x.iccid === cle)?.libelle ?? cle;
  const ouvrir = (f: Flux) => setFeuille({ genre: "fiche", f });

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Defilement
        contentContainerStyle={{ padding: espaces.lg, paddingBottom: margeBas, gap: espaces.lg }}
        keyboardShouldPersistTaps="handled"
        refreshControl={roue}
        scrollEventThrottle={80}
        onScroll={({ nativeEvent: n }) => {
          const restant = n.contentSize.height - (n.contentOffset.y + n.layoutMeasurement.height);
          if (restant < n.layoutMeasurement.height * 1.5) allonger();
        }}
      >
        {/* LE TITRE, ET LE TRI À SA DROITE : un réglage de la VUE, pas un
            filtre — il ne retire rien. Posé dans la rangée des filtres, il
            la faisait passer sur deux lignes. */}
        <Entree>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
            <Texte taille={textes.titre} poids="demi" accessibilityRole="header" style={{ flex: 1 }}>
              {t.titre}
            </Texte>
            <BoutonFiltre icone="Tri" etiquette={t.triAria}
                          libelle={tri === "recentes" ? t.tri : t.trisCourts[tri]} actif={tri !== "recentes"}
                          onPress={() => setFeuille({ genre: "tri" })} />
          </View>
        </Entree>

        {/* LA RECHERCHE, TOUJOURS LÀ. */}
        <Entree delai={60}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: espaces.sm,
            borderWidth: 1, borderColor: couleurs.trait, borderRadius: rayons.rond,
            backgroundColor: couleurs.surfaceHaute,
            paddingHorizontal: espaces.lg, paddingVertical: espaces.sm,
          }}>
            <Icone nom="Search" taille={18} couleur={couleurs.encrePale} />
            <ChampTexte
              value={recherche}
              onChangeText={setRecherche}
              placeholder={t.rechercher}
              placeholderTextColor={couleurs.encrePale}
              accessibilityLabel={t.chercher}
              style={{
                // `minWidth: 0` : un champ du navigateur a une largeur propre
                // (vingt caractères) ; sans cela, à 320 points, il débordait
                // et écrasait la loupe à zéro — mesuré, sur les deux écrans.
                flex: 1, minWidth: 0, paddingVertical: espaces.xs,
                fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
              }}
            />
            {recherche ? (
              <BoutonIcone nom="Close" taille={16} couleur={couleurs.encrePale}
                           etiquette={ts.effacerRecherche} onPress={() => setRecherche("")} />
            ) : null}
          </View>
        </Entree>

        {/* LES FILTRES, EN UNE RANGÉE — ceux des SMS. */}
        <Entree delai={120}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: espaces.sm }}>
            <BoutonFiltre icone="Calendrier" etiquette={ts.filtreDateAria}
                          libelle={nomDePeriode ?? ts.filtreDate} actif={nomDePeriode != null}
                          onPress={() => setFeuille({ genre: "date" })} />
            {sims.length > 1 ? (
              <BoutonFiltre icone="Wallet" etiquette={ts.filtreCarteAria}
                            libelle={carte ? nomCarte(carte) : ts.filtreCarte} actif={carte != null}
                            onPress={() => setFeuille({ genre: "carte" })} />
            ) : null}
            <BoutonFiltre icone="List" etiquette={ts.filtreTypeAria}
                          libelle={famille ? t.familles[famille] : ts.filtreType} actif={famille != null}
                          onPress={() => setFeuille({ genre: "type" })} />
            {filtre ? (
              <Pressable accessibilityRole="button" hitSlop={8}
                         onPress={() => { setPeriode({ genre: "tout" }); setCarte(null); setFamille(null); }}
                         style={avecAppui({ paddingHorizontal: espaces.xs })}>
                <Texte taille={textes.petit} ton="doux" style={{ textDecorationLine: "underline" }}>
                  {ts.effacerFiltres}
                </Texte>
              </Pressable>
            ) : null}
          </View>
        </Entree>

        {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}
        {periodeP.refus ? (
          <Accroc message={t.periodeImpossible} onReessayer={periodeP.reessayer} />
        ) : null}

        {/* UNE SEULE LIGNE D'ALERTE, et seulement s'il y a lieu ; sinon, ce
            que la recherche ou les filtres ont trouvé — un nombre, pas un
            total : les chiffres de tête ont été retirés à dessein. */}
        {donnees && (totaux.ecarts || totaux.aVerifier) ? (
          <Pressable accessibilityRole="button" accessibilityState={{ selected: aRegarder }}
                     onPress={() => setARegarder(!aRegarder)}
                     style={avecAppui({
                       flexDirection: "row", alignItems: "center", gap: espaces.sm,
                       paddingVertical: espaces.sm + 2, paddingHorizontal: espaces.md,
                       borderRadius: rayons.carte,
                       backgroundColor: totaux.ecarts ? FOND_ECART : FOND_ATTENTE,
                     })}>
            <View style={{ width: 8, height: 8, borderRadius: rayons.rond,
                           backgroundColor: totaux.ecarts ? couleurs.negatif : couleurs.alerte }} />
            <Texte taille={textes.petit} poids="moyen" ton={totaux.ecarts ? "negatif" : "alerte"}
                   style={{ flex: 1 }}>
              {t.attention(totaux.ecarts, totaux.aVerifier)}
            </Texte>
            <Icone nom={aRegarder ? "Close" : "Chevron"} taille={14}
                   couleur={totaux.ecarts ? couleurs.negatif : couleurs.alerte} />
          </Pressable>
        ) : null}
        {donnees && (filtre || cherche) && vus.length > 0 ? (
          <Texte taille={textes.petit} ton="pale" style={{ paddingHorizontal: espaces.xs }}>
            {t.transactions(vus.length)}
          </Texte>
        ) : null}
        {periodeP.tronquee && histoire.suite !== null ? (
          <Texte taille={textes.legende} ton="alerte" style={{ lineHeight: 18 }}>
            {typeof histoire.suite === "string" ? t.periodeACompleter : t.periodeTronquee}
          </Texte>
        ) : null}

        {vus.length === 0 && (attente || periodeP.cherche) && !erreur && !periodeP.refus ? (
          <SqueletteListe lignes={6} />
        ) : null}

        {donnees && vus.length === 0 && !attente && !periodeP.cherche && !periodeP.refus ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
            <Texte ton="doux" style={{ textAlign: "center", lineHeight: 22 }}>
              {filtre || cherche || aRegarder ? t.aucunResultat : t.aucunPaiement}
            </Texte>
          </Carte>
        ) : null}

        {/* PAR DATE : jour par jour, les écarts à leur place. */}
        {chronologique ? jours.map((j) => (
          <View key={j.jour} style={{ gap: espaces.sm }}>
            <Texte taille={textes.legende} ton="pale"
                   style={{ paddingHorizontal: espaces.xs, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {/^\d{4}-\d{2}-\d{2}$/.test(j.jour) ? libelleJour(j.jour, aujourdhui, langue) : j.libelle}
            </Texte>
            <Carte style={{ overflow: "hidden" }}>
              {j.flux.map((f, i) => (
                <View key={f.p.id}>
                  {tri === "recentes" && f.ecartApres ? (
                    <RangeeEcart e={f.ecartApres} langue={langue}
                                 onPress={() => setFeuille({ genre: "ecart", f, e: f.ecartApres! })} />
                  ) : i > 0 ? <Filet style={{ marginLeft: 68 }} /> : null}
                  {tri === "anciennes" && f.ecartAvant ? (
                    <RangeeEcart e={f.ecartAvant} langue={langue}
                                 onPress={() => setFeuille({ genre: "ecart", f, e: f.ecartAvant! })} />
                  ) : null}
                  <LigneFlux f={f} langue={langue} carteCourte={nomCarte(f.p.carte || f.p.sim)}
                             onOuvrir={ouvrir} />
                  {tri === "recentes" && f.ecartAvant ? (
                    <RangeeEcart e={f.ecartAvant} langue={langue}
                                 onPress={() => setFeuille({ genre: "ecart", f, e: f.ecartAvant! })} />
                  ) : null}
                  {tri === "anciennes" && f.ecartApres ? (
                    <RangeeEcart e={f.ecartApres} langue={langue}
                                 onPress={() => setFeuille({ genre: "ecart", f, e: f.ecartApres! })} />
                  ) : null}
                </View>
              ))}
            </Carte>
          </View>
        )) : montres.length ? (
          // PAR MONTANT : à plat, et le jour sur chaque ligne.
          <Carte style={{ overflow: "hidden" }}>
            {montres.map((f, i) => (
              <View key={f.p.id}>
                {i > 0 ? <Filet style={{ marginLeft: 68 }} /> : null}
                <LigneFlux f={f} langue={langue} carteCourte={nomCarte(f.p.carte || f.p.sim)}
                           onOuvrir={ouvrir} avecJour={jourCourt(f.p.jour, langue)} />
              </View>
            ))}
          </Carte>
        ) : null}

        {/* LA SUITE DE L'HISTORIQUE — une fois toute la liste montrée. */}
        {donnees && montres.length === vus.length && !periodeP.cherche && !periodeP.refus ? (
          <PiedHistorique langue={langue} suite={histoire.suite} enCours={histoire.enCours}
                          refus={histoire.refus} toutes={bornes == null}
                          jusqua={jusquAu(histoire.paiements)}
                          onPlus={histoire.plus} />
        ) : null}
      </Defilement>
      </KeyboardAvoidingView>

      {feuille?.genre === "date" ? (
        <FeuilleChoix titre={t.filtreDateTitre} onFermer={() => setFeuille(null)}
          choisie={periode.genre}
          options={[
            { cle: "tout", libelle: ts.periodeTout },
            { cle: "aujourdhui", libelle: ts.periodeAujourdhui },
            { cle: "hier", libelle: ts.periodeHier },
            { cle: "semaine", libelle: ts.periodeSemaine },
            { cle: "mois", libelle: ts.periodeMois },
            { cle: "jours", libelle: periode.genre === "jours" && bornes
                ? `${ts.periodeChoisir} · ${nomDesJours(bornes, langue)}` : ts.periodeChoisir,
              icone: "Calendrier" },
          ]}
          onChoisir={(cle) => {
            setFeuille(null);
            if (cle === "jours") setCalendrier(true);
            else setPeriode({ genre: cle as Exclude<Periode["genre"], "jours"> });
          }} />
      ) : null}
      {feuille?.genre === "carte" ? (
        <FeuilleChoix titre={ts.filtreCarteTitre} onFermer={() => setFeuille(null)}
          choisie={carte ?? ""}
          options={[{ cle: "", libelle: t.toutesLesCartes },
                    ...sims.map((s) => ({ cle: s.iccid, libelle: s.libelle }))]}
          onChoisir={(cle) => { setCarte(cle || null); setFeuille(null); }} />
      ) : null}
      {feuille?.genre === "type" ? (
        <FeuilleChoix titre={ts.filtreTypeTitre} onFermer={() => setFeuille(null)}
          choisie={famille ?? ""}
          options={[{ cle: "", libelle: t.tous },
                    ...FAMILLES_FLUX.map((fam) => ({ cle: fam, libelle: t.familles[fam] }))]}
          onChoisir={(cle) => { setFamille((cle || null) as FamilleFlux | null); setFeuille(null); }} />
      ) : null}
      {feuille?.genre === "tri" ? (
        <FeuilleChoix titre={t.triTitre} onFermer={() => setFeuille(null)}
          choisie={tri}
          options={TRIS_FLUX.map((x) => ({ cle: x, libelle: t.tris[x] }))}
          onChoisir={(cle) => { setTri(cle as TriFlux); setFeuille(null); }} />
      ) : null}
      {calendrier ? (
        <Calendrier langue={langue} aujourdhui={aujourdhui}
                    depart={periode.genre === "jours" ? bornes : null}
                    onFermer={() => setCalendrier(false)}
                    onChoisir={(b) => { setPeriode({ genre: "jours", de: b.de, a: b.a });
                                        setCalendrier(false); }} />
      ) : null}
      {feuille?.genre === "fiche" ? (
        // Un reçu établi dans la fiche relit EN SILENCE : la fiche corrige le
        // cahier sur place, et la relecture confirme sans roue.
        <FicheFlux f={feuille.f} sims={sims} maintenant={maintenant} fuseau={fuseau}
                   onFermer={() => setFeuille(null)}
                   onCorriger={() => setFeuille({ genre: "corriger", f: feuille.f })}
                   onChange={() => actualiser()}
                   onRetouche={(id, champs) => {
                     periodeP.retoucher(id, champs);
                     histoire.retoucher(id, champs);
                   }} />
      ) : null}
      {feuille?.genre === "corriger" ? (
        <FeuilleCorriger f={feuille.f} onFermer={() => setFeuille(null)} />
      ) : null}
      {feuille?.genre === "ecart" ? (
        <FeuilleEcart f={feuille.f} e={feuille.e} tous={tous} onFermer={() => setFeuille(null)} />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * LE PIED DE LA LISTE : ce qu'on sait de l'historique, et rien de plus.
 * Il y a plus ancien → le bouton (et jusqu'où l'on remonte déjà, pour qu'une
 * recherche sans résultat ne passe pas pour une recherche sur TOUT) ; la
 * base n'a rien avant → « Début de l'historique » — seulement sans période :
 * une période complète ne dit rien de ce qui la précède ; on ne sait pas
 * (une plateforme pas encore à jour) → rien.
 */
function PiedHistorique({ langue, suite, enCours, refus, toutes, jusqua, onPlus }: {
  langue: "fr" | "en"; suite: string | null | undefined; enCours: boolean; refus: boolean;
  toutes: boolean; jusqua: string | null; onPlus: () => void;
}) {
  const t = textesFlux[langue];
  if (refus) return <Accroc message={t.anciensImpossible} onReessayer={onPlus} />;
  if (enCours) {
    return (
      <Texte taille={textes.petit} ton="pale" style={{ textAlign: "center", paddingVertical: espaces.md }}
             accessibilityLiveRegion="polite">
        {t.chargementAnciens}
      </Texte>
    );
  }
  if (typeof suite === "string") {
    return (
      <View style={{ alignItems: "center", gap: espaces.sm, paddingVertical: espaces.sm }}>
        {jusqua ? (
          <Texte taille={textes.legende} ton="pale">{t.jusquAu(jourCourt(jusqua, langue))}</Texte>
        ) : null}
        {/* Sans icône : la flèche vers le bas dit « dépôt » partout
            ailleurs dans l'application. */}
        <Pressable accessibilityRole="button" onPress={onPlus}
                   style={avecAppui({
                     flexDirection: "row", alignItems: "center", gap: espaces.sm,
                     paddingVertical: espaces.sm + 2, paddingHorizontal: espaces.lg,
                     borderRadius: rayons.rond, borderWidth: 1, borderColor: couleurs.trait,
                     backgroundColor: couleurs.surfaceHaute,
                   })}>
          <Texte taille={textes.petit} poids="moyen">{t.plusAnciens}</Texte>
        </Pressable>
      </View>
    );
  }
  if (suite === null && toutes && jusqua) {
    return (
      <Texte taille={textes.legende} ton="pale" style={{ textAlign: "center", paddingVertical: espaces.md }}>
        {t.debutHistorique}
      </Texte>
    );
  }
  return null;
}

/** Une transaction : QUI, et COMBIEN. Le type et l'heure dessous, en petit —
 *  et le jour, quand la liste n'est plus rangée par jour. */
function LigneFlux({ f, langue, carteCourte, onOuvrir, avecJour }: {
  f: Flux; langue: "fr" | "en"; carteCourte: string; onOuvrir: (f: Flux) => void; avecJour?: string;
}) {
  const t = textesFlux[langue];
  const p = f.p;
  const entree = f.effet != null && f.effet > 0;
  const attend = f.etat === "a_verifier";
  const echouee = f.etat === "echouee";
  const titre = p.tiers || formaterNumero(p.numero) || NOMS_TYPES[langue][f.type];
  // L'HEURE D'ABORD : sur un petit écran, la ligne se coupe à droite, et
  // c'est le type qui doit partir — les « + » et « − » disent déjà le sens.
  const quand = avecJour ? `${avecJour} ${p.heure}` : p.heure;
  const sous = attend ? `${NOMS_TYPES[langue][f.type]} · ${t.aConfirmer}`
    : `${quand} · ${NOMS_TYPES[langue][f.type]}`;
  return (
    <Pressable accessibilityRole="button" onPress={() => onOuvrir(f)}
               accessibilityLabel={`${titre}, ${NOMS_TYPES[langue][f.type]}, ${montantSigne(f, langue, nombre)} F`}
               style={({ pressed }) => ({
                 flexDirection: "row", alignItems: "center", gap: espaces.md,
                 paddingVertical: espaces.md, paddingHorizontal: espaces.lg,
                 backgroundColor: pressed ? couleurs.surface2 : "transparent",
               })}>
      <RondFlux f={f} carteCourte={carteCourte} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Texte poids="moyen" numberOfLines={1} ton={echouee ? "pale" : "normal"}>{titre}</Texte>
        <Texte taille={textes.petit} ton={attend ? "alerte" : "pale"} numberOfLines={1}>{sous}</Texte>
      </View>
      <Texte poids="demi" chiffresAlignes
             ton={echouee ? "pale" : attend ? "alerte" : entree ? "positif" : "normal"}
             style={echouee ? { textDecorationLine: "line-through" } : undefined}>
        {montantSigne(f, langue, nombre)}
      </Texte>
    </Pressable>
  );
}

/** L'écart de la suite des soldes, À SA PLACE dans la liste — une ligne. */
function RangeeEcart({ e, langue, onPress }: { e: Ecart; langue: "fr" | "en"; onPress: () => void }) {
  const t = textesFlux[langue];
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
               style={({ pressed }) => ({
                 backgroundColor: FOND_ECART, opacity: pressed ? 0.7 : 1,
                 paddingVertical: espaces.sm, paddingHorizontal: espaces.lg,
                 flexDirection: "row", alignItems: "center", gap: espaces.sm,
               })}>
      <View style={{ width: 6, height: 6, borderRadius: rayons.rond, backgroundColor: couleurs.negatif }} />
      <Texte taille={textes.petit} ton="negatif" numberOfLines={1} style={{ flex: 1 }}>
        {t.ecartCourt(nombre(Math.abs(e.montant), langue), e.montant < 0 ? "moins" : "plus", e.depuis, e.jusqua)}
      </Texte>
      <Icone nom="Chevron" taille={12} couleur={couleurs.negatif} />
    </Pressable>
  );
}
