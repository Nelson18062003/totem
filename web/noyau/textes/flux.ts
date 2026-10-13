// Les PAIEMENTS : ce qui est entré et sorti de chaque carte.
//
// Le module s'est d'abord appelé « Flux » ; le propriétaire a demandé
// « Paiements », le mot de Revolut. Sur la barre d'onglets du plus petit
// téléphone, avec cinq onglets, chacun a 55 points : « Paiements » en
// demande 48,3 (Inter demi-gras 11 points, mesuré), « Payments » 45,8.
// « Transactions » (60) et « Mouvements » (60) n'y tenaient pas.
// Dans le code, la règle garde son nom de « flux » (`@noyau/flux`).

import type { TypeFlux } from "../flux";

const en = {
  // En anglais, le mot de Revolut, que le propriétaire a montré : 46 points.
  onglet: "Payments",
  titre: "Payments",
  sousTitre: "What came in and went out of your cards",
  // Le texte d'exemple tient dans le champ du plus petit téléphone : 230
  // points à 320 (Inter 16 : 193 ici). La référence se cherche aussi.
  rechercher: "Name, number or amount",
  periode: "Period",
  cartes: "Cards",
  toutesLesCartes: "All cards",
  type: "Type",
  tous: "All",
  entrees: "Money in",
  sorties: "Money out",
  frais: "Fees",
  commissions: "Commissions",
  commission: "Commission",
  commissionsAPart: "not counted in the balance",
  variation: "Net change",
  aVerifier: (n: number) => (n === 1 ? "1 to check" : `${n} to check`),
  transactions: (n: number) => (n === 1 ? "1 transaction" : `${n} transactions`),
  soldeAnnonce: (op: string) => `Balance announced by ${op}`,
  annonceA: (op: string, quand: string) => `announced by ${op} ${quand}`,
  toutSeSuit: (h: string) => `Balances add up since ${h}`,
  ecartsCarte: (n: number) => (n === 1 ? "Balances don't add up once" : `Balances don't add up ${n} times`),
  pasDeSolde: "Not enough announced balances to check",
  voir: "See",
  voirMonSolde: "Check balance",
  solde: "Balance",
  sansSolde: "No balance announced",
  calcule: "calculated",
  lesSoldesDisent: (s: "in" | "out") => `Balances say: ${s === "in" ? "money in" : "money out"}`,
  confirmer: "Confirm",
  ecart: (montant: string, de: string, a: string) =>
    `Balances don't add up: ${montant} F less than expected between ${de} and ${a}.`,
  ecartPlus: (montant: string, de: string, a: string) =>
    `Balances don't add up: ${montant} F more than expected between ${de} and ${a}.`,
  queSEstIlPasse: "What happened?",
  // Les formes courtes de la liste : une ligne, pas une phrase.
  ecartCourt: (montant: string, sens: "moins" | "plus", de: string, a: string) =>
    `${montant} F ${sens === "moins" ? "out" : "in"} without SMS · ${de} → ${a}`,
  aConfirmer: "to confirm",
  attention: (ecarts: number, aVerifier: number) => [
    ecarts ? (ecarts === 1 ? "1 balance gap" : `${ecarts} balance gaps`) : "",
    aVerifier ? (aVerifier === 1 ? "1 to check" : `${aVerifier} to check`) : "",
  ].filter(Boolean).join(" · "),
  soldesVerifies: "Balances checked",
  annonceCourt: (h: string) => `announced ${h}`,
  aucuneTransaction: "No transactions for this period.",
  aucunResultat: "No payment matches.",
  aucunPaiement: "No payments yet. Every deposit, withdrawal and transfer on your cards will appear here.",
  // Les filtres, comme ceux des SMS (`filtres.tsx`), et le tri.
  filtreDateTitre: "Show the payments of…",
  tri: "Sort",
  triAria: "Sort the payments",
  triTitre: "Sort by…",
  tris: {
    recentes: "Most recent first", anciennes: "Oldest first",
    montant_haut: "Largest amounts first", montant_bas: "Smallest amounts first",
  },
  trisCourts: {
    recentes: "Most recent", anciennes: "Oldest", montant_haut: "Largest", montant_bas: "Smallest",
  },
  periodeImpossible: "The payments of this period could not be loaded. Check the connection, then try again.",
  periodeTronquee: "Only the latest 1,000 SMS of this period came back: its first days are missing. Pick fewer days.",
  familles: {
    entrees: "Money in", sorties: "Money out", depots: "Deposits", retraits: "Withdrawals",
    transferts: "Transfers", a_verifier: "To check", echouees: "Failed",
  },
  // La fiche
  reussie: "Successful",
  aVerifierEtat: "To check",
  echouee: "Failed",
  de: "From",
  a: "To",
  // Le sens attend une décision : ni « de » ni « à », qui le devineraient.
  avec: "With",
  reference: "Reference",
  carte: "Card",
  date: "Date",
  heureOperateur: (op: string) => `time written by ${op}`,
  montant: "Amount",
  commissionNonComptee: "not counted in your balance",
  soldeApresAnnonce: (op: string) => `Balance after, announced by ${op}`,
  soldeAvant: "Balance before",
  ceQueDitLeSms: "What the SMS says",
  smsDOrigine: "Original SMS",
  recuPdf: "PDF receipt",
  partager: "Share",
  corriger: "Correct",
  toutesAvecCeNumero: "All with this number",
  chercher: "Search",
  voirLeSms: "View the SMS",
  copier: "Copy",
  retour: "Back",
  // Corriger
  corrigerTitre: "Correct this transaction",
  entreeOuSortie: "Money in or out?",
  entree: "Money in",
  sortie: "Money out",
  cEstQuoi: "What is it?",
  ajouterUneNote: "Add a note",
  noteVisible: "Your associate will see it.",
  plus: "More",
  plusPourVous: "For you only: “Don't count” (with a reason) · “The right amount is…”",
  enregistrer: "Save",
  signeParVous: "signed by you",
  smsIntact: "The original SMS never changes. Your correction is saved under your name, with the date, and can be undone.",
  bientot: "Coming soon: corrections are not saved yet.",
};

