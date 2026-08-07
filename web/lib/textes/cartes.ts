// Les textes de l'écran des puces.
//
// UN SEUL MOT POUR UN SEUL OBJET. Cet écran disait « carte », « SIM »,
// « puce » et « compte » pour désigner la même chose, et un paragraphe de
// 48 mots en réglages expliquait la différence — un paragraphe qui n'existait
// que parce que l'interface ne s'était pas décidée. Elle se décide ici :
//
//   français → « puce »   (le mot qu'on emploie au comptoir, et l'objet qu'on
//                          tient dans la main : c'est lui qu'on glisse dans le
//                          terminal, lui qui porte le solde, lui qui revient
//                          avec son journal quand on le remet)
//   anglais  → « SIM »    (le mot courant ; « chip » ne se dit pas, « card »
//                          se confond avec une carte bancaire, et « account »
//                          nomme une abstraction qu'on ne peut pas insérer)
//
// « Compte » ne disparaît pas du produit : il disparaît comme SECOND NOM de la
// puce. Le solde reste le solde.
//
// L'anglais s'écrit pour lui-même, le français aussi : aucun des deux n'est
// une traduction mot à mot de l'autre. Les noms d'opérateurs et « FCFA » ne
// changent jamais de langue.

const en = {
  titre: "SIMs",
  sousTitre: "Each SIM keeps its own balance and its own record.",
  videTitre: "No SIM in the terminal",
  videDetail:
    "Slide a SIM into the terminal: its balance and its record will appear here on their own.",
  numeroAbsent: "no number yet",
  // Le solde n'est jamais « en direct » : on dit l'heure où il a été relevé.
  soldeLe: (h: string) => `checked at ${h}`,
  carte: (fin: string) => `SIM ${fin}`,
  // L'ancien mot était « roaming » : le vrai nom de la chose, mais pas celui
  // du fait qu'il décrit. Ce qui compte pour le commerce, c'est que la puce
  // n'est pas sur son propre réseau — le reste est l'affaire de l'opérateur.
  itinerance: (reseau: string) => `off its own network: ${reseau}`,
  consulterSolde: "Check the balance",
  historique: "History",
  verrouiller: "Lock",
  repartition: "Breakdown",
  retireesTitre: "Removed SIMs",
  retireesDetail:
    "They are no longer in the terminal, but their record is intact. Put one back in and it shows up again just as it was.",
  bilanRetiree: (n: number, d: string) =>
    `${n} ${n === 1 ? "payment" : "payments"} · removed ${d}`,
  mouvements: "Recent activity",
};

const fr: typeof en = {
  titre: "Puces",
  sousTitre: "Chaque puce garde son propre solde et son propre journal.",
  videTitre: "Aucune puce dans le terminal",
  videDetail:
    "Glissez une puce dans le terminal : son solde et son journal apparaîtront ici tout seuls.",
  numeroAbsent: "numéro non inscrit",
  soldeLe: (h) => `consulté à ${h}`,
  carte: (fin) => `puce ${fin}`,
  itinerance: (reseau) => `hors de son réseau : ${reseau}`,
  consulterSolde: "Consulter le solde",
  historique: "Historique",
  verrouiller: "Verrouiller",
  repartition: "Répartition",
  retireesTitre: "Puces retirées",
  retireesDetail:
    "Elles ne sont plus dans le terminal, mais leur journal est intact. Les remettre le fait ressortir tel quel.",
  bilanRetiree: (n, d) => `${n} paiement${n > 1 ? "s" : ""} · retirée le ${d}`,
  mouvements: "Mouvements récents",
};

export const textesCartes = { en, fr } as const;
