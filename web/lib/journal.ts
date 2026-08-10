// Ce que la seconde moitié de la console a besoin de savoir : les versions du
// logiciel, le journal, les alertes.
//
// CE QUE CE FICHIER DÉCIDE, ET QUI NE SE DEVINE PAS EN LE SURVOLANT
//
// 1. IL NE DEMANDE JAMAIS « commandes.parametres » À LA BASE.
//    Le fichier voisin (« lib/console.ts ») demande « select=* » partout, et il
//    a raison : nommer les colonnes rend un écran vide quand la base a une
//    migration de retard. Ici on fait l'inverse, pour UNE raison et une seule :
//    « parametres » porte le code composé sur la SIM, et une réponse marquée
//    « secret » porte le code confidentiel Mobile Money le temps que le robot
//    la relève. Une colonne qu'on ne demande pas ne peut pas fuir dans une page
//    HTML, dans un journal de serveur, ni dans une capture d'écran. Le prix est
//    accepté : sur une base incomplète, le journal est vide au lieu d'être
//    pauvre.
//
// 2. UNE LIGNE DE JOURNAL NE PORTE JAMAIS DE TEXTE LIBRE NON LAVÉ.
//    Ce qui est fait est nommé par un vocabulaire FERMÉ (« a demandé un
//    solde », « est entré », « a levé une alerte »), traduit à l'écran. Le seul
//    texte libre qui subsiste — ce que le boîtier écrit lui-même, le titre
//    d'une alerte — passe par « sansSecret ». Voir son commentaire : elle
//    masque plus que nécessaire, exprès.
//
// 3. IL ÉCRIT DEUX CHOSES, ET DEUX SEULEMENT.
//    « accuserReception » et « clore ». Ce sont les seuls gestes de toute la
//    console, ils ne touchent qu'à la table « alertes » et qu'aux cinq colonnes
//    de COLONNES_DE_L_ACCUSE et COLONNES_DE_LA_CLOTURE. Aucun chemin d'ici ne
//    mène à « commandes » : l'administrateur ne fait agir aucun terminal, et ne
//    déplace aucun argent (« sortir_argent » n'est pas dans sa liste, voir
//    lib/roles.ts).
//
// 4. VOIR N'EST PAS RÉSOUDRE.
//    Les deux gestes écrivent dans des colonnes disjointes. Fondre les deux
//    ferait disparaître de l'écran des choses que personne n'a réparées, et
//    c'est exactement la façon dont une supervision se met à mentir.
//
// 5. « PERSONNE N'ÉCRIT ICI » N'EST PAS « TOUT VA BIEN ».
//    Aujourd'hui, rien ne remplit « alertes » : le robot calcule ses alertes et
//    n'en fait qu'un message Telegram. Un écran vide serait donc lu comme une
//    flotte en bonne santé. « chargerAlertes » va donc chercher, dans la
//    flotte elle-même, de quoi contredire ce silence — combien de boîtiers vont
//    mal en ce moment sans qu'aucune alerte ne soit ouverte.

import { lire, modifier, relie } from "./base";
import {
  chargerFlotte, dateLisible, ecartLisible, momentLisible,
  type TerminalDeFlotte, type Vivacite,
} from "./console";
import type { Langue } from "./langue";

export { relie };

// Douala ne change pas d'heure. Un décalage fixe suffit donc à découper une
// journée, et il vaut mieux qu'une bibliothèque de fuseaux : le jour du
// journal est le jour du commerçant, pas celui du serveur.
const DECALAGE_DOUALA = "+01:00";

// --- Laver un texte de ce qu'il ne doit jamais porter ------------------------

const MASQUE = "••••";

/**
 * Les règles de masquage, dans l'ordre où elles s'appliquent.
 *
 * ELLES MASQUENT PLUS QUE NÉCESSAIRE, ET C'EST VOULU. Une suite de quatre
 * chiffres dans une ligne de journal peut être un montant, une référence — ou
 * un code. Le journal n'a aucun moyen de savoir lequel, et se tromper une seule
 * fois écrit un code confidentiel dans une page qui reste. Perdre un montant
 * ici ne coûte rien : les montants vivent sur les écrans du commerce, où ils
 * ont une colonne à eux et un sens.
 */
