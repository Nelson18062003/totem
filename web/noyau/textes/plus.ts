// L'onglet « … » — PLUS.
//
// La barre d'onglets ne garde que ce qu'on fait tous les jours : l'accueil,
// les paiements, les SMS, les opérations. « Comptes » y prenait une place
// pour un écran qu'on ouvre de temps en temps ; le propriétaire l'a dit :
// « je ne sais pas si Comptes est utile là ». Il vit ici, avec ce qui
// n'avait pas d'onglet : l'analyse, le relevé, les bénéficiaires, le cadran,
// les réglages. Chaque ligne dit ce qu'on y trouve.

const en = {
  titre: "More",
  groupeComptes: "Your accounts",
  groupeOutils: "Tools",
  comptesSous: "The balance of each card, and removed cards",
  analyseSous: "This week, best days, top senders",
  releveSous: "PDF or CSV, over the period you choose",
  reglagesSous: "Your account, notifications, language",
};

const fr: typeof en = {
  titre: "Plus",
  groupeComptes: "Vos comptes",
  groupeOutils: "Outils",
  comptesSous: "Le solde de chaque carte, et les cartes retirées",
  analyseSous: "La semaine, les meilleurs jours, qui vous envoie le plus",
  releveSous: "PDF ou CSV, sur la période de votre choix",
  reglagesSous: "Votre compte, les notifications, la langue",
};

export const textesPlus = { en, fr } as const;
