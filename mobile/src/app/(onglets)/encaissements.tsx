// La boîte de réception : les SMS reçus par les cartes.
//
// Le pendant mobile de `web/app/encaissements/`. Même ordre, mêmes filtres :
// la recherche, puis la carte, puis la nature — du plus large au plus fin —
// et la DATE : aujourd'hui, hier, sept jours, ce mois, ou des jours choisis
// au calendrier, avec ce que la période a fait entrer et sortir.
// Les messages se groupent par JOUR, comme une messagerie.
//
// Le texte de l'opérateur s'affiche mot pour mot, dans la langue où la SIM
// l'a reçu. Le traduire serait le trahir.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Pressable, RefreshControl, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { useMargeSousLaBarre, ChampTexte, Defilement, Accroc, BoutonIcone, Carte, Filet, Texte, avecAppui } from "@/ui";
import { FicheSms, couleursCategorie, icone as iconeCat } from "@/fiche-sms";
import { texteSurEcran } from "@noyau/sms";
import { Icone, type NomIcone } from "@/icones";
import { Entree } from "@/animations";
import { SqueletteListe } from "@/squelettes";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useDonnees } from "@/donnees";
import { useLangue } from "@/langue";
import { Calendrier } from "@/calendrier";
import { Feuille } from "@/feuille";
import { chargerDonnees } from "@/api/guichet";
import { textesSms } from "@noyau/textes/sms";
import { FUSEAU_DEFAUT, fcfa, jourLocal, type Categorie, type Paiement } from "@noyau/types";
import {
  bornesDe, dansBornes, depuisPourLaBase, nomDesJours, totauxDe, type Periode,
} from "@noyau/periodes";

// Ce que la plateforme rapporte au plus pour une période (voir `MAX_SMS`).
const SMS_PAR_PERIODE = 1000;

// Les natures proposées en filtre, dans l'ordre où on les cherche.
const FILTRES: Categorie[] = ["encaissement", "envoi", "transfert", "publicite"];

// Une ligne de la liste, ou un pli de consultations de solde répétées : les
// vérifications identiques se replient derrière la plus récente — rien ne se
// supprime, tout reste à un geste. La même règle que le web (liste.tsx).
type Rangee2 =
  | { genre: "sms"; p: Paiement }
  | { genre: "soldes"; recent: Paiement; anciens: Paiement[] };

function plierLesSoldes(items: Paiement[]): Rangee2[] {
  const rangees: Rangee2[] = [];
  for (const p of items) {
    const derniere = rangees[rangees.length - 1];
    if ((p.nature ?? p.categorie) === "solde" && p.montant == null) {
      if (derniere?.genre === "soldes") {
        derniere.anciens.push(p);
        continue;
      }
      rangees.push({ genre: "soldes", recent: p, anciens: [] });
      continue;
    }
    rangees.push({ genre: "sms", p });
  }
  return rangees;
}

// `dataSet` est une propriété de react-native-web, absente des types de
// React Native : elle pose un attribut `data-…` sur le web, et rien du tout
// sur le téléphone. C'est la poignée du harnais, pas une décoration.
const MARQUE_REPOSE = { dataSet: { repose: "1" } } as object;

/** L'identité d'une ligne, pour le harnais seul. Sans elle, il ne peut pas
 *  répondre à « a-t-on atteint TOUTE la caisse ? » : depuis que la liste
 *  repose ce qui est loin derrière, compter les lignes montées ne dit plus
 *  rien de ce qu'on peut atteindre. Et le texte ne suffit pas — sur une
 *  caisse d'essai, deux encaissements se ressemblent au caractère près.
 *  Comme `data-squelette`, cet attribut n'existe que sur le web. */
const marqueLigne = (id: string) => ({ dataSet: { ligne: id } } as object);

