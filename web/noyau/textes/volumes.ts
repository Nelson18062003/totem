// Les textes de l'écran Volumes — ce qui est entré et sorti des cartes, sur
// la période qu'on choisit. Peu de mots, à dessein : le propriétaire voulait
// des DESSINS (« trop de textes… je ne comprends rien »). Chaque phrase ici
// est un titre, une étiquette ou un avertissement — pas une explication.
// L'anglais d'abord, écrit pour lui-même.

import type { FamilleVolume, GenrePeriode, Pas, TypeVolume } from "../volumes";

const en = {
  titre: "Volumes",
  periodes: { jour: "Day", semaine: "Week", mois: "Month", "6mois": "6 months", dates: "Dates" } as Record<GenrePeriode, string>,
  precedente: "Previous period",
  suivante: "Next period",
  du: "From",
  au: "To",
  voir: "Show",
  toutesLesCartes: "All cards",
  carte: "Card",
  telechargerReleve: "Download the statement for this period",
  entrees: "Money in",
  sorties: "Money out",
  reste: "Net",
  operations: (n: number) => (n === 1 ? "1 transaction" : `${n.toLocaleString("en-US")} transactions`),
  op: (n: number) => `${n} txn`,
  vsAvant: "vs. the period before",
  // Les avertissements : ce qui peut manquer.
  incomplet: "These figures may be incomplete",
  illisibles: (n: number) => (n === 1 ? "1 unreadable money SMS" : `${n} unreadable money SMS`),
  aVerifier: (n: number) => (n === 1 ? "1 transaction with no direction" : `${n} transactions with no direction`),
  ecarts: (n: number) => (n === 1 ? "1 balance gap" : `${n} balance gaps`),
  incomplets: (n: number) => (n === 1 ? "1 SMS still incomplete" : `${n} SMS still incomplete`),
  silence: (carte: string) => `The box holding ${carte} is not responding: recent transactions may arrive later`,
  tronque: "This period holds more SMS than TOTEM reads at once: totals are cut",
  // Les chiffres clés.
  chiffresCles: "Key figures",
  kOperations: "Transactions",
  kParJour: (n: number) => `${n.toLocaleString("en-US")} a day on average`,
  kMoyenne: "Average amount",
  kParOperation: "per transaction",
  kPlusGrosse: "Largest",
  kRecueLe: (j: string) => `received on ${j}`,
  kEnvoyeeLe: (j: string) => `sent on ${j}`,
  kCorrespondants: "Counterparties",
  kPersonnes: "different people",
  kCommissions: "Commissions",
  kGagnees: "earned",
  kFrais: "Fees",
  kPayes: "paid",
  // Les sections.
  serie: { heure: "Hour by hour", jour: "Day by day", semaine: "Week by week", mois: "Month by month" } as Record<Pas, string>,
  avecQui: "Who with",
  parVolume: "by volume",
  voirTous: (n: number) => `See all ${n} counterparties`,
  voirMoins: "Show fewer",
  sansNom: "No name",
  dOuVaLArgent: "Where the money comes from and goes",
  parCarte: "By card",
  soldesJustes: "Balances match",
  ecartDe: (x: string) => `Gap ${x}`,
  soldeNonConnu: "Balance unknown",
  entreVosCartes: (x: string) => `${x} moved between your cards — counted on each card, not in the totals above`,
  heuresDePointe: "Busy hours",
  lePlusCharge: "Busiest:",
  creneau: (jour: string, h: number) => `${jour}, ${h}:00–${h + 2}:00`,
  calme: "quiet",
  charge: "busy",
  jours: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  joursLongs: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  // La fiche d'une carte.
  leSolde: "The balance",
  debut: "Start",
  fin: "End",
  ilManque: (x: string, quand: string) => `${x} missing · ${quand}`,
  enTrop: (x: string, quand: string) => `${x} too much · ${quand}`,
  attendu: (x: string) => `Expected: ${x}`,
  // La fiche d'un correspondant.
  recuDe: "Received",
  envoyeA: "Sent",
  avecChaqueCarte: "With each card",
  // Vide, panne.
  rien: "No transaction over this period",
  rienDetail: "Choose another period, or another card.",
  pasDeCarte: "No card yet",
  pasDeCarteDetail: "Volumes appear once a card is linked to your account.",
  erreur: "The figures could not be loaded. Check the connection and try again.",
  reessayer: "Try again",
  types: {
    argent_recu: "Money received", transfert_recu: "Transfers in", retrait_client: "Customer withdrawals",
    depot_recu: "Deposits received", commissions_versees: "Commissions paid to the card",
    argent_envoye: "Money sent", transfert_envoye: "Transfers out", depot_client: "Customer deposits",
    retrait_especes: "Cash withdrawals",
  } as Record<TypeVolume, string>,
  familles: {
    in: { argent: "Money received", especes: "Cash", transferts: "Transfers", commissions: "Commissions" },
    out: { argent: "Money sent", especes: "Cash", transferts: "Transfers", commissions: "Commissions" },
  } as Record<"in" | "out", Record<FamilleVolume, string>>,
};

