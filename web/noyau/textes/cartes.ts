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
  soldeLeHier: (h: string) => `checked yesterday at ${h}`,
  soldeLeDate: (j: string, h: string) => `checked on ${j} at ${h}`,
  analyseSous: "This week, best days, top customers",
  carte: (fin: string) => `card ${fin}`,
  itinerance: (reseau: string) => `roaming on ${reseau}`,
  repartition: "Breakdown",
  retireesTitre: "Removed cards",
  retireesDetail:
    "They are no longer in the terminal, but their record is intact. Put one back in and it shows up again just as it was.",
  bilanRetiree: (n: number, d: string) =>
    `${n} ${n === 1 ? "payment" : "payments"} · removed ${d}`,
  // Le modem a répondu « 99 » — il ne sait pas. Ce n'est PAS « pas de
  // réseau » (ce libellé est celui du téléphone hors ligne) : on dit ce
  // qu'on sait, c'est-à-dire rien.
  signalInconnu: "signal unknown",
  // Une carte dont on ne sait RIEN de récent : ni « en place », ni
  // « retirée ». Deux raisons, et la phrase est vraie pour les deux : le
  // boîtier s'est tu, ou il vient de revenir et n'a pas encore relu ses
  // puces (son signe de vie arrive avant ses cartes). On nomme l'objet (le
  // boîtier), pas une cause qu'on ignore — courant ou Internet.
  boitierSansNouvelles:
    "No recent news of this card: the shop's box went quiet, or has just come back. "
    + "What you see here dates from before.",
};

const fr: typeof en = {
  titre: "Comptes",
  videTitre: "Aucune carte dans le terminal",
  videDetail:
    "Dès qu'une SIM sera vue par le terminal, son compte apparaîtra ici, avec son solde et son journal.",
  numeroAbsent: "numéro non provisionné",
  soldeLe: (h) => `consulté à ${h}`,
  soldeLeHier: (h) => `consulté hier à ${h}`,
  soldeLeDate: (j, h) => `consulté le ${j} à ${h}`,
  analyseSous: "La semaine, les meilleurs jours, les meilleurs clients",
  carte: (fin) => `carte ${fin}`,
  itinerance: (reseau) => `itinérance sur ${reseau}`,
  repartition: "Répartition",
  retireesTitre: "Cartes retirées",
  retireesDetail:
    "Elles ne sont plus dans le terminal, mais leur journal est intact. Les remettre le fait ressortir tel quel.",
  bilanRetiree: (n, d) => `${n} paiement${n > 1 ? "s" : ""} · retirée le ${d}`,
  signalInconnu: "signal inconnu",
  boitierSansNouvelles:
    "Pas de nouvelles récentes de cette carte : le boîtier de la boutique s’est tu, "
    + "ou vient de revenir. Ce qui s’affiche ici date d’avant.",
};

export const textesCartes = { en, fr } as const;