const fr: typeof en = {
  onglet: "Paiements",
  titre: "Paiements",
  sousTitre: "Ce qui est entré et sorti de vos cartes",
  rechercher: "Nom, numéro ou montant",
  periode: "Période",
  cartes: "Cartes",
  toutesLesCartes: "Toutes les cartes",
  type: "Type",
  tous: "Tous",
  entrees: "Entrées",
  sorties: "Sorties",
  frais: "Frais",
  commissions: "Commissions",
  commission: "Commission",
  commissionsAPart: "non comptées dans le solde",
  variation: "Variation",
  aVerifier: (n) => (n === 1 ? "1 à vérifier" : `${n} à vérifier`),
  transactions: (n) => (n === 1 ? "1 transaction" : `${n} transactions`),
  soldeAnnonce: (op) => `Solde annoncé par ${op}`,
  annonceA: (op, quand) => `annoncé par ${op} ${quand}`,
  toutSeSuit: (h) => `Les soldes se suivent depuis ${h}`,
  ecartsCarte: (n) => (n === 1 ? "Les soldes ne se suivent pas une fois" : `Les soldes ne se suivent pas ${n} fois`),
  pasDeSolde: "Pas assez de soldes annoncés pour vérifier",
  voir: "Voir",
  voirMonSolde: "Voir mon solde",
  solde: "Solde",
  sansSolde: "Sans solde annoncé",
  calcule: "calculé",
  lesSoldesDisent: (s) => `Les soldes disent : ${s === "in" ? "entrée" : "sortie"}`,
  confirmer: "Confirmer",
  ecart: (montant, de, a) => `Les soldes ne se suivent pas : ${montant} F de moins que prévu entre ${de} et ${a}.`,
  ecartPlus: (montant, de, a) => `Les soldes ne se suivent pas : ${montant} F de plus que prévu entre ${de} et ${a}.`,
  queSEstIlPasse: "Que s'est-il passé ?",
  ecartCourt: (montant, sens, de, a) => `${montant} F ${sens === "moins" ? "sortis" : "entrés"} sans SMS · ${de} → ${a}`,
  aConfirmer: "à confirmer",
  attention: (ecarts, aVerifier) => [
    ecarts ? (ecarts === 1 ? "1 écart de solde" : `${ecarts} écarts de solde`) : "",
    aVerifier ? (aVerifier === 1 ? "1 à vérifier" : `${aVerifier} à vérifier`) : "",
  ].filter(Boolean).join(" · "),
  soldesVerifies: "Soldes vérifiés",
  annonceCourt: (h) => `annoncé à ${h}`,
  aucuneTransaction: "Aucune transaction sur cette période.",
  aucunResultat: "Aucun paiement ne correspond.",
  aucunPaiement: "Aucun paiement pour l'instant. Chaque dépôt, retrait et transfert de vos cartes apparaîtra ici.",
  filtreDateTitre: "Voir les paiements de…",
  tri: "Trier",
  triAria: "Trier les paiements",
  triTitre: "Ranger par…",
  tris: {
    recentes: "Les plus récents d'abord", anciennes: "Les plus anciens d'abord",
    montant_haut: "Les plus gros montants d'abord", montant_bas: "Les plus petits montants d'abord",
  },
  trisCourts: {
    recentes: "Récents", anciennes: "Anciens", montant_haut: "Plus gros", montant_bas: "Plus petits",
  },
  periodeImpossible: "Les paiements de cette période n'ont pas pu être chargés. Vérifiez la connexion, puis réessayez.",
  periodeTronquee: "Seuls les 1 000 derniers SMS de cette période sont revenus : ses premiers jours manquent. Choisissez moins de jours.",
  familles: {
    entrees: "Entrées", sorties: "Sorties", depots: "Dépôts", retraits: "Retraits",
    transferts: "Transferts", a_verifier: "À vérifier", echouees: "Échouées",
  },
  reussie: "Réussie",
  aVerifierEtat: "À vérifier",
  echouee: "Échouée",
  de: "De",
  a: "À",
  avec: "Avec",
  reference: "Référence",
  carte: "Carte",
  date: "Date",
  heureOperateur: (op) => `heure écrite par ${op}`,
  montant: "Montant",
  commissionNonComptee: "non comptée dans votre solde",
  soldeApresAnnonce: (op) => `Solde après, annoncé par ${op}`,
  soldeAvant: "Solde avant",
  ceQueDitLeSms: "Ce que dit le SMS",
  smsDOrigine: "Le SMS d'origine",
  recuPdf: "Reçu PDF",
  partager: "Partager",
  corriger: "Corriger",
  toutesAvecCeNumero: "Toutes avec ce numéro",
  chercher: "Rechercher",
  voirLeSms: "Voir le SMS",
  copier: "Copier",
  retour: "Retour",
  corrigerTitre: "Corriger cette transaction",
  entreeOuSortie: "Entrée ou sortie ?",
  entree: "Entrée",
  sortie: "Sortie",
  cEstQuoi: "C'est quoi ?",
  ajouterUneNote: "Ajouter une note",
  noteVisible: "Votre associé la verra.",
  plus: "Plus",
  plusPourVous: "Pour vous seul : « Ne pas compter » (avec un motif) · « Le bon montant est… »",
  enregistrer: "Enregistrer",
  signeParVous: "signé par vous",
  smsIntact: "Le SMS d'origine ne change jamais. Votre correction est notée à votre nom, avec la date, et s'annule en un geste.",
  bientot: "Bientôt : les corrections ne sont pas encore enregistrées.",
};

