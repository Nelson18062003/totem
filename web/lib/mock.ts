// Données de démonstration pour la maquette TOTEM.
// Remplacées plus tard par l'API réelle du robot (Raspberry Pi).

// Une carte SIM est identifiée par son ICCID — le numéro de série gravé sur
// la puce, unique au monde. L'opérateur ne suffit pas : deux SIM du même
// opérateur qui se succèdent dans le terminal sont deux caisses distinctes.
export type Sim = {
  id: string;
  iccid: string;
  libelle: string;          // « Orange ·4432 » — opérateur + 4 derniers de l'ICCID
  operateur: "MTN" | "Orange";
  reseau: string;           // réseau visité, différent en itinérance
  itinerance: boolean;
  numero: string;
  solde: number;
  // Le solde n'est jamais « en direct » : la SIM ne le connaît que par le
  // dernier SMS reçu, ou par une interrogation USSD. On garde donc sa source.
  soldeSource: string;      // « le SMS de 09 h 47 », « l'interrogation de 08 h 02 »
  signal: number;
  enPlace: boolean;         // la puce est-elle dans le terminal en ce moment ?
  premiereVue: string;
  derniereVue: string;
  nbPaiements: number;
  totalRecu: number;
};

export type Paiement = {
  id: string;
  sim: "MTN" | "Orange";
  sens: "in" | "out";
  nom: string;
  numero: string;
  montant: number;
  heure: string;
  date: string;
  reference: string;
  soldeApres: number;
  smsBrut: string;
  categorie: "Client" | "Transfert" | "Retrait" | "Crédit";
};

export type EtatRobot = {
  nom: string; enLigne: boolean; lieu: string; batterie: number;
  surSecteur: boolean; internet: string; majTexte: string;
};

export const robot: EtatRobot = {
  nom: "TOTEM", enLigne: true, lieu: "Douala", batterie: 100,
  surSecteur: true, internet: "Starlink", majTexte: "12 s",
};

// La puce en place aujourd'hui est une Orange — comme dans la réalité.
// Les MTN passées par le boîtier restent consultables : journal intact.
export const sims: Sim[] = [
  {
    id: "orange", iccid: "89237020000000004432", libelle: "Orange ·4432",
    operateur: "Orange", reseau: "Orange CM", itinerance: false,
    numero: "699 88 77 66", solde: 415000,
    soldeSource: "le SMS de 09 h 47",
    signal: 22, enPlace: true,
    premiereVue: "12 mars 2026", derniereVue: "à l’instant",
    nbPaiements: 96, totalRecu: 1_640_000,
  },
  {
    id: "mtn", iccid: "89237010000000008901", libelle: "MTN ·8901",
    operateur: "MTN", reseau: "MTN CM", itinerance: false,
    numero: "", solde: 0, soldeSource: "",
    signal: 0, enPlace: false,
    premiereVue: "12 mars 2026", derniereVue: "28 juil. 2026",
    nbPaiements: 214, totalRecu: 4_820_000,
  },
  {
    // Une puce retirée : son journal reste entier et consultable. C'est
    // précisément ce que le cloisonnement par ICCID rend possible.
    id: "mtn-ancienne", iccid: "89237010000000002215", libelle: "MTN ·2215",
    operateur: "MTN", reseau: "MTN CM", itinerance: false,
    numero: "", solde: 0, soldeSource: "",
    signal: 0, enPlace: false,
    premiereVue: "4 janv. 2026", derniereVue: "11 mars 2026",
    nbPaiements: 58, totalRecu: 1_115_000,
  },
];

export const simsEnPlace = sims.filter((s) => s.enPlace);

// Le solde du terminal ne compte que les cartes présentes : additionner celui
// d'une puce retirée annoncerait un argent qu'on ne peut pas toucher.
export const soldeTotal = simsEnPlace.reduce((s, x) => s + x.solde, 0);

function mk(
  id: string, sim: "MTN" | "Orange", sens: "in" | "out", nom: string, numero: string,
  montant: number, heure: string, date: string, ref: string, soldeApres: number,
  categorie: Paiement["categorie"],
): Paiement {
  // Les SMS Orange réels portent l'ID de transaction et le « Nouveau Solde » —
  // c'est de là que vient le dernier solde connu.
  const smsBrut = sim === "Orange"
    ? `Vous avez ${sens === "in" ? "recu un transfert de" : "transfere"} ` +
      `${montant.toLocaleString("fr-FR")} FCFA ${sens === "in" ? "de" : "vers"} ` +
      `${numero.replace(/\s/g, "")} ${nom}. Details: ID transaction: ${ref}, ` +
      `Nouveau Solde: ${soldeApres.toLocaleString("fr-FR")} FCFA`
    : `MobileMoney: Vous avez ${sens === "in" ? "recu" : "envoye"} ` +
      `${montant.toLocaleString("fr-FR")} FCFA ${sens === "in" ? "de" : "a"} ` +
      `${nom} (${numero}). Ref: ${ref}. ` +
      `Nouveau solde: ${soldeApres.toLocaleString("fr-FR")} FCFA.`;
  return { id, sim, sens, nom, numero, montant, heure, date, reference: ref, soldeApres, smsBrut, categorie };
}

