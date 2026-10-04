// Les textes de la boîte de réception SMS et de la fiche d'un SMS.
// L'anglais d'abord, écrit pour lui-même. Ce qui vient de l'opérateur —
// le texte du SMS, l'expéditeur, la référence — ne se traduit JAMAIS.

import type { Categorie } from "../types";

const en = {
  // La boîte de réception
  titre: "Messages received",
  enCoursDeTransmission: (n: number) =>
    n === 1
      ? "The terminal has 1 message still on its way — this list may not be complete yet. Pull down to see how far it has got."
      : `The terminal has ${n} messages still on their way — this list may not be complete yet. Pull down to see how far it has got.`,
  recherchePlaceholder: "Name, number, amount, message text",
  effacerRecherche: "Clear the search",
  tousLesOperateurs: "All",
  toutesLesCategories: "All",
  // LE FILTRE PAR DATE. Les jours sont ceux de la caisse (voir
  // `noyau/periodes.ts`) : « aujourd'hui » est le même jour qu'en tête de
  // liste et dans le bilan.
  periodeTout: "All dates",
  periodeAujourdhui: "Today",
  periodeHier: "Yesterday",
  periodeSemaine: "Last 7 days",
  periodeMois: "This month",
  periodeChoisir: "Pick dates",
  calendrierTitre: "Show the SMS of…",
  calendrierAide: "Tap a day. Tap a second day to show a whole period.",
  calendrierVoir: "Show these SMS",
  fermer: "Close",
  // LES FILTRES, EN UNE RANGÉE. Trois rangées de pastilles qui défilaient
  // de côté — cartes, dates, natures — faisaient un écran touffu, sans
  // ordre : le propriétaire l'a jugé illisible. Trois boutons, chacun dit
  // ce qu'il filtre et ce qui est choisi ; le choix se fait dans une liste.
  filtreDate: "Date",
  filtreCarte: "SIM",
  filtreType: "Type",
  filtreDateTitre: "Show the SMS of…",
  filtreCarteTitre: "Show the SMS of which SIM?",
  filtreTypeTitre: "Show which kind of SMS?",
  filtreDateAria: "Filter by date",
  filtreCarteAria: "Filter by SIM",
  filtreTypeAria: "Filter by kind",
  effacerFiltres: "Clear",
  periodeImpossible: "The SMS of this period could not be loaded. Check the connection, then try again.",
  moisPrecedent: "Previous month",
  moisSuivant: "Next month",
  // Ce qu'une période a fait entrer et sortir : la question qu'on se pose
  // en filtrant — « combien j'ai encaissé hier ? ».
  totalRecu: "Received",
  totalEnvoye: "Sent",
  totalNombre: (n: number) => (n === 1 ? "1 SMS" : `${n} SMS`),
  periodeTronquee:
    "Only the 1,000 most recent SMS of this period are shown. Pick fewer days to see the rest.",
  aucunResultatTitre: "No message matches",
  aucunResultatDetail: "Try another word or amount, or remove a filter.",
  toutAfficher: "Show everything",
  aucunSmsTitre: "No messages yet",
  aucunSmsDetail:
    "Every message a card receives will appear here. If a card should be " +
    "getting messages and nothing arrives, check the terminal: a long " +
    "silence is not normal.",
  nonLu: "unread",
  telechargerRecu: "Download the PDF receipt",
  ouvrirRecu: "Open the receipt (PDF)",
  refaireRecu: "Rebuild the receipt",
  ouvertureRecu: "Opening…",
  partagerRecu: "Share the receipt",
  preparationRecu: "Preparing the PDF…",
  // Le reçu d'un SMS tout juste arrivé : le boîtier le dépose tout seul,
  // dans les secondes qui suivent. On l'ATTEND — on ne propose pas de
  // l'établir (voir `recuAttendu`).
  recuEnPreparation: "Receipt on its way…",
  // « Refaire » sans rien changer : le document en place EST le bon.
  recuDejaAJour: "This receipt is already up to date ✓",
  lienRecuImpossible: "The receipt could not be prepared. Check the connection, then try again.",
  toutesLesCartes: "All SIMs",
  soldesRepetes: (n: number) =>
    n === 1 ? "1 earlier balance check" : `${n} earlier balance checks`,
  replierSoldes: "Hide them",

  // La fiche d'un SMS
  smsRecu: "Message received",
  paiementRecu: "Payment received",
  paiementEnvoye: "Payment sent",
  sensAConfirmer: "Money moved — direction to be confirmed",
  categorie: "Category",
  operateur: "Card",
  numero: "Number",
  date: "Date",
  dateEtHeure: (date: string, heure: string) => `${date} at ${heure}`,
  reference: "Reference",
  soldeApres: "Balance after",
  natureTitre: "Type — for the receipt",
  natureAide: "Choosing a type shows it that way everywhere and issues its receipt.",
  messageRecu: "Original message",
  copierSms: "Copy the message",
  recuPdf: "PDF receipt",
  telechargerPdf: "Download the PDF",
  regenererPdf: "Rebuild the PDF",
  regenerationEnCours:
    "The terminal is rebuilding the document with today's reading — about "
    + "twenty seconds, then open the PDF again.",
  regenerationFaite: "Receipt rebuilt ✓",
  // Le reçu vient d'être fabriqué. La fiche ouverte porte encore
  // l'ancienne version du paiement : on le DIT, plutôt que de laisser le
  // bouton reprendre son libellé d'avant comme si rien ne s'était passé.
  recuEtabli: "Receipt ready ✓",
  regenerationLente:
    "The terminal is taking longer than expected. The PDF will be replaced "
    + "as soon as it finishes — try opening it again in a minute.",
  regenerationEnRoute:
    "The rebuild is on its way — open the PDF again in about a minute to "
    + "see the new document.",
  demandeAuTerminal: "Asking the terminal…",
  etablirRecu: "Issue the receipt",
  terminalMuet: "The terminal did not answer — is it switched on, and up to date?",
  fermerFiche: "Close",
  toutLeMessage: "Show the whole message",
  replierMessage: "Collapse the message",
  typeTitre: "Type",
  modifierType: "Change",
  classerMessage: "Classify this message — for its receipt",

  // Les libellés d'affichage des catégories. Les clés ("encaissement",
  // "depot"…) sont des données : elles ne se traduisent pas.
  cat: {
    encaissement: "Money in",
    envoi: "Money out",
    transfert: "Transfer",
    depot: "Deposit",
    retrait: "Withdrawal",
    solde: "Balance",
    echec: "Failed operation",
    code: "One-time code",
    publicite: "Advert",
    illisible: "Unreadable",
    message: "Message",
    inconnu: "Unclear",
  } satisfies Record<Categorie, string>,
};

