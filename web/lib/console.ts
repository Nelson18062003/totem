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
import { FUSEAU } from "./fuseau";
import type { Langue } from "@noyau/langue";

export { relie };

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

type LigneUtilisateur = {
  id: number; courriel: string; role: string; approuve: boolean;
  cree_le: string | null; vu_le: string | null;
};

type LigneAppareil = {
  plateforme: string | null; nom: string | null;
  cree_le: string | null; vu_le: string | null;
};

type LigneFrein = { cle: string; n: number; vu: string };

type LigneEvenement = {
  id: number; terminal: string; texte: string; survenu_le: string;
};

type LigneCommande = {
  id: number; terminal: string; type: string; etat: string;
  demandee_le: string; traitee_le: string | null;
  demandee_par?: number | null; commerce?: string | null;
};

// --- Laver un texte de ce qu'il ne doit jamais porter ------------------------

const MASQUE = "••••";

/**
 * Les règles de masquage, dans l'ordre où elles s'appliquent.
 *
 * ELLES MASQUENT PLUS QUE NÉCESSAIRE, ET C'EST VOULU. Une suite de quatre
 * chiffres dans une ligne de journal peut être un montant, une référence — ou
 * un code. L'écran n'a aucun moyen de savoir lequel, et se tromper une seule
 * fois écrit un code confidentiel dans une page qui reste. Perdre un montant
 * ici ne coûte rien : les montants vivent sur les écrans du commerce, où ils
 * ont une colonne à eux et un sens.
 *
 * TOUT texte libre qui monte à un écran de console passe par ici : ce que
 * les boîtiers écrivent (`evenements.texte`), le titre et le détail d'une
 * alerte, le motif d'une clôture. La revue de sécurité de septembre a trouvé
 * la fiche d'un terminal qui affichait le journal du boîtier SANS ce lavage,
 * pendant que l'écran du journal, lui, lavait le même texte — une règle qui
 * ne s'applique qu'à un écran sur deux n'est pas une règle.
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

/** Le même texte, débarrassé de ce qu'un écran de console ne doit pas porter. */
export function sansSecret(texte: string | null | undefined): string {
  if (!texte) return "";
  let propre = String(texte);
  for (const [motif, remplacement] of REGLES) {
    propre = propre.replace(motif, remplacement);
  }
  return propre;
}

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
  /**
   * Y a-t-il au moins un commerce déclaré en base ? Tant qu'il n'y en a
   * aucun, le rattachement des caisses n'est pas en service : une ligne sans
   * commerce est alors l'état normal de toute la flotte, pas une anomalie à
   * peindre en rouge sur chaque rangée.
   */
  proprietesConnues: boolean;
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
  /** Voir `Flotte.proprietesConnues` : tant qu'aucun commerce n'est déclaré,
   *  « sans commerce » est l'état normal, pas une alarme. */
  proprietesConnues: boolean;
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

// --- Les gens et leurs portes -------------------------------------------------
// Trois registres qu'aucun écran ne montrait : les comptes qui peuvent ouvrir
// la plateforme, les téléphones qu'elle prévient, et le frein qui compte les
// essais de mot de passe. Les trois existent en base depuis longtemps ; c'est
// leur lecture qui manquait.

export type CompteDeLaConsole = {
  id: number;
  courriel: string;
  role: string;
  approuve: boolean;
  creeLe: string | null;
  vuLe: string | null;
  /** « il y a 2 h », ou « jamais » pour un compte qui n'est jamais entré. */
  depuis: string;
};

export type TelephonePrevenu = {
  /** « Pixel 7 » — le nom que l'appareil a donné. Vide s'il n'en a pas donné. */
  nom: string;
  plateforme: string;
  creeLe: string | null;
  vuLe: string | null;
  depuis: string;
};

export type EssaiFreine = {
  /** L'adresse qui a essayé. C'est la clé du seau, telle que le frein la tient. */
  cle: string;
  n: number;
  vu: string;
  depuis: string;
};

export type Gens = {
  relie: boolean;
  comptes: CompteDeLaConsole[];
  enAttente: number;
  telephones: TelephonePrevenu[];
  /** Les seaux du frein qui portent plus d'essais que la tolérance gratuite. */
  freines: EssaiFreine[];
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
  quand: string;
  attenteDepuis: string | null;
  /** Qui a demandé. Vide quand la ligne est antérieure à la colonne. */
  demandeeParNom: string;
  commerceNom: string;
};

