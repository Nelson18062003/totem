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
  muet: "Offline",
  emplacement: "Location",
  version: "Version",
  sante: "Device health",
  aucunTerminal: "No terminal has checked in yet.",

  // La carte et son solde
  aucuneCarte: "No card in the terminal",
  aucuneCarteDetail:
    "As soon as the terminal sees a SIM, its balance and the counter will appear here.",

  // AJOUTER MA CARTE — ce que voit un compte qui vient de naître. Ce n'est
  // PAS une panne, ni un boîtier qui se tait : la personne n'a simplement
  // pas encore de carte. On lui dit comment en avoir une, en mots simples,
  // et à qui écrire.
  ajouterCarteTitre: "Add my card",
  ajouterCarteIntro:
    "Your account is ready. To reach your Mobile Money accounts from here, " +
    "link your SIM card to TOTEM. Two ways:",
  ajouterCarteEnvoyerTitre: "Send your SIM card to TOTEM",
  ajouterCarteEnvoyer:
    "We place it in a TOTEM box, where it stays in service. You then reach " +
    "it from here, wherever you are.",
  ajouterCarteBoitierTitre: "Plug in your own TOTEM box",
  ajouterCarteBoitier:
    "Keep your SIM card at home, in a TOTEM box connected to the Internet.",
  ajouterCarteOuvrir:
    "No Mobile Money account yet? TOTEM can help you open one with the operator.",
  ajouterCarteEnsuite:
    "Then TOTEM links the card to your account, and it appears here by " +
    "itself. Pull the screen down to check.",
  // LE CODE DE COMPTE, pas l'adresse e-mail : rien ne prouve qu'une adresse
  // appartient à qui l'a tapée, et TOTEM attribuerait la puce à celui qui
  // l'a prise le premier. Voir web/lib/code-de-compte.ts.
  ajouterCarteCodeTitre: "Your account code",
  ajouterCarteCode:
    "Send this code with your SIM card, or give it to TOTEM: it is how the " +
    "card reaches YOUR account. Give it to no one else.",
  ajouterCarteContacter: "Contact TOTEM",
  ajouterCarteVoir: "How to add my card",
  ajouterCarteCourt: "No card on your account yet.",
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
  // LE BOÎTIER QUI PORTE VOTRE CARTE — pas « celui de la boutique » : la
  // puce d'un particulier est le plus souvent dans un boîtier de TOTEM, et
  // il ne possède ni boutique ni boîtier.
  horsLigneDepuis: (d: string) => `The TOTEM box that holds your card hasn't been in touch since ${d}.`,
  horsLigneSansHeure: "The TOTEM box that holds your card isn't in touch any more.",
  horsLigneArgent:
    "Money can still reach you: it arrives in your account at the operator. "
    + "Its SMS will appear here as soon as the box is back.",
  horsLigneEnAttendant:
    "Until then, the balance and the latest transactions are those of that time, "
    + "and operations from the app can't go out.",
  horsLigneSurPlace: "If the box is yours",
  horsLigneQuoiFaire:
    "Check that the box and the internet router are switched on. If they are, "
    + "unplug the box, count to ten, and plug it back in.",
  // L'alerte NE disparaît PAS d'elle-même : rien ne relit sans un geste (pas
  // de pouls, à dessein). La phrase le promettait ; elle dit quoi faire.
  horsLigneFin: "Once the box is plugged back in, tap “Check again”.",
  // Une carte placée chez TOTEM : la personne n'a rien à débrancher — le
  // boîtier n'est pas chez elle. On ne l'envoie pas chercher une prise.
  horsLigneChezTotemTitre: "Your card is with TOTEM",
  horsLigneChezTotem:
    "The box is in TOTEM's care, and TOTEM is told when it goes quiet. "
    + "There is nothing for you to unplug. If it lasts, write to us.",
  horsLigneChezTotemFin: "Tap “Check again” in a little while.",
  horsLigneReverifier: "Check again",
  horsLigneVerification: "Checking…",
  horsLigneToujours: (h: string) => `Still offline — checked at ${h}.`,
  horsLigneCompris: "OK",
  horsLigneVoir: "Operations can't go out. Tap to see what to do.",
  horsLigneHier: (h: string) => `yesterday at ${h}`,
  horsLigneLe: (j: string, h: string) => `${j} at ${h}`,
  // Les ronds sous la carte : un verbe chacun, court. « Retrait » est celui
  // du guichet (`textesGuichet.retrait`) — un seul nom par geste.
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
  retrait: "Withdraw",
  transfert: "Transfer",
  solde: "Balance",
  monSolde: "My balance",
  monNumero: "My number",
  menu: "Menu",
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
  muet: "Hors ligne",
  emplacement: "Emplacement",
  version: "Version",
  sante: "Santé du boîtier",
  aucunTerminal: "Aucun terminal ne s’est encore annoncé.",

  aucuneCarte: "Aucune carte dans le terminal",
  aucuneCarteDetail:
    "Dès qu’une SIM sera vue par le terminal, son solde et le guichet apparaîtront ici.",

  ajouterCarteTitre: "Ajouter ma carte",
  ajouterCarteIntro:
    "Votre compte est prêt. Pour atteindre vos comptes Mobile Money d’ici, " +
    "reliez votre carte SIM à TOTEM. Deux façons :",
  ajouterCarteEnvoyerTitre: "Envoyer votre puce à TOTEM",
  ajouterCarteEnvoyer:
    "Nous la plaçons dans un boîtier TOTEM, où elle reste en service. Vous " +
    "l’atteignez ensuite d’ici, où que vous soyez.",
  ajouterCarteBoitierTitre: "Brancher votre propre boîtier TOTEM",
  ajouterCarteBoitier:
    "Gardez votre puce chez vous, dans un boîtier TOTEM relié à Internet.",
  ajouterCarteOuvrir:
    "Pas encore de compte Mobile Money ? TOTEM peut vous aider à l’ouvrir chez l’opérateur.",
  ajouterCarteEnsuite:
    "Ensuite, TOTEM relie la carte à votre compte, et elle apparaît ici " +
    "d’elle-même. Tirez l’écran vers le bas pour vérifier.",
  ajouterCarteCodeTitre: "Votre code de compte",
  ajouterCarteCode:
    "Joignez ce code à votre puce, ou donnez-le à TOTEM : c’est d’après lui " +
    "que la carte arrive dans VOTRE compte. Ne le donnez à personne d’autre.",
  ajouterCarteContacter: "Contacter TOTEM",
  ajouterCarteVoir: "Comment ajouter ma carte",
  ajouterCarteCourt: "Aucune carte sur votre compte pour l’instant.",
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
  horsLigneDepuis: (d) => `Le boîtier TOTEM qui porte votre carte n’a plus donné de nouvelles depuis ${d}.`,
  horsLigneSansHeure: "Le boîtier TOTEM qui porte votre carte ne donne plus de nouvelles.",
  horsLigneArgent:
    "L’argent peut toujours vous arriver : il entre sur votre compte chez l’opérateur. "
    + "Ses SMS s’afficheront ici dès que le boîtier reviendra.",
  horsLigneEnAttendant:
    "En attendant, le solde et les derniers mouvements sont ceux de ce moment-là, "
    + "et les opérations depuis l’application ne peuvent pas partir.",
  horsLigneSurPlace: "Si le boîtier est chez vous",
  horsLigneQuoiFaire:
    "Vérifiez que le boîtier et le routeur Internet sont allumés. S’ils le sont, "
    + "débranchez le boîtier, comptez jusqu’à dix, puis rebranchez-le.",
  horsLigneFin: "Une fois le boîtier rebranché, touchez « Revérifier ».",
  horsLigneChezTotemTitre: "Votre carte est chez TOTEM",
  horsLigneChezTotem:
    "Le boîtier est sous la garde de TOTEM, qui est prévenu quand il se tait. "
    + "Vous n’avez rien à débrancher. Si cela dure, écrivez-nous.",
  horsLigneChezTotemFin: "Touchez « Revérifier » dans un moment.",
  horsLigneReverifier: "Revérifier",
  horsLigneVerification: "Vérification…",
  horsLigneToujours: (h) => `Toujours hors ligne — vérifié à ${h}.`,
  horsLigneCompris: "Compris",
  horsLigneVoir: "Les opérations ne peuvent pas partir. Touchez pour savoir quoi faire.",
  horsLigneHier: (h) => `hier à ${h}`,
  horsLigneLe: (j, h) => `le ${j} à ${h}`,
  rondRecevoir: "Recevoir",
  rondUssd: "Code USSD",
  recevoirAria: "Votre nom et votre numéro, à donner à qui vous paie",
  mouvements: "Derniers mouvements",
  aucunMouvement: "Aucun mouvement d’argent parmi les derniers SMS",
  soldeSansHeure: "Dernier solde connu.",
  carteAnonyme: (fin) => `carte ${fin}`,

  depot: "Dépôt",
  retrait: "Retrait",
  transfert: "Transfert",
  solde: "Solde",
  monSolde: "Mon solde",
  monNumero: "Mon numéro",
  menu: "Menu",
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
