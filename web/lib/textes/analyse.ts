// Les textes de la page Analyse — les sept derniers jours.
// L'anglais d'abord, écrit pour lui-même.

const en = {
  titre: "Analysis",
  sousTitre: "The last seven days.",
  rienTitre: "Nothing to analyse yet",
  rienDetail:
    "As soon as payments come in, this page will show the week, the best " +
    "days and the top customers.",
  encaissementsSemaine: "Money in this week",
  parRapportSemainePrecedente: "compared with the week before",
  moyenneParJour: "Daily average",
  meilleurJour: "Best day",
  principauxClients: "Top customers",
  nbPaiements: (n: number) => (n === 1 ? "1 payment" : `${n} payments`),
  exporterBilan: "Export the report",
};

const fr: typeof en = {
  titre: "Analyse",
  sousTitre: "Sept derniers jours.",
  rienTitre: "Rien à analyser pour l’instant",
  rienDetail:
    "Dès que des paiements arriveront, cette page montrera la semaine, les " +
    "meilleurs jours et les principaux clients.",
  encaissementsSemaine: "Encaissements de la semaine",
  parRapportSemainePrecedente: "par rapport à la semaine précédente",
  moyenneParJour: "Moyenne par jour",
  meilleurJour: "Meilleur jour",
  principauxClients: "Principaux clients",
  nbPaiements: (n) => (n > 1 ? `${n} paiements` : `${n} paiement`),
  exporterBilan: "Exporter le bilan",
};

export const textesAnalyse = { en, fr } as const;
