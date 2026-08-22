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

export type Paiement = {
  id: string;
  sim: string;              // libellé court de l'opérateur (« Orange »)
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
export function nombre(n: number, langue: Langue): string {
  return langue === "en"
    ? n.toLocaleString("en-US")
    : n.toLocaleString("fr-FR").replace(/ /g, " ");
}

/** Le jour d'un instant, vu de Douala, sous forme de clé « 2026-08-05 ». */
export function jourDouala(d: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Douala" }).format(d);
}
