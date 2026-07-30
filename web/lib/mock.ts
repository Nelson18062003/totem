// Données de démonstration pour la maquette TOTEM.
// Remplacées plus tard par l'API réelle du robot (Raspberry Pi).

export type Sim = {
  id: string;
  operateur: "MTN" | "Orange";
  numero: string;
  solde: number;
  signal: number;
  enLigne: boolean;
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

export const sims: Sim[] = [
  { id: "mtn", operateur: "MTN", numero: "677 12 34 56", solde: 872500, signal: 26, enLigne: true },
  { id: "orange", operateur: "Orange", numero: "699 88 77 66", solde: 415000, signal: 22, enLigne: true },
];

export const soldeTotal = sims.reduce((s, x) => s + x.solde, 0);

function mk(
  id: string, sim: "MTN" | "Orange", sens: "in" | "out", nom: string, numero: string,
  montant: number, heure: string, date: string, ref: string, soldeApres: number,
  categorie: Paiement["categorie"],
): Paiement {
  const op = sim === "MTN" ? "MobileMoney" : "Orange Money";
  const verbe = sens === "in" ? "recu" : "envoye";
  const smsBrut = `${op}: Vous avez ${verbe} ${montant.toLocaleString("fr-FR")} FCFA ` +
    `${sens === "in" ? "de" : "a"} ${nom} (${numero}). Ref: ${ref}. ` +
    `Nouveau solde: ${soldeApres.toLocaleString("fr-FR")} FCFA.`;
  return { id, sim, sens, nom, numero, montant, heure, date, reference: ref, soldeApres, smsBrut, categorie };
}

export const paiements: Paiement[] = [
  mk("p1", "MTN", "in", "NGONO Marie", "682 59 53 28", 25000, "09:47", "Aujourd’hui", "PP0947.A12345", 872500, "Client"),
  mk("p2", "Orange", "in", "TCHOUMI Paul", "699 10 22 33", 15000, "09:12", "Aujourd’hui", "OM0912.B67890", 415000, "Client"),
  mk("p3", "MTN", "in", "FOTSO Jean", "677 45 66 77", 50000, "08:35", "Aujourd’hui", "PP0835.C24680", 847500, "Client"),
  mk("p4", "MTN", "out", "Fournisseur SARL", "690 33 44 55", 80000, "08:10", "Aujourd’hui", "PP0810.D13579", 797500, "Transfert"),
  mk("p5", "MTN", "in", "ABENA Rose", "690 33 44 55", 10000, "07:58", "Aujourd’hui", "PP0758.E11223", 877500, "Client"),
  mk("p6", "Orange", "in", "KAMGA Eric", "655 12 88 99", 35000, "01:12", "Aujourd’hui", "OM0112.F33445", 400000, "Client"),
  mk("p7", "MTN", "in", "MBALLA Sophie", "679 88 11 22", 40000, "22:40", "Hier", "PP2240.G55667", 787500, "Client"),
  mk("p8", "Orange", "out", "Recharge crédit", "656 77 99 00", 5000, "18:05", "Hier", "OM1805.H77889", 365000, "Crédit"),
];

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
  return n.toLocaleString("fr-FR").replace(/ /g, " ") + " FCFA";
}
export function fcfaCourt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + " M";
  if (n >= 1000) return Math.round(n / 1000) + " k";
  return String(n);
}