const REGLES: readonly (readonly [RegExp, string])[] = [
  // « code : 408913 », « PIN=1234 », « token: eyJhbGci… »
  [/\b(code|pin|jeton|token|mot de passe|password|secret|otp)\b\s*[:=]?\s*\S+/gi,
    `$1 ${MASQUE}`],
  // Un code composé sur la carte — « #150# », « *126*1# ». C'est par là que
  // l'argent sort.
  [/[*#][0-9*#]+#/g, MASQUE],
  // Une longue suite opaque : une empreinte, un jeton de session.
  [/\b[A-Za-z0-9_-]{20,}\b/g, MASQUE],
  // « 408 913 » — un code se colle avec ses espaces, et arrive donc espacé.
  [/\b\d{1,4}(?:[\s.]\d{3,4})+\b/g, MASQUE],
  // Toute suite de quatre chiffres ou plus.
  [/\d{4,}/g, MASQUE],
];

/** Le même texte, débarrassé de ce qu'une ligne de journal ne doit pas porter. */
export function sansSecret(texte: string | null | undefined): string {
  if (!texte) return "";
  let propre = String(texte);
  for (const [motif, remplacement] of REGLES) {
    propre = propre.replace(motif, remplacement);
  }
  return propre;
}

// --- Ce que la base contient -------------------------------------------------

type LigneVersion = {
  version: string;
  publiee_le: string;
  envoyee_le: string | null;
  resume: string | null;
  correctif_securite: boolean;
  retiree_le: string | null;
};

type LigneEntree = {
  id: number; personne: number | null; commerce: string | null;
  issue: string; moyen: string | null; appareil: string | null;
  lieu: string | null; survenu_le: string;
};

type LigneCommande = {
  id: number; terminal: string; type: string; etat: string;
  demandee_le: string; traitee_le: string | null;
  demandee_par: number | null; commerce: string | null;
};

type LigneSession = {
  personne: number; commerce: string | null; appareil: string | null;
  lieu: string | null; ouverte_le: string;
  revoquee_le: string | null; revoquee_motif: string | null;
};

type LigneEvenement = {
  id: number; terminal: string; texte: string; survenu_le: string;
};

type LigneAlerteBrute = {
  id: number; terminal: string | null; commerce: string | null;
  genre: string; gravite: string; titre: string; detail: string | null;
  ouverte_le: string;
  vue_le: string | null; vue_par?: number | null;
  close_le: string | null; close_par: number | null; close_motif?: string | null;
};

type LignePersonne = { id: number; nom: string };
type LigneCommerce = { id: string; nom: string };
type LigneTerminalNu = {
  id: string; nom: string | null; commerce?: string | null;
  vu_le: string | null; retire_le?: string | null;
};

// --- Les versions ------------------------------------------------------------

/**
 * L'état d'un boîtier vis-à-vis du logiciel. Sept mots, et deux d'entre eux ne
 * doivent JAMAIS se confondre : « en_retard » est une machine qu'on sait en
 * arrière ; « muet » est une machine dont on ne sait plus rien. La seconde est
 * plus grave, et elle se lit facilement comme la première — le boîtier annonce
 * encore la version qu'il portait la dernière fois qu'il a parlé, et cette
 * valeur vieillit sans jamais changer d'apparence.
 */
export type EtatDuLogiciel =
  | "expose_et_muet" | "muet" | "expose" | "hors_registre"
  | "jamais_dit" | "en_retard" | "a_jour" | "retire";

const RANG_LOGICIEL: Record<EtatDuLogiciel, number> = {
  // Exposé ET hors d'atteinte : le correctif ne partira pas tout seul, et
  // personne ne le saura sans se déplacer.
  expose_et_muet: 0,
  // On ne sait pas ce qu'il porte EN CE MOMENT. Plus grave qu'un retard connu.
  muet: 1,
  // Un trou de sécurité a été bouché ailleurs, pas chez lui.
  expose: 2,
  // Il porte un logiciel que le registre ne connaît pas : ni à jour, ni en
  // retard — invérifiable, ce qui n'est pas rassurant.
  hors_registre: 3,
  // Il parle et n'a jamais dit ce qu'il porte.
  jamais_dit: 4,
  en_retard: 5,
  a_jour: 6,
  retire: 7,
};

export function rangDuLogiciel(etat: EtatDuLogiciel): number {
  return RANG_LOGICIEL[etat];
}

export type BoitierEtSonLogiciel = {
  id: string;
  nom: string;
  lieu: string;
  commerces: string[];
  vivacite: Vivacite;
  /** « il y a 6 h » — la fraîcheur en toutes lettres, jamais une pastille seule. */
  depuis: string;
  /** Le logiciel annoncé. Vide quand le boîtier ne l'a jamais dit. */
  version: string;
  /** Ce que cette version-là change, si le registre la connaît. */
  resume: string;
  /** Le jour où cette version a été envoyée à la flotte. Vide sinon. */
  envoyeeLe: string;
  etat: EtatDuLogiciel;
  /** Les correctifs de sécurité passés depuis, du plus ancien au plus récent. */
  correctifsManques: string[];
};

export type VersionDuRegistre = {
  version: string;
  publiee: string;
  envoyee: string;
  resume: string;
  correctif: boolean;
  /** Combien de boîtiers en service la portent, aujourd'hui. */
  combien: number;
};

export type ParcLogiciel = {
  relie: boolean;
  /** Aucune version déclarée : l'écran ne peut pas dire qui est en retard. */
  registreVide: boolean;
  /** Ce que la flotte devrait porter. Vide quand rien n'a été envoyé. */
  attendue: string;
  attendueDepuis: string;
  attendueResume: string;
  /** Publiées, pas encore envoyées à la flotte. Elles ne mettent personne en retard. */
  aLEssai: VersionDuRegistre[];
  /** Déjà triés par retard — le plus exposé d'abord, jamais par nom. */
  boitiers: BoitierEtSonLogiciel[];
  exposes: number;
  muets: number;
  enRetard: number;
  aJour: number;
  /** Le parc tel qu'il est : quelle version, sur combien de boîtiers. */
  portees: { version: string; combien: number }[];
};

function versionsEnvoyees(registre: LigneVersion[]): LigneVersion[] {
  return registre
    .filter((v) => v.envoyee_le && !v.retiree_le)
    .sort((a, b) =>
      new Date(a.envoyee_le!).getTime() - new Date(b.envoyee_le!).getTime());
}

/**
 * L'état d'un boîtier, et ce qui lui manque.
 *
 * Le classement se fait sur DEUX questions séparées : est-ce qu'on sait ce
 * qu'il porte, et est-ce que ce qu'il porte est à jour. Les mélanger produit
 * l'erreur qu'on veut éviter — un boîtier muet rangé sous « en retard », c'est
 * quelqu'un qui attend une mise à jour au lieu de prendre la route.
 */
function etatDuBoitier(
  t: TerminalDeFlotte,
  envoyees: LigneVersion[],
): { etat: EtatDuLogiciel; manques: string[] } {
  if (t.vivacite === "retire") return { etat: "retire", manques: [] };

  const parle = t.vivacite === "actif" || t.vivacite === "en_retard";

  if (!t.version) {
    // Il n'a jamais dit ce qu'il porte. Muet, c'est pire encore.
    return { etat: parle ? "jamais_dit" : "muet", manques: [] };
  }
  if (envoyees.length === 0) {
    // Rien n'a jamais été envoyé : on ne peut comparer à rien. Dire « à jour »
    // ici serait une invention pure.
    return { etat: parle ? "hors_registre" : "muet", manques: [] };
  }

  const sienne = envoyees.findIndex((v) => v.version === t.version);
  if (sienne === -1) {
    return { etat: parle ? "hors_registre" : "muet", manques: [] };
  }

  const apres = envoyees.slice(sienne + 1);
  const manques = apres.filter((v) => v.correctif_securite).map((v) => v.version);

  if (manques.length > 0) {
    return { etat: parle ? "expose" : "expose_et_muet", manques };
  }
  if (!parle) return { etat: "muet", manques: [] };
  return { etat: apres.length > 0 ? "en_retard" : "a_jour", manques: [] };
}

/** Le parc logiciel : qui porte quoi, et qui est resté en arrière. */
export async function chargerParcLogiciel(langue: Langue): Promise<ParcLogiciel> {
  // La flotte est déjà lue, triée et nommée par « lib/console.ts ». On ne la
  // relit pas : un second calcul du même parc finirait par diverger du premier,
  // et deux écrans qui ne disent pas la même chose valent moins qu'un seul.
  const [flotte, registre] = await Promise.all([
    chargerFlotte(langue),
    lire<LigneVersion>("versions?select=*"),
  ]);

  const envoyees = versionsEnvoyees(registre);
  const derniere = envoyees[envoyees.length - 1] ?? null;

  const enService = flotte.terminaux.filter((t) => t.vivacite !== "retire");
  const combienPorte = (v: string) =>
    enService.filter((t) => t.version === v).length;

  const boitiers: BoitierEtSonLogiciel[] = flotte.terminaux
    .map((t) => {
      const { etat, manques } = etatDuBoitier(t, envoyees);
      const connue = registre.find((v) => v.version === t.version);
      return {
        id: t.id,
        nom: t.nom,
        lieu: t.lieu,
        commerces: t.commerces,
        vivacite: t.vivacite,
        depuis: t.depuis,
        version: t.version,
        resume: connue?.resume ?? "",
        envoyeeLe: connue?.envoyee_le ? dateLisible(connue.envoyee_le, langue) : "",
        etat,
        correctifsManques: manques,
      };
    })
    // Par retard, jamais par nom. À rang égal, le plus longtemps silencieux
    // devant : entre deux boîtiers exposés, celui qu'on ne joint plus est celui
    // pour lequel il faut prendre la route.
    .sort((a, b) =>
      rangDuLogiciel(a.etat) - rangDuLogiciel(b.etat) ||
      a.id.localeCompare(b.id));

  const compte = (e: EtatDuLogiciel[]) =>
    boitiers.filter((b) => e.includes(b.etat)).length;

  return {
    relie,
    registreVide: registre.length === 0,
    attendue: derniere?.version ?? "",
    attendueDepuis: derniere?.envoyee_le ? dateLisible(derniere.envoyee_le, langue) : "",
    attendueResume: derniere?.resume ?? "",
    aLEssai: registre
      .filter((v) => !v.envoyee_le && !v.retiree_le)
      .sort((a, b) =>
        new Date(b.publiee_le).getTime() - new Date(a.publiee_le).getTime())
      .map((v) => ({
        version: v.version,
        publiee: dateLisible(v.publiee_le, langue),
        envoyee: "",
        resume: v.resume ?? "",
        correctif: v.correctif_securite,
        combien: combienPorte(v.version),
      })),
    boitiers,
    exposes: compte(["expose", "expose_et_muet"]),
    muets: compte(["muet", "expose_et_muet"]),
    enRetard: compte(["en_retard"]),
    aJour: compte(["a_jour"]),
    portees: flotte.versions,
  };
}

// --- Le journal ---------------------------------------------------------------

/**
 * Ce qui a été fait, nommé par un vocabulaire FERMÉ.
 *
 * C'est la garantie n° 2 de ce fichier, et elle est structurelle : le libellé
 * d'une ligne de journal ne vient jamais de la base, il vient de cette liste et
 * se traduit dans « lib/textes/journal.ts ». Aucun chemin ne permet donc à un
 * code, un jeton ou un message d'opérateur d'atterrir dans le titre d'une
 * ligne.
 */
export type Geste =
  | "entree_ouverte" | "entree_refusee" | "entree_ralentie" | "entree_expiree"
  | "entree_invitation"
  | "session_ouverte" | "session_fermee"
  | "demande_solde" | "demande_recu" | "demande_ussd" | "demande_identite"
  | "demande_autre"
  | "alerte_ouverte" | "alerte_vue" | "alerte_close"
  | "boitier_ecrit";

export type SourceDeJournal = "porte" | "session" | "demande" | "alerte" | "boitier";

export type LigneDuJournal = {
  cle: string;
  source: SourceDeJournal;
  geste: Geste;
  /** « 12 Mar, 14:02 » — heure de Douala, jamais celle du navigateur. */
  quand: string;
  survenuLe: string;
  /** Qui a fait le geste. Vide quand la base ne nomme personne. */
  quiNom: string;
  quiId: number | null;
  commerce: string | null;
  commerceNom: string;
  /** Le boîtier concerné, quand il y en a un. */
  terminal: string;
  /** La précision, déjà lavée. Jamais un texte brut de la base. */
  precision: string;
  /** L'issue, en trois mots fermés — l'écran colore là-dessus. */
  issue: "faite" | "refusee" | "attente" | "neutre";
};

export type FiltreDuJournal = {
  /** L'identifiant d'une personne. */
  personne: number | null;
  commerce: string | null;
  /** « AAAA-MM-JJ », le jour tel qu'on le vit à Douala. */
  jour: string | null;
};

export type QuiPeutFiltrer = { id: number; nom: string };

export type Journal = {
  relie: boolean;
  lignes: LigneDuJournal[];
  /** Un filtre est posé : un résultat vide ne veut alors pas dire « rien n'existe ». */
  filtre: FiltreDuJournal;
  filtreActif: boolean;
  /** De quoi construire les filtres, sans que l'écran ait à relire la base. */
  gens: QuiPeutFiltrer[];
  commerces: { id: string; nom: string }[];
  jours: string[];
  /** Le jour filtré, écrit pour être lu : « 12 Mar 2026 ». */
  jourLisible: string;
  /** Vrai quand le filtre par personne écarte ce que les boîtiers écrivent. */
  boitiersEcartes: boolean;
  /** Combien de lignes ont été demandées au plus — l'écran le dit en pied. */
  plafond: number;
};

const PLAFOND = 120;
const PAR_SOURCE = 200;

const GESTE_PAR_ISSUE: Record<string, Geste> = {
  ouverte: "entree_ouverte",
  refusee: "entree_refusee",
  ralentie: "entree_ralentie",
  expiree: "entree_expiree",
  invitation: "entree_invitation",
};

const GESTE_PAR_COMMANDE: Record<string, Geste> = {
  solde: "demande_solde",
  recu: "demande_recu",
  ussd: "demande_ussd",
  ussd_reponse: "demande_ussd",
  ussd_fin: "demande_ussd",
  identite: "demande_identite",
};

/** Le début et la fin d'une journée de Douala, en ISO. */
function bornesDuJour(jour: string): { debut: string; fin: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const debut = new Date(`${jour}T00:00:00${DECALAGE_DOUALA}`);
  if (Number.isNaN(debut.getTime())) return null;
  const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

/** Le jour de Douala d'un horodatage, sous la forme « AAAA-MM-JJ ». */
export function jourDeDouala(ts: string): string {
  const d = new Date(new Date(ts).getTime() + 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Un identifiant qui vient de l'adresse ne part jamais tel quel en requête. */
function propre(valeur: string): string {
  return valeur.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
}

function bornes(colonne: string, jour: string | null): string {
  if (!jour) return "";
  const b = bornesDuJour(jour);
  if (!b) return "";
  return `&${colonne}=gte.${b.debut}&${colonne}=lt.${b.fin}`;
}

/**
 * Le journal, filtrable par personne, par commerce, par jour.
 *
 * LA QUESTION À LAQUELLE IL RÉPOND, ET IL N'Y EN A QU'UNE : « qui a fait sortir
 * cet argent mardi ? » — posée un jour précis, sous pression, par quelqu'un qui
 * n'a pas le temps de comprendre un écran. D'où les trois filtres, et d'où le
 * fait qu'ils se cumulent.
 */
export async function chargerJournal(
  filtre: FiltreDuJournal,
  langue: Langue,
): Promise<Journal> {
  const personne = filtre.personne && filtre.personne > 0 ? filtre.personne : null;
  const commerce = filtre.commerce ? propre(filtre.commerce) : null;
  const jour = filtre.jour && bornesDuJour(filtre.jour) ? filtre.jour : null;

  const parPersonne = personne ? `&personne=eq.${personne}` : "";
  const parCommerce = commerce ? `&commerce=eq.${encodeURIComponent(commerce)}` : "";

  const [entrees, commandes, sessions, alertes, evenements,
         gens, commerces, terminaux, joursPorte, joursDemandes] = await Promise.all([
    lire<LigneEntree>(
      "entrees?select=id,personne,commerce,issue,moyen,appareil,lieu,survenu_le"
      + `${parPersonne}${parCommerce}${bornes("survenu_le", jour)}`
      + `&order=survenu_le.desc&limit=${PAR_SOURCE}`),
    // Les colonnes sont nommées ici, et « parametres » n'y est pas : elle porte
    // le code composé sur la carte. Ce qui n'est pas demandé ne peut pas fuir.
    lire<LigneCommande>(
      "commandes?select=id,terminal,type,etat,demandee_le,traitee_le,demandee_par,commerce"
      + `${personne ? `&demandee_par=eq.${personne}` : ""}${parCommerce}`
      + `${bornes("demandee_le", jour)}&order=demandee_le.desc&limit=${PAR_SOURCE}`),
    // Ni « sessions.id » : c'est l'identifiant que porte le jeton.
    lire<LigneSession>(
      "sessions?select=personne,commerce,appareil,lieu,ouverte_le,revoquee_le,revoquee_motif"
      + `${parPersonne}${parCommerce}${bornes("ouverte_le", jour)}`
      + `&order=ouverte_le.desc&limit=${PAR_SOURCE}`),
    // Sans filtre de commerce à la base : une alerte dont la colonne
    // « commerce » est vide appartient tout de même à quelqu'un — celui chez
    // qui le boîtier est posé. Le rattachement se fait plus bas, et le filtre
    // avec lui.
    lire<LigneAlerteBrute>(
      `alertes?select=*${bornes("ouverte_le", jour)}`
      + `&order=ouverte_le.desc&limit=${PAR_SOURCE}`),
    // Ce que les boîtiers écrivent n'est l'œuvre de personne : quand on cherche
    // ce qu'UNE personne a fait, ces lignes ne répondent pas à la question et
    // noieraient la réponse.
    personne
      ? Promise.resolve([] as LigneEvenement[])
      : lire<LigneEvenement>(
          `evenements?select=id,terminal,texte,survenu_le${bornes("survenu_le", jour)}`
          + `&order=survenu_le.desc&limit=${PAR_SOURCE}`),
    lire<LignePersonne>("personnes?select=id,nom&order=nom.asc"),
    lire<LigneCommerce>("commerces?select=id,nom&order=nom.asc"),
    lire<LigneTerminalNu>("terminaux?select=*"),
    // Les jours qu'on pourra proposer. Ils se lisent SANS le filtre de jour :
    // sinon, choisir mardi effacerait tous les autres jours de la liste, et
    // l'on ne pourrait plus en sortir qu'en effaçant la question entière.
    lire<{ survenu_le: string }>(
      `entrees?select=survenu_le${parPersonne}${parCommerce}`
      + "&order=survenu_le.desc&limit=300"),
    lire<{ demandee_le: string }>(
      `commandes?select=demandee_le${personne ? `&demandee_par=eq.${personne}` : ""}`
      + `${parCommerce}&order=demandee_le.desc&limit=300`),
  ]);

  const nomDe = new Map(gens.map((p) => [p.id, p.nom]));
  const nomCommerce = new Map(commerces.map((c) => [c.id, c.nom]));
  const commerceDuTerminal = new Map(
    terminaux.map((t) => [t.id, t.commerce ?? null]));
  const nomTerminal = new Map(terminaux.map((t) => [t.id, t.nom || t.id]));

  const habiller = (id: string | null | undefined): { id: string | null; nom: string } => {
    if (!id) return { id: null, nom: "" };
    return { id, nom: nomCommerce.get(id) ?? id };
  };

  const lignes: LigneDuJournal[] = [];

  for (const e of entrees) {
    const c = habiller(e.commerce);
    lignes.push({
      cle: `porte-${e.id}`,
      source: "porte",
      geste: GESTE_PAR_ISSUE[e.issue] ?? "entree_refusee",
      quand: momentLisible(e.survenu_le, langue),
      survenuLe: e.survenu_le,
      quiNom: e.personne ? nomDe.get(e.personne) ?? "" : "",
      quiId: e.personne,
      commerce: c.id,
      commerceNom: c.nom,
      terminal: "",
      precision: [sansSecret(e.appareil), sansSecret(e.lieu)]
        .filter(Boolean).join(" · "),
      issue: e.issue === "ouverte" ? "faite"
        : e.issue === "invitation" ? "neutre" : "refusee",
    });
  }

  for (const s of sessions) {
    const c = habiller(s.commerce);
    const ou = [sansSecret(s.appareil), sansSecret(s.lieu)].filter(Boolean).join(" · ");
    lignes.push({
      cle: `session-${s.personne}-${s.ouverte_le}`,
      source: "session",
      geste: "session_ouverte",
      quand: momentLisible(s.ouverte_le, langue),
      survenuLe: s.ouverte_le,
      quiNom: nomDe.get(s.personne) ?? "",
      quiId: s.personne,
      commerce: c.id,
      commerceNom: c.nom,
      terminal: "",
      precision: ou,
      issue: "neutre",
    });
    if (s.revoquee_le) {
      lignes.push({
        cle: `session-fin-${s.personne}-${s.revoquee_le}`,
        source: "session",
        geste: "session_fermee",
        quand: momentLisible(s.revoquee_le, langue),
        survenuLe: s.revoquee_le,
        quiNom: nomDe.get(s.personne) ?? "",
        quiId: s.personne,
        commerce: c.id,
        commerceNom: c.nom,
        terminal: "",
        precision: ou,
        issue: "neutre",
      });
    }
  }

  for (const d of commandes) {
    const id = d.commerce ?? commerceDuTerminal.get(d.terminal) ?? null;
    const c = habiller(id);
    lignes.push({
      cle: `demande-${d.id}`,
      source: "demande",
      geste: GESTE_PAR_COMMANDE[d.type] ?? "demande_autre",
      quand: momentLisible(d.demandee_le, langue),
      survenuLe: d.demandee_le,
      quiNom: d.demandee_par ? nomDe.get(d.demandee_par) ?? "" : "",
      quiId: d.demandee_par ?? null,
      commerce: c.id,
      commerceNom: c.nom,
      terminal: nomTerminal.get(d.terminal) ?? d.terminal,
      // Ni « parametres » ni « resultat » : le premier porte le code composé,
      // le second recopie ce que le réseau a répondu — un menu qui demande
      // justement un code.
      precision: "",
      issue: d.etat === "faite" ? "faite"
        : d.etat === "echouee" ? "refusee"
          : d.etat === "en_attente" ? "attente" : "neutre",
    });
  }

  for (const a of alertes) {
    const id = a.commerce ?? commerceDuTerminal.get(a.terminal ?? "") ?? null;
    if (commerce && id !== commerce) continue;
    const c = habiller(id);
    const base = {
      source: "alerte" as const,
      commerce: c.id,
      commerceNom: c.nom,
      terminal: a.terminal ? nomTerminal.get(a.terminal) ?? a.terminal : "",
      precision: sansSecret(a.titre),
    };
    lignes.push({
      ...base,
      cle: `alerte-${a.id}`,
      geste: "alerte_ouverte",
      quand: momentLisible(a.ouverte_le, langue),
      survenuLe: a.ouverte_le,
      quiNom: "",
      quiId: null,
      issue: "neutre",
    });
    if (a.vue_le) {
      lignes.push({
        ...base,
        cle: `alerte-vue-${a.id}`,
        geste: "alerte_vue",
        quand: momentLisible(a.vue_le, langue),
        survenuLe: a.vue_le,
        quiNom: a.vue_par ? nomDe.get(a.vue_par) ?? "" : "",
        quiId: a.vue_par ?? null,
        issue: "neutre",
      });
    }
    if (a.close_le) {
      lignes.push({
        ...base,
        cle: `alerte-close-${a.id}`,
        geste: "alerte_close",
        quand: momentLisible(a.close_le, langue),
        survenuLe: a.close_le,
        quiNom: a.close_par ? nomDe.get(a.close_par) ?? "" : "",
        quiId: a.close_par ?? null,
        issue: "faite",
      });
    }
  }

  for (const v of evenements) {
    const id = commerceDuTerminal.get(v.terminal) ?? null;
    if (commerce && id !== commerce) continue;
    const c = habiller(id);
    lignes.push({
      cle: `boitier-${v.id}`,
      source: "boitier",
      geste: "boitier_ecrit",
      quand: momentLisible(v.survenu_le, langue),
      survenuLe: v.survenu_le,
      quiNom: "",
      quiId: null,
      commerce: c.id,
      commerceNom: c.nom,
      terminal: nomTerminal.get(v.terminal) ?? v.terminal,
      // Le seul texte libre du journal, et le seul qui soit lavé ligne à ligne.
      precision: sansSecret(v.texte),
      issue: "neutre",
    });
  }

  // Le filtre par personne, appliqué une dernière fois sur TOUTES les lignes.
  // Les trois premières sources sont déjà filtrées par la base ; les alertes,
  // elles, ne portent pas de colonne « personne » — leurs deux gestes en
  // portent une chacune, et c'est ici qu'on le voit.
  const retenues = personne ? lignes.filter((l) => l.quiId === personne) : lignes;

  retenues.sort((a, b) =>
    new Date(b.survenuLe).getTime() - new Date(a.survenuLe).getTime() ||
    a.cle.localeCompare(b.cle));

  // Les jours proposés au filtre viennent de ce qui existe, jamais d'un
  // calendrier : proposer un jour vide, c'est promettre une réponse qui
  // n'arrivera pas.
  const jours = [...new Set([
    ...joursPorte.map((x) => jourDeDouala(x.survenu_le)),
    ...joursDemandes.map((x) => jourDeDouala(x.demandee_le)),
    ...retenues.map((l) => jourDeDouala(l.survenuLe)),
  ])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 14);

  // Les personnes proposées au filtre : toutes celles qui ont un nom en base
  // tant qu'on ne filtre sur personne, et sinon celles qui restent visibles.
  const vues = new Set(retenues.map((l) => l.quiId).filter((x): x is number => x != null));

  return {
    relie,
    lignes: retenues.slice(0, PLAFOND),
    filtre: { personne, commerce, jour },
    filtreActif: Boolean(personne || commerce || jour),
    // La personne choisie en tête, puis celles qui apparaissent réellement, puis
    // les autres : l'écran n'en montre qu'une poignée, et celle qu'on regarde
    // ne doit jamais tomber hors de la liste — sinon on ne peut plus en sortir.
    gens: [...gens]
      .sort((a, b) => {
        const rang = (p: LignePersonne) =>
          p.id === personne ? 0 : vues.has(p.id) ? 1 : 2;
        return rang(a) - rang(b) || a.nom.localeCompare(b.nom);
      })
      .map((p) => ({ id: p.id, nom: p.nom })),
    commerces: commerces.map((c) => ({ id: c.id, nom: c.nom })),
    jours,
    jourLisible: jour ? dateLisible(`${jour}T12:00:00${DECALAGE_DOUALA}`, langue) : "",
    boitiersEcartes: Boolean(personne),
    plafond: PLAFOND,
  };
}

// --- Les alertes ---------------------------------------------------------------

export type AlerteDuRegistre = {
  id: number;
  terminal: string;
  terminalNom: string;
  commerce: string | null;
  commerceNom: string;
  genre: string;
  gravite: "information" | "attention" | "grave";
  titre: string;
  detail: string;
  ouverteLe: string;
  ouverteQuand: string;
  depuis: string;
  /** Vue par quelqu'un, et par qui. Distinct de close. */
  vue: boolean;
  vueQuand: string;
  vueParNom: string;
  close: boolean;
  closeQuand: string;
  closeParNom: string;
  closeMotif: string;
};

export type BoitierQuiVaMal = {
  id: string;
  nom: string;
  commerces: string[];
  vivacite: Vivacite;
  depuis: string;
};

export type RegistreDesAlertes = {
  relie: boolean;
  ouvertes: AlerteDuRegistre[];
  closes: AlerteDuRegistre[];
  /** Vrai quand la table n'a JAMAIS reçu une ligne. Ce n'est pas « tout va bien ». */
  jamaisEcrit: boolean;
  /** Ouvertes que personne n'a encore regardées. */
  aVoir: number;
  /**
   * Ce que la flotte dit d'elle-même, en ce moment, indépendamment du registre.
   * C'est la contradiction qui prouve que personne n'écrit dans « alertes ».
   */
  boitiersQuiVontMal: BoitierQuiVaMal[];
  flotteEnService: number;
};

const RANG_GRAVITE: Record<string, number> = { grave: 0, attention: 1, information: 2 };

function versAlerteDuRegistre(
  a: LigneAlerteBrute,
  nomDe: Map<number, string>,
  nomCommerce: Map<string, string>,
  nomTerminal: Map<string, string>,
  commerceDuTerminal: Map<string, string | null>,
  langue: Langue,
): AlerteDuRegistre {
  const commerce = a.commerce ?? commerceDuTerminal.get(a.terminal ?? "") ?? null;
  const gravite = a.gravite === "grave" ? "grave"
    : a.gravite === "information" ? "information" : "attention";
  return {
    id: a.id,
    terminal: a.terminal ?? "",
    terminalNom: a.terminal ? nomTerminal.get(a.terminal) ?? a.terminal : "",
    commerce,
    commerceNom: commerce ? nomCommerce.get(commerce) ?? commerce : "",
    genre: a.genre,
    gravite,
    // Le robot écrit ces deux phrases pour un humain. On les lave quand même :
    // le jour où il recopiera un message d'opérateur dedans, il n'y aura pas de
    // deuxième chance.
    titre: sansSecret(a.titre),
    detail: sansSecret(a.detail),
    ouverteLe: a.ouverte_le,
    ouverteQuand: momentLisible(a.ouverte_le, langue),
    depuis: ecartLisible(a.ouverte_le, langue),
    vue: Boolean(a.vue_le),
    vueQuand: a.vue_le ? momentLisible(a.vue_le, langue) : "",
    vueParNom: a.vue_par ? nomDe.get(a.vue_par) ?? "" : "",
    close: Boolean(a.close_le),
    closeQuand: a.close_le ? momentLisible(a.close_le, langue) : "",
    closeParNom: a.close_par ? nomDe.get(a.close_par) ?? "" : "",
    closeMotif: sansSecret(a.close_motif),
  };
}

/**
 * Ce qui va mal, et ce qu'on en a fait.
 *
 * Il lit DEUX choses au lieu d'une : le registre, et la flotte. Le registre
 * seul ne permet pas de distinguer « tout va bien » de « personne n'écrit
 * ici », et les confondre est exactement la façon dont une supervision ment.
 * La flotte, elle, sait toujours dire combien de boîtiers se taisent.
 */
export async function chargerRegistreDesAlertes(
  langue: Langue,
): Promise<RegistreDesAlertes> {
  const [brutes, gens, commerces, terminaux, flotte] = await Promise.all([
    lire<LigneAlerteBrute>("alertes?select=*&order=ouverte_le.desc&limit=200"),
    lire<LignePersonne>("personnes?select=id,nom"),
    lire<LigneCommerce>("commerces?select=id,nom"),
    lire<LigneTerminalNu>("terminaux?select=*"),
    chargerFlotte(langue),
  ]);

  const nomDe = new Map(gens.map((p) => [p.id, p.nom]));
  const nomCommerce = new Map(commerces.map((c) => [c.id, c.nom]));
  const nomTerminal = new Map(terminaux.map((t) => [t.id, t.nom || t.id]));
  const commerceDuTerminal = new Map(terminaux.map((t) => [t.id, t.commerce ?? null]));

  const toutes = brutes.map((a) =>
    versAlerteDuRegistre(a, nomDe, nomCommerce, nomTerminal, commerceDuTerminal, langue));

  const ouvertes = toutes
    .filter((a) => !a.close)
    // Le plus grave devant, et à gravité égale le plus ancien : une alerte
    // ouverte depuis six heures n'a pas le même sens qu'une de six minutes.
    .sort((a, b) =>
      (RANG_GRAVITE[a.gravite] ?? 1) - (RANG_GRAVITE[b.gravite] ?? 1) ||
      new Date(a.ouverteLe).getTime() - new Date(b.ouverteLe).getTime());

  const closes = toutes
    .filter((a) => a.close)
    .sort((a, b) => new Date(b.ouverteLe).getTime() - new Date(a.ouverteLe).getTime())
    .slice(0, 20);

  const malades: BoitierQuiVaMal[] = flotte.terminaux
    .filter((t) => t.vivacite === "muet" || t.vivacite === "jamais")
    .map((t) => ({
      id: t.id, nom: t.nom, commerces: t.commerces,
      vivacite: t.vivacite, depuis: t.depuis,
    }));

  return {
    relie,
    ouvertes,
    closes,
    jamaisEcrit: brutes.length === 0,
    aVoir: ouvertes.filter((a) => !a.vue).length,
    boitiersQuiVontMal: malades,
    flotteEnService: flotte.enService,
  };
}

// --- Les deux seuls gestes de toute la console --------------------------------
//
// Ils ne touchent qu'à « alertes », et qu'aux colonnes listées ci-dessous. Rien
// ici n'écrit dans « commandes » : faire agir un terminal appartient au
// comptoir, et faire sortir de l'argent au propriétaire.

export const TABLE_DES_GESTES = "alertes";
export const COLONNES_DE_L_ACCUSE = ["vue_le", "vue_par"] as const;
export const COLONNES_DE_LA_CLOTURE = ["close_le", "close_par", "close_motif"] as const;

/**
 * « Je l'ai vue. » Ce n'est pas « c'est réglé ».
 *
 * Le filtre « vue_le=is.null » n'est pas une précaution de style : sans lui, un
 * second appui écraserait l'heure du premier regard, et l'on perdrait le seul
 * chiffre qui compte le lendemain — combien de temps une alerte est restée sans
 * que personne ne la voie.
 */
export async function accuserReception(
  alerte: number,
  personne: number,
): Promise<boolean> {
  if (!Number.isInteger(alerte) || alerte <= 0) return false;
  return modifier(`${TABLE_DES_GESTES}?id=eq.${alerte}&vue_le=is.null`, {
    vue_le: new Date().toISOString(),
    vue_par: personne,
  });
}

/**
 * « C'est réglé. » Le geste qui fait descendre la ligne de l'écran.
 *
 * Il n'accuse PAS réception au passage, et c'est délibéré : une alerte close
 * sans jamais avoir été vue est une information — quelqu'un a réparé la chose
 * sans que le registre ait servi à quoi que ce soit. L'effacer en la déduisant
 * rendrait cet écran flatteur, donc inutile.
 */
export async function clore(
  alerte: number,
  personne: number,
  motif: string,
): Promise<boolean> {
  if (!Number.isInteger(alerte) || alerte <= 0) return false;
  return modifier(`${TABLE_DES_GESTES}?id=eq.${alerte}&close_le=is.null`, {
    close_le: new Date().toISOString(),
    close_par: personne,
    // Ce que quelqu'un tape ici part en base et revient à l'écran. On le lave
    // comme le reste : un administrateur pressé colle parfois ce qu'il a sous
    // la main.
    close_motif: sansSecret(motif).slice(0, 200) || null,
  });
}

export type { Vivacite };
