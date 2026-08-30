// Les textes de l'accueil — la page d'ensemble et le guichet.
// L'anglais d'abord, écrit pour lui-même ; le français en regard.

const en = {
  // L'en-tête et le terminal
  // Le prénom du propriétaire était ÉCRIT EN DUR ici. Tant que TOTEM
  // n'appartenait qu'à une personne, cela passait ; dès qu'un deuxième
  // compte existe, tout le monde est accueilli sous le prénom du premier.
  // Le nom vient donc du compte connecté, et « bonjourSeul » sert quand il
  // n'y en a pas — une session ouverte par la clé de secours, par exemple.
  bonjour: "Hello, {nom}",
  bonjourSeul: "Hello",
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
  masquerSolde: "Hide the balance",
  montrerSolde: "Show the balance",
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
  // Plusieurs cartes : le guichet suit la carte choisie
  choisirCarte: (l: string) => `Select the ${l} card`,
  gestesSur: (l: string) => `Operations on the ${l} card`,
  carteMuette: (d: string) =>
    `Not seen by the terminal since ${d} — check the box where it is installed. ` +
    "The balance shown is the last one known.",
  // Les coordonnées de la carte — le « RIB » à donner pour être payé
  coordonneesTitre: "Account details",
  coordonneesAria: "Show the account details to share them",
  coordNom: "Name",
  coordNumero: "Number",
  coordReseau: "Network",
  coordSansNom: "No name yet — add it in Settings so it appears here.",
  coordCopier: "Copy",
  coordCopie: "Copied",
  // Sur le téléphone, le geste naturel n'est pas de copier mais de PARTAGER :
  // la feuille d'Android porte WhatsApp, les SMS — et « Copier » avec.
  coordPartager: "Share",
  coordPdf: "Download the PDF",
  coordPdfImpossible:
    "The PDF could not be opened. Check the connection and try again.",
  coordVoir: "View",
  coordTelecharger: "Download",
  copierNumero: "Copy the number",
  numeroCopie: "Number copied",
  coordFermer: "Close",
  coordPied:
    "Give these details to anyone who wants to send you money on this card.",

  // Les derniers SMS
  derniersSms: "Latest SMS",
  toutVoir: "See all",
  aucunSms:
    "No SMS so far. If the card should be receiving some, check the " +
    "terminal — a long silence is not normal.",
};

const fr: typeof en = {
  bonjour: "Bonjour, {nom}",
  bonjourSeul: "Bonjour",
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
  masquerSolde: "Masquer le solde",
  montrerSolde: "Afficher le solde",
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
  choisirCarte: (l) => `Choisir la carte ${l}`,
  gestesSur: (l) => `Gestes sur la carte ${l}`,
  carteMuette: (d) =>
    `Plus vue par le terminal depuis le ${d} — vérifiez le boîtier, là où il est installé. ` +
    "Le solde affiché est le dernier connu.",
  coordonneesTitre: "Mes coordonnées",
  coordonneesAria: "Afficher les coordonnées de la carte pour les partager",
  coordNom: "Nom",
  coordNumero: "Numéro",
  coordReseau: "Réseau",
  coordSansNom: "Aucun nom pour l’instant — ajoutez-le dans les Réglages pour qu’il apparaisse ici.",
  coordCopier: "Copier",
  coordCopie: "Copié",
  coordPartager: "Partager",
  coordPdf: "Télécharger le PDF",
  coordPdfImpossible:
    "Le PDF n’a pas pu s’ouvrir. Vérifiez la connexion, puis réessayez.",
  coordVoir: "Voir",
  coordTelecharger: "Télécharger",
  copierNumero: "Copier le numéro",
  numeroCopie: "Numéro copié",
  coordFermer: "Fermer",
  coordPied:
    "Donnez ces coordonnées à qui veut vous envoyer de l’argent sur cette carte.",

  derniersSms: "Derniers SMS",
  toutVoir: "Tout voir",
  aucunSms:
    "Aucun SMS reçu pour l’instant. Si la carte devrait en recevoir, " +
    "vérifiez le terminal — un silence prolongé n’est pas normal.",
};

export const textesAccueil = { en, fr } as const;