export const textesFlux = { en, fr };

/** Le nom d'un type, du point de vue de la carte. */
export const NOMS_TYPES: Record<"fr" | "en", Record<TypeFlux, string>> = {
  fr: {
    depot_client: "Dépôt client", retrait_client: "Retrait client",
    depot_recu: "Dépôt sur ma carte", retrait_especes: "Retrait d'espèces",
    argent_recu: "Argent reçu", argent_envoye: "Argent envoyé",
    // Le sens inconnu se dit par l'étiquette « À vérifier » et le « ? » du
    // montant : le nom reste court, une liste ne coupe pas ce qu'on cherche.
    depot_inconnu: "Dépôt", retrait_inconnu: "Retrait",
    transfert_inconnu: "Transfert", illisible: "Montant non lu",
  },
  en: {
    depot_client: "Customer deposit", retrait_client: "Customer withdrawal",
    depot_recu: "Cash deposit received", retrait_especes: "Cash withdrawal",
    argent_recu: "Money received", argent_envoye: "Money sent",
    depot_inconnu: "Deposit", retrait_inconnu: "Withdrawal",
    transfert_inconnu: "Transfer", illisible: "Amount not read",
  },
};

/** Les types qu'on ne lit pas encore dans un SMS : ils se choisissent à la
 *  main (« C'est quoi ? »), en attendant de vrais SMS de ces sortes. */
export const NOMS_CORRECTION = {
  fr: { paiement_recu: "Paiement reçu", paiement_effectue: "Paiement effectué",
        achat_float: "Achat de float", vente_float: "Vente de float" },
  en: { paiement_recu: "Payment received", paiement_effectue: "Payment made",
        achat_float: "Float purchase", vente_float: "Float sale" },
} as const;
