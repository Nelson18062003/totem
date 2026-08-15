// Les textes de la boîte de réception SMS et de la fiche d'un SMS.
// L'anglais d'abord, écrit pour lui-même. Ce qui vient de l'opérateur —
// le texte du SMS, l'expéditeur, la référence — ne se traduit JAMAIS.

import type { Categorie } from "../types";

const en = {
  // La boîte de réception
  titre: "Messages received",
  enCoursDeTransmission: (n: number) =>
    n === 1
      ? "The terminal has 1 message still on its way — this list may not be complete yet. It updates by itself."
      : `The terminal has ${n} messages still on their way — this list may not be complete yet. It updates by itself.`,
  recherchePlaceholder: "Name, number, amount, message text",
  effacerRecherche: "Clear the search",
  tousLesOperateurs: "All",
  toutesLesCategories: "All",
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

  // La fiche d'un SMS
  smsRecu: "Message received",
  paiementRecu: "Payment received",
  paiementEnvoye: "Payment sent",
  sensAConfirmer: "Money moved — direction to be confirmed",
  numero: "Number",
  dateEtHeure: (date: string, heure: string) => `${date} at ${heure}`,
  reference: "Reference",
  soldeApres: "Balance after",
  natureTitre: "Type — for the receipt",
  natureAide: "Choosing a type shows it that way everywhere and issues its receipt.",
  fermerFiche: "Close",
  rechercheEnCours: "Searching the whole history…",
  rechercheHistorique: (n: number) =>
    n === 1 ? "1 result across the whole history" : `${n} results across the whole history`,
  repetitions: (n: number) => `Received ${n} times in a row — tap to unfold`,
  afficherPlus: (n: number) =>
    n === 1 ? "Show 1 more message" : `Show more (${n} remaining)`,
  voirDetails: "Details",
  copierSms: "Copy the message",
  recuPdf: "PDF receipt",
  telechargerPdf: "Download the PDF",
  regenererPdf: "Rebuild the PDF",
  regenerationEnCours:
    "The terminal is rebuilding the document with today's reading — about "
    + "twenty seconds, then open the PDF again.",
  regenerationFaite: "Document rebuilt — open the PDF: it is the new one.",
  regenerationLente:
    "The terminal is taking longer than expected. The PDF will be replaced "
    + "as soon as it finishes — try opening it again in a minute.",
  regenerationEnRoute:
    "The rebuild is on its way — open the PDF again in about a minute to "
    + "see the new document.",
  demandeAuTerminal: "Asking the terminal…",
  etablirRecu: "Issue the receipt",
  terminalMuet: "The terminal did not answer — is it switched on, and up to date?",

  // Les libellés d'affichage des catégories. Les clés ("encaissement",
  // "depot"…) sont des données : elles ne se traduisent pas.
  cat: {
    encaissement: "Money in",
    envoi: "Money out",
    transfert: "Transfer",
    depot: "Deposit",
    retrait: "Withdrawal",
    solde: "Balance",
    code: "One-time code",
    publicite: "Advert",
    message: "Message",
    inconnu: "Unclear",
  } satisfies Record<Categorie, string>,
};

const fr: typeof en = {
  titre: "SMS reçus",
  enCoursDeTransmission: (n) =>
    n === 1
      ? "Le terminal a 1 message en cours de transmission — cette liste n’est peut-être pas encore complète. Elle se met à jour toute seule."
      : `Le terminal a ${n} messages en cours de transmission — cette liste n’est peut-être pas encore complète. Elle se met à jour toute seule.`,
  recherchePlaceholder: "Nom, numéro, montant, texte du SMS",
  effacerRecherche: "Effacer la recherche",
  tousLesOperateurs: "Tous",
  toutesLesCategories: "Toutes",
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

  smsRecu: "SMS reçu",
  paiementRecu: "Paiement reçu",
  paiementEnvoye: "Paiement envoyé",
  sensAConfirmer: "Mouvement — sens à confirmer",
  numero: "Numéro",
  dateEtHeure: (date, heure) => `${date} à ${heure}`,
  reference: "Référence",
  soldeApres: "Solde après",
  natureTitre: "Nature — pour le reçu",
  natureAide: "Choisir une nature l’affiche ainsi partout et établit son reçu.",
  fermerFiche: "Fermer",
  rechercheEnCours: "Recherche sur tout l’historique…",
  rechercheHistorique: (n) =>
    n === 1 ? "1 résultat sur tout l’historique" : `${n} résultats sur tout l’historique`,
  repetitions: (n) => `Reçu ${n} fois d’affilée — toucher pour déplier`,
  afficherPlus: (n) =>
    n === 1 ? "Afficher 1 message de plus" : `Afficher plus (${n} restants)`,
  voirDetails: "Détails",
  copierSms: "Copier le SMS",
  recuPdf: "Reçu PDF",
  telechargerPdf: "Télécharger le PDF",
  regenererPdf: "Régénérer le PDF",
  regenerationEnCours:
    "Le terminal refait le document avec la lecture du jour — une vingtaine "
    + "de secondes, puis rouvrez le PDF.",
  regenerationFaite: "Document refait — ouvrez le PDF : c'est le nouveau.",
  regenerationLente:
    "Le terminal prend plus de temps que prévu. Le PDF sera remplacé dès "
    + "qu'il aura fini — réessayez de l'ouvrir dans une minute.",
  regenerationEnRoute:
    "La refabrication est en route — rouvrez le PDF dans une minute environ "
    + "pour voir le nouveau document.",
  demandeAuTerminal: "Demande au terminal…",
  etablirRecu: "Établir le reçu",
  terminalMuet: "Le terminal n’a pas répondu — est-il allumé, et à jour ?",

  cat: {
    encaissement: "Encaissement",
    envoi: "Envoi",
    transfert: "Transfert",
    depot: "Dépôt",
    retrait: "Retrait",
    solde: "Solde",
    code: "Code",
    publicite: "Pub",
    message: "Message",
    inconnu: "SMS",
  },
};

export const textesSms = { en, fr } as const;