export default function Encaissements() {
  // Ce que la barre d'onglets flottante recouvre — voir `useMargeSousLaBarre`.
  const margeBas = useMargeSousLaBarre();
  const langue = useLangue();
  const t = textesSms[langue];
  const { donnees, chargement, erreur, recharger } = useDonnees({ sms: 200 });

  const [recherche, setRecherche] = useState("");
  const [carte, setCarte] = useState<string | null>(null);       // null = toutes
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [ouvert, setOuvert] = useState<Paiement | null>(null);
  // Les plis de soldes dépliés, par l'identifiant de leur ligne récente.
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  const basculer = (id: string) =>
    setDeplies((d) => {
      const suite = new Set(d);
      if (suite.has(id)) suite.delete(id); else suite.add(id);
      return suite;
    });

  // Arriver déjà filtré : l'Analyse pousse un nom de client, la liste
  // s'ouvre sur ses paiements — même chemin que le web
  // (`/encaissements?recherche=…`). Le champ reste libre ensuite, et
  // « moment » fait que retoucher le MÊME nom refiltre quand même.
  const params = useLocalSearchParams<{ recherche?: string; moment?: string }>();
  useEffect(() => {
    if (typeof params.recherche === "string" && params.recherche) {
      setRecherche(params.recherche);
    }
  }, [params.recherche, params.moment]);

  const sims = donnees?.sims ?? [];

  // ── LA DATE ───────────────────────────────────────────────────────────
  const [periode, setPeriode] = useState<Periode>({ genre: "tout" });
  const [calendrier, setCalendrier] = useState(false);
  const fuseau = donnees?.fuseau || FUSEAU_DEFAUT;
  const bornes = useMemo(() => bornesDe(periode, Date.now(), fuseau), [periode, fuseau]);
  const recents = donnees?.paiements ?? [];
  const nomDePeriode = periode.genre === "tout" || !bornes ? null
    : periode.genre === "jours" ? nomDesJours(bornes, langue)
    : periode.genre === "aujourdhui" ? t.periodeAujourdhui
    : periode.genre === "hier" ? t.periodeHier
    : periode.genre === "semaine" ? t.periodeSemaine
    : t.periodeMois;
  // La liste de choix ouverte : la date, la carte, ou le type.
  const [feuille, setFeuille] = useState<null | "date" | "carte" | "type">(null);

  // LES DEUX CENTS DERNIERS NE COUVRENT PAS « CE MOIS ». Filtrer sur ce que
  // l'écran a déjà aurait rendu une période à moitié vide, sans le dire —
  // sur une caisse à quarante SMS par jour, deux cents s'arrêtent au
  // cinquième jour. On ne s'en contente que s'ils remontent AVANT le
  // premier jour demandé (ou s'ils sont toute la caisse) ; sinon, on demande
  // la période à la plateforme, qui la découpe dans la base.
  const couverte = bornes == null
    || recents.length < 200
    || (recents.length > 0 && recents[recents.length - 1].jour < bornes.de);
  const [duneP, setDuneP] = useState<{ de: string; lignes: Paiement[] } | null>(null);
  const [chercheP, setChercheP] = useState(false);
  const [refusP, setRefusP] = useState(false);
  const [essaiP, setEssaiP] = useState(0);
  useEffect(() => {
    if (couverte || !bornes) return;
    let vivant = true;
    setChercheP(true); setRefusP(false);
    chargerDonnees(langue, { sms: SMS_PAR_PERIODE, recus: 0,
                             depuis: depuisPourLaBase(bornes) })
      .then((d) => { if (vivant) setDuneP({ de: bornes.de, lignes: d.paiements }); })
      .catch(() => { if (vivant) setRefusP(true); })
      .finally(() => { if (vivant) setChercheP(false); });
    return () => { vivant = false; };
    // La période se résume à ses bornes ; `recents` change à chaque SMS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couverte, bornes?.de, bornes?.a, langue, essaiP]);

  const paiements = couverte ? recents
    : duneP && bornes && duneP.de === bornes.de ? duneP.lignes : [];
  // La plateforme a-t-elle coupé ? Elle rend au plus mille lignes, les plus
  // récentes : si la plus ancienne est encore DANS la période, le début de
  // la période manque — et on le dit plutôt que de laisser croire au total.
  const tronquee = !couverte && bornes != null && paiements.length >= SMS_PAR_PERIODE
    && paiements[paiements.length - 1].jour >= bornes.de;

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return paiements.filter((p) => {
      if (!dansBornes(p, bornes)) return false;
      if (carte && p.sim !== carte) return false;
      // La nature CHOISIE par le propriétaire l'emporte sur la catégorie
      // devinée — comme la couleur, l'icône et le pli des soldes de cet
      // écran (`p.nature ?? p.categorie`), et comme le web (`catDe`). Sans
      // cela, un SMS reclassé en « publicité » s'affichait en publicité mais
      // le filtre « Publicité » le cachait, et « Encaissement » le montrait
      // encore : le filtre contredisait l'écran.
      if (categorie && (p.nature ?? p.categorie) !== categorie) return false;
      if (!q) return true;
      // On cherche dans tout ce qui est lisible : le nom, le numéro, le
      // montant, et le message entier.
      return [p.nom, p.tiers, p.numero, p.smsBrut, p.reference,
              p.montant == null ? "" : String(p.montant)]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [paiements, recherche, carte, categorie, bornes]);

  // Ce que la période (et les autres filtres) a fait entrer et sortir.
  const totaux = useMemo(() => totauxDe(filtres), [filtres]);

  // Groupés par jour, dans l'ordre où ils sont arrivés.
  // ON NE REND PAS CE QUE PERSONNE NE REGARDE.
  //
  // Mesuré sur une caisse de trente jours : 201 lignes MONTÉES pour 10
  // visibles à l'écran — vingt fois trop, et 2 386 nœuds pour dix lignes.
  // Un `ScrollView` monte tous ses enfants, sur Android comme ici : chaque
  // ligne construit ses icônes, ses textes, sa mise en page, et occupe la
  // mémoire d'un téléphone qui n'en a pas beaucoup.
  //
  // On rend donc les premiers jours, puis les suivants À MESURE qu'on
  // approche du bas. Personne ne le voit : c'est ce que fait déjà toute
  // liste qui se respecte. La vraie virtualisation (`SectionList`) reste le
  // geste juste à terme — elle démonte aussi ce qui est passé — mais elle
  // demande de restructurer cet écran, et de l'éprouver sur un VRAI
  // téléphone, ce qu'on ne peut pas faire d'ici.
  // LE BUDGET SE COMPTE EN LIGNES, PAS EN JOURS.
  //
  // Il se comptait en jours — quatre au premier affichage — et cela liait ce
  // que le téléphone monte à ce que la boutique ENCAISSE. Mesuré : sur une
  // caisse à vingt encaissements par jour, ces quatre jours faisaient 88
  // lignes ; sur une caisse à quarante, les MÊMES quatre jours en font 165.
  // C'est exactement à l'envers — plus la boutique travaille, plus son
  // téléphone peine. On compte donc des lignes, et le premier affichage
  // coûte la même chose à tout le monde.
  const LIGNES_PREMIER_LOT = 40;
  const LIGNES_LOT_SUIVANT = 40;
  const [budget, setBudget] = useState(LIGNES_PREMIER_LOT);
  const [hauteurVue, setHauteurVue] = useState(0);

  const jours = useMemo(() => {
    const par = new Map<string, { libelle: string; lignes: Paiement[] }>();
    for (const p of filtres) {
      const g = par.get(p.jour) ?? { libelle: p.date, lignes: [] };
      g.lignes.push(p);
      par.set(p.jour, g);
    }
    // On plie ICI les consultations de solde répétées : ce qui se monte,
    // c'est la rangée pliée, pas l'encaissement. Compter avant le pliage
    // budgétait des lignes qui n'existent pas à l'écran.
    return [...par.values()].map((g) => ({ libelle: g.libelle,
                                           rangees: plierLesSoldes(g.lignes) }));
  }, [filtres]);

  const rangeesEnTout = useMemo(
    () => jours.reduce((n, j) => n + j.rangees.length, 0), [jours]);

  // Ce qu'on rend vraiment : les jours dans l'ordre, coupés dès le budget
  // atteint — au milieu d'un jour s'il le faut. Une seule journée très
  // chargée ne doit pas monter à elle seule quatre cents lignes.
  const rendus = useMemo(() => {
    const sortie = [];
    let reste = budget;
    for (const j of jours) {
      sortie.push({ libelle: j.libelle, rangees: j.rangees.slice(0, Math.max(1, reste)) });
      reste -= j.rangees.length;
      if (reste <= 0) break;
    }
    return sortie;
  }, [jours, budget]);

  const allonger = useCallback(() => {
    setBudget((b) => (b >= rangeesEnTout ? b : b + LIGNES_LOT_SUIVANT));
  }, [rangeesEnTout]);

  // ── CE QU'ON RELÂCHE DERRIÈRE SOI ──────────────────────────────────────
  //
  // Rendre par lots borne le PREMIER affichage, et rien d'autre : mesuré,
  // après avoir descendu un mois, la liste tenait 201 lignes et 2 161 nœuds
  // — et les tenait ENCORE une fois remonté tout en haut. Un serveur qui
  // dresse les tables au fur et à mesure, mais ne débarrasse jamais.
  //
  // On repose donc les jours qui sont loin AU-DESSUS de ce qu'on regarde. À
  // leur place, un vide de la hauteur EXACTE qu'ils occupaient — mesurée par
  // `onLayout`, jamais devinée. C'est la leçon de `verifier-l-attente` : une
  // forme à la mauvaise hauteur fait sauter l'écran, et c'est pire que de ne
  // rien faire. Ici, comme la hauteur vient de la mesure, rien ne bouge.
  //
  // Redescendre les remonte. Le contenu n'est jamais perdu : il est déjà en
  // mémoire, seul son affichage est reposé.
  const places = useRef(new Map<string, { y: number; h: number }>());
  const [defilement, setDefilement] = useState(0);
  // LES PLACES SE MESURENT POUR UNE LISTE, PAS POUR TOUTES. Après un filtre,
  // « hier » n'est plus au trentième écran mais en haut ; sa place d'avant
  // le faisait croire loin dessous, et il restait reposé — la carte du total
  // annonçait 21 SMS au-dessus d'une liste vide. Vu sur une capture. Une
  // liste neuve oublie donc les places de l'ancienne, ICI, pendant le rendu :
  // un effet arriverait un rendu trop tard.
  const placesDe = useRef(filtres);
  if (placesDe.current !== filtres) {
    places.current.clear();
    placesDe.current = filtres;
  }
  // Une marge d'un écran de chaque côté : on ne relâche que ce qui est
  // franchement hors de vue, sans quoi un petit va-et-vient du doigt
  // ferait clignoter le haut de l'écran.
  const MARGE = 1;

  // UNE NOUVELLE RECHERCHE REPART DU HAUT. Sans cela, taper trois lettres
  // après avoir descendu la liste laissait vingt jours rendus pour trois
  // résultats — et le bas de l'écran se remplissait de vide.
  useEffect(() => { setBudget(LIGNES_PREMIER_LOT); }, [filtres]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      {/* Bord à bord : le clavier ne pousse rien tout seul (voir
          feuille.tsx). La recherche vit en haut, mais un téléphone couché
          n'a que quelques lignes au-dessus du clavier. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Defilement
        contentContainerStyle={{ padding: espaces.lg, gap: espaces.lg, paddingBottom: margeBas }}
        keyboardShouldPersistTaps="handled"
        // On allonge la liste AVANT d'arriver au bout — un écran et demi
        // d'avance : la suite est déjà là quand le doigt y arrive, et rien
        // ne clignote.
        scrollEventThrottle={80}
        onScroll={({ nativeEvent: n }) => {
          const restant = n.contentSize.height
            - (n.contentOffset.y + n.layoutMeasurement.height);
          if (restant < n.layoutMeasurement.height * 1.5) allonger();
          // On ne retient la position que par PALIERS d'un demi-écran :
          // suivre le pixel ferait un rendu de toute la liste à chaque
          // image du défilement, ce qui coûterait plus cher que ce qu'on
          // cherche à économiser.
          const pas = Math.max(200, n.layoutMeasurement.height / 2);
          const palier = Math.floor(n.contentOffset.y / pas) * pas;
          setDefilement((avant) => (avant === palier ? avant : palier));
        }}
        // UNE LISTE TROP COURTE NE DÉFILE PAS, DONC NE S'ALLONGE JAMAIS.
        // Si le lot rendu ne remplit pas deux écrans, aucun geste ne peut
        // venir chercher la suite : la liste resterait bloquée là, avec des
        // encaissements hors de portée. On l'allonge alors toute seule.
        onLayout={({ nativeEvent: n }) => setHauteurVue(n.layout.height)}
        onContentSizeChange={(_, h) => {
          if (hauteurVue && h < hauteurVue * 2) allonger();
        }}
        refreshControl={<RefreshControl refreshing={chargement} onRefresh={recharger}
                                        tintColor={couleurs.encrePale} />}
      >
        <Entree>
          <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
        </Entree>

        {/* Ce que le terminal a relevé mais pas encore transmis : la liste
            paraît à jour, elle ne l'est pas — le web le dit, ici aussi. */}
        {(donnees?.terminal?.enAttente ?? 0) > 0 ? (
          <Carte style={{ padding: espaces.md }}>
            <Texte taille={textes.petit} ton="doux">
              {t.enCoursDeTransmission(donnees!.terminal!.enAttente)}
            </Texte>
          </Carte>
        ) : null}

        {/* La recherche. */}
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
              placeholder={t.recherchePlaceholder}
              placeholderTextColor={couleurs.encrePale}
              style={{
                flex: 1, paddingVertical: espaces.xs,
                fontFamily: polices.corps, fontSize: textes.corps, color: couleurs.encre,
              }}
            />
            {recherche ? (
              <BoutonIcone nom="Close" taille={16} couleur={couleurs.encrePale}
                           etiquette={t.effacerRecherche}
                           onPress={() => setRecherche("")} />
            ) : null}
          </View>
        </Entree>

        {/* LES FILTRES, EN UNE RANGÉE : la date, la carte, le type. Ils
            tenaient en trois rangées de pastilles qui défilaient de côté —
            un écran touffu, sans ordre, que le propriétaire a trouvé
            illisible. Chaque bouton dit maintenant CE qu'il filtre, ou ce
            qui est choisi ; le choix se fait dans une liste, une seule
            chose à la fois. */}
        <Entree delai={120}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center",
                         gap: espaces.sm }}>
            <BoutonFiltre icone="Calendrier" etiquette={t.filtreDateAria}
                          libelle={nomDePeriode ?? t.filtreDate} actif={nomDePeriode != null}
                          onPress={() => setFeuille("date")} />
            {sims.length > 1 ? (
              <BoutonFiltre icone="Wallet" etiquette={t.filtreCarteAria}
                            libelle={carte ?? t.filtreCarte} actif={carte != null}
                            onPress={() => setFeuille("carte")} />
            ) : null}
            <BoutonFiltre icone={categorie ? iconeDe(categorie) : "List"}
                          etiquette={t.filtreTypeAria}
                          libelle={categorie ? t.cat[categorie] : t.filtreType}
                          actif={categorie != null}
                          onPress={() => setFeuille("type")} />
            {nomDePeriode != null || carte != null || categorie != null ? (
              <Pressable accessibilityRole="button" hitSlop={8}
                         onPress={() => { setPeriode({ genre: "tout" }); setCarte(null);
                                          setCategorie(null); }}
                         style={avecAppui({ paddingHorizontal: espaces.xs })}>
                <Texte taille={textes.petit} ton="doux"
                       style={{ textDecorationLine: "underline" }}>
                  {t.effacerFiltres}
                </Texte>
              </Pressable>
            ) : null}
          </View>
        </Entree>

        {erreur ? <Accroc message={erreur} onReessayer={recharger} /> : null}
        {refusP ? (
          <Accroc message={t.periodeImpossible} onReessayer={() => setEssaiP((n) => n + 1)} />
        ) : null}

        {/* LE TOTAL DE LA PÉRIODE — ce qu'on cherchait en filtrant. Il ne
            compte que ce qui porte un montant et un sens : une publicité,
            un échec, un solde ne sont ni entrés ni sortis. */}
        {bornes && !chercheP && filtres.length ? (
          <Carte style={{ padding: espaces.lg, gap: espaces.sm }}>
            <Texte taille={textes.petit} ton="pale">
              {nomDePeriode} · {t.totalNombre(totaux.nombre)}
            </Texte>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.lg }}>
              <View style={{ gap: 2 }}>
                <Texte taille={textes.legende} ton="pale">{t.totalRecu}</Texte>
                <Texte poids="demi" chiffresAlignes style={{ color: couleurs.positif }}>
                  {totaux.recu ? "+" : ""}{fcfa(totaux.recu, langue)}
                </Texte>
              </View>
              <View style={{ gap: 2 }}>
                <Texte taille={textes.legende} ton="pale">{t.totalEnvoye}</Texte>
                <Texte poids="demi" chiffresAlignes>
                  {totaux.envoye ? "−" : ""}{fcfa(totaux.envoye, langue)}
                </Texte>
              </View>
            </View>
            {tronquee ? (
              <Texte taille={textes.legende} ton="alerte" style={{ lineHeight: 18 }}>
                {t.periodeTronquee}
              </Texte>
            ) : null}
          </Carte>
        ) : null}

        {jours.length === 0 && (chargement || chercheP) && !erreur ? (
          // L'écran le plus long à charger de l'application : c'est celui qui
          // avait le plus besoin de dire qu'il travaille.
          <SqueletteListe lignes={6} />
        ) : null}

        {jours.length === 0 && !chargement && !chercheP && !erreur && !refusP ? (
          <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
            <Texte poids="demi">
              {recherche || carte || categorie || bornes ? t.aucunResultatTitre : t.aucunSmsTitre}
            </Texte>
            <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
              {recherche || carte || categorie || bornes ? t.aucunResultatDetail : t.aucunSmsDetail}
            </Texte>
          </Carte>
        ) : null}

        {rendus.map((j, k) => {
          const place = places.current.get(j.libelle);
          // Reposé s'il est franchement HORS de ce qu'on regarde — au-dessus
          // comme en dessous — et seulement si on a DÉJÀ mesuré sa hauteur.
          // Sans mesure, on rend : mieux vaut peser trop que sauter.
          //
          // LES DEUX CÔTÉS, et il a fallu le mesurer pour le voir : ne
          // relâcher que le dessus donnait 4 lignes en bas de liste, puis
          // 202 une fois remonté en haut — tout se remontait au passage et
          // plus rien ne redescendait.
          const dessus = !!place && place.y + place.h < defilement - hauteurVue * MARGE;
          const dessous = !!place && place.y > defilement + hauteurVue * (1 + MARGE);
          const repose = hauteurVue > 0 && (dessus || dessous);
          if (repose) {
            // La marque sert au harnais, comme celle des squelettes :
            // `dataSet` n'existe que sur le web et ne part pas dans le
            // paquet Android. Sans elle, un jour reposé et un jour absent se
            // ressemblent, et on ne saurait pas ce qu'on mesure.
            return <View key={j.libelle} style={{ height: place!.h }}
                         {...MARQUE_REPOSE} />;
          }
          return (
          // LA MESURE SE PREND SUR L'ENVELOPPE, PAS DEDANS. Posée sur la vue
          // intérieure, `onLayout` rend une position relative à `Entree` —
          // c'est-à-dire zéro pour tous les jours. Tous se croyaient alors en
          // haut de la liste : ils se relâchaient TOUS dès qu'on descendait,
          // ce qui donnait un beau chiffre pour une raison fausse.
          <Entree key={j.libelle} delai={180 + k * 40}
                  onLayout={({ nativeEvent: n }) => {
                    places.current.set(j.libelle,
                                       { y: n.layout.y, h: n.layout.height });
                  }}>
            <View style={{ gap: espaces.sm }}>
              <Texte taille={textes.legende} ton="pale"
                     style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                {j.libelle}
              </Texte>
              <Carte>
                {j.rangees.map((r, i) => (
                  <View key={r.genre === "sms" ? r.p.id : r.recent.id}>
                    {i > 0 ? <Filet /> : null}
                    {r.genre === "sms" ? (
                      <Ligne paiement={r.p} langue={langue}
                             onPress={() => setOuvert(r.p)} />
                    ) : (
                      <>
                        <Ligne paiement={r.recent} langue={langue}
                               onPress={() => setOuvert(r.recent)} />
                        {/* Les consultations identiques d'avant, repliées
                            derrière la plus récente — dépliables d'un
                            geste, jamais perdues. */}
                        {r.anciens.length ? (
                          <Pressable
                                     accessibilityRole="button" onPress={() => basculer(r.recent.id)}
                                     hitSlop={6}
                                     style={avecAppui({ flexDirection: "row",
                                              alignItems: "center",
                                              gap: espaces.xs,
                                              paddingLeft: 66,
                                              paddingBottom: espaces.md })}>
                            {!deplies.has(r.recent.id)
                              && r.anciens.some((p) => p.nonLu) ? (
                              <View style={{ width: 6, height: 6,
                                             borderRadius: rayons.rond,
                                             backgroundColor: couleurs.accent }} />
                            ) : null}
                            <Texte taille={textes.legende} ton="pale"
                                   style={{ textDecorationLine: "underline" }}>
                              {deplies.has(r.recent.id)
                                ? t.replierSoldes
                                : t.soldesRepetes(r.anciens.length)}
                            </Texte>
                          </Pressable>
                        ) : null}
                        {deplies.has(r.recent.id)
                          ? r.anciens.map((p) => (
                              <View key={p.id}>
                                <Filet />
                                <Ligne paiement={p} langue={langue}
                                       onPress={() => setOuvert(p)} />
                              </View>
                            ))
                          : null}
                      </>
                    )}
                  </View>
                ))}
              </Carte>
            </View>
          </Entree>
          );
        })}
      </Defilement>
      </KeyboardAvoidingView>

      {ouvert ? (
        <FicheSms paiement={ouvert} onFermer={() => setOuvert(null)}
                  onChange={recharger} />
      ) : null}
      {feuille === "date" ? (
        <FeuilleChoix titre={t.filtreDateTitre} onFermer={() => setFeuille(null)}
          choisie={periode.genre}
          options={[
            { cle: "tout", libelle: t.periodeTout },
            { cle: "aujourdhui", libelle: t.periodeAujourdhui },
            { cle: "hier", libelle: t.periodeHier },
            { cle: "semaine", libelle: t.periodeSemaine },
            { cle: "mois", libelle: t.periodeMois },
            { cle: "jours", libelle: periode.genre === "jours" && bornes
                ? `${t.periodeChoisir} · ${nomDesJours(bornes, langue)}` : t.periodeChoisir,
              icone: "Calendrier" },
          ]}
          onChoisir={(cle) => {
            setFeuille(null);
            if (cle === "jours") setCalendrier(true);
            else setPeriode({ genre: cle as Exclude<Periode["genre"], "jours"> });
          }} />
      ) : null}
      {feuille === "carte" ? (
        <FeuilleChoix titre={t.filtreCarteTitre} onFermer={() => setFeuille(null)}
          choisie={carte ?? ""}
          options={[{ cle: "", libelle: t.toutesLesCartes },
                    ...sims.map((x) => ({ cle: x.libelle, libelle: x.libelle }))]}
          onChoisir={(cle) => { setFeuille(null); setCarte(cle || null); }} />
      ) : null}
      {feuille === "type" ? (
        <FeuilleChoix titre={t.filtreTypeTitre} onFermer={() => setFeuille(null)}
          choisie={categorie ?? ""}
          options={[{ cle: "", libelle: t.toutesLesCategories },
                    ...FILTRES.map((c) => ({ cle: c, libelle: t.cat[c], icone: iconeDe(c) }))]}
          onChoisir={(cle) => { setFeuille(null); setCategorie((cle || null) as Categorie | null); }} />
      ) : null}
      {calendrier ? (
        <Calendrier langue={langue} aujourdhui={jourLocal(new Date(), fuseau)}
                    depart={periode.genre === "jours" ? bornes : null}
                    onFermer={() => setCalendrier(false)}
                    onChoisir={(b) => { setPeriode({ genre: "jours", de: b.de, a: b.a });
                                        setCalendrier(false); }} />
      ) : null}
    </SafeAreaView>
  );
}

