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
export type Categorie =
  | "encaissement" | "envoi" | "transfert" | "depot" | "retrait"
  | "solde" | "code" | "publicite" | "message" | "inconnu";

export type Paiement = {
  id: string;
  sim: string;              // libellé court de l'opérateur (« Orange »)
  // « ? » : le SMS nomme les deux parties sans dire laquelle est la nôtre
  // (forme d'Orange). Mieux vaut un sens inconnu qu'un sens inversé.
  sens: "in" | "out" | "?";
  nom: string;
  numero: string;
  // Null pour un SMS qui n'est pas un paiement (information, publicité…).
  montant: number | null;
  heure: string;
  date: string;             // « Today », « Hier », « 28 juillet » — déjà traduit
  // La clé STABLE du jour (« 2026-08-05 », heure de Douala) : c'est elle qui
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
  // Jamais ouvert sur la plateforme. Alimente la pastille du menu et le point
  // des lignes ; s'éteint dès que la fiche du SMS s'ouvre.
  nonLu: boolean;
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
  relie: boolean;           // les variables d'accès à la base sont-elles là ?
  terminal: EtatTerminal | null;
  sims: Sim[];
  paiements: Paiement[];
};

export function fcfa(n: number, langue: Langue): string {
  return nombre(n, langue) + " FCFA";
}

// Le nombre seul, complet, sans abréviation : 287 000 — jamais « 287 k ».
// En anglais, le séparateur de milliers est la virgule : 287,000.
//
// LE SÉPARATEUR FRANÇAIS. `toLocaleString("fr-FR")` produit une espace FINE
// insécable (U+202F). Ce caractère est ABSENT de DM Sans — vérifié dans la
// table cmap de totem/polices/dmsans-400.ttf : il est donc rendu par une
// police de repli, avec une chasse imprévisible, au milieu de chaque montant.
// On le remplace par l'espace insécable ordinaire (U+00A0), présente dans la
// police (chasse 266).
//
// Le code précédent tentait déjà ce remplacement — mais ses deux caractères
// avaient été aplatis en espaces ordinaires quelque part en chemin, et il
// cherchait donc un caractère absent de la sortie pour le remplacer par
// lui-même. Un correctif muet vaut moins que pas de correctif : celui-ci
// nomme les points de code, qu'aucun éditeur ne peut normaliser en silence.
const FINE_INSECABLE = "\u202F";
const INSECABLE = "\u00A0";

export function nombre(n: number, langue: Langue): string {
  return langue === "en"
    ? n.toLocaleString("en-US")
    : n.toLocaleString("fr-FR").replaceAll(FINE_INSECABLE, INSECABLE);
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA FORCE DU RÉSEAU, EN MOTS
 *
 * Le boîtier remonte ce que le modem répond à `AT+CSQ` : un entier de 0 à 31,
 * et 99 quand il ne sait pas (voir `totem/modem.py`). Affiché nu — « 4/31 »,
 * en gris, sans étiquette —, ce nombre ne dit rien à personne. Or 4, c'est
 * −105 dBm : un réseau au bord du silence, sur une puce par où passe l'argent
 * du commerce. C'est une information vitale, et elle était illisible.
 *
 * L'ÉCHELLE. 3GPP TS 27.007 § 8.5 fixe la correspondance de `AT+CSQ` : 0 vaut
 * −113 dBm ou moins, 1 vaut −111 dBm, 2 à 30 couvrent −109 à −53 dBm par pas
 * de 2 dBm, 31 vaut −51 dBm ou plus, et 99 signifie « inconnu ».
 * Les paliers de qualité sont ceux du tableau publié pour cette même commande
 * par M2MSupport — https://m2msupport.net/m2msupport/atcsq-signal-quality/ :
 * 0–1 non détectable, 2–9 « marginal » (−109 à −95 dBm), 10–14 « OK » (−93 à
 * −85), 15–19 « good » (−83 à −75), 20–31 « excellent » (−73 à −51).
 *
 * ON N'EN GARDE QUE TROIS CRANS. Cinq mots pour un chiffre qu'on ne peut pas
 * régler ne servent à rien : ce qui change, c'est ce qu'on fait derrière —
 * déplacer l'antenne, ou ne rien faire. « marginal » devient FAIBLE, « OK »
 * devient MOYEN, « good » et « excellent » deviennent BON.
 *
 * La fonction ne rend PAS de texte : les mots vivent dans `lib/textes`, et
 * l'application est bilingue.
 * ──────────────────────────────────────────────────────────────────────────── */
export type ForceReseau = "faible" | "moyen" | "bon";

export function forceReseau(signal: number | null): ForceReseau | null {
  // Hors de 0–31, on ne sait pas : 99 est le « inconnu » de la norme, et le
  // robot le remonte tel quel quand le modem ne répond pas.
  if (signal == null || signal < 0 || signal > 31) return null;
  if (signal < 10) return "faible";
  if (signal < 15) return "moyen";
  return "bon";
}

/** Le jour d'un instant, vu de Douala, sous forme de clé « 2026-08-05 ». */
export function jourDouala(d: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Douala" }).format(d);
}
