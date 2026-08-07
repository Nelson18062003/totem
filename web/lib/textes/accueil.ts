// Les textes de l'accueil — la page d'ensemble et le guichet.
// L'anglais d'abord, écrit pour lui-même ; le français en regard.

const en = {
  // L'en-tête et le terminal
  bonjour: "Hello, Nelson",
  titre: "Overview",
  reglages: "Settings",
  terminal: "Terminal",
  enLigne: "Online",
  muet: "Silent",
  emplacement: "Location",
  // « Device health » nommait le terminal une seconde fois, et d'un autre mot,
  // à l'intérieur d'une carte déjà intitulée « Terminal ». Le mot seul suffit.
  // (La ligne « Version » a été retirée : voir le rendu de ce chantier.)
  sante: "Health",
  aucunTerminal: "No terminal has checked in yet.",

  // La puce et son solde
  aucuneCarte: "No SIM in the terminal",
  aucuneCarteDetail:
    "Slide a SIM into the terminal: its balance and the counter will appear here on their own.",
  actualiserAria: "Refresh the balance: ask the network",
  interrogerReseau: "Ask the network",
  aucunSoldeConnu: "No balance yet: press the arrow to ask the network.",
  soldeMaj: (h: string) => `From the network query at ${h}`,
  soldeSansHeure: "Last known balance.",
  carteAnonyme: (fin: string) => `SIM ${fin}`,

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
    "No SMS so far. If the SIM should be receiving some, check the " +
    "terminal — a long silence is not normal.",
};

const fr: typeof en = {
  bonjour: "Bonjour, Nelson",
  titre: "Vue d’ensemble",
  reglages: "Réglages",
  terminal: "Terminal",
  enLigne: "En ligne",
  muet: "Muet",
  emplacement: "Emplacement",
  sante: "Santé",
  aucunTerminal: "Aucun terminal ne s’est encore annoncé.",

  aucuneCarte: "Aucune puce dans le terminal",
  aucuneCarteDetail:
    "Glissez une puce dans le terminal : son solde et le guichet apparaîtront ici tout seuls.",
  actualiserAria: "Actualiser le solde : interroger le réseau",
  interrogerReseau: "Interroger le réseau",
  aucunSoldeConnu: "Aucun solde connu : appuyez sur la flèche pour interroger le réseau.",
  soldeMaj: (h) => `D’après l’interrogation de ${h}`,
  soldeSansHeure: "Dernier solde connu.",
  carteAnonyme: (fin) => `puce ${fin}`,

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
    "Aucun SMS reçu pour l’instant. Si la puce devrait en recevoir, " +
    "vérifiez le terminal — un silence prolongé n’est pas normal.",
};

export const textesAccueil = { en, fr } as const;
