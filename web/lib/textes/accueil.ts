// Les textes de l'accueil — la page d'ensemble et le guichet.
// L'anglais d'abord, écrit pour lui-même ; le français en regard.

const en = {
  // L'en-tête et le terminal
  // Le nom vient de la personne qui vient d'entrer, jamais d'ici. Il y a été
  // écrit en dur pendant des mois, et c'était sans conséquence tant que TOTEM
  // ne savait pas qui appuyait ; maintenant qu'il le sait, un nom figé dans le
  // code saluerait l'opératrice par le nom de la propriétaire.
  bonjour: (nom: string) => `Hello, ${nom}`,
  titre: "Overview",
  reglages: "Settings",
  terminal: "Terminal",
  enLigne: "Online",
  muet: "Silent",
  emplacement: "Location",
  version: "Version",
  sante: "Device health",
  aucunTerminal: "No terminal has checked in yet.",

  // La carte et son solde
  aucuneCarte: "No card in the terminal",
  aucuneCarteDetail:
    "As soon as the terminal sees a SIM, its balance and the counter will appear here.",
  actualiserAria: "Refresh the balance: ask the network",
  interrogerReseau: "Ask the network",
  aucunSoldeConnu: "No balance yet: press the arrow to ask the network.",
  soldeMaj: (h: string) => `From the network query at ${h}`,
  soldeSansHeure: "Last known balance.",
  carteAnonyme: (fin: string) => `card ${fin}`,

  // Les gestes du guichet
  depot: "Deposit",
  depotTitre: "Deposit money",
  retrait: "Withdrawal",
  retraitTitre: "Withdraw money",
  transfert: "Transfer",
  transfertTitre: "Transfer money",
  solde: "Balance",
  consulterSolde: "Check the balance",
  monNumero: "My number",
  numeroACrediter: "Number to credit",
  numeroAgent: "Agent's number",
  numeroBeneficiaire: "Recipient's number",
  montantFcfa: "Amount (FCFA)",
  aucunCode: (op: string) => `No ${op} codes recorded yet: add them in`,
  aucunCodeLien: "Settings",

  // Les derniers SMS
  derniersSms: "Latest SMS",
  toutVoir: "See all",
  aucunSms:
    "No SMS so far. If the card should be receiving some, check the " +
    "terminal — a long silence is not normal.",
};

const fr: typeof en = {
  bonjour: (nom: string) => `Bonjour, ${nom}`,
  titre: "Vue d’ensemble",
  reglages: "Réglages",
  terminal: "Terminal",
  enLigne: "En ligne",
  muet: "Muet",
  emplacement: "Emplacement",
  version: "Version",
  sante: "Santé du boîtier",
  aucunTerminal: "Aucun terminal ne s’est encore annoncé.",

  aucuneCarte: "Aucune carte dans le terminal",
  aucuneCarteDetail:
    "Dès qu’une SIM sera vue par le terminal, son solde et le guichet apparaîtront ici.",
  actualiserAria: "Actualiser le solde : interroger le réseau",
  interrogerReseau: "Interroger le réseau",
  aucunSoldeConnu: "Aucun solde connu : appuyez sur la flèche pour interroger le réseau.",
  soldeMaj: (h) => `D’après l’interrogation de ${h}`,
  soldeSansHeure: "Dernier solde connu.",
  carteAnonyme: (fin) => `carte ${fin}`,

  depot: "Dépôt",
  depotTitre: "Dépôt d’argent",
  retrait: "Retrait",
  retraitTitre: "Retrait d’argent",
  transfert: "Transfert",
  transfertTitre: "Transfert d’argent",
  solde: "Solde",
  consulterSolde: "Consulter le solde",
  monNumero: "Mon numéro",
  numeroACrediter: "Numéro à créditer",
  numeroAgent: "Numéro de l’agent",
  numeroBeneficiaire: "Numéro du bénéficiaire",
  montantFcfa: "Montant (FCFA)",
  aucunCode: (op) => `Aucun code ${op} relevé sur le terrain : ajoutez-les dans les`,
  aucunCodeLien: "Réglages",

  derniersSms: "Derniers SMS",
  toutVoir: "Tout voir",
  aucunSms:
    "Aucun SMS reçu pour l’instant. Si la carte devrait en recevoir, " +
    "vérifiez le terminal — un silence prolongé n’est pas normal.",
};

export const textesAccueil = { en, fr } as const;
