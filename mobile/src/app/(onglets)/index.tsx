// L'accueil : une carte, ce qu'on fait avec, et l'argent qui vient de bouger.
//
// REFAIT POUR SE LIRE SANS MODE D'EMPLOI. Le propriétaire le montrait à son
// père et à ses proches, qui ne savaient pas à quoi servait la moitié des
// boutons : un titre « Overview » qui ne disait rien, trois cercles muets,
// quatre grosses tuiles d'un autre style pour des gestes du même ordre, une
// liste de SMS mêlant publicités et soldes, et une carte « terminal relié »
// qui ne disait rien tant que tout allait bien. Quatre designers ont
// proposé, trois juges ont tranché ; ce qui reste, de haut en bas :
//
//   — le salut, et l'engrenage ;
//   — les cartes, en puces sur UNE ligne (quatre cartes n'en font plus
//     deux) ;
//   — la carte, avec l'âge de son solde dessous — le JOUR compris — et
//     « Actualiser » à côté ;
//   — UNE rangée de ronds nommés, tous du même dessin : Dépôt, Retrait,
//     Transfert, Recevoir (la fiche des coordonnées), Code USSD ;
//   — les derniers MOUVEMENTS D'ARGENT, toutes cartes, la carte nommée.
//
// Rien n'est perdu : « Mon numéro » et le solde exact sont dans Opérations
// (avec une phrase qui dit ce qu'ils font), l'Analyse dans Comptes, l'état
// complet du terminal dans Réglages — et la ligne sous la carte prévient
// dès que le terminal se tait.
//
// La mise en page suit la FENÊTRE, pas l'appareil : au-delà de 600 dp de
// large (tablette, pliable ouvert, écran partagé) elle passe à deux colonnes
// — la carte et ses gestes d'un côté, les mouvements de l'autre.

import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Caisse } from "@/caisse";
import { Coordonnees } from "@/coordonnees";
import { useMargeSousLaBarre, Defilement, Accroc, BoutonIcone, Carte, Filet, Pastille, Texte,
         appuiTexte, avecAppui } from "@/ui";
import { Icone, type NomIcone } from "@/icones";
import { LogoOperateur, operateurReconnu } from "@/logos-operateurs";
import { Entree, Animated, useAppui } from "@/animations";
import { SqueletteCaisse, SqueletteListe, SqueletteRonds } from "@/squelettes";
import { OperationPopup, type Operation } from "@/operation";
import { FicheSms, couleursCategorie, icone as iconeCat } from "@/fiche-sms";
import { useEcran } from "@/ecran";
import * as Coffre from "@/api/coffre";
import { choisirCarte, useCarteChoisie } from "@/carte-choisie";
import { toucherChoix } from "@/toucher";
import {
  ECART_PUCES, ECART_ROND, HAUTEUR_ETAT, HAUTEUR_PUCE, LIGNE_ROND, LIGNES_MOUVEMENTS,
  LIGNES_MOUVEMENTS_LARGE, NOM_ROND, ROND,
} from "@/mesures-accueil";
import { couleurs, espaces, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { etapesGeste } from "@noyau/codes";
import { clientsRecents } from "@noyau/recents";
import { aQui } from "@noyau/beneficiaires";
import { estMouvement } from "@noyau/sms";
import { jourCourt, jourDuReleve } from "@noyau/periodes";
import {
  FUSEAU_DEFAUT, fcfa, jourLocal, type EtatTerminal, type Paiement, type Sim,
} from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesGuichet } from "@noyau/textes/guichet";
import { salutation } from "@noyau/salutation";

const CLE_SOLDE_CACHE = "totem.solde.cache";
// Combien de cartes au dernier passage : la forme d'attente dessine les
// puces SEULEMENT s'il y en avait plusieurs — sans quoi un propriétaire à une
// carte verrait l'écran remonter de 48 points à chaque ouverture.
const CLE_NOMBRE_CARTES = "totem.cartes.nombre";

type T = (typeof textesAccueil)["fr"];

