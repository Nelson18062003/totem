// Ce que la console de la plateforme a besoin de savoir — une seule fois, ici.
//
// CE QUE CE FICHIER DÉCIDE
// Il ne lit QUE. Aucune fonction d'écriture n'entre ici, et ce n'est pas une
// commodité : la console est l'espace d'un administrateur, et un administrateur
// ne déplace jamais d'argent (« sortir_argent » n'est pas dans sa liste, voir
// lib/roles.ts). Un fichier de lecture pure rend la promesse VÉRIFIABLE plutôt
// que déclarative — « tests/test_console.py » relit ce fichier et échoue s'il
// se met à écrire.
//
// IL TRIE PAR CE QUI VA MAL, PAS PAR ORDRE ALPHABÉTIQUE
// Un écran de supervision ment par omission. Un boîtier muet depuis six heures
// rangé sous la lettre B, entre deux machines en parfaite santé, n'est pas
// affiché : il est caché. Toute liste sortie d'ici arrive donc triée par
// urgence, et c'est la liste, pas l'écran, qui porte cette règle.
//
// IL NE SAIT PAS DEVINER, ET IL LE DIT
// Trois états se ressemblent et ne doivent jamais se confondre : « tout va
// bien », « ça va mal », « je ne sais pas ». Une carte SIM dont le terminal
// s'est tu n'est pas retirée — on l'ignore, et c'est ce qui s'affiche. Là où
// la base ne dit rien, ce fichier renvoie une chaîne vide ou `null`, jamais un
// zéro : un zéro se lit comme une mesure.
//
// IL NOMME TOUJOURS À QUI APPARTIENT CE QU'IL MONTRE
// Un administrateur voit tous les commerces à la fois — c'est son rôle, et
// c'est aussi le meilleur moyen de confondre deux boutiques. Chaque ligne
// sortie d'ici porte donc le nom du commerce concerné, ou dit franchement
// qu'aucun ne lui est rattaché.

import { lire, relie } from "./base";
import type { Langue } from "./langue";

export { relie };

const FUSEAU = "Africa/Douala"; // l'argent vit à Douala : les heures aussi
const LOCALE: Record<Langue, string> = { en: "en-GB", fr: "fr-FR" };

// --- Les seuils de la surveillance -----------------------------------------
// Le robot republie son état au rythme de fond de « totem/nuage.py ». Trois
// minutes sans nouvelle, c'est déjà un battement manqué ; une demi-heure, c'est
// une machine dont plus personne ne sait rien. Les deux seuils sont ici, en
// clair, parce qu'ils décident de ce qui monte en tête d'écran.
const ACTIF_MS = 3 * 60 * 1000;
const MUET_MS = 30 * 60 * 1000;

// Une carte est « en place » si le terminal l'a vue il y a moins de dix
// minutes — la même durée que lib/serveur.ts, et pour la même raison. Mais
// cette déduction ne vaut QUE si le terminal parle encore : c'est lui qui voit
// les puces, et un boîtier muet ne voit plus rien.
const EN_PLACE_MS = 10 * 60 * 1000;

// --- Ce que la base contient (colonnes de sql/schema.sql) -------------------
// « select=* » partout, à dessein : exiger une colonne par son nom rend
// l'écran VIDE quand la base a une migration de retard (PostgREST refuse la
// requête entière). Avec l'étoile, une colonne absente donne un écran un peu
// moins riche — jamais une liste vide. Pour la même raison, aucun filtre ne
// porte sur une colonne ajoutée par « sql/migration-console.sql » : le tri se
// fait ici, en mémoire, sur sept lignes.

type LigneTerminal = {
  id: string; nom: string | null; vu_le: string | null; version: string | null;
  sante?: { resume?: string; en_attente?: number } | null;
  commerce?: string | null; lieu?: string | null;
  retire_le?: string | null; retire_motif?: string | null;
  cree_le?: string | null;
};

type LigneCommerce = {
  id: string; nom: string; ville: string | null; etat: string;
  etat_depuis: string | null; etat_motif: string | null;
  contact_secours: string | null; telephone_secours: string | null;
};

type LigneCarte = {
  terminal: string; iccid: string; operateur: string | null;
  libelle: string | null; nom?: string | null; numero: string | null;
  premiere_vue: string | null; derniere_vue: string | null;
  commerce?: string | null;
};