const fr: typeof en = {
  titre: "SMS reçus",
  enCoursDeTransmission: (n) =>
    n === 1
      ? "Le terminal a 1 message en cours de transmission — cette liste n’est peut-être pas encore complète. Tirez vers le bas pour voir où elle en est."
      : `Le terminal a ${n} messages en cours de transmission — cette liste n’est peut-être pas encore complète. Tirez vers le bas pour voir où elle en est.`,
  recherchePlaceholder: "Nom, numéro, montant, texte du SMS",
  effacerRecherche: "Effacer la recherche",
  tousLesOperateurs: "Tous",
  toutesLesCategories: "Toutes",
  periodeTout: "Toutes les dates",
  periodeAujourdhui: "Aujourd’hui",
  periodeHier: "Hier",
  periodeSemaine: "7 derniers jours",
  periodeMois: "Ce mois-ci",
  periodeChoisir: "Choisir les jours",
  calendrierTitre: "Voir les SMS du…",
  calendrierAide: "Touchez un jour. Touchez un second jour pour voir toute une période.",
  calendrierVoir: "Voir ces SMS",
  fermer: "Fermer",
  filtreDate: "Date",
  filtreCarte: "Carte",
  filtreType: "Type",
  filtreDateTitre: "Voir les SMS de…",
  filtreCarteTitre: "Voir les SMS de quelle carte ?",
  filtreTypeTitre: "Voir quels SMS ?",
  filtreDateAria: "Filtrer par date",
  filtreCarteAria: "Filtrer par carte",
  filtreTypeAria: "Filtrer par type",
  effacerFiltres: "Effacer",
  periodeImpossible: "Les SMS de cette période n’ont pas pu être chargés. Vérifiez la connexion, puis réessayez.",
  moisPrecedent: "Mois précédent",
  moisSuivant: "Mois suivant",
  totalRecu: "Reçu",
  totalEnvoye: "Envoyé",
  totalNombre: (n) => (n === 1 ? "1 SMS" : `${n} SMS`),
  periodeTronquee:
    "Seuls les 1 000 SMS les plus récents de cette période sont affichés. Choisissez moins de jours pour voir les autres.",
  aucunResultatTitre: "Aucun SMS ne correspond",
  aucunResultatDetail: "Essayez un autre mot, un autre montant, ou retirez un filtre.",
  toutAfficher: "Tout afficher",
  aucunSmsTitre: "Aucun SMS pour l’instant",
  aucunSmsDetail:
    "Chaque message reçu par une carte apparaîtra ici. Si la carte devrait " +
    "en recevoir et que rien n’arrive, vérifiez le terminal : un silence " +
    "prolongé n’est pas normal.",
  nonLu: "non lu",
  telechargerRecu: "Télécharger le reçu PDF",
  ouvrirRecu: "Ouvrir le reçu (PDF)",
  refaireRecu: "Refaire le reçu",
  ouvertureRecu: "Ouverture…",
  partagerRecu: "Partager le reçu",
  preparationRecu: "Préparation du PDF…",
  recuEnPreparation: "Reçu en préparation…",
  recuDejaAJour: "Ce reçu est déjà à jour ✓",
  lienRecuImpossible: "Le reçu n’a pas pu être préparé. Vérifiez la connexion, puis réessayez.",
  toutesLesCartes: "Toutes les cartes",
  soldesRepetes: (n) =>
    n === 1 ? "1 consultation de solde plus tôt" : `${n} consultations de solde plus tôt`,
  replierSoldes: "Les replier",

  smsRecu: "SMS reçu",
  paiementRecu: "Paiement reçu",
  paiementEnvoye: "Paiement envoyé",
  sensAConfirmer: "Mouvement — sens à confirmer",
  categorie: "Catégorie",
  operateur: "Carte",
  numero: "Numéro",
  date: "Date",
  dateEtHeure: (date, heure) => `${date} à ${heure}`,
  reference: "Référence",
  soldeApres: "Solde après",
  natureTitre: "Nature — pour le reçu",
  natureAide: "Choisir une nature l’affiche ainsi partout et établit son reçu.",
  messageRecu: "Message reçu",
  copierSms: "Copier le SMS",
  recuPdf: "Reçu PDF",
  telechargerPdf: "Télécharger le PDF",
  regenererPdf: "Régénérer le PDF",
  regenerationEnCours:
    "Le terminal refait le document avec la lecture du jour — une vingtaine "
    + "de secondes, puis rouvrez le PDF.",
  regenerationFaite: "Reçu refait ✓",
  recuEtabli: "Reçu prêt ✓",
  regenerationLente:
    "Le terminal prend plus de temps que prévu. Le PDF sera remplacé dès "
    + "qu'il aura fini — réessayez de l'ouvrir dans une minute.",
  regenerationEnRoute:
    "La refabrication est en route — rouvrez le PDF dans une minute environ "
    + "pour voir le nouveau document.",
  demandeAuTerminal: "Demande au terminal…",
  etablirRecu: "Établir le reçu",
  terminalMuet: "Le terminal n’a pas répondu — est-il allumé, et à jour ?",
  fermerFiche: "Fermer",
  toutLeMessage: "Voir tout le message",
  replierMessage: "Replier le message",
  typeTitre: "Nature",
  modifierType: "Modifier",
  classerMessage: "Classer ce message — pour son reçu",

  cat: {
    encaissement: "Encaissement",
    envoi: "Envoi",
    transfert: "Transfert",
    depot: "Dépôt",
    retrait: "Retrait",
    solde: "Solde",
    echec: "Échec d'opération",
    code: "Code",
    publicite: "Pub",
    illisible: "Illisible",
    message: "Message",
    inconnu: "SMS",
  },
};

export const textesSms = { en, fr } as const;
