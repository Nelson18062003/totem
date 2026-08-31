// Types partagés entre le serveur (qui lit la base) et les écrans.
// Aucune donnée ici : les valeurs viennent de Supabase, ou de nulle part.

import type { Langue } from "./langue";

// Une carte SIM est identifiée par son ICCID — le numéro de série gravé sur
// la puce, unique au monde. L'opérateur ne suffit pas : deux SIM du même
// opérateur qui se succèdent dans le terminal sont deux caisses distinctes.
export type Sim = {
  iccid: string;
  libelle: string;          // « Orange ·4432 » — opérateur + 4 derniers de l'ICCID
  operateur: string;        // « MTN », « Orange »
  reseau: string;           // réseau visité, différent en itinérance
  itinerance: boolean;
  // Le nom commercial du compte et son numéro. Ni la puce ni le réseau ne les
  // connaissent : la plupart des SIM prépayées ne déclarent pas leur numéro,
  // et le nom n'est connu que du propriétaire. Ils s'inscrivent depuis
  // Telegram (/reglages) et le terminal les remonte ici. Vides sinon.
  nom: string;
  numero: string;
  solde: number | null;     // le dernier solde connu — jamais « en direct »
  // L'heure de l'interrogation réseau qui a donné ce solde (« 09:47 »).
  // Les écrans l'habillent d'une phrase dans la langue du moment.
  soldeMaj: string | null;
  signal: number | null;
  enPlace: boolean;
  premiereVue: string;
  derniereVue: string;
  nbPaiements: number;
  totalRecu: number;
};

// La catégorie d'un SMS reçu, comme une boîte de réception les range.
// « echec » : une opération échouée ou annulée — rien ne s'est passé.
// « illisible » : le message parle d'argent, le robot n'a pas tout compris —
// il le dit, plutôt que de se déguiser en solde ou en message quelconque.
export type Categorie =
  | "encaissement" | "envoi" | "transfert" | "depot" | "retrait"
  | "solde" | "echec" | "code" | "publicite" | "illisible"
  | "message" | "inconnu";

// La même liste, comme VALEURS : c'est elle qui filtre ce qui vient de la
// base. Un terminal plus récent que l'écran peut envoyer une catégorie
// inconnue — elle s'affiche alors « message », jamais un écran cassé.
export const CATEGORIES: readonly Categorie[] = [
  "encaissement", "envoi", "transfert", "depot", "retrait",
  "solde", "echec", "code", "publicite", "illisible", "message", "inconnu",
];

export const estCategorie = (v: unknown): v is Categorie =>
  typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

export type Paiement = {
  id: string;
  // Le libellé du compte qui a reçu ce SMS (« MTN ·8901 ») : c'est lui qui
  // filtre la boîte de réception — par carte, jamais par opérateur, pour que
  // deux SIM du même réseau restent deux caisses distinctes.
  sim: string;
  // L'ICCID de la carte, quand le terminal l'a transmis. Le CSV le porte,
  // comme l'export du robot : c'est le seul nom qui ne change jamais.
  carte: string;
  // « ? » : le SMS nomme les deux parties sans dire laquelle est la nôtre
  // (forme d'Orange). Mieux vaut un sens inconnu qu'un sens inversé.
  sens: "in" | "out" | "?";
  nom: string;
  // La partie humaine du mouvement (« NKENGAFAC M. »), quand le robot l'a
  // lue : c'est ELLE que la liste montre pour un mouvement d'argent.
  tiers: string;
  numero: string;
  // Null pour un SMS qui n'est pas un paiement (information, publicité…).
  montant: number | null;
  heure: string;
  date: string;             // « Today », « Hier », « 28 juillet » — déjà traduit
  // La clé STABLE du jour (« 2026-08-05 », heure du terminal) : c'est elle qui
  // sert à regrouper et à filtrer. Le libellé `date` n'est qu'un habit — le
  // comparer casserait dès qu'on change de langue.
  jour: string;
  recuLe: string;           // l'horodatage retenu (réseau si connu, sinon relève)
  categorie: Categorie;     // devinée par le terminal
  nature: Categorie | null; // choisie par le propriétaire (pour le reçu)
  reference: string;
  soldeApres: number | null;
  smsBrut: string;
  recu: string | null;      // numéro du reçu PDF archivé, s'il existe
  sourceId: number | null;  // la ligne du journal du terminal (pour établir un reçu)
  // Le terminal qui a reçu ce SMS : c'est à LUI qu'une demande de reçu
  // s'adresse — `sourceId` ne veut rien dire dans le journal d'un autre.
  terminal: string | null;
  // Jamais ouvert sur la plateforme. Alimente la pastille du menu et le point
  // des lignes ; s'éteint dès que la fiche du SMS s'ouvre.
  nonLu: boolean;
};