export const paiements: Paiement[] = [
  mk("p1", "Orange", "in", "NGONO Marie", "699 59 53 28", 25000, "09:47", "Aujourd’hui", "PP260801.0947.A12345", 415000, "Client"),
  mk("p2", "Orange", "in", "TCHOUMI Paul", "699 10 22 33", 15000, "09:12", "Aujourd’hui", "PP260801.0912.B67890", 390000, "Client"),
  mk("p3", "Orange", "in", "FOTSO Jean", "697 45 66 77", 50000, "08:35", "Aujourd’hui", "PP260801.0835.C24680", 375000, "Client"),
  mk("p4", "Orange", "out", "Fournisseur SARL", "690 33 44 55", 80000, "08:10", "Aujourd’hui", "PP260801.0810.D13579", 325000, "Transfert"),
  mk("p5", "Orange", "in", "ABENA Rose", "655 33 44 55", 10000, "07:58", "Aujourd’hui", "PP260801.0758.E11223", 405000, "Client"),
  mk("p6", "Orange", "in", "KAMGA Eric", "655 12 88 99", 35000, "22:40", "Hier", "PP260731.2240.F33445", 395000, "Client"),
  mk("p7", "Orange", "out", "Recharge crédit", "656 77 99 00", 5000, "18:05", "Hier", "PP260731.1805.G55667", 360000, "Crédit"),
  // Encaissés par la MTN ·8901 avant son retrait du 28 juillet.
  mk("p8", "MTN", "in", "MBALLA Sophie", "679 88 11 22", 40000, "16:12", "28 juillet", "PP1612.H77889", 787500, "Client"),
  mk("p9", "MTN", "in", "NGONO Marie", "682 59 53 28", 22000, "11:03", "28 juillet", "PP1103.J11223", 747500, "Client"),
];

// --- SMS reçus, tels quels ---------------------------------------------------
// Tout ce que la carte reçoit passe ici : paiements compris, mais aussi le
// solde, la publicité — et les codes à usage unique, jamais montrés en clair.
export type Sms = {
  id: string;
  heure: string;
  date: string;
  expediteur: string;
  texte: string;
  nature: "paiement" | "solde" | "code" | "autre";
};

const smsBruts: Sms[] = [
  ...paiements
    .filter((p) => p.date === "Aujourd’hui" || p.date === "Hier")
    .map((p) => ({
      id: `s-${p.id}`, heure: p.heure, date: p.date,
      expediteur: "OrangeMoney", texte: p.smsBrut, nature: "paiement" as const,
    })),
  {
    id: "s-solde", heure: "08:02", date: "Aujourd’hui", expediteur: "OrangeMoney",
    texte: "Le solde de votre compte est de 395000FCFA.", nature: "solde",
  },
  {
    // Le vrai SMS contient un code à six chiffres. Il n'est jamais montré ni
    // archivé en clair : c'est une clé d'entrée sur le compte.
    id: "s-code", heure: "17:40", date: "Hier", expediteur: "OrangeMoney",
    texte: "Le code de 696103864 est: ••••••. Orange Money vous remercie.", nature: "code",
  },
  {
    id: "s-pub", heure: "12:15", date: "Hier", expediteur: "Orange",
    texte: "Profitez de 10 Go a 2000 FCFA valable 7 jours. Composez le #145#.", nature: "autre",
  },
];

export const smsRecus: Sms[] = smsBruts.sort((a, b) => {
  const jour = (d: string) => (d === "Aujourd’hui" ? 0 : d === "Hier" ? 1 : 2);
  return jour(a.date) - jour(b.date) || b.heure.localeCompare(a.heure);
});

// --- Codes USSD par opérateur ------------------------------------------------
// Le guichet n'a pas les mêmes codes d'un opérateur à l'autre, et rien ne se
// devine : ceux-ci ont été composés sur un vrai téléphone (totem/codes.py).
// Les réglages permettent de les corriger et d'en ajouter d'autres.
export type CodeUssd = { cle: string; libelle: string; code: string };

export const codesUssd: Record<"Orange" | "MTN", CodeUssd[]> = {
  Orange: [
    { cle: "menu", libelle: "Menu", code: "#148#" },
    { cle: "depot", libelle: "Dépôt", code: "#148*2#" },
    { cle: "retrait", libelle: "Retrait", code: "#148*3#" },
    { cle: "transfert", libelle: "Transfert", code: "#148*4#" },
    { cle: "solde", libelle: "Solde", code: "#148*5#" },
    { cle: "mon_numero", libelle: "Mon numéro", code: "#148*7*6#" },
  ],
  // Aucun code MTN relevé sur le terrain pour l'instant — on ne devine pas.
  MTN: [],
};

export const codeUssd = (op: "Orange" | "MTN", cle: string) =>
  codesUssd[op].find((c) => c.cle === cle)?.code ?? "";

// 7 derniers jours d'encaissements (FCFA)
export const septJours = [
  { jour: "Lun", montant: 287000 }, { jour: "Mar", montant: 342000 },
  { jour: "Mer", montant: 198000 }, { jour: "Jeu", montant: 405000 },
  { jour: "Ven", montant: 512000 }, { jour: "Sam", montant: 366000 },
  { jour: "Dim", montant: 241000 },
];

// Meilleurs clients (cumul)
export const topClients = [
  { nom: "NGONO Marie", nb: 12, total: 312000 },
  { nom: "FOTSO Jean", nb: 8, total: 245000 },
  { nom: "MBALLA Sophie", nb: 6, total: 180000 },
  { nom: "KAMGA Eric", nb: 5, total: 142000 },
];

export function fcfa(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ /g, " ") + " FCFA";
}
export function fcfaCourt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + " M";
  if (n >= 1000) return Math.round(n / 1000) + " k";
  return String(n);
}