type LigneCompte = {
  terminal: string; iccid: string | null; libelle: string;
  operateur: string | null; reseau: string | null; itinerance: boolean;
  numero: string | null; solde: number | null; signal: number | null;
  maj: string;
};

type LigneAlerte = {
  id: number; terminal: string | null; commerce: string | null;
  genre: string; gravite: string; titre: string; detail: string | null;
  ouverte_le: string; vue_le: string | null; close_le: string | null;
};

type LignePersonne = {
  id: number; nom: string; courriel: string | null; etat: string;
  langue: string; vue_le: string | null; cree_le: string;
};

type LigneAcces = {
  personne: number; commerce: string; role: string;
  cree_le: string; retire_le: string | null;
};

type LigneEvenement = {
  id: number; terminal: string; texte: string; survenu_le: string;
};

type LigneCommande = {
  id: number; terminal: string; type: string; etat: string;
  resultat: string | null; demandee_le: string; traitee_le: string | null;
  demandee_par?: number | null; commerce?: string | null;
};

// --- Dire l'heure sans mentir ----------------------------------------------

/** « 6 h », « 12 s » — la durée seule, pour une colonne serrée. */
function dureeCourte(ms: number, langue: Langue): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86_400)} ${langue === "en" ? "d" : "j"}`;
}

/** « 6 h ago » / « il y a 6 h », et « never » quand la base ne sait pas. */
export function ecartLisible(ts: string | null | undefined, langue: Langue): string {
  if (!ts) return langue === "en" ? "never" : "jamais";
  const d = dureeCourte(Date.now() - new Date(ts).getTime(), langue);
  return langue === "en" ? `${d} ago` : `il y a ${d}`;
}

/** « 12 Mar 2026 » — une date que quelqu'un peut recopier au téléphone. */
export function dateLisible(ts: string | null | undefined, langue: Langue): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(LOCALE[langue], {
    day: "numeric", month: "short", year: "numeric", timeZone: FUSEAU,
  }).format(new Date(ts));
}

/** « 12 Mar, 14:02 » — pour un journal, où l'heure compte autant que le jour. */
export function momentLisible(ts: string | null | undefined, langue: Langue): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(LOCALE[langue], {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: FUSEAU,
  }).format(new Date(ts));
}

function ecoule(ts: string | null | undefined): number | null {
  return ts ? Date.now() - new Date(ts).getTime() : null;
}

// --- La vivacité d'un boîtier ----------------------------------------------

/**
 * Ce qu'on sait d'un terminal, en un mot.
 *
 * « jamais » n'est pas « muet » : une machine inscrite qui n'a jamais parlé
 * n'est pas tombée en panne, elle n'a jamais démarré. Les deux demandent un
 * geste, mais pas le même, et les confondre envoie quelqu'un réparer une
 * machine qui n'est peut-être même pas déballée.
 */
export type Vivacite = "actif" | "en_retard" | "muet" | "jamais" | "retire";

export function vivacite(vuLe: string | null, retireLe?: string | null): Vivacite {
  if (retireLe) return "retire";
  if (!vuLe) return "jamais";
  const ms = Date.now() - new Date(vuLe).getTime();
  if (ms < ACTIF_MS) return "actif";
  if (ms < MUET_MS) return "en_retard";
  return "muet";
}

export type Gravite = "information" | "attention" | "grave";

export type Alerte = {
  id: number;
  terminal: string | null;
  /** Le nom lisible du commerce touché, ou la phrase qui dit qu'on ne sait pas. */
  commerce: string | null;
  commerceNom: string;
  genre: string;
  gravite: Gravite;
  titre: string;
  detail: string;
  ouverteLe: string;
  depuis: string;
  vue: boolean;
};

export type TerminalDeFlotte = {
  id: string;
  nom: string;
  /** « Douala · Akwa ». Vide quand la base ne l'a jamais appris. */
  lieu: string;
  /** Les noms des commerces desservis. Vide = rattaché à personne, et l'écran le dit. */
  commerces: string[];
  vivacite: Vivacite;
  vuLe: string | null;
  /** « il y a 6 h » — écrit en toutes lettres, jamais une pastille seule. */
  depuis: string;
  /** Le logiciel réellement en service. Vide quand le terminal ne l'a jamais dit. */
  version: string;
  /** Le résumé de santé du robot, en toutes lettres. Vide s'il n'en publie pas. */
  sante: string;
  /** Ce que le robot a relevé sans pouvoir le transmettre. `null` = il ne le dit pas. */
  enAttente: number | null;
  cartesConnues: number;
  cartesEnPlace: number;
  alertes: Alerte[];
  retireLe: string | null;
  retireMotif: string;
};

export type Flotte = {
  relie: boolean;
  /** Déjà triés par urgence : le plus silencieux d'abord. */
  terminaux: TerminalDeFlotte[];
  enService: number;
  muets: number;
  jamaisVus: number;
  retires: number;
  alertesOuvertes: number;
  /** Le parc logiciel : quelle version, sur combien de boîtiers. */
  versions: { version: string; combien: number }[];
  commercesServis: number;
  cartesEnPlace: number;
};

/**
 * L'échelle d'urgence — un seul barreau par ligne, et c'est ce qui la classe.
 *
 * Elle mélange volontairement deux choses de nature différente : le silence
 * d'une machine et la gravité de ses alertes. Un boîtier qui parle mais dont
 * l'alimentation lâche est plus urgent qu'un boîtier simplement en retard de
 * quatre minutes ; les séparer en deux tris successifs aurait enterré le
 * premier sous le second.
 */
const RANG_JAMAIS = 0;
const RANG_MUET = 1;
const RANG_GRAVE = 2;
const RANG_RETARD = 3;
const RANG_ATTENTION = 4;
const RANG_CALME = 5;
const RANG_RETIRE = 6;

export function rangDUrgence(t: TerminalDeFlotte): number {
  if (t.vivacite === "retire") return RANG_RETIRE;
  if (t.vivacite === "jamais") return RANG_JAMAIS;
  if (t.vivacite === "muet") return RANG_MUET;
  if (t.alertes.some((a) => a.gravite === "grave")) return RANG_GRAVE;
  if (t.vivacite === "en_retard") return RANG_RETARD;
  if (t.alertes.some((a) => a.gravite === "attention")) return RANG_ATTENTION;
  return RANG_CALME;
}

/**
 * L'ordre de la flotte. À rang égal, le plus longtemps silencieux passe
 * devant : entre deux machines muettes, celle qui se tait depuis six heures
 * n'a pas le même sens que celle qui se tait depuis trente minutes.
 */
export function parUrgence(a: TerminalDeFlotte, b: TerminalDeFlotte): number {
  const ra = rangDUrgence(a);
  const rb = rangDUrgence(b);
  if (ra !== rb) return ra - rb;
  const sa = a.vuLe ? new Date(a.vuLe).getTime() : 0;
  const sb = b.vuLe ? new Date(b.vuLe).getTime() : 0;
  if (sa !== sb) return sa - sb;
  return a.id.localeCompare(b.id);
}

// --- Les cartes SIM ---------------------------------------------------------

/**
 * « inconnu » est un état à part entière, et le plus important des trois.
 *
 * Une puce n'est déclarée retirée que si le terminal qui la portait parle
 * encore et ne la voit plus. Si le boîtier s'est tu, personne ne sait où est
 * la carte — et l'écrire « retirée » enverrait quelqu'un chercher un vol qui
 * n'a pas eu lieu.
 */
export type EtatCarte = "en_place" | "retiree" | "inconnu";

export type CarteDuRegistre = {
  iccid: string;
  libelle: string;
  operateur: string;
  /** Le nom commercial déclaré par le propriétaire. Vide s'il ne l'a pas dit. */
  nom: string;
  numero: string;
  terminal: string;
  terminalNom: string;
  terminalVivacite: Vivacite;
  /** À qui appartient cette caisse. Jamais deviné. */
  commerce: string | null;
  commerceNom: string;
  etat: EtatCarte;
  solde: number | null;
  /** L'heure de l'interrogation qui a donné ce solde. Un solde n'est jamais « en direct ». */
  soldeLe: string | null;
  signal: number | null;
  itinerance: boolean;
  reseau: string;
  premiereVue: string | null;
  derniereVue: string | null;
};

export type RegistreDesCartes = {
  relie: boolean;
  cartes: CarteDuRegistre[];
  enPlace: number;
  retirees: number;
  inconnues: number;
  itinerantes: number;
  /** Les puces qu'aucun commerce ne réclame : une caisse sans propriétaire déclaré. */
  sansCommerce: number;
};

const RANG_CARTE: Record<EtatCarte, number> = { inconnu: 0, retiree: 1, en_place: 2 };

function parEtatDeCarte(a: CarteDuRegistre, b: CarteDuRegistre): number {
  // Une carte sans commerce déclaré passe devant tout : c'est de l'argent qui
  // n'a de propriétaire nulle part dans la base.
  const oa = a.commerce ? 1 : 0;
  const ob = b.commerce ? 1 : 0;
  if (oa !== ob) return oa - ob;
  const ra = RANG_CARTE[a.etat];
  const rb = RANG_CARTE[b.etat];
  if (ra !== rb) return ra - rb;
  // À état égal, l'itinérance d'abord : une puce qui a quitté son réseau coûte
  // cher au propriétaire sans que personne ne s'en aperçoive.
  if (a.itinerance !== b.itinerance) return a.itinerance ? -1 : 1;
  const da = a.derniereVue ? new Date(a.derniereVue).getTime() : 0;
  const db = b.derniereVue ? new Date(b.derniereVue).getTime() : 0;
  return db - da;
}

// --- Les clients -------------------------------------------------------------

export type GensDuCommerce = {
  personne: number;
  nom: string;
  role: string;
  /** « actif » | « suspendu » | « parti » — l'état de la personne, pas de son accès. */
  etat: string;
  vueLe: string | null;
  depuis: string;
  /** Un accès retiré ne disparaît pas : il porte sa date. */
  retireLe: string | null;
};

export type CommerceDeLaConsole = {
  id: string;
  nom: string;
  ville: string;
  /** « ouvert » | « succession » | « litige » | « ferme ». */
  etat: string;
  etatDepuis: string | null;
  etatMotif: string;
  /** Qui l'a laissé joignable le jour où il ne l'est plus. Vide = la question n'a pas été posée. */
  contactSecours: string;
  gens: GensDuCommerce[];
  proprietaires: number;
  terminaux: string[];
  cartes: number;
};

export type Clients = {
  relie: boolean;
  commerces: CommerceDeLaConsole[];
  /** Des personnes sans aucun accès vivant. Elles existent, et l'écran le dit. */
  sansAcces: GensDuCommerce[];
  gele: number;
  sansProprietaire: number;
};

const RANG_ETAT_COMMERCE: Record<string, number> = {
  litige: 0, succession: 1, ferme: 2, ouvert: 3,
};

// --- La fiche d'un terminal --------------------------------------------------

export type LigneDeJournal = {
  id: number;
  texte: string;
  quand: string;
  survenuLe: string;
};

export type CommandeDeLaConsole = {
  id: number;
  genre: string;
  etat: string;
  resultat: string;
  quand: string;
  attenteDepuis: string | null;
  /** Qui a demandé. Vide quand la ligne est antérieure à la colonne. */
  demandeeParNom: string;
  commerceNom: string;
};

export type FicheTerminal = {
  relie: boolean;
  terminal: TerminalDeFlotte;
  misEnServiceLe: string | null;
  cartes: CarteDuRegistre[];
  journal: LigneDeJournal[];
  commandes: CommandeDeLaConsole[];
  commandesEnAttente: number;
};

// --- Les lectures ------------------------------------------------------------

function nomDeCommerce(
  id: string | null | undefined,
  commerces: Map<string, LigneCommerce>,
): string {
  if (!id) return "";
  return commerces.get(id)?.nom ?? id;
}

function versAlerte(
  l: LigneAlerte,
  commerces: Map<string, LigneCommerce>,
  langue: Langue,
): Alerte {
  const gravite: Gravite =
    l.gravite === "grave" ? "grave" : l.gravite === "information" ? "information" : "attention";
  return {
    id: l.id,
    terminal: l.terminal,
    commerce: l.commerce ?? null,
    commerceNom: nomDeCommerce(l.commerce, commerces),
    genre: l.genre,
    gravite,
    titre: l.titre,
    detail: l.detail ?? "",
    ouverteLe: l.ouverte_le,
    depuis: ecartLisible(l.ouverte_le, langue),
    vue: Boolean(l.vue_le),
  };
}

function versTerminal(
  l: LigneTerminal,
  commerces: Map<string, LigneCommerce>,
  cartes: LigneCarte[],
  alertes: Alerte[],
  langue: Langue,
): TerminalDeFlotte {
  const vie = vivacite(l.vu_le, l.retire_le);
  const siennes = cartes.filter((c) => c.terminal === l.id);

  // Les commerces desservis : celui qui héberge le boîtier, plus tous ceux qui
  // ont une puce dedans. Deux commerçants peuvent partager un comptoir, et
  // l'écran doit nommer les deux — pas seulement le premier.
  const noms = new Set<string>();
  const nomHote = nomDeCommerce(l.commerce, commerces);
  if (nomHote) noms.add(nomHote);
  for (const c of siennes) {
    const n = nomDeCommerce(c.commerce, commerces);
    if (n) noms.add(n);
  }

  // Une carte n'est « en place » que si le boîtier parle encore : lui seul la
  // voit. Muet, il ne permet de conclure ni à la présence ni à l'absence.
  const parle = vie === "actif" || vie === "en_retard";
  const enPlace = parle
    ? siennes.filter((c) => {
        const ms = ecoule(c.derniere_vue);
        return ms !== null && ms < EN_PLACE_MS;
      }).length
    : 0;

  return {
    id: l.id,
    nom: l.nom || l.id,
    lieu: l.lieu ?? "",
    commerces: [...noms],
    vivacite: vie,
    vuLe: l.vu_le,
    depuis: ecartLisible(l.vu_le, langue),
    version: l.version ?? "",
    sante: l.sante?.resume ?? "",
    enAttente: l.sante?.en_attente ?? null,
    cartesConnues: siennes.length,
    cartesEnPlace: enPlace,
    alertes: alertes.filter((a) => a.terminal === l.id),
    retireLe: l.retire_le ?? null,
    retireMotif: l.retire_motif ?? "",
  };
}

function versCarte(
  c: LigneCarte,
  comptes: LigneCompte[],
  terminaux: Map<string, LigneTerminal>,
  commerces: Map<string, LigneCommerce>,
): CarteDuRegistre {
  const compte = comptes.find((x) => x.terminal === c.terminal && x.iccid === c.iccid);
  const hote = terminaux.get(c.terminal);
  const vie = vivacite(hote?.vu_le ?? null, hote?.retire_le ?? null);
  const parle = vie === "actif" || vie === "en_retard";
  const vueRecemment = (() => {
    const ms = ecoule(c.derniere_vue);
    return ms !== null && ms < EN_PLACE_MS;
  })();

  const etat: EtatCarte = !parle ? "inconnu" : vueRecemment ? "en_place" : "retiree";

  return {
    iccid: c.iccid,
    libelle: compte?.libelle || c.libelle || `··${c.iccid.slice(-4)}`,
    operateur: compte?.operateur || c.operateur || "",
    nom: c.nom ?? "",
    numero: compte?.numero || c.numero || "",
    terminal: c.terminal,
    terminalNom: hote?.nom || c.terminal,
    terminalVivacite: vie,
    commerce: c.commerce ?? null,
    commerceNom: nomDeCommerce(c.commerce, commerces),
    etat,
    // Un solde relevé alors que la puce n'est plus là décrit le passé : on le
    // montre quand même, avec l'heure du relevé, parce que « ce qu'il restait
    // quand elle est partie » est exactement la question qu'on se pose.
    solde: compte?.solde == null ? null : Number(compte.solde),
    soldeLe: compte?.maj ?? null,
    signal: compte?.signal ?? null,
    itinerance: compte?.itinerance ?? false,
    reseau: compte?.reseau ?? "",
    premiereVue: c.premiere_vue,
    derniereVue: c.derniere_vue,
  };
}

async function lireLeSocle(langue: Langue) {
  const [terminaux, commerces, cartes, comptes, alertes] = await Promise.all([
    lire<LigneTerminal>("terminaux?select=*"),
    lire<LigneCommerce>("commerces?select=*"),
    lire<LigneCarte>("cartes?select=*"),
    lire<LigneCompte>("comptes?select=*"),
    // Le filtre porte sur « close_le », colonne de la table neuve : sur une
    // base sans « sql/migration-console.sql », la table entière est absente et
    // la lecture renvoie simplement une liste vide.
    lire<LigneAlerte>("alertes?select=*&close_le=is.null&order=ouverte_le.desc"),
  ]);
  const parId = new Map(commerces.map((c) => [c.id, c]));
  return {
    terminaux,
    commerces,
    parId,
    cartes,
    comptes,
    alertes: alertes.map((a) => versAlerte(a, parId, langue)),
  };
}

/** La flotte entière, triée par ce qui va mal. */
export async function chargerFlotte(langue: Langue): Promise<Flotte> {
  const socle = await lireLeSocle(langue);

  const liste = socle.terminaux
    .map((t) => versTerminal(t, socle.parId, socle.cartes, socle.alertes, langue))
    .sort(parUrgence);

  const enService = liste.filter((t) => t.vivacite !== "retire");
  const compteurs = new Map<string, number>();
  for (const t of enService) {
    if (!t.version) continue;
    compteurs.set(t.version, (compteurs.get(t.version) ?? 0) + 1);
  }

  const servis = new Set<string>();
  for (const t of enService) for (const n of t.commerces) servis.add(n);

  return {
    relie,
    terminaux: liste,
    enService: enService.length,
    muets: enService.filter((t) => t.vivacite === "muet").length,
    jamaisVus: enService.filter((t) => t.vivacite === "jamais").length,
    retires: liste.length - enService.length,
    alertesOuvertes: socle.alertes.length,
    versions: [...compteurs.entries()]
      .map(([version, combien]) => ({ version, combien }))
      .sort((a, b) => b.combien - a.combien || a.version.localeCompare(b.version)),
    commercesServis: servis.size,
    cartesEnPlace: enService.reduce((s, t) => s + t.cartesEnPlace, 0),
  };
}

/** Un boîtier : sa santé, ses cartes, son journal, ses commandes. */
export async function chargerFicheTerminal(
  id: string,
  langue: Langue,
): Promise<FicheTerminal | null> {
  // L'identifiant vient de l'adresse : on ne le recopie jamais tel quel dans
  // une requête. Et on revérifie l'égalité nous-mêmes plus bas — le filtrage
  // du service distant n'est pas une garantie qu'on accepte sur parole.
  const propre = id.replace(/[^A-Za-z0-9._-]/g, "");
  if (!propre) return null;

  const socle = await lireLeSocle(langue);
  const ligne = socle.terminaux.find((t) => t.id === propre);
  if (!ligne) return null;

  const [journal, commandes, personnes] = await Promise.all([
    lire<LigneEvenement>(
      `evenements?select=*&terminal=eq.${propre}&order=survenu_le.desc&limit=40`),
    lire<LigneCommande>(
      `commandes?select=*&terminal=eq.${propre}&order=demandee_le.desc&limit=30`),
    lire<LignePersonne>("personnes?select=id,nom,etat"),
  ]);
  const nomDe = new Map(personnes.map((p) => [p.id, p.nom]));

  const terminal = versTerminal(ligne, socle.parId, socle.cartes, socle.alertes, langue);
  const cartes = socle.cartes
    .filter((c) => c.terminal === propre)
    .map((c) => versCarte(c, socle.comptes, new Map([[ligne.id, ligne]]), socle.parId))
    .sort(parEtatDeCarte);

  return {
    relie,
    terminal,
    misEnServiceLe: ligne.cree_le ?? null,
    cartes,
    journal: journal
      .filter((e) => e.terminal === propre)
      .map((e) => ({
        id: e.id, texte: e.texte, survenuLe: e.survenu_le,
        quand: momentLisible(e.survenu_le, langue),
      })),
    commandes: commandes
      .filter((c) => c.terminal === propre)
      .map((c) => ({
        id: c.id,
        genre: c.type,
        etat: c.etat,
        resultat: c.resultat ?? "",
        quand: momentLisible(c.demandee_le, langue),
        attenteDepuis:
          c.etat === "en_attente" ? ecartLisible(c.demandee_le, langue) : null,
        demandeeParNom: c.demandee_par ? nomDe.get(c.demandee_par) ?? "" : "",
        commerceNom: nomDeCommerce(c.commerce, socle.parId),
      })),
    commandesEnAttente: commandes.filter(
      (c) => c.terminal === propre && c.etat === "en_attente").length,
  };
}

/** Toutes les puces, présentes ou retirées, et où elles sont. */
export async function chargerRegistreDesCartes(
  langue: Langue,
): Promise<RegistreDesCartes> {
  const socle = await lireLeSocle(langue);
  const parId = new Map(socle.terminaux.map((t) => [t.id, t]));

  const cartes = socle.cartes
    .map((c) => versCarte(c, socle.comptes, parId, socle.parId))
    .sort(parEtatDeCarte);

  return {
    relie,
    cartes,
    enPlace: cartes.filter((c) => c.etat === "en_place").length,
    retirees: cartes.filter((c) => c.etat === "retiree").length,
    inconnues: cartes.filter((c) => c.etat === "inconnu").length,
    itinerantes: cartes.filter((c) => c.itinerance && c.etat === "en_place").length,
    sansCommerce: cartes.filter((c) => !c.commerce).length,
  };
}

/** Les commerces, leur état, et qui les tient. */
export async function chargerClients(langue: Langue): Promise<Clients> {
  const [socle, personnes, acces] = await Promise.all([
    lireLeSocle(langue),
    lire<LignePersonne>("personnes?select=*&order=nom.asc"),
    lire<LigneAcces>("acces?select=*"),
  ]);
  const parPersonne = new Map(personnes.map((p) => [p.id, p]));

  const gensDe = (commerce: string): GensDuCommerce[] =>
    acces
      .filter((a) => a.commerce === commerce)
      .map((a) => {
        const p = parPersonne.get(a.personne);
        return {
          personne: a.personne,
          nom: p?.nom ?? `#${a.personne}`,
          role: a.role,
          etat: p?.etat ?? "",
          vueLe: p?.vue_le ?? null,
          depuis: ecartLisible(p?.vue_le, langue),
          retireLe: a.retire_le ?? null,
        };
      })
      // Les accès vivants d'abord, puis les retirés — qui restent visibles :
      // savoir qui avait la clé la semaine dernière fait partie du tableau.
      .sort((x, y) =>
        (x.retireLe ? 1 : 0) - (y.retireLe ? 1 : 0) || x.nom.localeCompare(y.nom));

  const liste: CommerceDeLaConsole[] = socle.commerces.map((c) => {
    const gens = gensDe(c.id);
    const terminaux = socle.terminaux
      .filter((t) =>
        t.commerce === c.id ||
        socle.cartes.some((k) => k.terminal === t.id && k.commerce === c.id))
      .map((t) => t.id);
    return {
      id: c.id,
      nom: c.nom,
      ville: c.ville ?? "",
      etat: c.etat,
      etatDepuis: c.etat_depuis,
      etatMotif: c.etat_motif ?? "",
      contactSecours: c.contact_secours ?? "",
      gens,
      proprietaires: gens.filter(
        (g) => g.role === "proprietaire" && !g.retireLe && g.etat === "actif").length,
      terminaux,
      cartes: socle.cartes.filter((k) => k.commerce === c.id).length,
    };
  });

  // Ce qui va mal d'abord : un litige, une succession, puis une boutique que
  // plus aucun propriétaire vivant ne tient — personne ne peut plus y faire
  // sortir d'argent, et personne ne s'en apercevra tout seul.
  liste.sort((a, b) => {
    const ra = RANG_ETAT_COMMERCE[a.etat] ?? 3;
    const rb = RANG_ETAT_COMMERCE[b.etat] ?? 3;
    if (ra !== rb) return ra - rb;
    const pa = a.proprietaires === 0 ? 0 : 1;
    const pb = b.proprietaires === 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.nom.localeCompare(b.nom);
  });

  const avecAcces = new Set(acces.filter((a) => !a.retire_le).map((a) => a.personne));
  const sansAcces: GensDuCommerce[] = personnes
    .filter((p) => !avecAcces.has(p.id))
    .map((p) => ({
      personne: p.id, nom: p.nom, role: "", etat: p.etat,
      vueLe: p.vue_le, depuis: ecartLisible(p.vue_le, langue), retireLe: null,
    }));

  return {
    relie,
    commerces: liste,
    sansAcces,
    gele: liste.filter((c) => c.etat !== "ouvert").length,
    sansProprietaire: liste.filter(
      (c) => c.etat === "ouvert" && c.proprietaires === 0).length,
  };
}
