// L'ONGLET FLUX — ce qui est entré et sorti de chaque carte, et rien d'autre.
//
// Un module à part des SMS : la boîte de réception garde tout ce qui arrive
// (codes, publicités, consultations), Flux ne garde que l'argent qui bouge.
// La règle vit dans le noyau (`@noyau/flux`) : le téléphone et le site
// rangent, comptent et vérifient de la même façon.
//
// LE SIGNE ET LA COULEUR DISENT CE QUE L'OPÉRATION FAIT AU SOLDE. Ce qui
// entre s'écrit « + » en vert ; ce qui sort « − » à l'encre — sur une puce
// d'agent, sortir de l'argent électronique n'est pas un danger, c'est le
// métier. Le ROUGE ne sert qu'aux soldes qui ne se suivent pas ; l'AMBRE
// qu'à ce qui attend une décision.

import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import {
  useMargeSousLaBarre, ChampTexte, Defilement, Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui,
} from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { Entree } from "@/animations";
import { SqueletteListe } from "@/squelettes";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees, useMaintenant, useRoue } from "@/donnees";
import { useLangue } from "@/langue";
import { Feuille } from "@/feuille";
import { LogoOperateur } from "@/logos-operateurs";
import { FicheFlux, FeuilleEcart, FeuilleCorriger, quandAnnonce, operateurDe } from "@/flux-fiches";
import { textesFlux, NOMS_TYPES } from "@noyau/textes/flux";
import { textesSms } from "@noyau/textes/sms";
import {
  fluxDe, totauxFlux, etatDesCartes, parJour, correspondFlux, dansFamille, montantSigne,
  FAMILLES_FLUX, type Flux, type FamilleFlux, type Ecart,
} from "@noyau/flux";
import { FUSEAU_DEFAUT, jourLocal, nombre, type Paiement } from "@noyau/types";
import { bornesDe, dansBornes, libelleJour, type Periode } from "@noyau/periodes";
import { formaterNumero } from "@noyau/numero";

// Ce que l'écran demande au cahier : les deux cents derniers SMS, comme
// l'onglet SMS. Les consultations de solde comprises servent de repères.
const SMS_ECRAN = 200;
const AUCUN: Paiement[] = [];

// Les teintes de fond, tirées des couleurs sémantiques de la charte.
const FOND_ENTREE = "rgba(2, 84, 45, 0.09)";
const FOND_ATTENTE = "rgba(151, 81, 2, 0.10)";
const FOND_ECART = "rgba(192, 15, 12, 0.07)";

type Feuilles =
  | { genre: "periode" } | { genre: "carte" } | { genre: "type" }
  | { genre: "fiche"; f: Flux } | { genre: "corriger"; f: Flux }
  | { genre: "ecart"; f: Flux; e: Ecart }
  | null;