export type FicheTerminal = {
  relie: boolean;
  /** Voir `Flotte.proprietesConnues`. */
  proprietesConnues: boolean;
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
    // Le robot écrit ces deux phrases pour un humain. On les lave quand
    // même : le jour où il recopiera un message d'opérateur dedans, il n'y
    // aura pas de deuxième chance.
    titre: sansSecret(l.titre),
    detail: sansSecret(l.detail),
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
    proprietesConnues: socle.commerces.length > 0,
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

  const [journal, commandes] = await Promise.all([
    lire<LigneEvenement>(
      `evenements?select=*&terminal=eq.${propre}&order=survenu_le.desc&limit=40`),
    // Les colonnes sont NOMMÉES, et ni « parametres » ni « resultat » n'y
    // sont : la première porte le code composé sur la carte — et, le temps
    // d'une session USSD, le code confidentiel avant que le robot ne
    // l'efface — la seconde recopie ce que le réseau a répondu, un menu qui
    // demande justement un code. Ce qui n'est pas demandé à la base ne peut
    // fuir ni dans une page, ni dans un journal de serveur.
    lire<LigneCommande>(
      "commandes?select=id,terminal,type,etat,demandee_le,traitee_le"
      + `&terminal=eq.${propre}&order=demandee_le.desc&limit=30`),
  ]);

  const terminal = versTerminal(ligne, socle.parId, socle.cartes, socle.alertes, langue);
  const cartes = socle.cartes
    .filter((c) => c.terminal === propre)
    .map((c) => versCarte(c, socle.comptes, new Map([[ligne.id, ligne]]), socle.parId))
    .sort(parEtatDeCarte);

  return {
    relie,
    proprietesConnues: socle.commerces.length > 0,
    terminal,
    misEnServiceLe: ligne.cree_le ?? null,
    cartes,
    journal: journal
      .filter((e) => e.terminal === propre)
      .map((e) => ({
        // Ce que le boîtier écrit est du texte libre : il se lave, comme
        // sur l'écran du journal — la règle est une, ou elle n'est pas.
        id: e.id, texte: sansSecret(e.texte), survenuLe: e.survenu_le,
        quand: momentLisible(e.survenu_le, langue),
      })),
    commandes: commandes
      .filter((c) => c.terminal === propre)
      .map((c) => ({
        id: c.id,
        genre: c.type,
        etat: c.etat,
        quand: momentLisible(c.demandee_le, langue),
        attenteDepuis:
          c.etat === "en_attente" ? ecartLisible(c.demandee_le, langue) : null,
        // « Qui a demandé » attendra que la base porte la colonne : on écrit
        // « la base ne nomme personne », jamais un nom deviné.
        demandeeParNom: "",
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
    proprietesConnues: socle.commerces.length > 0,
    cartes,
    enPlace: cartes.filter((c) => c.etat === "en_place").length,
    retirees: cartes.filter((c) => c.etat === "retiree").length,
    inconnues: cartes.filter((c) => c.etat === "inconnu").length,
    itinerantes: cartes.filter((c) => c.itinerance && c.etat === "en_place").length,
    sansCommerce: cartes.filter((c) => !c.commerce).length,
  };
}

/**
 * Les gens : les comptes, les téléphones prévenus, et le frein.
 *
 * LES COURRIELS S'AFFICHENT ICI, ET C'EST UNE DÉCISION. Cette page est
 * derrière la garde « administrer » : celui qui la lit est celui qui a créé
 * ces comptes. Les jetons de notification, eux, ne sont PAS lus : un jeton
 * suffit à sonner un téléphone, il n'a rien à faire dans une page HTML.
 */
export async function chargerGens(langue: Langue): Promise<Gens> {
  const [utilisateurs, appareils, freins] = await Promise.all([
    lire<LigneUtilisateur>(
      "utilisateurs?select=id,courriel,role,approuve,cree_le,vu_le&order=cree_le.asc"),
    lire<LigneAppareil>(
      "appareils?select=plateforme,nom,cree_le,vu_le&order=vu_le.desc.nullslast"),
    // Le frein ne garde que des seaux récents (sa fenêtre est courte) : tout
    // ce qu'il porte se montre, du plus chargé au plus calme. Cinq essais
    // sont gratuits — en dessous, ce n'est pas une attaque, c'est un doigt.
    lire<LigneFrein>("freins?select=cle,n,vu&n=gt.5&order=n.desc&limit=50"),
  ]);

  const comptes: CompteDeLaConsole[] = utilisateurs.map((u) => ({
    id: u.id,
    courriel: u.courriel,
    role: u.role === "proprietaire" ? "proprietaire" : "invite",
    approuve: u.approuve,
    creeLe: u.cree_le ?? null,
    vuLe: u.vu_le ?? null,
    depuis: ecartLisible(u.vu_le, langue),
  }));

  return {
    relie,
    comptes,
    enAttente: comptes.filter((c) => !c.approuve).length,
    telephones: appareils.map((a) => ({
      nom: a.nom ?? "",
      plateforme: a.plateforme ?? "",
      creeLe: a.cree_le ?? null,
      vuLe: a.vu_le ?? null,
      depuis: ecartLisible(a.vu_le, langue),
    })),
    freines: freins.map((f) => ({
      cle: f.cle,
      n: f.n,
      vu: f.vu,
      depuis: ecartLisible(f.vu, langue),
    })),
  };
}
