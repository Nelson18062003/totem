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
//
// CE QUI BOUGE SOUS LE DOIGT, ET CE QUI NE DOIT PLUS BOUGER.
//
// Le propriétaire descendait dans la liste pour retrouver un paiement ; un
// SMS arrivait, ou il revenait de WhatsApp, et la liste se raccourcissait
// sous son doigt, ou glissait d'une ligne au moment où il allait toucher.
// Sept causes, chacune réglée à sa place :
//
//   — le budget de la liste (quarante lignes) revenait à quarante à CHAQUE
//     mise à jour des données. Il n'y revient plus que quand les CRITÈRES
//     changent : la recherche, la carte, le type, la période ;
//   — toutes les places mesurées s'oubliaient à chaque donnée neuve. Seuls
//     les jours dont le CONTENU a changé sont maintenant remesurés ;
//   — un SMS arrivé AU-DESSUS de ce qu'on lit poussait tout vers le bas.
//     Le défilement garde maintenant la ligne regardée à sa place
//     (`maintainVisibleContentPosition`) — et pour qu'il puisse le faire,
//     chaque LIGNE est un enfant direct du défilement : le téléphone ne
//     sait ancrer qu'un enfant direct, et quand le jour entier en était un,
//     lire DANS « Aujourd'hui » ancrait le jour lui-même, dont le haut ne
//     bouge pas quand un SMS s'y ajoute — rien n'était compensé, dans le
//     cas le plus courant ;
//   — chaque jour remonté rejouait son entrée (un délai, puis un fondu) :
//     en remontant vite, des journées passaient en blanc. L'entrée ne se
//     joue plus qu'à la composition de l'écran ;
//   — la liste montrait TOUT ce que le cahier portait : mille SMS tant que
//     l'Analyse était passée depuis moins de cinq minutes, deux cents
//     ensuite. Elle ne montre plus que ce qu'elle a demandé (`SMS_ECRAN`) ;
//   — une période filtrée retombait en formes grises dès qu'un SMS la
//     faisait sortir du cahier. Ce que le cahier en a reste à l'écran
//     jusqu'à la réponse de la plateforme ;
//   — une rafale de SMS faisait reposer la journée qu'on lisait, le temps
//     d'un rendu : on ne repose plus un jour qu'en défilant.

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Pressable, View, type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import {
  useMargeSousLaBarre, ChampTexte, Defilement, Accroc, BoutonIcone, Carte, Filet, Texte,
  avecAppui, HAUTEUR_BARRE_ONGLETS,
} from "@/ui";
import { FicheSms, couleursCategorie, icone as iconeCat } from "@/fiche-sms";
import { texteSurEcran } from "@noyau/sms";
import { Icone, type NomIcone } from "@/icones";
import { Entree } from "@/animations";
import { SqueletteListe } from "@/squelettes";
import { couleurs, espaces, polices, rayons, textes } from "@/theme/jetons";
import { useAgeDesChiffres, useDonnees, useMaintenant, useRoue } from "@/donnees";
import { boitierSeTait } from "@/terminal-hors-ligne";
import { useLangue } from "@/langue";
import { useSession } from "@/session";
import { Calendrier } from "@/calendrier";
import { Feuille } from "@/feuille";
import { chargerDonnees, ErreurGuichet } from "@/api/guichet";
import { textesSms } from "@noyau/textes/sms";
import { FUSEAU_DEFAUT, fcfa, jourLocal, type Categorie, type Paiement } from "@noyau/types";
import {
  bornesDe, dansBornes, depuisPourLaBase, libelleJour, nomDesJours, totauxDe,
  type Bornes, type Periode,
} from "@noyau/periodes";

// Ce que la plateforme rapporte au plus pour une période (voir `MAX_SMS`).
const SMS_PAR_PERIODE = 1000;

// CE QUE LA LISTE DEMANDE AU CAHIER, ET CE QU'ELLE MONTRE : les deux cents
// derniers SMS — le même nombre aux deux bouts. Elle montrait TOUT ce que le
// cahier portait : après l'Analyse, qui en fait porter mille, on descendait
// à la trois-centième ligne, on passait cinq minutes sur WhatsApp, et au
// retour le cahier, relu sans l'Analyse, n'en rapportait plus que deux
// cents — la ligne qu'on lisait disparaissait, la liste se raccourcissait
// sous le doigt. Ce que la liste n'a pas demandé, elle ne le montre pas ;
// les jours plus anciens passent par la période, qui les demande à part.
const SMS_ECRAN = 200;

// Les natures proposées en filtre, dans l'ordre où on les cherche.
const FILTRES: Categorie[] = ["encaissement", "envoi", "transfert", "publicite"];

// Une liste vide qui reste LA MÊME d'un rendu à l'autre : `[]` écrit en
// ligne en ferait une neuve à chaque fois, et tout ce qui en découle
// (filtres, jours, mesures) se recalculerait pour rien.
const AUCUN: Paiement[] = [];

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

const idDe = (r: Rangee2) => (r.genre === "sms" ? r.p.id : r.recent.id);

/** Ce qui décide de la HAUTEUR d'une ligne à l'écran : qui elle est, et ce
 *  qu'elle montre en dessous de l'entête — un nom (une ligne) ou le texte
 *  du message (une ou deux). Le reste — lu ou non, la nature, le reçu —
 *  change une couleur ou une icône, jamais une hauteur. */
