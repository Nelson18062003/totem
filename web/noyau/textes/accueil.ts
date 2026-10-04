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
  // Les trois commandes sous la carte, NOMMÉES. Un cercle sans mot ne
  // disait rien à qui découvrait l'application : on ne savait pas à quoi
  // servaient ces boutons. Un nom court, sous chaque icône.
  cmdSolde: "Balance",
  cmdUssd: "USSD code",
  cmdCoordonnees: "My details",
  ussdAria: "Dial a USSD code on this card",
  masquerSolde: "Hide the balance",
  montrerSolde: "Show the balance",
  interrogerReseau: "Ask the network",
  aucunSoldeConnu: "No balance yet: press the arrow to ask the network.",
  soldeMaj: (h: string) => `From the network query at ${h}`,
  // LA LIGNE SOUS LA CARTE : l'âge du solde, AVEC son jour. « 21:54 » seul
  // ne disait pas si c'était ce soir ou hier soir.
  soldeReleve: (h: string) => `Balance checked at ${h}`,
  soldeReleveHier: (h: string) => `Balance checked yesterday at ${h}`,
  soldeReleveLe: (j: string, h: string) => `Balance checked on ${j} at ${h}`,
  aucunSoldeCourt: "No balance yet",
  actualiser: "Refresh",
  // « Terminal muet » ne disait rien à qui ne connaît pas le système : ni ce
  // que c'est, ni si l'argent arrive, ni quoi faire. Hors ligne se comprend
  // partout ; l'appui ouvre une explication, plus les Réglages.
  terminalMuetCourt: "Terminal offline",
  terminalMuetAria: (q: string) => `The terminal is offline (${q}): what it means and what to do`,
  horsLigneTitre: "The terminal is offline",
  horsLigneDepuis: (d: string) => `The TOTEM box at the shop hasn't been in touch since ${d}.`,
  horsLigneSansHeure: "The TOTEM box at the shop isn't in touch any more.",
  horsLigneArgent:
    "Your customers can still pay you: the money reaches your account at the operator. "
    + "Their SMS will appear here as soon as the box is back.",
  horsLigneEnAttendant:
    "Until then, the balance and the latest transactions are those of that time, "
    + "and operations from the app can't go out.",
  horsLigneSurPlace: "At the shop",
  horsLigneQuoiFaire:
    "Check that the box and the internet router are switched on. If they are, "
    + "unplug the box, count to ten, and plug it back in.",
  horsLigneFin: "This alert goes away by itself as soon as the box is back in touch.",
  horsLigneCompris: "OK",
  horsLigneVoir: "Operations can't go out. Tap to see what to do.",
  horsLigneHier: (h: string) => `yesterday at ${h}`,
  horsLigneLe: (j: string, h: string) => `${j} at ${h}`,
  // Les cinq ronds sous la carte : un verbe chacun, court.
  rondRetrait: "Withdraw",
  rondRecevoir: "Receive",
  rondUssd: "USSD code",
  recevoirAria: "Your name and number, to give to whoever pays you",
  // Ce qui vient d'arriver : l'argent seulement, toutes cartes.
  mouvements: "Latest transactions",
  aucunMouvement: "No money movement among the latest SMS",
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
  // Ce que le bouton « Copier » emporte, dit en entier aux aides vocales :
  // le nom et le numéro, pas le réseau (voir `noyau/coordonnees.ts`).
  coordCopierNomNumero: "Copy the name and number",
  coordCopierNom: "Copy the name",
  nomCopie: "Name copied",
  // Partager envoie aussi le réseau : il part chez quelqu'un qui ne connaît
  // pas encore la carte.
  coordPartager: "Share",
  coordPdf: "Download the PDF",
  coordPdfImpossible:
    "The PDF could not be prepared. Check the connection and try again.",
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
  cmdSolde: "Solde",
  cmdUssd: "Code USSD",
  cmdCoordonnees: "Coordonnées",
  ussdAria: "Composer un code USSD sur cette carte",
  masquerSolde: "Masquer le solde",
  montrerSolde: "Afficher le solde",
  interrogerReseau: "Interroger le réseau",
  aucunSoldeConnu: "Aucun solde connu : appuyez sur la flèche pour interroger le réseau.",
  soldeMaj: (h) => `D’après l’interrogation de ${h}`,
  soldeReleve: (h) => `Solde relevé à ${h}`,
  soldeReleveHier: (h) => `Solde relevé hier à ${h}`,
  soldeReleveLe: (j, h) => `Solde relevé le ${j} à ${h}`,
  aucunSoldeCourt: "Aucun solde connu",
  actualiser: "Actualiser",
  terminalMuetCourt: "Terminal hors ligne",
  terminalMuetAria: (q) => `Le terminal est hors ligne (${q}) : ce que cela veut dire, et quoi faire`,
  horsLigneTitre: "Le terminal est hors ligne",
  horsLigneDepuis: (d) => `Le boîtier TOTEM de la boutique n’a plus donné de nouvelles depuis ${d}.`,
  horsLigneSansHeure: "Le boîtier TOTEM de la boutique ne donne plus de nouvelles.",
  horsLigneArgent:
    "Vos clients peuvent toujours vous payer : l’argent arrive sur votre compte chez l’opérateur. "
    + "Leurs SMS s’afficheront ici dès que le boîtier reviendra.",
  horsLigneEnAttendant:
    "En attendant, le solde et les derniers mouvements sont ceux de ce moment-là, "
    + "et les opérations depuis l’application ne peuvent pas partir.",
  horsLigneSurPlace: "À la boutique",
  horsLigneQuoiFaire:
    "Vérifiez que le boîtier et le routeur Internet sont allumés. S’ils le sont, "
    + "débranchez le boîtier, comptez jusqu’à dix, puis rebranchez-le.",
  horsLigneFin: "Cette alerte disparaît d’elle-même dès que le boîtier redonne des nouvelles.",
  horsLigneCompris: "Compris",
  horsLigneVoir: "Les opérations ne peuvent pas partir. Touchez pour savoir quoi faire.",
  horsLigneHier: (h) => `hier à ${h}`,
  horsLigneLe: (j, h) => `le ${j} à ${h}`,
  rondRetrait: "Retrait",
  rondRecevoir: "Recevoir",
  rondUssd: "Code USSD",
  recevoirAria: "Votre nom et votre numéro, à donner à qui vous paie",
  mouvements: "Derniers mouvements",
  aucunMouvement: "Aucun mouvement d’argent parmi les derniers SMS",
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
  coordCopierNomNumero: "Copier le nom et le numéro",
  coordCopierNom: "Copier le nom",
  nomCopie: "Nom copié",
  coordPartager: "Partager",
  coordPdf: "Télécharger le PDF",
  coordPdfImpossible:
    "Le PDF n’a pas pu être préparé. Vérifiez la connexion, puis réessayez.",
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
