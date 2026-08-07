// Les textes du guichet : la page Opérations, le pop-up d'une opération et le
// pavé du code secret. L'anglais d'abord, écrit pour lui-même ; le français
// reste la langue d'origine. Ce qui vient de l'opérateur (réponses USSD,
// codes #148#…) ne passe JAMAIS par ici : il s'affiche mot pour mot.

const en = {
  // --- La page Opérations (serveur) ------------------------------------------
  titre: "Operations",
  sansCode: "No USSD codes to dial.",
  aucuneCarte: "No SIM in the terminal",
  aucuneCarteDetail:
    "Slide a SIM into the terminal: it is the SIM that holds the counter, and operations open by themselves once it is in place.",

  // --- Le guichet -------------------------------------------------------------
  sousTitre: (op: string) => `The real ${op} counter, right here on the platform.`,
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
  codeUssd: "USSD code",
  aucunCodeReleve: (op: string) =>
    `No ${op} codes have been collected in the field yet — a digit that moves ` +
    "money is not something to guess. Add them in Settings.",
  basDePage:
    "Every action opens an exchange on the real SIM, in Douala. The network " +
    "asks its questions, the platform answers with your details, and the " +
    "secret code is entered on its own keypad — never stored anywhere.",

  // --- Le pop-up d'une opération ----------------------------------------------
  preparation: "Getting ready",
  sessionEnCours: "Exchange in progress",
  session: "Exchange",
  fermer: "Close",
  noteSaisie:
    "The exchange opens on the SIM, in Douala. The platform answers the " +
    "menu's questions with these details; the secret code then goes in on " +
    "its own keypad.",
  annuler: "Cancel",
  lancer: "Start",
  terminalCompose: "the terminal is dialling…",
  reponseVide: "(empty reply)",
  echec: "Failed.",
  demandePasPartie: "the request could not be sent — try again",
  terminalMuet: "the terminal did not answer — is it switched on, and up to date?",
  accroc: "small hitch — please try again",
  votreReponse: "Your reply",
  envoyer: "Send",
  confirmationSms:
    "The operator's confirmation will arrive with the incoming SMS, along " +
    "with its receipt when there is one.",
  termine: "Done",
  annulerSession: "Hang up",

  // --- Le pavé du code secret ---------------------------------------------------
  paveTitre: "Mobile Money secret code",
  chiffresComposes: (n: number) => (n === 1 ? "1 digit entered" : `${n} digits entered`),
  effacer: "Erase",
  effacerDernier: "Erase the last digit",
  valider: "Confirm",
  paveNote:
    "The code goes to the terminal, which dials it on the SIM, then it " +
    "vanishes. It is stored nowhere — the log only ever keeps “••••”.",
};

const fr: typeof en = {
  titre: "Opérations",
  sansCode: "Sans composer de code USSD.",
  aucuneCarte: "Aucune puce dans le terminal",
  aucuneCarteDetail:
    "Glissez une puce dans le terminal : c’est elle qui porte le guichet, et les opérations s’ouvriront d’elles-mêmes dès qu’elle sera en place.",

  sousTitre: (op) => `Le vrai guichet ${op}, ouvert depuis la plateforme.`,
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
  codeUssd: "Code USSD",
  aucunCodeReleve: (op) =>
    `Aucun code ${op} n’a encore été relevé sur le terrain — on ne devine ` +
    "pas un chiffre qui déplace de l’argent. Ajoutez-les dans les Réglages.",
  basDePage:
    "Chaque geste ouvre l’échange sur la vraie puce, à Douala. Le réseau " +
    "pose ses questions, la plateforme y répond avec vos informations, et le " +
    "code secret se compose sur son pavé — jamais enregistré nulle part.",

  preparation: "Préparation",
  sessionEnCours: "Échange en cours",
  session: "Échange",
  fermer: "Fermer",
  noteSaisie:
    "L’échange s’ouvre sur la puce, à Douala. La plateforme répond aux " +
    "questions du menu avec ces informations ; le code secret se compose " +
    "ensuite sur son pavé.",
  annuler: "Annuler",
  lancer: "Lancer",
  terminalCompose: "le terminal compose…",
  reponseVide: "(réponse vide)",
  echec: "Échec.",
  demandePasPartie: "la demande n’a pas pu partir — réessayez",
  terminalMuet: "le terminal n’a pas répondu — est-il allumé, et à jour ?",
  accroc: "petit accroc — réessayez",
  votreReponse: "Votre réponse",
  envoyer: "Envoyer",
  confirmationSms:
    "La confirmation de l’opérateur arrivera dans les SMS reçus, avec son " +
    "reçu quand il y a lieu.",
  termine: "Terminé",
  annulerSession: "Raccrocher",

  paveTitre: "Code secret Mobile Money",
  chiffresComposes: (n) => (n > 1 ? `${n} chiffres composés` : `${n} chiffre composé`),
  effacer: "Effacer",
  effacerDernier: "Effacer le dernier chiffre",
  valider: "Valider",
  paveNote:
    "Le code part au terminal qui le compose sur la puce, puis disparaît. " +
    "Nulle part il n’est enregistré — le journal n’en garde que « •••• ».",
};

export const textesGuichet = { en, fr } as const;