const fr: typeof en = {
  titre: "Volumes",
  periodes: { jour: "Jour", semaine: "Semaine", mois: "Mois", "6mois": "6 mois", dates: "Dates" },
  precedente: "Période précédente",
  suivante: "Période suivante",
  du: "Du",
  au: "Au",
  voir: "Voir",
  toutesLesCartes: "Toutes les cartes",
  carte: "Carte",
  telechargerReleve: "Télécharger le relevé de cette période",
  entrees: "Entrées",
  sorties: "Sorties",
  reste: "Reste",
  operations: (n) => (n > 1 ? `${n.toLocaleString("fr-FR").replace(/[  ]/g, " ")} opérations` : `${n} opération`),
  op: (n) => `${n} op.`,
  vsAvant: "par rapport à la période d’avant",
  incomplet: "Ces chiffres peuvent être incomplets",
  illisibles: (n) => (n > 1 ? `${n} SMS d’argent illisibles` : "1 SMS d’argent illisible"),
  aVerifier: (n) => (n > 1 ? `${n} opérations sans sens connu` : "1 opération sans sens connu"),
  ecarts: (n) => (n > 1 ? `${n} écarts de solde` : "1 écart de solde"),
  incomplets: (n) => (n > 1 ? `${n} SMS encore incomplets` : "1 SMS encore incomplet"),
  silence: (carte) => `Le boîtier de ${carte} ne répond plus : les dernières opérations peuvent arriver plus tard`,
  tronque: "Cette période porte plus de SMS que TOTEM n’en lit d’un coup : les totaux sont coupés",
  chiffresCles: "Chiffres clés",
  kOperations: "Opérations",
  kParJour: (n) => `${String(n).replace(".", ",")} par jour en moyenne`,
  kMoyenne: "Montant moyen",
  kParOperation: "par opération",
  kPlusGrosse: "Plus grosse",
  kRecueLe: (j) => `reçue le ${j}`,
  kEnvoyeeLe: (j) => `envoyée le ${j}`,
  kCorrespondants: "Correspondants",
  kPersonnes: "personnes différentes",
  kCommissions: "Commissions",
  kGagnees: "gagnées",
  kFrais: "Frais",
  kPayes: "payés",
  serie: { heure: "Heure par heure", jour: "Chaque jour", semaine: "Chaque semaine", mois: "Chaque mois" },
  avecQui: "Avec qui",
  parVolume: "par volume",
  voirTous: (n) => `Voir les ${n} correspondants`,
  voirMoins: "Voir moins",
  sansNom: "Sans nom",
  dOuVaLArgent: "D’où vient l’argent, où il va",
  parCarte: "Par carte",
  soldesJustes: "Soldes justes",
  ecartDe: (x) => `Écart ${x}`,
  soldeNonConnu: "Solde non connu",
  entreVosCartes: (x) => `${x} passés d’une de vos cartes à une autre : comptés sur chaque carte, pas en haut`,
  heuresDePointe: "Heures de pointe",
  lePlusCharge: "Le plus chargé :",
  creneau: (jour, h) => `${jour}, de ${h} h à ${h + 2} h`,
  calme: "calme",
  charge: "chargé",
  jours: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
  joursLongs: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
  leSolde: "Le solde",
  debut: "Début",
  fin: "Fin",
  ilManque: (x, quand) => `Il manque ${x} · ${quand}`,
  enTrop: (x, quand) => `${x} en trop · ${quand}`,
  attendu: (x) => `Attendu : ${x}`,
  recuDe: "Reçu",
  envoyeA: "Envoyé",
  avecChaqueCarte: "Avec chaque carte",
  rien: "Aucune opération sur cette période",
  rienDetail: "Choisissez une autre période, ou une autre carte.",
  pasDeCarte: "Pas encore de carte",
  pasDeCarteDetail: "Les volumes apparaissent dès qu’une carte est rattachée à votre compte.",
  erreur: "Les chiffres n’ont pas pu se charger. Vérifiez la connexion, puis réessayez.",
  reessayer: "Réessayer",
  types: {
    argent_recu: "Argent reçu", transfert_recu: "Transferts reçus", retrait_client: "Retraits de clients",
    depot_recu: "Dépôts reçus", commissions_versees: "Commissions versées sur la carte",
    argent_envoye: "Argent envoyé", transfert_envoye: "Transferts envoyés", depot_client: "Dépôts de clients",
    retrait_especes: "Retraits en espèces",
  },
  familles: {
    in: { argent: "Argent reçu", especes: "Espèces", transferts: "Transferts", commissions: "Commissions" },
    out: { argent: "Argent envoyé", especes: "Espèces", transferts: "Transferts", commissions: "Commissions" },
  },
};

export const textesVolumes = { en, fr } as const;

/** Un montant EN ENTIER, avec « F » : « 12 486 500 F ». Jamais abrégé — un
 *  montant abrégé est un montant flou. `signe` : « + » et « − » devant. */
export function francs(n: number, langue: "en" | "fr", signe = false): string {
  const v = Math.abs(n).toLocaleString(langue === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
  const s = signe ? (n > 0 ? "+" : n < 0 ? "−" : "") : n < 0 ? "−" : "";
  return `${s}${v} F`;
}

/** Le nom d'une famille dans un anneau : celui du type quand il est seul
 *  (« Retraits de clients » sur une puce d'agent), sinon celui de la famille. */
export function nomDeFamille(
  langue: "en" | "fr", sens: "in" | "out", famille: FamilleVolume, types: TypeVolume[],
): string {
  const t = textesVolumes[langue];
  return types.length === 1 ? t.types[types[0]] : t.familles[sens][famille];
}

/** « 9 oct. » / « 9 Oct » — un jour de la caisse, court. */
export function jourCourtVolumes(cle: string, langue: "en" | "fr"): string {
  const [a, m, j] = cle.split("-").map(Number);
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, j))).replace(/[  ]/g, " ");
}