const formeDe = (p: Paiement) => `${p.id}:${p.tiers ? "n" : texteSurEcran(p).length}`;

/** L'EMPREINTE d'un jour rendu : tant qu'elle ne change pas, sa hauteur
 *  mesurée reste juste. Une lecture marquée, une nature posée ne la
 *  touchent pas ; un SMS de plus, si. */
function empreinteDe(rangees: Rangee2[]): string {
  return rangees.map((r) => (r.genre === "sms" ? formeDe(r.p)
    : `${formeDe(r.recent)}+${r.anciens.map(formeDe).join("+")}`)).join(",");
}

/** « Aujourd'hui », « Hier », « 28 septembre » — dit À L'HEURE DE L'ÉCRAN.
 *  Une clé illisible (une plateforme d'avant `jour`) ne fait pas tomber la
 *  liste : on retombe sur ce que la plateforme avait écrit. */
function nomDuJour(cle: string, aujourdhui: string, langue: "en" | "fr", repli: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(cle) ? libelleJour(cle, aujourdhui, langue) : (repli || cle);
}

function memesLignes(a: Paiement[], b: Paiement[]): boolean {
  if (a.length !== b.length) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

type JourRendu = { cle: string; libelle: string; rangees: Rangee2[]; empreinte: string };

// UNE CARTE PAR JOUR, DESSINÉE LIGNE À LIGNE. Chaque ligne est un enfant
// direct du défilement (voir l'en-tête) : c'est la seule façon pour le
// téléphone d'ancrer la ligne qu'on lit quand un SMS s'ajoute au-dessus.
// Le cadre du jour se dessine donc par morceaux — le haut arrondi sur la
// première ligne, le bas sur la dernière, les côtés sur toutes — et donne à
// l'œil exactement la carte d'avant.
const BORD: ViewStyle = {
  backgroundColor: couleurs.surfaceHaute, borderColor: couleurs.trait,
  borderLeftWidth: 1, borderRightWidth: 1, overflow: "hidden",
};
const HAUT: ViewStyle = {
  borderTopWidth: 1, borderTopLeftRadius: rayons.carte, borderTopRightRadius: rayons.carte,
};
const BAS: ViewStyle = {
  borderBottomWidth: 1, borderBottomLeftRadius: rayons.carte,
  borderBottomRightRadius: rayons.carte,
};
const RANGEES: Record<string, ViewStyle> = {
  "00": BORD,
  "10": { ...BORD, ...HAUT },
  "01": { ...BORD, ...BAS },
  "11": { ...BORD, ...HAUT, ...BAS },
};
const styleRangee = (premiere: boolean, derniere: boolean) =>
  RANGEES[`${premiere ? 1 : 0}${derniere ? 1 : 0}`];

// L'en-tête d'un jour, et le vide qui le remplace quand le jour est reposé :
// la MÊME marge au-dessus, pour que l'un prenne exactement la place de
// l'autre.
const MARGE_JOUR = espaces.lg;

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

// Une marge d'un écran de chaque côté : on ne relâche que ce qui est
// franchement hors de vue, sans quoi un petit va-et-vient du doigt ferait
// clignoter le haut de l'écran.
const MARGE = 1;

export default function Encaissements() {
  // Ce que la barre d'onglets flottante recouvre — voir `useMargeSousLaBarre`.
  const margeBas = useMargeSousLaBarre();
  const basEcran = useSafeAreaInsets().bottom;
  const langue = useLangue();
  const t = textesSms[langue];
  const { perdue } = useSession();
  const {
    donnees, attente, erreur, recharger, actualiser, quand, duCahier,
  } = useDonnees({ sms: SMS_ECRAN });
  // LA ROUE NE TOURNE QUE SOUS LE DOIGT. Elle vient du cahier, telle
  // quelle : aucun chargement ne peut plus l'allumer — ni l'ouverture d'un
  // SMS, ni une notification, ni une période qu'on demande à la plateforme.
  const roue = useRoue();
  // L'heure de l'ÉCRAN, refaite chaque minute : « aujourd'hui », « hier »
  // et les bornes des périodes changent à minuit, sans attendre une requête.
  const maintenant = useMaintenant();
  const { horsLigne } = useAgeDesChiffres();

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
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);
  // LES BORNES SUIVENT LE JOUR, PAS LA MINUTE. Calculées une fois pour
  // toutes à l'ouverture, « Aujourd'hui » restait la veille après minuit ;
  // recalculées en objet neuf à chaque minute, elles referaient toute la
  // liste soixante fois par heure. On les garde donc tant que leurs deux
  // jours ne changent pas.
  const calculees = bornesDe(periode, maintenant, fuseau);
  const deCalcule = calculees?.de;
  const aCalcule = calculees?.a;
  const bornes = useMemo<Bornes | null>(
    () => (deCalcule && aCalcule ? { de: deCalcule, a: aCalcule } : null),
    [deCalcule, aCalcule]);
  const recents = useMemo(() => {
    const lus = donnees?.paiements;
    if (!Array.isArray(lus)) return AUCUN;
    return lus.length > SMS_ECRAN ? lus.slice(0, SMS_ECRAN) : lus;
  }, [donnees]);
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
    || recents.length < SMS_ECRAN
    || (recents.length > 0 && recents[recents.length - 1].jour < bornes.de);

  // ── LA PÉRIODE DEMANDÉE À PART ────────────────────────────────────────
  //
  // RIEN NE PEUT PLUS RESTER COINCÉ. « En recherche » et « impossible »
  // étaient deux drapeaux posés à la main : choisir « Ce mois » puis
  // « Aujourd'hui » avant la réponse annulait la première demande… et son
  // `finally`, qui seul baissait « en recherche ». Le total n'apparaissait
  // plus jamais, ou les formes grises battaient sans fin. Ils sont
  // maintenant CALCULÉS, à partir de ce qu'on a reçu et de ce qui a échoué,
  // pour LA période affichée : n'étant rangés nulle part, ils ne peuvent
  // pas rester vrais tout seuls.
  //
  // ET LA PÉRIODE SUIT LE CAHIER. Elle n'était demandée qu'au choix : un
  // encaissement arrivé ensuite n'y entrait jamais, et tirer pour
  // rafraîchir faisait tourner la roue sur une liste qui ne bougeait pas.
  // Chaque relecture réussie du cahier (`quand`) — la notification, le
  // retour devant l'application, le doigt qui tire — la redemande, EN
  // SILENCE : la liste d'avant reste à l'écran pendant ce temps.
  //
  // MAIS SEULEMENT DEVANT. Les onglets restent montés : « Ce mois » posé
  // ici, puis l'Accueil, et chaque passage du cahier — chaque notification,
  // et toutes les vingt secondes tant que le terminal annonce des SMS en
  // route — redemandait jusqu'à mille SMS (264 Ko, mesurés pour l'écran des
  // cartes) pour un écran que personne ne regardait, une ou deux fois par
  // notification. Caché, l'écran ne demande rien ; revenu devant,
  // il redemande la période si le cahier a bougé entre-temps — et seulement
  // alors. Le doigt qui tire est toujours devant : il la relance encore.
  const devant = useIsFocused();
  const cleP = couverte || !bornes ? null : `${bornes.de}…${bornes.a}`;
  const [lueP, setLueP] = useState<{ cle: string; lignes: Paiement[] } | null>(null);
  const [rateeP, setRateeP] = useState<string | null>(null);
  const [essaiP, setEssaiP] = useState(0);
  const cleCourante = useRef(cleP);
  cleCourante.current = cleP;
  // LES RÉPONSES SONT NUMÉROTÉES : deux demandes de la même période se
  // croisent (un SMS, puis un retour devant l'application), et la plus
  // ancienne ne doit pas effacer la plus récente. Seule la DERNIÈRE
  // demandée a le droit de dire « impossible ».
  const ordreP = useRef({ dernier: 0, applique: 0 });
  // Ce qui a été demandé en dernier : la période, la langue, le passage du
  // cahier, l'essai. Revenir devant sans que rien de cela ait changé ne
  // redemande rien. (Un AUTRE motif entre deux — une autre période, puis
  // celle-ci de nouveau — redemande : la réponse d'avant a pu être écartée
  // par la plus récente.)
  const demandee = useRef<string | null>(null);
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => { monte.current = false; };
  }, []);
  useEffect(() => {
    if (!cleP || !bornes || !devant) return;
    const motif = [cleP, langue, quand ?? "", essaiP].join("|");
    if (demandee.current === motif) return;
    demandee.current = motif;
    const n = ++ordreP.current.dernier;
    const cle = cleP;
    chargerDonnees(langue, { sms: SMS_PAR_PERIODE, recus: 0,
                             depuis: depuisPourLaBase(bornes) })
      .then((d) => {
        if (!monte.current || cle !== cleCourante.current || n < ordreP.current.applique) return;
        ordreP.current.applique = n;
        // Une réponse sans liste n'est pas une période vide.
        const lignes = Array.isArray(d?.paiements) ? d.paiements : AUCUN;
        // Rien n'a bougé : LE MÊME objet, et aucune des mille lignes ne se
        // redessine — la période se relit maintenant à chaque passage du
        // cahier, et la plupart du temps rien n'y a changé.
        setLueP((avant) => (avant && avant.cle === cle && memesLignes(avant.lignes, lignes)
          ? avant : { cle, lignes }));
        setRateeP((r) => (r === cle ? null : r));
      })
      .catch((e: unknown) => {
        // Une session expirée n'est pas une période impossible : c'est un
        // retour au verrou, comme partout ailleurs.
        if (e instanceof ErreurGuichet && e.statut === 401) { perdue(); return; }
        if (!monte.current || cle !== cleCourante.current || n !== ordreP.current.dernier) return;
        setRateeP(cle);
      });
    // La période se résume à sa clé ; `quand` est la relecture du cahier,
    // `essaiP` le bouton « Réessayer », `devant` le retour sur l'onglet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleP, langue, quand, essaiP, devant]);

  const lignesP = cleP != null && lueP?.cle === cleP ? lueP.lignes : null;
  // Rien encore pour CETTE période, et pas d'échec connu : on cherche.
  const chercheP = cleP != null && lignesP == null && rateeP !== cleP;
  // Rien pour cette période, et le dernier essai a échoué : on le dit. Une
  // période déjà affichée dont la relecture échoue reste à l'écran, muette
  // — comme le cahier, qui ne dit la panne qu'à l'écran qui n'a rien.
  const refusP = cleP != null && lignesP == null && rateeP === cleP;
  // EN ATTENDANT LA PÉRIODE, CE QUE LE CAHIER EN A DÉJÀ. Une période tenue
  // par le cahier cesse de l'être au premier SMS qui arrive (les deux cents
  // derniers ne remontent plus avant son premier jour) : la liste tombait
  // alors de quarante lignes à zéro, une forme grise à la place, le total
  // effacé — et ramenée en haut si on lisait plus bas. Si la demande
  // échouait, « impossible » remplaçait une liste qui était juste. Les
  // lignes que le cahier porte DANS la période restent donc à l'écran ; la
  // réponse ajoute les plus anciennes en dessous. Les formes grises ne
  // viennent que si le cahier n'a RIEN de la période (des jours anciens).
  const paiements = cleP == null ? recents : (lignesP ?? recents);
  // LE TOTAL NE SE DIT QUE SUR UNE PÉRIODE ENTIÈRE : celle que le cahier
  // couvre, ou celle que la plateforme a rendue. Sur les seules lignes du
  // cahier, il serait faux sans le dire — un total partiel, sur de l'argent.
  const totalSur = bornes != null && (cleP == null || lignesP != null);
  // La plateforme a-t-elle coupé ? Elle rend au plus mille lignes, les plus
  // récentes : si la plus ancienne est encore DANS la période, le début de
  // la période manque — et on le dit plutôt que de laisser croire au total.
  const tronquee = lignesP != null && bornes != null && lignesP.length >= SMS_PAR_PERIODE
    && lignesP[lignesP.length - 1].jour >= bornes.de;

  // Ce que la fiche vient de changer (lu, nature, reçu), reporté sur la
  // période qu'on tient à part — le cahier, la fiche le corrige elle-même.
  const retoucherPeriode = useCallback((id: string, champs: Partial<Paiement>) => {
    setLueP((l) => (l && l.lignes.some((x) => x.id === id)
      ? { ...l, lignes: l.lignes.map((x) => (x.id === id ? { ...x, ...champs } : x)) }
      : l));
  }, []);

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

  // ── LES CRITÈRES, ET EUX SEULS, REMETTENT LA LISTE AU DÉPART ───────────
  //
  // UNE NOUVELLE RECHERCHE REPART DU HAUT : taper trois lettres après avoir
  // descendu la liste laissait vingt jours rendus pour trois résultats, et
  // le bas de l'écran se remplissait de vide. Mais la règle était écrite sur
  // la LISTE filtrée, qui change aussi à chaque SMS, à chaque retour devant
  // l'application, à chaque SMS qu'on ouvre : la liste se recoupait à
  // quarante lignes sous le doigt de qui lisait plus bas. Elle s'écrit
  // maintenant sur les CRITÈRES — et se décide pendant le rendu : un effet
  // arriverait un rendu trop tard, avec un rendu de quatre cents lignes
  // entre les deux.
  const criteres = [recherche, carte ?? "", categorie ?? "", bornes?.de ?? "", bornes?.a ?? ""]
    .join("\u0000");
  const [budget, setBudget] = useState(LIGNES_PREMIER_LOT);
  const [vue, setVue] = useState({ criteres, generation: 0 });
  // Le haut de chaque jour, mesuré (contenu du défilement).
  const positions = useRef(new Map<string, number>());
  if (vue.criteres !== criteres) {
    setVue({ criteres, generation: vue.generation + 1 });
    setBudget(LIGNES_PREMIER_LOT);
    // LES PLACES SE MESURENT POUR UNE LISTE, PAS POUR TOUTES. Après un
    // filtre, « hier » n'est plus au trentième écran mais en haut ; sa place
    // d'avant le faisait croire loin dessous, et il restait reposé — la
    // carte du total annonçait 21 SMS au-dessus d'une liste vide. Vu sur une
    // capture. Les positions s'oublient donc avec les critères, et chaque
    // jour se remonte (`generation`) pour se remesurer : un en-tête resté
    // immobile ne redonnerait jamais sa place, et une ligne déplacée sans
    // changer de taille non plus (le navigateur ne signale que les tailles).
    positions.current.clear();
  }

  // Groupés par jour, dans l'ordre où ils sont arrivés.
  const jours = useMemo(() => {
    const par = new Map<string, Paiement[]>();
    for (const p of filtres) {
      const g = par.get(p.jour);
      if (g) g.push(p); else par.set(p.jour, [p]);
    }
    // On plie ICI les consultations de solde répétées : ce qui se monte,
    // c'est la rangée pliée, pas l'encaissement. Compter avant le pliage
    // budgétait des lignes qui n'existent pas à l'écran.
    return [...par].map(([cle, lignes]) => ({
      cle,
      // LE JOUR SE DIT À L'HEURE DE L'ÉCRAN. `p.date` est écrit par la
      // plateforme au moment où elle répond, et rangé tel quel dans le
      // cahier : relu le lendemain matin, les paiements d'hier se rangeaient
      // sous « AUJOURD'HUI », ceux d'avant-hier sous « HIER ».
      libelle: nomDuJour(cle, aujourdhui, langue, lignes[0].date),
      rangees: plierLesSoldes(lignes),
    }));
  }, [filtres, aujourdhui, langue]);

  const rangeesEnTout = useMemo(
    () => jours.reduce((n, j) => n + j.rangees.length, 0), [jours]);

  // ON NE REND PAS CE QUE PERSONNE NE REGARDE.
  //
  // Mesuré sur une caisse de trente jours : 201 lignes MONTÉES pour 10
  // visibles à l'écran — vingt fois trop, et 2 386 nœuds pour dix lignes.
  // Un `ScrollView` monte tous ses enfants, sur Android comme ici : chaque
  // ligne construit ses icônes, ses textes, sa mise en page, et occupe la
  // mémoire d'un téléphone qui n'en a pas beaucoup.
  //
  // On rend donc les premières lignes, puis les suivantes À MESURE qu'on
  // approche du bas — coupées dès le budget atteint, au milieu d'un jour
  // s'il le faut : une seule journée très chargée ne doit pas monter à elle
  // seule quatre cents lignes.
  const rendus = useMemo(() => {
    const sortie: JourRendu[] = [];
    let reste = budget;
    for (const j of jours) {
      const rangees = j.rangees.slice(0, Math.max(1, reste));
      sortie.push({ cle: j.cle, libelle: j.libelle, rangees, empreinte: empreinteDe(rangees) });
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
  // On repose donc les jours qui sont loin de ce qu'on regarde. À leur
  // place, un vide de la hauteur EXACTE qu'ils occupaient — mesurée par
  // `onLayout`, jamais devinée. C'est la leçon de `verifier-l-attente` : une
  // forme à la mauvaise hauteur fait sauter l'écran, et c'est pire que de ne
  // rien faire. Redescendre les remonte : le contenu n'est jamais perdu, il
  // est déjà en mémoire, seul son affichage est reposé.
  //
  // UNE HAUTEUR VAUT POUR UN CONTENU. Elle est rangée avec l'EMPREINTE du
  // jour mesuré : un jour qui a changé pendant qu'il était reposé (un SMS de
  // plus « aujourd'hui ») n'a plus de hauteur connue, et se rend pour être
  // remesuré. Les autres gardent la leur — les oublier toutes à chaque
  // donnée neuve, comme avant, laissait des jours montés et immobiles sans
  // mesure (le téléphone ne redonne une place que si elle change), donc
  // jamais plus relâchés.
  //
  // Le bas d'un jour, c'est le bas de sa dernière ligne ; on retient donc le
  // bas de CHAQUE ligne, par son identité : une ligne qui n'a pas bougé
  // garde une mesure juste, et celle qui devient la dernière en a déjà une.
  const hauteurs = useRef(new Map<string, { h: number; empreinte: string }>());
  const basDesLignes = useRef(new Map<string, number>());
  const derniersRendus = useRef(new Map<string, JourRendu>());
  derniersRendus.current = useMemo(() => new Map(rendus.map((j) => [j.cle, j])), [rendus]);
  const [defilement, setDefilement] = useState(0);
  const [hauteurVue, setHauteurVue] = useState(0);
  const defilementVu = useRef(0);
  const hauteurVueVue = useRef(0);
  hauteurVueVue.current = hauteurVue;
  // Un vide qui découvre qu'il est À L'ÉCRAN (sa place a changé sous lui)
  // demande un rendu : il ne doit jamais rester un trou là où l'on regarde.
  const [, setRevoir] = useState(0);

  const remesurer = (cle: string) => {
    const j = derniersRendus.current.get(cle);
    const y = positions.current.get(cle);
    if (!j || y == null || !j.rangees.length) return;
    let fond = -Infinity;
    for (const r of j.rangees) {
      const b = basDesLignes.current.get(idDe(r));
      if (b == null) return;
      fond = Math.max(fond, b);
    }
    if (fond > y) hauteurs.current.set(cle, { h: fond - y, empreinte: j.empreinte });
  };
  const placeDe = (j: JourRendu) => {
    const y = positions.current.get(j.cle);
    const m = hauteurs.current.get(j.cle);
    return y != null && m && m.empreinte === j.empreinte ? { y, h: m.h } : null;
  };
  // Franchement HORS de ce qu'on regarde — au-dessus comme en dessous.
  //
  // LES DEUX CÔTÉS, et il a fallu le mesurer pour le voir : ne relâcher que
  // le dessus donnait 4 lignes en bas de liste, puis 202 une fois remonté en
  // haut — tout se remontait au passage et plus rien ne redescendait.
  const horsDeVue = (place: { y: number; h: number }, haut: number, vueH: number) =>
    vueH > 0 && (place.y + place.h < haut - vueH * MARGE || place.y > haut + vueH * (1 + MARGE));

  // Ce que ce rendu pose : chaque jour, rendu ou reposé. Reposé s'il est
  // franchement hors de vue, et seulement si on a DÉJÀ mesuré sa hauteur
  // pour CE contenu. Sans mesure, on rend : mieux vaut peser trop que
  // sauter.
  //
  // ON NE REPOSE QU'EN DÉFILANT. Le boîtier revient d'une coupure et livre
  // vingt-cinq SMS d'un coup pendant qu'on lit plus bas : le téléphone
  // décale le défilement de 1 800 points pour garder la ligne lue en place,
  // mais il dit les nouvelles PLACES avant le nouveau DÉFILEMENT. Un rendu
  // entre les deux (un vide qui se découvre à l'écran) jugeait la journée
  // qu'on lisait — descendue de 1 800 points — loin dessous, d'après
  // l'ancien défilement, et la remplaçait par un vide : un trou sous les
  // yeux jusqu'à l'événement suivant. Une décision de repos ne se prend
  // donc que dans un rendu où le défilement a changé de palier ; les autres
  // rendus — une mesure, une donnée neuve, un vide qui revient — gardent
  // les décisions d'avant et ne font que REMONTER.
  const palierDecide = useRef<number | null>(null);
  const dejaReposes = useRef(new Set<string>());
  const decide = palierDecide.current !== defilement;
  const affiches = rendus.map((j) => {
    const place = placeDe(j);
    const loin = !!place && horsDeVue(place, defilement, hauteurVue);
    return { j, place, repose: loin && (decide || dejaReposes.current.has(j.cle)) };
  });
  palierDecide.current = defilement;
  dejaReposes.current = new Set(affiches.filter((a) => a.repose).map((a) => a.j.cle));
  // UN JOUR QUI A CHANGÉ SANS BOUGER se remesure quand même. Le téléphone
  // ne redonne une place que si elle CHANGE : un jour dont le contenu
  // change sans que rien ne se déplace (une ligne remplacée par une autre
  // de même hauteur) n'aurait jamais plus de hauteur valable pour son
  // nouveau contenu — donc ne serait jamais plus relâché. Après chaque
  // rendu, les jours rendus se recalculent sur leurs dernières mesures ;
  // si quelque chose a bougé, les mesures qui arrivent ensuite corrigent.
  const reels = useRef<string[]>([]);
  reels.current = affiches.filter((a) => !a.repose).map((a) => a.j.cle);
  useEffect(() => {
    for (const cle of reels.current) remesurer(cle);
  });

  // L'ENTRÉE NE SE JOUE QU'À LA COMPOSITION DE L'ÉCRAN. Les jours montés au
  // premier affichage montent et se révèlent ; tout ce qui vient ensuite —
  // un lot de plus, un jour reposé qui revient, une autre période — est là
  // tout de suite. Voir `Entree`.
  const [composition, setComposition] = useState(true);
  useEffect(() => {
    if (composition && !attente) setComposition(false);
  }, [composition, attente]);

  // ── CE QUE LE TERMINAL N'A PAS ENCORE TRANSMIS ────────────────────────
  //
  // La liste paraît à jour, elle ne l'est pas : le web le dit, ici aussi.
  // La carte était posée EN HAUT de la liste : elle la poussait d'un bloc
  // en apparaissant, et la faisait remonter d'un bloc en disparaissant —
  // souvent une minute plus tard, une fois les SMS arrivés. Elle FLOTTE
  // maintenant au-dessus de la barre d'onglets, à la place de la pastille
  // « pas de réseau » (qui l'emporte : des chiffres qui datent ne disent
  // rien de ce qui est en route), et ne pousse rien.
  //
  // Elle ne promet plus « elle se met à jour toute seule » : le cahier
  // repasse deux fois (voir `SUIVIS_EN_ATTENTE_MS` dans `donnees.tsx`), puis
  // s'arrête — pas de pouls. Une longue transmission se suit en tirant.
  // Des chiffres relus du téléphone n'en disent rien non plus : ce compte
  // date du dernier passage.
  const enAttente = donnees?.terminal?.enAttente ?? 0;
  // Un boîtier qui se tait ne transmet rien : son dernier compte n'est pas
  // « en cours de transmission » — et l'accueil dit déjà « hors ligne ».
  const avis = enAttente > 0 && !horsLigne && !duCahier && !boitierSeTait(donnees, duCahier);
  const [hauteurAvis, setHauteurAvis] = useState(0);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      {/* Bord à bord : le clavier ne pousse rien tout seul (voir
          feuille.tsx). La recherche vit en haut, mais un téléphone couché
          n'a que quelques lignes au-dessus du clavier. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Defilement
        contentContainerStyle={{
          padding: espaces.lg,
          // La dernière ligne doit pouvoir passer AU-DESSUS de l'avis qui
          // flotte : rien ne devient inatteignable.
          paddingBottom: margeBas + (avis ? hauteurAvis + espaces.sm : 0),
        }}
        keyboardShouldPersistTaps="handled"
        // LA LIGNE QU'ON LIT RESTE OÙ ELLE EST. Un SMS qui arrive au-dessus,
        // un jour reposé qui revient d'un point plus haut : le téléphone
        // décale le défilement d'autant, avant de dessiner. Il ancre le
        // premier enfant direct visible — d'où les lignes en enfants
        // directs. Tout en haut, l'ancre est l'en-tête de l'écran : le
        // nouveau SMS apparaît alors à sa place, sous les yeux, comme il se
        // doit. (Le web l'ignore ; c'est un réglage du téléphone.)
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
          defilementVu.current = palier;
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
        refreshControl={roue}
      >
        {/* L'EN-TÊTE DE L'ÉCRAN : un seul enfant du défilement, ses blocs
            espacés entre eux. Les jours suivent, ligne à ligne. */}
        <View style={{ gap: espaces.lg }}>
          <Entree>
            <Texte taille={textes.titre} poids="demi">{t.titre}</Texte>
          </Entree>

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

          {/* La panne ne se dit qu'à l'écran qui n'a RIEN : celui qui a ses
              SMS les garde, et la pastille du bas dit qu'ils datent. Le
              message reste jusqu'au succès — le cahier réessaie seul. */}
          {erreur ? <Accroc message={erreur} onReessayer={() => void recharger()} /> : null}
          {refusP ? (
            <Accroc message={t.periodeImpossible} onReessayer={() => setEssaiP((n) => n + 1)} />
          ) : null}

          {/* LE TOTAL DE LA PÉRIODE — ce qu'on cherchait en filtrant. Il ne
              compte que ce qui porte un montant et un sens : une publicité,
              un échec, un solde ne sont ni entrés ni sortis.
              PENDANT QU'ON CHERCHE, LA CARTE GARDE SA PLACE, sans chiffres :
              elle apparaissait à la réponse, en haut, et poussait toute la
              liste vers le bas sous les yeux — ou disparaissait le temps
              d'une relecture, et la faisait remonter. Les chiffres attendus
              sont des formes à la hauteur exacte d'une ligne de texte. */}
          {bornes && ((totalSur && filtres.length > 0) || chercheP) ? (
            <Carte style={{ padding: espaces.lg, gap: espaces.sm }}>
              <Texte taille={textes.petit} ton="pale">
                {totalSur ? `${nomDePeriode} · ${t.totalNombre(totaux.nombre)}` : nomDePeriode}
              </Texte>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaces.lg }}>
                <View style={{ gap: 2 }}>
                  <Texte taille={textes.legende} ton="pale">{t.totalRecu}</Texte>
                  {totalSur ? (
                    <Texte poids="demi" chiffresAlignes style={{ color: couleurs.positif }}>
                      {totaux.recu ? "+" : ""}{fcfa(totaux.recu, langue)}
                    </Texte>
                  ) : <ChiffreAttendu />}
                </View>
                <View style={{ gap: 2 }}>
                  <Texte taille={textes.legende} ton="pale">{t.totalEnvoye}</Texte>
                  {totalSur ? (
                    <Texte poids="demi" chiffresAlignes>
                      {totaux.envoye ? "−" : ""}{fcfa(totaux.envoye, langue)}
                    </Texte>
                  ) : <ChiffreAttendu />}
                </View>
              </View>
              {tronquee ? (
                <Texte taille={textes.legende} ton="alerte" style={{ lineHeight: 18 }}>
                  {t.periodeTronquee}
                </Texte>
              ) : null}
            </Carte>
          ) : null}

          {jours.length === 0 && (attente || chercheP) && !erreur && !refusP ? (
            // L'écran le plus long à charger de l'application : c'est celui qui
            // avait le plus besoin de dire qu'il travaille. Des formes grises,
            // jamais une roue.
            <SqueletteListe lignes={6} />
          ) : null}

          {/* L'ÉTAT VIDE NE MENT PAS. Il ne se montre que quand l'écran a SA
              réponse — ni en attente, ni en panne — et qu'elle est vide. */}
          {jours.length === 0 && !attente && !chercheP && !erreur && !refusP ? (
            <Carte style={{ padding: espaces.xl, alignItems: "center", gap: espaces.sm }}>
              <Texte poids="demi">
                {recherche || carte || categorie || bornes ? t.aucunResultatTitre : t.aucunSmsTitre}
              </Texte>
              <Texte ton="doux" taille={textes.petit} style={{ textAlign: "center", lineHeight: 20 }}>
                {recherche || carte || categorie || bornes ? t.aucunResultatDetail : t.aucunSmsDetail}
              </Texte>
            </Carte>
          ) : null}
        </View>

        {affiches.map(({ j, place, repose }, k) => {
          if (repose && place) {
            // La marque sert au harnais, comme celle des squelettes :
            // `dataSet` n'existe que sur le web et ne part pas dans le
            // paquet Android. Sans elle, un jour reposé et un jour absent se
            // ressemblent, et on ne saurait pas ce qu'on mesure.
            return (
              <View key={`r${vue.generation}:${j.cle}`} {...MARQUE_REPOSE}
                    style={{ marginTop: MARGE_JOUR, height: place.h }}
                    onLayout={({ nativeEvent: n }) => {
                      positions.current.set(j.cle, n.layout.y);
                      const m = hauteurs.current.get(j.cle);
                      if (m && !horsDeVue({ y: n.layout.y, h: m.h }, defilementVu.current,
                                          hauteurVueVue.current)) {
                        setRevoir((x) => x + 1);
                      }
                    }} />
            );
          }
          const delai = 180 + k * 40;
          return (
            <Fragment key={`j:${j.cle}`}>
              {/* LA MESURE SE PREND SUR L'ENFANT DU DÉFILEMENT, pas dedans.
                  Posée sur une vue intérieure, `onLayout` rend une position
                  relative à son parent — c'est-à-dire zéro pour tous les
                  jours. Tous se croyaient alors en haut de la liste : ils se
                  relâchaient TOUS dès qu'on descendait, ce qui donnait un
                  beau chiffre pour une raison fausse. */}
              <Entree key={`t${vue.generation}`} anime={composition} delai={delai}
                      style={{ marginTop: MARGE_JOUR, marginBottom: espaces.sm }}
                      onLayout={({ nativeEvent: n }) => {
                        positions.current.set(j.cle, n.layout.y);
                        remesurer(j.cle);
                      }}>
                <Texte taille={textes.legende} ton="pale"
                       style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {j.libelle}
                </Texte>
              </Entree>
              {j.rangees.map((r, i) => {
                const id = idDe(r);
                return (
                  // Remontée elle aussi quand les critères changent : le
                  // navigateur ne redonne une mesure que si la TAILLE change,
                  // et une ligne restée montée mais déplacée par un filtre
                  // garderait le bas d'une autre liste.
                  <Entree key={`${vue.generation}:${id}`} anime={composition} delai={delai}
                          style={styleRangee(i === 0, i === j.rangees.length - 1)}
                          onLayout={({ nativeEvent: n }) => {
                            basDesLignes.current.set(id, n.layout.y + n.layout.height);
                            remesurer(j.cle);
                          }}>
                    {i > 0 ? <Filet /> : null}
                    {r.genre === "sms" ? (
                      <Ligne paiement={r.p} langue={langue} onOuvrir={setOuvert} />
                    ) : (
                      <>
                        <Ligne paiement={r.recent} langue={langue} onOuvrir={setOuvert} />
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
                                <Ligne paiement={p} langue={langue} onOuvrir={setOuvert} />
                              </View>
                            ))
                          : null}
                      </>
                    )}
                  </Entree>
                );
              })}
            </Fragment>
          );
        })}
      </Defilement>
      </KeyboardAvoidingView>

      {avis ? (
        <Animated.View
          entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}
          // Il ne capte aucun doigt : la liste se touche et défile à travers.
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          onLayout={({ nativeEvent: n }) => setHauteurAvis(n.layout.height)}
          style={{
            position: "absolute", left: 0, right: 0,
            bottom: Math.max(basEcran, espaces.md) + HAUTEUR_BARRE_ONGLETS + espaces.sm,
            alignItems: "center", paddingHorizontal: espaces.lg,
          }}
        >
          <View style={{
            flexDirection: "row", alignItems: "center", gap: espaces.sm,
            paddingHorizontal: espaces.md, paddingVertical: espaces.sm,
            borderRadius: rayons.carte, maxWidth: 520,
            backgroundColor: couleurs.accent,
          }}>
            <Icone nom="Inbox" taille={14} couleur={couleurs.surfaceHaute} />
            <Texte taille={textes.legende}
                   style={{ color: couleurs.surfaceHaute, flexShrink: 1, lineHeight: 16 }}>
              {t.enCoursDeTransmission(enAttente)}
            </Texte>
          </View>
        </Animated.View>
      ) : null}

      {ouvert ? (
        // Un geste dans la fiche relit EN SILENCE : la fiche corrige le
        // cahier sur place, et la relecture confirme sans roue.
        <FicheSms paiement={ouvert} fuseau={fuseau}
                  onFermer={() => setOuvert(null)}
                  onChange={() => actualiser()}
                  onRetouche={retoucherPeriode} />
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
        <Calendrier langue={langue} aujourdhui={aujourdhui}
                    depart={periode.genre === "jours" ? bornes : null}
                    onFermer={() => setCalendrier(false)}
                    onChoisir={(b) => { setPeriode({ genre: "jours", de: b.de, a: b.a });
                                        setCalendrier(false); }} />
      ) : null}
    </SafeAreaView>
  );
}