// Un bouton USSD appris par le robot (💾 sur Telegram) et poussé dans la
// base. Il appartient à un OPÉRATEUR, pas à une carte : « *126# puis 5 »
// vaut pour toute puce MTN. `etapes` : le code d'entrée puis les réponses,
// dans l'ordre — jamais le code secret, l'apprentissage s'arrête avant.
export type RaccourciAppris = {
  nom: string;
  libelle: string;
  etapes: string[];
};

export type EtatTerminal = {
  id: string;
  nom: string;
  enLigne: boolean;
  majTexte: string;         // « il y a 12 s »
  version: string;
  // La santé physique du Pi, telle que le robot la résume :
  // « 35 °C · disque 12 % (98 Go libres) ». Vide si rien n'est remonté.
  sante: string;
  // Ce que le robot a relevé mais pas encore transmis au cloud : quand c'est
  // significatif, la plateforme le dit plutôt que de paraître à jour.
  enAttente: number;
};

export type Donnees = {
  // Le courriel du compte connecté, quand il y en a un. Sert à saluer la
  // personne par son prénom — et rien d'autre. `null` pour une session
  // ouverte par la clé de secours, qui ne désigne personne.
  courriel?: string | null;
  relie: boolean;           // les variables d'accès à la base sont-elles là ?
  terminal: EtatTerminal | null;
  sims: Sim[];
  paiements: Paiement[];
  // Les boutons appris, rangés par opérateur (« MTN » → [solde, …]).
  // Vide tant que le terminal n'a rien appris — ou que la base n'a pas
  // encore la table (migration en retard) : jamais un écran cassé.
  raccourcis: Record<string, RaccourciAppris[]>;
  // Le fuseau du terminal — celui qui découpe les journées. Le téléphone
  // en a besoin pour ranger un encaissement dans le BON jour : sans lui,
  // il découperait selon son propre fuseau, ou selon un défaut écrit en
  // dur, et un paiement de 23 h changerait de jour selon l'écran.
  // Optionnel : une plateforme pas encore à jour ne casse aucun écran.
  fuseau?: string;
};

export function fcfa(n: number, langue: Langue): string {
  return nombre(n, langue) + " FCFA";
}

// Le nombre seul, complet, sans abréviation : 287 000 — jamais « 287 k ».
// En anglais, le séparateur de milliers est la virgule : 287,000.
// L'ESPACE QUI NE SE REMPLAÇAIT PAS. Ce `replace` cherchait U+0020 pour le
// remplacer par… U+0020 : les deux caractères étaient l'espace ordinaire, et
// la substitution ne faisait donc rien du tout. Or la locale « fr-FR » sépare
// les milliers avec U+202F (espace fine insécable) — le caractère qu'il
// fallait viser. Les montants sortaient donc avec un séparateur invisible et
// différent de celui du robot, qui, lui, écrit une espace ordinaire
// (`analyse_sms.formater_montant`). Même somme, deux écritures : une
// recherche échouait, un copier-coller vers un tableur aussi, et le CSV du
// bilan emportait le caractère exotique. On vise désormais les deux espaces
// insécables par leur code, jamais par un caractère invisible dans le source.
export function nombre(n: number, langue: Langue): string {
  return langue === "en"
    ? n.toLocaleString("en-US")
    : n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
}

/**
 * Le fuseau par défaut du terminal.
 *
 * C'est un DÉFAUT, pas une vérité. Il était écrit en dur partout, ce qui
 * revenait à décider que TOTEM ne servirait qu'au Cameroun. Or le Mobile
 * Money, le réseau qui tombe et les menus USSD sont le quotidien du Nigeria,
 * de la Côte d'Ivoire, du Ghana, du Kenya. Et un fuseau faux n'est pas un
 * détail cosmétique : il découpe les journées au mauvais moment. À Abidjan
 * (UTC+0), les encaissements de 23 h tomberaient dans le bilan du lendemain.
 */
export const FUSEAU_DEFAUT = "Africa/Douala";

/**
 * Le jour d'un instant, vu du terminal, sous forme de clé « 2026-08-05 ».
 *
 * Le fuseau se passe explicitement : c'est celui du TERMINAL, pas celui du
 * serveur qui calcule ni du téléphone qui regarde. Le propriétaire peut être
 * à Paris et sa caisse à Lagos ; c'est la caisse qui décide de ce qu'est
 * « aujourd'hui », parce que c'est elle qui encaisse.
 */
// Un formateur par fuseau, gardé : en construire un par APPEL coûtait cher
// partout où l'on classe mille paiements par jour (l'analyse, le bilan) —
// des secondes de gel sur un petit téléphone. Il n'y a jamais qu'une
// poignée de fuseaux dans une vie de caisse.
const formateursJour = new Map<string, Intl.DateTimeFormat>();

export function jourLocal(d: Date, fuseau: string = FUSEAU_DEFAUT): string {
  let f = formateursJour.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau });
    formateursJour.set(fuseau, f);
  }
  return f.format(d);
}
