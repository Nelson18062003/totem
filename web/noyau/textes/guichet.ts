// Les textes du guichet : la page Opérations, le pop-up d'une opération et le
// pavé du code secret. L'anglais d'abord, écrit pour lui-même ; le français
// reste la langue d'origine. Ce qui vient de l'opérateur (réponses USSD,
// codes #148#…) ne passe JAMAIS par ici : il s'affiche mot pour mot.

const en = {
  // --- La page Opérations (serveur) ------------------------------------------
  titre: "Operations",
  sansCode: "No USSD codes to dial.",
  aucuneCarte: "No card in the terminal",
  aucuneCarteDetail:
    "Operations will open as soon as a SIM is in place — the card is what holds the counter.",

  // --- Le guichet -------------------------------------------------------------
  depot: "Deposit",
  depotSous: "Top up a Mobile Money account",
  depotTitre: "Money deposit",
  retrait: "Withdrawal",
  retraitSous: "At an agent",
  retraitTitre: "Money withdrawal",
  transfert: "Transfer",
  transfertSous: "Send to a number",
  transfertTitre: "Money transfer",
  numeroACrediter: "Number to top up",
  numeroAgent: "Agent's number",
  numeroBeneficiaire: "Recipient's number",
  montantFcfa: "Amount (FCFA)",
  exempleVingtMille: "20,000",
  exempleCinquanteMille: "50,000",
  consulterSolde: "Check the balance",
  monNumero: "My number",
  consultation: "Enquiries",
  smsRecus: "Incoming SMS",
  analyse: "Analysis",
  codeUssd: "USSD code",
  aucunCodeReleve: (op: string) =>
    `No ${op} codes have been collected in the field yet — a digit that moves ` +
    "money is not something to guess. Add them in Settings.",
  carteVisee: "Card the operations run on",

  // --- Le pop-up d'une opération ----------------------------------------------
  preparation: "Getting ready",
  sessionEnCours: "Session in progress",
  session: "Session",
  fermer: "Close",
  noteSaisie:
    "The session opens on the card itself. The platform answers the " +
    "menu's questions with these details; the secret code then goes in on " +
    "its own keypad.",
  annuler: "Cancel",
  lancer: "Start",
  terminalCompose: "the terminal is dialling…",
  reponseVide: "(empty reply)",
  echec: "Failed.",
  demandePasPartie: "the request could not be sent",
  terminalMuet: "the terminal did not answer — is it switched on, and up to date?",
  accroc: "small hitch — please try again",
  trouSansReponse: (noms: string) =>
    `This code carries ${noms}, and the form gives no value for it. ` +
    "Nothing has been dialled: fix the code in Settings.",
  votreReponse: "Your reply",
  envoyer: "Send",
  confirmationSms:
    "The operator's confirmation will arrive with the incoming SMS, along " +
    "with its receipt when there is one.",
  termine: "Done",
  annulerSession: "Cancel the session",
  raccrocherQuestion: "Hang up the session?",
  raccrocherCourt: "Hang up",
  garderSession: "Keep it open",
  jeterQuestion: "Discard what you typed?",
  jeter: "Discard",
  continuerSaisie: "Keep editing",

  // --- Le pavé du code secret ---------------------------------------------------
  paveTitre: "Mobile Money secret code",
  chiffresComposes: (n: number) => (n === 1 ? "1 digit entered" : `${n} digits entered`),
  effacer: "Erase",
  effacerDernier: "Erase the last digit",
  valider: "Confirm",
};

const fr: typeof en = {
  titre: "Opérations",
  sansCode: "Sans composer de code USSD.",
  aucuneCarte: "Aucune carte dans le terminal",
  aucuneCarteDetail:
    "Les opérations s'ouvriront dès qu'une SIM sera en place : c'est elle qui porte le guichet.",

  depot: "Dépôt",
  depotSous: "Créditer un compte Mobile Money",
  depotTitre: "Dépôt d’argent",
  retrait: "Retrait",
  retraitSous: "Chez un agent",
  retraitTitre: "Retrait d’argent",
  transfert: "Transfert",
  transfertSous: "Envoyer vers un numéro",
  transfertTitre: "Transfert d’argent",
  numeroACrediter: "Numéro à créditer",
  numeroAgent: "Numéro de l’agent",
  numeroBeneficiaire: "Numéro du bénéficiaire",
  montantFcfa: "Montant (FCFA)",
  exempleVingtMille: "20 000",
  exempleCinquanteMille: "50 000",
  consulterSolde: "Consulter le solde",
  monNumero: "Mon numéro",
  consultation: "Consultation",
  smsRecus: "SMS reçus",
  analyse: "Analyse",
  codeUssd: "Code USSD",
  aucunCodeReleve: (op) =>
    `Aucun code ${op} n’a encore été relevé sur le terrain — on ne devine ` +
    "pas un chiffre qui déplace de l’argent. Ajoutez-les dans les Réglages.",
  carteVisee: "Carte des opérations",

  preparation: "Préparation",
  sessionEnCours: "Session en cours",
  session: "Session",
  fermer: "Fermer",
  noteSaisie:
    "La session s’ouvre sur la carte elle-même. La plateforme répond aux " +
    "questions du menu avec ces informations ; le code secret se compose " +
    "ensuite sur son pavé.",
  annuler: "Annuler",
  lancer: "Lancer",
  terminalCompose: "le terminal compose…",
  reponseVide: "(réponse vide)",
  echec: "Échec.",
  demandePasPartie: "la demande n’a pas pu partir",
  terminalMuet: "le terminal n’a pas répondu — est-il allumé, et à jour ?",
  accroc: "petit accroc — réessayez",
  trouSansReponse: (noms) =>
    `Ce code porte ${noms}, et le formulaire ne donne rien pour ` +
    "le remplir. Rien n'a été composé : corrigez le code aux Réglages.",
  votreReponse: "Votre réponse",
  envoyer: "Envoyer",
  confirmationSms:
    "La confirmation de l’opérateur arrivera dans les SMS reçus, avec son " +
    "reçu quand il y a lieu.",
  termine: "Terminé",
  annulerSession: "Annuler la session",
  raccrocherQuestion: "Raccrocher la session ?",
  raccrocherCourt: "Raccrocher",
  garderSession: "La garder ouverte",
  jeterQuestion: "Jeter la saisie ?",
  jeter: "Jeter",
  continuerSaisie: "Continuer la saisie",

  paveTitre: "Code secret Mobile Money",
  chiffresComposes: (n) => (n > 1 ? `${n} chiffres composés` : `${n} chiffre composé`),
  effacer: "Effacer",
  effacerDernier: "Effacer le dernier chiffre",
  valider: "Valider",
};

export const textesGuichet = { en, fr } as const;