/** La place d'un chiffre du total qui n'est pas encore arrivé : une ligne
 *  de texte VIDE (une espace insécable), dans le même corps que le chiffre —
 *  donc exactement sa hauteur, quel que soit le réglage « taille du texte »
 *  du téléphone. Aucun chiffre dedans : ni un zéro, ni un total partiel,
 *  qu'un œil pressé prendrait pour le vrai. */
function ChiffreAttendu() {
  return (
    <View style={{ alignSelf: "flex-start", minWidth: 96, borderRadius: rayons.petit,
                   backgroundColor: couleurs.surface2 }}>
      <Texte poids="demi" chiffresAlignes>{" "}</Texte>
    </View>
  );
}

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
  if (c === "encaissement") return "ArrowDown";
  if (c === "envoi") return "ArrowUp";
  // Un dépôt et un retrait n'ont pas de sens fixe : chez l'agent, le retrait
  // du client FAIT ENTRER l'argent et le dépôt le fait sortir ; chez le
  // client, c'est l'inverse. Une flèche y mentirait une fois sur deux.
  if (c === "depot" || c === "retrait") return "Bank";
  if (c === "transfert") return "Transfer";
  if (c === "publicite") return "Megaphone";
  if (c === "solde") return "Refresh";
  return "Bubble";
}

/** Une ligne : la pastille de nature, l'entête, le message, le montant.
 *
 *  MÉMORISÉE : elle ne se redessine que si SON SMS a changé. Le cahier
 *  corrigé sur place (un SMS lu) ne change que l'objet de ce SMS-là ; un
 *  palier du défilement refait la liste, pas les deux cents lignes. */
const Ligne = memo(function Ligne({ paiement: p, langue, onOuvrir }: {
  paiement: Paiement; langue: "en" | "fr"; onOuvrir: (p: Paiement) => void;
}) {
  const entree = p.sens === "in";
  const sortie = p.sens === "out";
  const schema = couleursCategorie(p.nature ?? p.categorie);

  return (
    <Pressable
               accessibilityRole="button" onPress={() => onOuvrir(p)}
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
});
