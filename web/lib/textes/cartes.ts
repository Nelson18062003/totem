// Les textes de l'écran des comptes (une carte SIM, un compte).
// L'anglais s'écrit pour lui-même, le français aussi : aucun des deux n'est
// une traduction mot à mot de l'autre. Les noms d'opérateurs, « ICCID » et
// « FCFA » ne changent jamais de langue.

const en = {
  titre: "Accounts",
  videTitre: "No card in the terminal",
  videDetail:
    "As soon as the terminal sees a SIM, its account will appear here, with its balance and its record.",
  numeroAbsent: "no number on record",
  // Le solde n'est jamais « en direct » : on dit l'heure où il a été relevé.
  soldeLe: (h: string) => `checked at ${h}`,
  carte: (fin: string) => `card ${fin}`,
  itinerance: (reseau: string) => `roaming on ${reseau}`,
  repartition: "Breakdown",
  retireesTitre: "Removed cards",
  retireesDetail:
    "They are no longer in the terminal, but their record is intact. Put one back in and it shows up again just as it was.",
  bilanRetiree: (n: number, d: string) =>
    `${n} ${n === 1 ? "payment" : "payments"} · removed ${d}`,
};

const fr: typeof en = {
  titre: "Comptes",
  videTitre: "Aucune carte dans le terminal",
  videDetail:
    "Dès qu'une SIM sera vue par le terminal, son compte apparaîtra ici, avec son solde et son journal.",
  numeroAbsent: "numéro non provisionné",
  soldeLe: (h) => `consulté à ${h}`,
  carte: (fin) => `carte ${fin}`,
  itinerance: (reseau) => `itinérance sur ${reseau}`,
  repartition: "Répartition",
  retireesTitre: "Cartes retirées",
  retireesDetail:
    "Elles ne sont plus dans le terminal, mais leur journal est intact. Les remettre le fait ressortir tel quel.",
  bilanRetiree: (n, d) => `${n} paiement${n > 1 ? "s" : ""} · retirée le ${d}`,
};

export const textesCartes = { en, fr } as const;
