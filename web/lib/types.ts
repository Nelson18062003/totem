// Types partagés entre le serveur (qui lit la base) et les écrans.
// Aucune donnée ici : les valeurs viennent de Supabase, ou de nulle part.

// Une carte SIM est identifiée par son ICCID — le numéro de série gravé sur
// la puce, unique au monde. L'opérateur ne suffit pas : deux SIM du même
// opérateur qui se succèdent dans le terminal sont deux caisses distinctes.
export type Sim = {
  iccid: string;
  libelle: string;          // « Orange ·4432 » — opérateur + 4 derniers de l'ICCID
  operateur: string;        // « MTN », « Orange »
  reseau: string;           // réseau visité, différent en itinérance
  itinerance: boolean;
  numero: string;
  solde: number | null;     // le dernier solde connu — jamais « en direct »
  soldeSource: string;      // « le SMS de 09 h 47 », « la mise à jour de 8 h 02 »
  signal: number | null;
  enPlace: boolean;
  premiereVue: string;
  derniereVue: string;
  nbPaiements: number;
  totalRecu: number;
};

export type Paiement = {
  id: string;
  sim: string;              // libellé court de l'opérateur (« Orange »)
  sens: "in" | "out";
  nom: string;
  numero: string;
  montant: number;
  heure: string;
  date: string;             // « Aujourd'hui », « Hier », « 28 juillet »
  recuLe: string;           // l'horodatage exact, pour les calculs
  reference: string;
  soldeApres: number | null;
  smsBrut: string;
};

export type EtatTerminal = {
  id: string;
  nom: string;
  enLigne: boolean;
  majTexte: string;         // « il y a 12 s »
  version: string;
};

export type Donnees = {
  relie: boolean;           // les variables d'accès à la base sont-elles là ?
  terminal: EtatTerminal | null;
  sims: Sim[];
  paiements: Paiement[];
};

export function fcfa(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ /g, " ") + " FCFA";
}

// Le nombre seul, complet, sans abréviation : 287 000 — jamais « 287 k ».
export function nombre(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ /g, " ");
}