/** Une rangée de filtres qui glisse horizontalement : sur un écran étroit,
 *  quatre natures ne tiennent pas de front. */
/** Un bouton de filtre : ce qu'il filtre (« Date »), ou ce qui est choisi
 *  (« Hier ») — rempli de sombre dès qu'il filtre quelque chose, pour qu'on
 *  voie d'un coup d'œil que la liste n'est pas entière. */
function BoutonFiltre({ libelle, etiquette, actif, icone, onPress }: {
  libelle: string; etiquette: string; actif: boolean; icone: NomIcone; onPress: () => void;
}) {
  const teinte = actif ? couleurs.surfaceHaute : couleurs.encreDouce;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${etiquette} : ${libelle}`}
      onPress={onPress}
      style={avecAppui({
        flexDirection: "row", alignItems: "center", gap: espaces.xs,
        minHeight: 40, paddingLeft: espaces.md, paddingRight: espaces.sm,
        borderRadius: rayons.rond,
        borderWidth: 1, borderColor: actif ? couleurs.accent : couleurs.trait,
        backgroundColor: actif ? couleurs.accent : couleurs.surfaceHaute,
      })}
    >
      <Icone nom={icone} taille={15} couleur={teinte} />
      <Texte taille={textes.petit} poids="moyen" style={{ color: actif ? teinte : couleurs.encre }}>
        {libelle}
      </Texte>
      {/* Le chevron tourné vers le bas : « ça s'ouvre ». */}
      <View style={{ transform: [{ rotate: "90deg" }] }}>
        <Icone nom="Chevron" taille={13} couleur={teinte} />
      </View>
    </Pressable>
  );
}

/** La liste d'un filtre : une option par ligne, une coche sur la choisie. */
function FeuilleChoix({ titre, options, choisie, onChoisir, onFermer }: {
  titre: string;
  options: { cle: string; libelle: string; icone?: NomIcone }[];
  choisie: string;
  onChoisir: (cle: string) => void;
  onFermer: () => void;
}) {
  const langue = useLangue();
  return (
    <Feuille visible libelleFermer={textesSms[langue].fermer} onFermer={onFermer}
             entete={<Texte taille={textes.intertitre} poids="demi">{titre}</Texte>}>
      <Carte>
        {options.map((o, i) => {
          const elle = o.cle === choisie;
          return (
            <View key={o.cle || "tout"}>
              {i > 0 ? <Filet /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: elle }}
                accessibilityLabel={o.libelle}
                onPress={() => onChoisir(o.cle)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: espaces.md,
                  minHeight: 52, paddingHorizontal: espaces.lg,
                  backgroundColor: pressed ? couleurs.surface2 : "transparent",
                })}
              >
                {o.icone ? <Icone nom={o.icone} taille={18} couleur={couleurs.encreDouce} /> : null}
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

function iconeDe(c: Categorie): NomIcone {
  if (c === "encaissement" || c === "depot") return "ArrowDown";
  if (c === "envoi" || c === "retrait") return "ArrowUp";
  if (c === "transfert") return "Transfer";
  if (c === "publicite") return "Megaphone";
  if (c === "solde") return "Refresh";
  return "Bubble";
}

/** Une ligne : la pastille de nature, l'entête, le message, le montant. */
function Ligne({ paiement: p, langue, onPress }: {
  paiement: Paiement; langue: "en" | "fr"; onPress: () => void;
}) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  const schema = couleursCategorie(p.nature ?? p.categorie);

  return (
    <Pressable
               accessibilityRole="button" onPress={onPress}
               {...marqueLigne(p.id)}
               style={({ pressed }) => ({
                 flexDirection: "row", gap: espaces.md, padding: espaces.lg,
                 backgroundColor: pressed ? couleurs.surface2 : "transparent",
               })}>
      <View style={{
        width: 36, height: 36, borderRadius: rayons.petit, backgroundColor: schema.fond,
        alignItems: "center", justifyContent: "center",
      }}>
        <Icone nom={iconeCat(p.nature ?? p.categorie)} taille={16} couleur={schema.encre} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaces.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: espaces.xs }}>
            {p.nonLu ? (
              <View style={{ width: 6, height: 6, borderRadius: rayons.rond,
                             backgroundColor: couleurs.accent }} />
            ) : null}
            <Texte taille={textes.petit} ton="pale" numberOfLines={1} style={{ flex: 1 }}>
              {[p.numero, p.sim, p.heure].filter(Boolean).join(" · ")}
            </Texte>
          </View>
          {p.montant != null ? (
            <Texte poids="demi" chiffresAlignes taille={textes.petit}
                   ton={entree ? "positif" : sortie ? "negatif" : "doux"}>
              {entree ? "+" : sortie ? "−" : ""}{fcfa(p.montant, langue)}
            </Texte>
          ) : null}
        </View>

        {p.tiers ? (
          <Texte poids={p.nonLu ? "demi" : "moyen"} numberOfLines={1}>{p.tiers}</Texte>
        ) : (
          // Sans partie humaine (publicité, information), c'est le message
          // lui-même qui prend la place — mot pour mot.
          // MASQUÉ, comme dans la fiche. La défense contre les codes à
          // usage unique ne vaut que si elle est posée PARTOUT où le texte
          // s'affiche : une liste qui montre le code en clair annule le
          // masquage de la fiche.
          <Texte ton="doux" taille={textes.petit} numberOfLines={2}
                 style={{ lineHeight: 20 }}>
            {texteSurEcran(p)}
          </Texte>
        )}
      </View>
    </Pressable>
  );
}