export default function Accueil() {
  // Ce que la barre d'onglets flottante recouvre — voir `useMargeSousLaBarre`.
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesAccueil[langue];
  const tg = textesGuichet[langue];
  const ecran = useEcran();
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 30, recus: 60 });

  const sims = donnees?.sims ?? [];
  const enPlace = sims.filter((s) => s.enPlace);
  const cartes = enPlace.length ? enPlace : sims;
  const raccourcis = donnees?.raccourcis ?? {};
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;

  // La carte choisie est PARTAGÉE avec Opérations, et retenue d'une
  // ouverture à l'autre (voir `carte-choisie.ts`).
  const choisie = useCarteChoisie();
  const active = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const [operation, setOperation] = useState<Operation | null>(null);
  const [smsOuvert, setSmsOuvert] = useState<Paiement | null>(null);
  const [coordonnees, setCoordonnees] = useState(false);

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

  const [plusieurs, setPlusieurs] = useState(true);
  useEffect(() => {
    Coffre.lire(CLE_NOMBRE_CARTES)
      .then((v) => { if (v != null) setPlusieurs(Number(v) > 1); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!donnees) return;
    void Coffre.ecrire(CLE_NOMBRE_CARTES, String(cartes.length)).catch(() => {});
  }, [donnees, cartes.length]);

  const operationDe = (cle: string, titre: string, champs: Operation["champs"]): Operation => {
    const et = active ? etapesGeste(active.operateur, cle, raccourcis[active.operateur] ?? []) : [];
    return { titre, code: et[0] ?? "", etapes: et, champs,
             carte: active?.iccid, terminal: donnees?.terminal?.id ?? null,
             carteLibelle: active?.libelle, operateur: active?.operateur,
             recents: aQui(donnees?.beneficiaires,
                           clientsRecents(donnees?.paiements ?? [], active?.iccid), active?.iccid) };
  };

  // LES GESTES D'ARGENT. Un geste dont on ne connaît pas le code ne
  // s'affiche PAS : un bouton qui composerait au hasard vaut moins que pas
  // de bouton du tout.
  type Geste = { libelle: string; aide: string; icone: NomIcone; fabrique: () => Operation };
  const tous: Geste[] = active == null ? [] : [
    { libelle: t.depot, aide: tg.depotSous, icone: "ArrowDown",
      fabrique: () => operationDe("depot", t.depotTitre, [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { libelle: t.rondRetrait, aide: tg.retraitSous, icone: "Billet",
      fabrique: () => operationDe("retrait", t.retraitTitre, [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" }]) },
    { libelle: t.transfert, aide: tg.transfertSous, icone: "ArrowUp",
      fabrique: () => operationDe("transfert", t.transfertTitre, [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "50 000", type: "montant" }]) },
  ];
  const gestes = tous.filter((g) => g.fabrique().code);
  const actualiser = active && operationDe("solde", t.consulterSolde, []).code
    ? () => setOperation(operationDe("solde", t.consulterSolde, [])) : null;

  // L'ARGENT QUI VIENT DE BOUGER — toutes cartes, et rien d'autre : ni les
  // consultations de solde, ni les échecs, ni les codes, ni les publicités.
  // Toutes cartes, parce qu'un paiement arrivé sur la MTN pendant qu'on
  // regardait l'Orange ne doit pas disparaître : on répondrait « pas reçu »
  // à un client qui a payé. La carte est nommée sur chaque ligne.
  const deux = ecran.deuxColonnes;
  const mouvements = (donnees?.paiements ?? []).filter(estMouvement)
    .slice(0, deux ? LIGNES_MOUVEMENTS_LARGE : LIGNES_MOUVEMENTS);
  const aujourdhui = jourLocal(new Date(), fuseau);

  // Rien de ce qui arrive avec les données ne doit faire SAUTER l'écran : la
  // forme d'attente de chaque bloc a la hauteur du vrai (`mesures-accueil`).
  const enAttente = !active && chargement;

  const blocCarte = active ? (
    <Entree delai={60}>
      <View>
        {cartes.length > 1 ? (
          <PucesCartes cartes={cartes} active={active.iccid} deux={deux}
                       marge={ecran.marge} t={t} />
        ) : null}
        <Caisse carte={active} langue={langue} soldeCache={soldeCache}
                onBasculerSolde={basculerSolde} />
        <LigneEtat carte={active} terminal={donnees?.terminal ?? null} fuseau={fuseau}
                   langue={langue} t={t} onActualiser={actualiser} />
      </View>
    </Entree>
  ) : enAttente ? (
    // PENDANT L'ATTENTE, UNE FORME — pas le vide. L'écran ne montrait RIEN
    // tant que les chiffres n'étaient pas là : le propriétaire ne pouvait
    // pas distinguer « ça arrive » de « c'est cassé ».
    <SqueletteCaisse puces={plusieurs} />
  ) : erreur ? null : (
    // La panne passe AVANT la carte vide : hors ligne, « aucune carte »
    // serait un mensonge.
    <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm,
                    borderStyle: "dashed" }}>
      <Texte poids="demi">{t.aucuneCarte}</Texte>
      <Texte ton="doux" taille={textes.petit}
             style={{ textAlign: "center", lineHeight: 20 }}>
        {t.aucuneCarteDetail}
      </Texte>
    </Carte>
  );

  // RIEN À COMPOSER SUR UNE CARTE ABSENTE : une carte retirée montre son
  // dernier solde connu, mais aucun geste — il partirait vers une puce qui
  // n'est plus dans le boîtier.
  const ronds = active?.enPlace ? (
    <Entree delai={120}>
      <View>
        <View style={{ flexDirection: "row", justifyContent: "center",
                       width: "100%", maxWidth: 460, alignSelf: "center" }}>
          {gestes.map((g) => (
            <Rond key={g.libelle} icone={g.icone} libelle={g.libelle} aide={g.aide}
                  onPress={() => setOperation(g.fabrique())} />
          ))}
          <Rond icone="Identite" libelle={t.rondRecevoir} aide={t.recevoirAria}
                onPress={() => setCoordonnees(true)} />
          <Rond icone="Hash" libelle={t.rondUssd} aide={t.ussdAria}
                onPress={() => router.push({ pathname: "/ussd",
                                             params: { carte: active.iccid } })} />
        </View>
        {gestes.length === 0 ? (
          // Aucun code relevé pour cet opérateur : on le DIT, et on mène
          // là où il s'inscrit — sans quoi les gestes disparaissaient sans
          // un mot, comme si l'application était en panne.
          <Pressable onPress={() => router.push("/reglages")}
                     accessibilityRole="button" style={appuiTexte}>
            <Carte style={{ marginTop: espaces.md, padding: espaces.lg, borderStyle: "dashed",
                            alignItems: "center" }}>
              <Texte taille={textes.petit} ton="pale"
                     style={{ textAlign: "center", lineHeight: 20 }}>
                {t.aucunCode(active.operateur)}{" "}
                <Texte taille={textes.petit} ton="doux"
                       style={{ textDecorationLine: "underline" }}>
                  {t.aucunCodeLien}
                </Texte>.
              </Texte>
            </Carte>
          </Pressable>
        ) : null}
      </View>
    </Entree>
  ) : enAttente ? <SqueletteRonds /> : null;

  const blocMouvements = active || enAttente ? (
    <Entree delai={180}>
      <View style={{ gap: espaces.sm, marginTop: deux ? 0 : espaces.sm }}>
        {/* Le titre est le MÊME pendant l'attente : il se lit tout de suite,
            et l'écran se compose dans le bon ordre. */}
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 24,
                       gap: espaces.sm }}>
          <Texte poids="demi" accessibilityRole="header" style={{ flex: 1 }}>
            {t.mouvements}
          </Texte>
          {donnees ? (
            <Pressable onPress={() => router.push("/encaissements")} hitSlop={8}
                       accessibilityRole="button"
                       style={avecAppui({ flexDirection: "row", alignItems: "center",
                                          gap: espaces.xs })}>
              <Texte taille={textes.petit} ton="doux">{t.toutVoir}</Texte>
              <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
            </Pressable>
          ) : null}
        </View>
        {!donnees ? (
          <SqueletteListe lignes={deux ? LIGNES_MOUVEMENTS_LARGE : LIGNES_MOUVEMENTS} />
        ) : mouvements.length ? (
          <Carte>
            {mouvements.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Filet /> : null}
                <LigneMouvement paiement={p} langue={langue} aujourdhui={aujourdhui}
                                nommerCarte={sims.length > 1}
                                onPress={() => setSmsOuvert(p)} />
              </View>
            ))}
          </Carte>
        ) : (
          // Des SMS, mais aucun mouvement d'argent parmi eux : on le dit, et
          // la boîte de réception est à un appui.
          <Carte>
            <Pressable onPress={() => router.push("/encaissements")}
                       accessibilityRole="button"
                       style={avecAppui({ flexDirection: "row", alignItems: "center",
                                          gap: espaces.md, padding: espaces.lg })}>
              <Texte taille={textes.petit} ton="pale" style={{ flex: 1, lineHeight: 20 }}>
                {(donnees.paiements ?? []).length ? t.aucunMouvement : t.aucunSms}
              </Texte>
              <Icone nom="Chevron" taille={14} couleur={couleurs.encrePale} />
            </Pressable>
          </Carte>
        )}
      </View>
    </Entree>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Defilement
        contentContainerStyle={{
          paddingHorizontal: ecran.marge,
          paddingTop: espaces.sm,
          paddingBottom: margeBas,
          gap: espaces.lg,
          // Sur grand écran, le contenu se centre au lieu de s'étirer : une
          // ligne large de mille points ne se lit plus, elle se balaie.
          maxWidth: deux ? 1100 : undefined,
          width: "100%",
          alignSelf: "center",
        }}
        refreshControl={
          <RefreshControl refreshing={chargement} onRefresh={recharger}
                          tintColor={couleurs.encrePale} />
        }
      >
        {/* L'EN-TÊTE : le salut, et l'engrenage. « Overview » est parti — il
            ne disait rien ; le salut, lui, accueille. Le graphe de l'Analyse
            aussi : une icône sans nom que personne ne reconnaissait. Elle
            est dans l'onglet Comptes, sur une ligne qui dit son nom. */}
        <Entree montee={6}>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44,
                         gap: espaces.md }}>
            <Texte taille={textes.titre} poids="demi" numberOfLines={1}
                   adjustsFontSizeToFit minimumFontScale={0.75}
                   accessibilityRole="header"
                   style={{ flex: 1, letterSpacing: -0.3 }}>
              {salutation(langue, donnees?.courriel)}
            </Texte>
            <BoutonIcone nom="Settings" etiquette={t.reglages}
                         onPress={() => router.push("/reglages")} />
          </View>
        </Entree>

        {erreur ? <Accroc message={erreur} onReessayer={recharger} /> : null}

        {deux ? (
          <View style={{ flexDirection: "row", gap: espaces.xl, alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: espaces.lg }}>{blocCarte}{ronds}</View>
            <View style={{ flex: 1 }}>{blocMouvements}</View>
          </View>
        ) : (
          <>{blocCarte}{ronds}{blocMouvements}</>
        )}
      </Defilement>

      {operation ? (
        <OperationPopup operation={operation} onFermer={() => setOperation(null)}
                        onTermine={recharger} />
      ) : null}

      {smsOuvert ? (
        <FicheSms paiement={smsOuvert} onFermer={() => setSmsOuvert(null)}
                  onChange={recharger} />
      ) : null}

      {coordonnees && active ? (
        <Coordonnees langue={langue} onFermer={() => setCoordonnees(false)}
                     carte={{ iccid: active.iccid, nom: active.nom,
                              numero: active.numero,
                              operateur: active.operateur, libelle: active.libelle }} />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * LES CARTES, EN PUCES, SUR UNE LIGNE. Elles passaient sur deux lignes avec
 * quatre cartes ; un logo et les quatre chiffres suffisent à les distinguer
 * — le nom long est sur la carte elle-même. Au-delà de la largeur, la
 * rangée défile, et ramène la carte choisie en vue : sinon la carte
 * affichée n'aurait aucune puce allumée visible.
 */
function PucesCartes({ cartes, active, deux, marge, t }: {
  cartes: Sim[]; active: string; deux: boolean; marge: number; t: T;
}) {
  const rangee = useRef<ScrollView>(null);
  // TROIS MESURES, DANS N'IMPORTE QUEL ORDRE : la largeur de la rangée, la
  // place de chaque puce, et le choix — qui, retenu d'une ouverture à
  // l'autre, arrive avec les données, APRÈS une rangée déjà mesurée. La
  // première version ne regardait qu'au changement de choix ou de largeur :
  // la puce choisie venait d'apparaître, pas encore mesurée, et plus rien ne
  // la ramenait — elle restait hors de l'écran, selon l'ordre d'arrivée.
  // Chacune des trois mesures redemande donc, et seule la dernière agit.
  const places = useRef(new Map<string, { x: number; w: number }>());
  const largeur = useRef(0);
  const decalage = useRef(0);
  const bord = deux ? 0 : marge;
  const amener = useRef(() => {});
  amener.current = () => {
    const p = places.current.get(active);
    const l = largeur.current;
    if (!p || !l) return;
    const gauche = p.x - decalage.current;
    // Déjà en vue : on ne bouge rien sous le doigt.
    if (gauche >= bord - 1 && gauche + p.w <= l - bord + 1) return;
    const x = gauche + p.w > l - bord ? p.x + p.w - l + bord : p.x - bord;
    rangee.current?.scrollTo({ x: Math.max(0, x), animated: true });
  };
  useEffect(() => amener.current(), [active, bord]);

  return (
    <Defilement
      ref={rangee}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      onLayout={(e) => { largeur.current = e.nativeEvent.layout.width; amener.current(); }}
      onScroll={(e) => { decalage.current = e.nativeEvent.contentOffset.x; }}
      scrollEventThrottle={32}
      style={{ marginHorizontal: deux ? 0 : -marge, flexGrow: 0,
               marginBottom: espaces.md }}
      contentContainerStyle={{ paddingHorizontal: deux ? 0 : marge, gap: ECART_PUCES,
                               alignItems: "center" }}
    >
      {cartes.map((c) => (
        <View key={c.iccid}
              onLayout={(e) => {
                places.current.set(c.iccid,
                  { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width });
                if (c.iccid === active) amener.current();
              }}>
          <PuceCarte carte={c} actif={c.iccid === active} t={t} />
        </View>
      ))}
    </Defilement>
  );
}

/** Une puce : le logo de l'opérateur, et la fin du libellé (« 8901 »). */
function PuceCarte({ carte, actif, t }: { carte: Sim; actif: boolean; t: T }) {
  const appui = useAppui();
  const reconnu = operateurReconnu(carte.operateur);
  const fin = /·\s*(\S+)$/.exec(carte.libelle)?.[1];
  return (
    <Animated.View style={appui.style}>
      <Pressable onPress={() => { if (!actif) { choisirCarte(carte.iccid); toucherChoix(); } }}
                 {...appui}
                 accessibilityRole="button"
                 // `aria-selected` EN PLUS : react-native-web ignore
                 // `accessibilityState`, et la puce choisie ne se disait
                 // « choisie » à personne dans l'aperçu web.
                 accessibilityState={{ selected: actif }} aria-selected={actif}
                 accessibilityLabel={t.choisirCarte(carte.libelle)}
                 hitSlop={{ top: 4, bottom: 4 }}
                 style={{
                   height: HAUTEUR_PUCE,
                   flexDirection: "row", alignItems: "center", gap: espaces.xs,
                   paddingHorizontal: espaces.sm + 2,
                   borderRadius: rayons.bouton,
                   // Le trait dans les DEUX états : sans lui d'un côté, la
                   // puce choisie changeait de taille de deux points.
                   borderWidth: 1, borderColor: actif ? couleurs.accent : couleurs.trait,
                   backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
                 }}>
        {reconnu ? <LogoOperateur operateur={carte.operateur} taille={14} /> : null}
        <Texte taille={textes.petit} poids={actif ? "demi" : "moyen"} chiffresAlignes
               ton={actif ? "normal" : "doux"}
               style={actif ? { color: couleurs.surfaceHaute } : undefined}>
          {reconnu && fin ? fin : carte.libelle}
        </Texte>
      </Pressable>
    </Animated.View>
  );
}

/**
 * LA LIGNE SOUS LA CARTE : de quand date le solde — LE JOUR COMPRIS — et, à
 * droite, ce qu'on peut y faire. Sa hauteur ne bouge jamais (une ou deux
 * lignes de texte y tiennent) : l'alerte du terminal vient s'y loger au
 * lieu de pousser l'écran.
 */
function LigneEtat({ carte, terminal, fuseau, langue, t, onActualiser }: {
  carte: Sim; terminal: EtatTerminal | null; fuseau: string; langue: "en" | "fr"; t: T;
  onActualiser: (() => void) | null;
}) {
  const muet = terminal != null && !terminal.enLigne;
  let texte: string;
  if (!carte.enPlace) texte = t.carteMuette(carte.derniereVue);
  else if (carte.solde == null) texte = t.aucunSoldeCourt;
  else if (!carte.soldeMaj) texte = t.soldeSansHeure;
  else {
    // « 21:54 » seul ne dit pas si c'était ce soir ou hier soir : un solde
    // d'hier s'annonçait comme celui de maintenant — le chiffre pour lequel
    // on ouvre l'application. Une plateforme pas encore à jour n'envoie pas
    // l'instant : on garde alors l'heure seule, comme avant.
    const jour = jourDuReleve(carte.soldeLe, Date.now(), fuseau);
    texte = jour?.genre === "hier" ? t.soldeReleveHier(carte.soldeMaj)
      : jour?.genre === "avant" ? t.soldeReleveLe(jourCourt(jour.cle, langue), carte.soldeMaj)
      : t.soldeReleve(carte.soldeMaj);
  }

  return (
    <View style={{ marginTop: espaces.sm, minHeight: HAUTEUR_ETAT, flexDirection: "row",
                   alignItems: "center", gap: espaces.sm, paddingHorizontal: espaces.xs }}>
      {!carte.enPlace ? <Icone nom="Close" taille={13} couleur={couleurs.alerte} /> : null}
      <Texte taille={textes.legende} ton={carte.enPlace ? "pale" : "alerte"}
             style={{ flex: 1, lineHeight: 16 }}>
        {texte}
      </Texte>
      {muet ? (
        <Pressable onPress={() => router.push("/reglages")}
                   accessibilityRole="button"
                   accessibilityLabel={t.terminalMuetAria(terminal!.majTexte)}
                   hitSlop={{ top: 6, bottom: 6 }}
                   style={({ pressed }) => ({
                     height: HAUTEUR_ETAT, flexDirection: "row", alignItems: "center",
                     gap: espaces.xs + 2, paddingHorizontal: espaces.md,
                     borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.alerte,
                     backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                   })}>
          <Pastille couleur={couleurs.alerte} />
          <Texte taille={textes.petit} poids="moyen" ton="alerte">{t.terminalMuetCourt}</Texte>
          <Icone nom="Chevron" taille={12} couleur={couleurs.alerte} />
        </Pressable>
      ) : carte.enPlace && onActualiser ? (
        // « Actualiser » remplace le cercle « Solde » : il pose la question
        // au réseau, juste à côté de la réponse qu'il va remplacer.
        <Pressable onPress={onActualiser}
                   accessibilityRole="button"
                   accessibilityLabel={t.actualiserAria}
                   hitSlop={{ top: 6, bottom: 6 }}
                   style={({ pressed }) => ({
                     height: HAUTEUR_ETAT, flexDirection: "row", alignItems: "center",
                     gap: espaces.xs, paddingHorizontal: espaces.md,
                     borderRadius: rayons.bouton, borderWidth: 1, borderColor: couleurs.trait,
                     backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
                   })}>
          <Icone nom="Refresh" taille={14} couleur={couleurs.encre} />
          <Texte taille={textes.petit} poids="moyen">{t.actualiser}</Texte>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * UN ROND D'ACTION : le cercle, et son NOM dessous — comme les applications
 * d'opérateur que tout le monde a déjà dans la main. Tous du même dessin :
 * il y avait des cercles muets ET de grosses tuiles pour des gestes du même
 * ordre, deux familles de boutons pour une seule chose à faire. Le nom a
 * deux lignes réservées : un nom long passe à la ligne sur un petit écran
 * sans rien pousser.
 */
function Rond({ icone, libelle, aide, onPress }: {
  icone: NomIcone; libelle: string; aide: string; onPress: () => void;
}) {
  const appui = useAppui();
  // UN MOT NE SE COUPE PAS EN DEUX. Sur 320 points, une colonne fait 57 :
  // « Withdraw » en 12 n'y tenait pas, et l'écran affichait « Withdra / w ».
  // Sous 360 points, le nom passe en 11 et ne grossit plus avec le réglage
  // « taille du texte » ; au-dessus, il grossit de 15 % au plus — de quoi
  // rester entier dans sa colonne. L'aide vocale, elle, lit le nom entier
  // quoi qu'il arrive.
  const etroit = useWindowDimensions().width < 360;
  return (
    <Animated.View style={[{ width: "20%" }, appui.style]}>
      <Pressable onPress={onPress} {...appui} accessibilityRole="button"
                 accessibilityLabel={libelle} accessibilityHint={aide}
                 style={{ alignItems: "center", gap: ECART_ROND }}>
        {({ pressed }) => (
          <>
            <View style={{
              width: ROND, height: ROND, borderRadius: rayons.rond,
              borderWidth: 1, borderColor: couleurs.trait,
              backgroundColor: pressed ? couleurs.surface2 : couleurs.surfaceHaute,
              alignItems: "center", justifyContent: "center",
            }}>
              <Icone nom={icone} taille={22} couleur={couleurs.encre} />
            </View>
            <View style={{ height: NOM_ROND, width: "100%" }}>
              <Texte taille={etroit ? 11 : textes.legende} poids="moyen"
                     maxFontSizeMultiplier={etroit ? 1 : 1.15}
                     numberOfLines={2}
                     style={{ textAlign: "center", lineHeight: LIGNE_ROND }}>
                {libelle}
              </Texte>
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Un mouvement d'argent : la nature d'un coup d'œil, le nom, le montant —
 *  le jour quand ce n'est pas aujourd'hui, la carte quand il y en a
 *  plusieurs. */
function LigneMouvement({ paiement: p, langue, aujourdhui, nommerCarte, onPress }: {
  paiement: Paiement; langue: "en" | "fr"; aujourdhui: string; nommerCarte: boolean;
  onPress: () => void;
}) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  const schema = couleursCategorie(p.nature ?? p.categorie);

  return (
    <Pressable onPress={onPress}
               accessibilityRole="button"
               style={({ pressed }) => ({
                 flexDirection: "row", alignItems: "center", gap: espaces.md,
                 padding: espaces.lg,
                 backgroundColor: pressed ? couleurs.surface2 : "transparent",
               })}>
      <View style={{ width: 34, height: 34, borderRadius: rayons.petit,
                     backgroundColor: schema.fond, alignItems: "center",
                     justifyContent: "center" }}>
        <Icone nom={iconeCat(p.nature ?? p.categorie)} taille={15} couleur={schema.encre} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
          {p.nonLu ? (
            <View style={{ width: 6, height: 6, borderRadius: rayons.rond,
                           backgroundColor: couleurs.accent }} />
          ) : null}
          <Texte poids={p.nonLu ? "demi" : "moyen"} numberOfLines={1} style={{ flex: 1 }}>
            {p.tiers || p.nom}
          </Texte>
        </View>
        <Texte taille={textes.legende} ton="pale" numberOfLines={1}>
          {p.jour === aujourdhui ? p.heure : `${p.date} · ${p.heure}`}
        </Texte>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        {p.montant != null ? (
          <Texte poids="demi" chiffresAlignes taille={textes.petit}
                 ton={entree ? "positif" : sortie ? "negatif" : "doux"}>
            {entree ? "+" : sortie ? "−" : ""}{fcfa(p.montant, langue)}
          </Texte>
        ) : null}
        {nommerCarte ? (
          <Texte taille={textes.legende} ton="pale" numberOfLines={1}>{p.sim}</Texte>
        ) : null}
      </View>
    </Pressable>
  );
}
