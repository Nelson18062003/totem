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

export const paiements: Paiement[] = [
  { id: "p1", sim: "MTN", nom: "NGONO Marie", numero: "682 59 53 28", montant: 25000, heure: "09:47" },
  { id: "p2", sim: "Orange", nom: "TCHOUMI Paul", numero: "699 10 22 33", montant: 15000, heure: "09:12" },
  { id: "p3", sim: "MTN", nom: "FOTSO Jean", numero: "677 45 66 77", montant: 50000, heure: "08:35" },
  { id: "p4", sim: "MTN", nom: "ABENA Rose", numero: "690 33 44 55", montant: 10000, heure: "07:58" },
  { id: "p5", sim: "Orange", nom: "KAMGA Eric", numero: "655 12 88 99", montant: 35000, heure: "01:12" },
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
