// Données de démonstration pour la maquette TOTEM.
// Remplacées plus tard par l'API réelle du robot (Raspberry Pi).

export type Sim = {
  id: string;
  operateur: "MTN" | "Orange";
  numero: string;
  solde: number;
  signal: number; // 0..31
  enLigne: boolean;
};

export type Paiement = {
  id: string;
  sim: "MTN" | "Orange";
  nom: string;
  numero: string;
  montant: number;
  heure: string;
  date: string; // ex. "Aujourd’hui", "Hier"
  reference: string; // identifiant de transaction MoMo/OM
  soldeApres: number;
  smsBrut: string; // le SMS exact reçu — preuve pour litiges
};

export type EtatRobot = {
  nom: string;
  enLigne: boolean;
  lieu: string;
  batterie: number; // %
  surSecteur: boolean;
  internet: "Starlink" | "4G (secours)";
  majTexte: string;
};

export const robot: EtatRobot = {
  nom: "TOTEM",
  enLigne: true,
  lieu: "Douala, bureau",
  batterie: 100,
  surSecteur: true,
  internet: "Starlink",
  majTexte: "il y a 12 s",
};

export const sims: Sim[] = [
  { id: "mtn", operateur: "MTN", numero: "677 12 34 56", solde: 872500, signal: 26, enLigne: true },
  { id: "orange", operateur: "Orange", numero: "699 88 77 66", solde: 415000, signal: 22, enLigne: true },
];

function mkPaiement(
  id: string, sim: "MTN" | "Orange", nom: string, numero: string,
  montant: number, heure: string, date: string, reference: string, soldeApres: number,
): Paiement {
  const op = sim === "MTN" ? "MobileMoney" : "Orange Money";
  const smsBrut = `${op}: Vous avez recu ${montant.toLocaleString("fr-FR")} FCFA de ${nom} (${numero}). ` +
    `Ref: ${reference}. Nouveau solde: ${soldeApres.toLocaleString("fr-FR")} FCFA.`;
  return { id, sim, nom, numero, montant, heure, date, reference, soldeApres, smsBrut };
}

export const paiements: Paiement[] = [
  mkPaiement("p1", "MTN", "NGONO Marie", "682 59 53 28", 25000, "09:47", "Aujourd’hui", "PP250730.0947.A12345", 872500),
  mkPaiement("p2", "Orange", "TCHOUMI Paul", "699 10 22 33", 15000, "09:12", "Aujourd’hui", "OM250730.0912.B67890", 415000),
  mkPaiement("p3", "MTN", "FOTSO Jean", "677 45 66 77", 50000, "08:35", "Aujourd’hui", "PP250730.0835.C24680", 847500),
  mkPaiement("p4", "MTN", "ABENA Rose", "690 33 44 55", 10000, "07:58", "Aujourd’hui", "PP250730.0758.D13579", 797500),
  mkPaiement("p5", "Orange", "KAMGA Eric", "655 12 88 99", 35000, "01:12", "Aujourd’hui", "OM250730.0112.E11223", 400000),
  mkPaiement("p6", "MTN", "MBALLA Sophie", "679 88 11 22", 40000, "22:40", "Hier", "PP250729.2240.F33445", 787500),
  mkPaiement("p7", "Orange", "ESSOMBA Luc", "656 77 99 00", 5000, "18:05", "Hier", "OM250729.1805.G55667", 365000),
  mkPaiement("p8", "MTN", "NGONO Marie", "682 59 53 28", 12000, "14:20", "Hier", "PP250729.1420.H77889", 747500),
];

// Encaissements des 7 derniers jours (FCFA) pour le graphique Rapports.
export const septJours: { jour: string; montant: number }[] = [
  { jour: "Lun", montant: 287000 },
  { jour: "Mar", montant: 342000 },
  { jour: "Mer", montant: 198000 },
  { jour: "Jeu", montant: 405000 },
  { jour: "Ven", montant: 512000 },
  { jour: "Sam", montant: 366000 },
  { jour: "Dim", montant: 241000 },
];

export function fcfa(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ /g, " ") + " FCFA";
}

// Menu MoMo simulé pour la console USSD de la maquette.
export const menuMoMo: Record<string, { texte: string; ouvert: boolean }> = {
  "*126#": {
    texte: "MTN MoMo\n1. Transfert d'argent\n2. Retrait d'argent\n3. Paiements\n4. Épargne\n5. Mon compte\n6. Quitter",
    ouvert: true,
  },
  "5": { texte: "Mon compte\n1. Consulter le solde\n2. Dernières transactions\n3. Retour", ouvert: true },
  "1": { texte: "Votre solde MoMo est de 872 500 FCFA.", ouvert: false },
};