export default function Flux() {
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesFlux[langue];
  const ts = textesSms[langue];
  const { donnees, attente, erreur, recharger } = useDonnees({ sms: SMS_ECRAN });
  const roue = useRoue();
  const maintenant = useMaintenant();
  const fuseau = donnees?.fuseau ?? FUSEAU_DEFAUT;
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);

  const [periode, setPeriode] = useState<Periode>({ genre: "aujourdhui" });
  const [carte, setCarte] = useState<string | null>(null);
  const [famille, setFamille] = useState<FamilleFlux | null>(null);
  const [recherche, setRecherche] = useState("");
  const [chercher, setChercher] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const [feuille, setFeuille] = useState<Feuilles>(null);
  // « Toutes avec ce numéro », depuis une fiche : la recherche arrive par
  // l'adresse, sur toutes les dates.
  const params = useLocalSearchParams<{ recherche?: string; moment?: string }>();
  useEffect(() => {
    if (typeof params.recherche === "string" && params.recherche) {
      setRecherche(params.recherche);
      setChercher(true);
      setPeriode({ genre: "tout" });
    }
  }, [params.recherche, params.moment]);

  const paiements = donnees?.paiements ?? AUCUN;
  const sims = donnees?.sims ?? [];
  // TOUTE la suite des soldes se juge sur ce que le cahier porte : un
  // filtre ne doit pas inventer un écart en retirant une ligne du milieu.
  const tous = useMemo(() => fluxDe(paiements), [paiements]);
  const bornes = bornesDe(periode, maintenant, fuseau);
  const vus = useMemo(() => tous.filter((f) =>
    dansBornes(f.p, bornes)
    && (carte == null || (f.p.carte || f.p.sim) === carte)
    && dansFamille(f, famille)
    && correspondFlux(f, recherche)),
  [tous, bornes?.de, bornes?.a, carte, famille, recherche]);
  const totaux = totauxFlux(vus);
  const jours = parJour(vus);
  const cartes = useMemo(() => etatDesCartes(paiements, tous), [paiements, tous]);
  const cartesVues = [...cartes.values()].filter((c) => carte == null || c.carte === carte);

  const nomPeriode = periode.genre === "aujourdhui" ? ts.periodeAujourdhui
    : periode.genre === "hier" ? ts.periodeHier
    : periode.genre === "semaine" ? ts.periodeSemaine
    : periode.genre === "mois" ? ts.periodeMois : ts.periodeTout;
  const nomCarte = (cle: string) => {
    const s = sims.find((x) => x.iccid === cle);
    return s?.libelle ?? cle;
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        contentContainerStyle={{ padding: espaces.lg, paddingBottom: margeBas, gap: espaces.lg }}
        keyboardShouldPersistTaps="handled"
        refreshControl={roue}
      >
        <Entree>
          <View style={{ gap: 2 }}>
            <Texte taille={textes.titre} poids="demi" accessibilityRole="header">{t.titre}</Texte>
            <Texte taille={textes.petit} ton="doux">{t.sousTitre}</Texte>
          </View>
        </Entree>

        {/* LES FILTRES, EN UNE RANGÉE. Chaque bouton dit ce qui est choisi. */}
        <Entree delai={40}>
          <View style={{ gap: espaces.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
              <BoutonFiltre libelle={nomPeriode} etiquette={t.periode} actif={periode.genre !== "tout"}
                            icone="Calendrier" onPress={() => setFeuille({ genre: "periode" })} />
              <View style={{ flexShrink: 1 }}>
                <BoutonFiltre libelle={carte ? nomCarte(carte) : t.toutesLesCartes} etiquette={t.cartes}
                              actif={carte != null} icone="PuceSim"
                              onPress={() => setFeuille({ genre: "carte" })} />
              </View>
              <BoutonFiltre libelle={famille ? t.familles[famille] : t.type} etiquette={t.type}
                            actif={famille != null} icone="List" sansIcone
                            onPress={() => setFeuille({ genre: "type" })} />
              <View style={{ marginLeft: "auto" }}>
                <BoutonIcone nom={chercher ? "Close" : "Search"} taille={18} etiquette={t.rechercher}
                             onPress={() => { setChercher(!chercher); if (chercher) setRecherche(""); }} />
              </View>
            </View>
            {chercher ? (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: espaces.sm,
                borderWidth: 1, borderColor: couleurs.trait, borderRadius: rayons.rond,
                backgroundColor: couleurs.surfaceHaute,
                paddingHorizontal: espaces.lg, paddingVertical: espaces.sm,
              }}>
                <Icone nom="Search" taille={18} couleur={couleurs.encrePale} />
                <ChampTexte value={recherche} onChangeText={setRecherche} autoFocus
                            placeholder={t.rechercher} placeholderTextColor={couleurs.encrePale}
                            style={{ flex: 1, fontSize: textes.corps, color: couleurs.encre, padding: 0 }} />
              </View>
            ) : null}
          </View>
        </Entree>

        {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}

        {/* LE RÉSUMÉ : une ligne, qui se déplie sur le solde de chaque carte. */}
        {donnees ? (
          <Entree delai={80}>
            <Carte style={{ padding: 0 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: deplie }}
                         onPress={() => setDeplie(!deplie)}
                         style={avecAppui({ padding: espaces.md, paddingHorizontal: espaces.lg,
                                            flexDirection: "row", alignItems: "center", gap: espaces.sm,
                                            flexWrap: "wrap" })}>
                <Texte taille={textes.petit} poids="demi">{nomPeriode}</Texte>
                <Texte taille={textes.petit} ton="positif" poids="moyen" chiffresAlignes>
                  {t.entrees} +{nombre(totaux.entrees, langue)}
                </Texte>
                <Texte taille={textes.petit} poids="moyen" chiffresAlignes>
                  {t.sorties} −{nombre(totaux.sorties, langue)}
                </Texte>
                {totaux.aVerifier ? <PastilleAmbre texte={t.aVerifier(totaux.aVerifier)} /> : null}
                <View style={{ marginLeft: "auto", transform: [{ rotate: deplie ? "-90deg" : "90deg" }] }}>
                  <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
                </View>
              </Pressable>
              {deplie ? (
                <View style={{ paddingHorizontal: espaces.lg, paddingBottom: espaces.md }}>
                  {cartesVues.map((c) => {
                    const op = operateurDe(nomCarte(c.carte));
                    const sim = sims.find((s) => s.iccid === c.carte);
                    return (
                      <View key={c.carte} style={{ borderTopWidth: 1, borderTopColor: couleurs.trait,
                                                   paddingVertical: espaces.md, gap: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
                          <LogoOperateur operateur={op} taille={18} />
                          <Texte taille={textes.petit} poids="demi">
                            {op}{sim?.numero ? ` · ${formaterNumero(sim.numero)}` : ` · ${nomCarte(c.carte)}`}
                          </Texte>
                        </View>
                        <Texte taille={textes.titre} poids="gras" chiffresAlignes>
                          {c.solde != null ? `${nombre(c.solde, langue)} F` : "—"}
                        </Texte>
                        {c.recuLe ? (
                          <Texte taille={textes.legende} ton="pale">
                            {t.annonceA(op, quandAnnonce(c.recuLe, c.heure ?? "", maintenant, fuseau, langue))}
                          </Texte>
                        ) : null}
                        <Texte taille={textes.legende} poids="moyen"
                               ton={c.ecarts ? "negatif" : c.suitDepuis ? "positif" : "doux"}>
                          {c.ecarts ? t.ecartsCarte(c.ecarts)
                            : c.suitDepuis ? `✓ ${t.toutSeSuit(c.suitDepuis)}` : t.pasDeSolde}
                        </Texte>
                      </View>
                    );
                  })}
                  <LigneResume libelle={t.frais} valeur={`${nombre(totaux.frais, langue)} F`} />
                  {totaux.commissions ? (
                    <LigneResume libelle={t.commissions} note={t.commissionsAPart}
                                 valeur={`${nombre(totaux.commissions, langue)} F`} />
                  ) : null}
                  <LigneResume libelle={t.variation} fort
                               valeur={`${totaux.entrees - totaux.sorties - totaux.frais >= 0 ? "+" : "−"}${
                                 nombre(Math.abs(totaux.entrees - totaux.sorties - totaux.frais), langue)} F`} />
                </View>
              ) : null}
            </Carte>
          </Entree>
        ) : null}

        {attente && !donnees ? <SqueletteListe lignes={6} /> : null}

        {donnees && vus.length === 0 ? (
          <Texte ton="doux" style={{ textAlign: "center", paddingVertical: espaces.xl }}>
            {t.aucuneTransaction}
          </Texte>
        ) : null}

        {/* LA LISTE, JOUR PAR JOUR. */}
        {jours.map((j) => (
          <View key={j.jour} style={{ gap: espaces.sm }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaces.sm,
                           paddingHorizontal: espaces.xs }}>
              <Texte taille={textes.legende} poids="demi" ton="doux"
                     style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
                {libelleJour(j.jour, aujourdhui, langue)} · {t.transactions(j.totaux.nombre)}
              </Texte>
              <Texte taille={textes.legende} ton="pale" chiffresAlignes style={{ marginLeft: "auto" }}>
                +{nombre(j.totaux.entrees, langue)} · −{nombre(j.totaux.sorties, langue)}
              </Texte>
            </View>
            <Carte style={{ padding: 0, overflow: "hidden" }}>
              {j.flux.map((f, i) => (
                <View key={f.p.id}>
                  {f.ecartApres ? (
                    <RangeeEcart e={f.ecartApres} langue={langue}
                                 onPress={() => setFeuille({ genre: "ecart", f, e: f.ecartApres! })} />
                  ) : i > 0 ? <Filet /> : null}
                  <LigneFlux f={f} langue={langue} carteCourte={nomCarte(f.p.carte || f.p.sim)}
                             onOuvrir={() => setFeuille({ genre: "fiche", f })}
                             onCorriger={() => setFeuille({ genre: "corriger", f })} />
                  {f.ecartAvant ? (
                    <RangeeEcart e={f.ecartAvant} langue={langue}
                                 onPress={() => setFeuille({ genre: "ecart", f, e: f.ecartAvant! })} />
                  ) : null}
                </View>
              ))}
            </Carte>
          </View>
        ))}
      </Defilement>

      {feuille?.genre === "periode" ? (
        <FeuilleChoix titre={t.periode} onFermer={() => setFeuille(null)}
          choisie={periode.genre}
          options={[
            { cle: "aujourdhui", libelle: ts.periodeAujourdhui },
            { cle: "hier", libelle: ts.periodeHier },
            { cle: "semaine", libelle: ts.periodeSemaine },
            { cle: "mois", libelle: ts.periodeMois },
            { cle: "tout", libelle: ts.periodeTout },
          ]}
          onChoisir={(cle) => { setPeriode({ genre: cle } as Periode); setFeuille(null); }} />
      ) : null}
      {feuille?.genre === "carte" ? (
        <FeuilleChoix titre={t.cartes} onFermer={() => setFeuille(null)}
          choisie={carte ?? ""}
          options={[{ cle: "", libelle: t.toutesLesCartes },
                    ...sims.map((s) => ({ cle: s.iccid, libelle: s.libelle }))]}
          onChoisir={(cle) => { setCarte(cle || null); setFeuille(null); }} />
      ) : null}
      {feuille?.genre === "type" ? (
        <FeuilleChoix titre={t.type} onFermer={() => setFeuille(null)}
          choisie={famille ?? ""}
          options={[{ cle: "", libelle: t.tous },
                    ...FAMILLES_FLUX.map((fam) => ({ cle: fam, libelle: t.familles[fam] }))]}
          onChoisir={(cle) => { setFamille((cle || null) as FamilleFlux | null); setFeuille(null); }} />
      ) : null}
      {feuille?.genre === "fiche" ? (
        <FicheFlux f={feuille.f} sims={sims} maintenant={maintenant} fuseau={fuseau}
                   onFermer={() => setFeuille(null)}
                   onCorriger={() => setFeuille({ genre: "corriger", f: feuille.f })} />
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

/** Une transaction : ce qui s'est passé, avec qui, et ce que ça a fait au solde. */
function LigneFlux({ f, langue, carteCourte, onOuvrir, onCorriger }: {
  f: Flux; langue: "fr" | "en"; carteCourte: string; onOuvrir: () => void; onCorriger: () => void;
}) {
  const t = textesFlux[langue];
  const p = f.p;
  const entree = f.effet != null && f.effet > 0;
  const attend = f.etat === "a_verifier";
  const echouee = f.etat === "echouee";
  const icone: NomIcone = echouee ? "Close" : attend ? "Transfer" : entree ? "ArrowDown" : "ArrowUp";
  const fond = echouee ? couleurs.surface2 : attend ? FOND_ATTENTE : entree ? FOND_ENTREE : couleurs.surface2;
  const teinte = echouee ? couleurs.encrePale : attend ? couleurs.alerte : entree ? couleurs.positif : couleurs.encre;
  const solde = p.soldeApres != null
    ? `${t.solde} ${nombre(p.soldeApres, langue)} F`
    : t.sansSolde;
  return (
    <Pressable accessibilityRole="button" onPress={onOuvrir}
               accessibilityLabel={`${NOMS_TYPES[langue][f.type]}, ${p.tiers || p.numero}, ${montantSigne(f, langue, nombre)} F`}
               style={({ pressed }) => ({
                 flexDirection: "row", gap: espaces.md, paddingVertical: espaces.md,
                 paddingHorizontal: espaces.lg,
                 backgroundColor: pressed ? couleurs.surface2 : "transparent",
               })}>
      <View style={{ width: 38, height: 38 }}>
        <View style={{ width: 38, height: 38, borderRadius: rayons.rond, backgroundColor: fond,
                       alignItems: "center", justifyContent: "center" }}>
          <Icone nom={icone} taille={17} couleur={teinte} />
        </View>
        <View style={{ position: "absolute", right: -3, bottom: -3, borderRadius: rayons.rond,
                       borderWidth: 2, borderColor: couleurs.surfaceHaute,
                       backgroundColor: couleurs.surfaceHaute }}>
          <LogoOperateur operateur={operateurDe(carteCourte)} taille={14} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <Texte poids="demi" numberOfLines={1} style={{ flex: 1 }}
                 ton={echouee ? "pale" : "normal"}>
            {NOMS_TYPES[langue][f.type]}
          </Texte>
          <Texte poids="demi" chiffresAlignes
                 ton={echouee ? "pale" : attend ? "alerte" : entree ? "positif" : "normal"}
                 style={echouee ? { textDecorationLine: "line-through" } : undefined}>
            {montantSigne(f, langue, nombre)}
          </Texte>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <Texte taille={textes.petit} ton="doux" numberOfLines={1} style={{ flex: 1 }}>
            {p.tiers || formaterNumero(p.numero) || "—"}
          </Texte>
          {attend ? <PastilleAmbre texte={t.aVerifierEtat} /> : null}
        </View>
        <Texte taille={textes.legende} ton="pale" numberOfLines={1} chiffresAlignes>
          {p.heure} · {carteCourte} · {solde}
          {f.verdict === "suit" ? <Texte taille={textes.legende} ton="positif" poids="demi"> ✓</Texte> : null}
        </Texte>
        {attend && f.lesSoldesDisent ? (
          <Pressable accessibilityRole="button" onPress={onCorriger} hitSlop={6}
                     style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: "flex-start" })}>
            <Texte taille={textes.legende} ton="alerte">
              {t.lesSoldesDisent(f.lesSoldesDisent)} —{" "}
              <Texte taille={textes.legende} ton="alerte" poids="demi"
                     style={{ textDecorationLine: "underline" }}>{t.confirmer}</Texte>
            </Texte>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/** L'écart de la suite des soldes, À SA PLACE dans la liste. */
function RangeeEcart({ e, langue, onPress }: { e: Ecart; langue: "fr" | "en"; onPress: () => void }) {
  const t = textesFlux[langue];
  const m = nombre(Math.abs(e.montant), langue);
  const phrase = e.montant < 0 ? t.ecart(m, e.depuis, e.jusqua) : t.ecartPlus(m, e.depuis, e.jusqua);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
               style={({ pressed }) => ({
                 backgroundColor: FOND_ECART, opacity: pressed ? 0.7 : 1,
                 borderTopWidth: 1, borderBottomWidth: 1, borderStyle: "dashed",
                 borderColor: couleurs.negatif,
                 paddingVertical: espaces.sm + 2, paddingHorizontal: espaces.lg,
                 flexDirection: "row", gap: espaces.sm,
               })}>
      <Texte taille={textes.petit} ton="negatif">⚠</Texte>
      <Texte taille={textes.petit} ton="negatif" style={{ flex: 1, lineHeight: 19 }}>
        {phrase}{" "}
        <Texte taille={textes.petit} ton="negatif" poids="demi" style={{ textDecorationLine: "underline" }}>
          {t.queSEstIlPasse}
        </Texte>
      </Texte>
    </Pressable>
  );
}

function PastilleAmbre({ texte }: { texte: string }) {
  return (
    <View style={{ backgroundColor: FOND_ATTENTE, borderRadius: rayons.rond,
                   paddingHorizontal: espaces.sm, paddingVertical: 1 }}>
      <Texte taille={textes.legende} ton="alerte" poids="demi">{texte}</Texte>
    </View>
  );
}

function LigneResume({ libelle, valeur, note, fort }: {
  libelle: string; valeur: string; note?: string; fort?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaces.sm,
                   borderTopWidth: 1, borderTopColor: couleurs.trait, paddingVertical: espaces.sm }}>
      <Texte taille={textes.petit} ton="doux" style={{ flex: 1 }}>
        {libelle}{note ? <Texte taille={textes.legende} ton="pale"> ({note})</Texte> : null}
      </Texte>
      <Texte taille={textes.petit} poids={fort ? "gras" : "moyen"} chiffresAlignes>{valeur}</Texte>
    </View>
  );
}

/** Un bouton de filtre : rempli de sombre dès qu'il filtre quelque chose. */
function BoutonFiltre({ libelle, etiquette, actif, icone, sansIcone, onPress }: {
  libelle: string; etiquette: string; actif: boolean; icone: NomIcone; sansIcone?: boolean;
  onPress: () => void;
}) {
  const teinte = actif ? couleurs.surfaceHaute : couleurs.encreDouce;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${etiquette} : ${libelle}`}
               onPress={onPress}
               style={avecAppui({
                 flexDirection: "row", alignItems: "center", gap: espaces.xs,
                 minHeight: 38, paddingLeft: sansIcone ? espaces.md : espaces.sm + 2,
                 paddingRight: espaces.sm, borderRadius: rayons.rond, borderWidth: 1,
                 borderColor: actif ? couleurs.accent : couleurs.trait,
                 backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
               })}>
      {sansIcone ? null : <Icone nom={icone} taille={14} couleur={teinte} />}
      <Texte taille={textes.petit} poids="moyen" numberOfLines={1} style={{ flexShrink: 1, color: actif ? teinte : couleurs.encre }}>
        {libelle}
      </Texte>
      <View style={{ transform: [{ rotate: "90deg" }] }}>
        <Icone nom="Chevron" taille={12} couleur={teinte} />
      </View>
    </Pressable>
  );
}

function FeuilleChoix({ titre, options, choisie, onChoisir, onFermer }: {
  titre: string; options: { cle: string; libelle: string }[]; choisie: string;
  onChoisir: (cle: string) => void; onFermer: () => void;
}) {
  const langue = useLangue();
  return (
    <Feuille visible libelleFermer={textesSms[langue].fermer} onFermer={onFermer}
             entete={<Texte taille={textes.intertitre} poids="demi">{titre}</Texte>}>
      <Carte style={{ padding: 0 }}>
        {options.map((o, i) => {
          const elle = o.cle === choisie;
          return (
            <View key={o.cle || "tout"}>
              {i > 0 ? <Filet /> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ selected: elle }}
                         onPress={() => onChoisir(o.cle)}
                         style={({ pressed }) => ({
                           flexDirection: "row", alignItems: "center", gap: espaces.md,
                           minHeight: 52, paddingHorizontal: espaces.lg,
                           backgroundColor: pressed ? couleurs.surface2 : "transparent",
                         })}>
                <Texte poids={elle ? "demi" : "normal"} style={{ flex: 1 }}>{o.libelle}</Texte>
                {elle ? <Icone nom="Check" taille={18} couleur={couleurs.encre} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Carte>
    </Feuille>
  );
}
