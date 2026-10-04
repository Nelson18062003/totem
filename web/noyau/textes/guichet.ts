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
  retrait: "Withdraw",
  retraitSous: "At an agent",
  transfert: "Transfer",
  transfertSous: "Send to a number",
  numeroACrediter: "Number to top up",
  numeroAgent: "Agent's number",
  numeroBeneficiaire: "Recipient's number",
  montantFcfa: "Amount (FCFA)",
  exempleVingtMille: "20,000",
  exempleCinquanteMille: "50,000",
  monNumero: "My number",
  soldeSous: "Ask the network for the exact balance",
  monNumeroSous: "The network tells you this card's number",
  recevoir: "Receive money",
  recevoirSous: "Name and number to give to whoever pays you",
  consultation: "Enquiries",
  smsRecus: "Incoming SMS",
  analyse: "Analysis",
  codeUssd: "USSD code",
  aucunCodeReleve: (op: string) =>
    `No ${op} codes have been collected in the field yet — a digit that moves ` +
    "money is not something to guess. Add them in Settings.",
  carteVisee: "Card the operations run on",
  // L'onglet Opérations, rangé : la carte, les trois gestes d'argent, puis
  // « Consulter » et « Outils ». Des intertitres en casse normale — une
  // étiquette en capitales se lit comme un réglage technique.
  depuisLaCarte: "From card",
  operationsDepuis: (l: string) => `Operations from card ${l}`,
  groupeConsulter: "Check",
  groupeOutils: "Tools",
  monSolde: "My balance",
  champNumero: "Number",

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
  // Quand l'écran ABANDONNE une demande restée sans réponse, il l'annule —
  // et ne dit « rien n'est parti » que si l'annulation a PRIS. Sinon le
  // boîtier l'a déjà en main : elle peut encore aboutir, et le dire autrement
  // ferait recommencer un transfert qui part peut-être.
  sansReponseRienParti:
    "The TOTEM box that holds your card did not answer: the request has been cancelled, nothing was sent.",
  sansReponseEnCours:
    "The TOTEM box that holds your card has taken the request but has not answered yet: it may "
    + "still go through. Check your SMS before trying again.",
  // Le TÉLÉPHONE n'a pas joint la plateforme pendant l'attente : ce n'est
  // pas le boîtier qui s'est tu, et on n'a pas pu annuler.
  telephoneSansTotem:
    "Your phone can't reach TOTEM right now: check its connection. The request "
    + "may still go through — check your SMS before trying again.",
  sansReponseIncertaine:
    "The TOTEM box that holds your card did not answer, and the cancellation could not be "
    + "confirmed: the request may still go out. Check your SMS before trying again.",
  // Le boîtier a FINI la demande pendant que l'écran renonçait — mais sa
  // réponse n'a pas pu être relue. On ne dit ni « rien n'est parti », ni
  // « elle peut encore aboutir » : elle est finie, et on ne sait pas comment.
  sansReponseFinie:
    "The TOTEM box that holds your card finished the request just now, but its answer could not be "
    + "read back. Check your SMS before trying again.",
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

  // --- La surcouche : la session comme une application, pas un terminal ---
  etapeConnexion: "Connecting",
  etapeEchange: "Operator",
  etapeCode: "Secret code",
  etapeFin: "Done",
  ouvertureSur: (carte: string) => `Opening the session on ${carte}…`,
  ouverture: "Opening the session on the card…",
  reseauDemandeNumero: "The network asks for a number",
  reseauDemandeMontant: "The network asks for an amount",
  reseauDemandeReponse: "The network is waiting for a reply",
  autreReponse: "Type another reply",
  voirEchange: "See the exchange with the operator",
  masquerEchange: "Hide the exchange",
  vous: "You",
  operateur: "Operator",
  opReussie: "Operation completed",
  opRefusee: "The operator declined",
  opReponse: "The operator's answer",
  opInterrompue: "The session stopped",
  repondreQuandMeme: "Reply to the operator anyway",
  recap: "Summary",
  recapOperation: "Operation",
  recapVers: "To",
  recapMontant: "Amount",
  clientsRecents: "Recent",

  // Le parcours en plein écran : une question par écran.
  combien: "How much?",
  continuer: "Continue",
  retour: "Back",
  verifiez: "Check before sending",
  vers: "to",
  depuis: (carte: string) => `from ${carte}`,
  confirmer: "Confirm",
  codeEnsuite: "Your secret code will be asked at the end.",
  connexionA: (op: string) => `Connecting to ${op}…`,
  onParleA: (op: string) => `Talking to ${op}…`,
  reseau: "the network",
  codeTitre: "Your secret code",
  codeNote: "Never shown, never kept.",
  operateurDemande: (op: string) => `${op} asks`,
  details: "Details",
  masquerDetails: "Hide details",
  saisirAutrement: "Type a number",
  // Les champs acceptent tout : on tape, on colle, on recopie.
  numeroPlaceholder: "Type or paste the number",
  reponsePlaceholder: "Type or paste your reply",
  partira: (valeur: string) => `Will be sent: ${valeur}`,
  numeroIntrouvable: "No single phone number found here — keep just one.",
  montantIntrouvable: "No single amount found here.",
  // L'échange avec l'opérateur, montré en entier.
  copier: "Copy",
  copie: "Copied",
  envoye: (valeur: string) => `Sent: ${valeur}`,
};

const fr: typeof en = {
  titre: "Opérations",
  sansCode: "Sans composer de code USSD.",
  aucuneCarte: "Aucune carte dans le terminal",
  aucuneCarteDetail:
    "Les opérations s'ouvriront dès qu'une SIM sera en place : c'est elle qui porte le guichet.",

  depot: "Dépôt",
  depotSous: "Créditer un compte Mobile Money",
  retrait: "Retrait",
  retraitSous: "Chez un agent",
  transfert: "Transfert",
  transfertSous: "Envoyer vers un numéro",
  numeroACrediter: "Numéro à créditer",
  numeroAgent: "Numéro de l’agent",
  numeroBeneficiaire: "Numéro du bénéficiaire",
  montantFcfa: "Montant (FCFA)",
  exempleVingtMille: "20 000",
  exempleCinquanteMille: "50 000",
  monNumero: "Mon numéro",
  soldeSous: "Demander au réseau le solde exact",
  monNumeroSous: "Le réseau vous dit le numéro de cette carte",
  recevoir: "Recevoir de l’argent",
  recevoirSous: "Le nom et le numéro à donner à qui vous paie",
  consultation: "Consultation",
  smsRecus: "SMS reçus",
  analyse: "Analyse",
  codeUssd: "Code USSD",
  aucunCodeReleve: (op) =>
    `Aucun code ${op} n’a encore été relevé sur le terrain — on ne devine ` +
    "pas un chiffre qui déplace de l’argent. Ajoutez-les dans les Réglages.",
  carteVisee: "Carte des opérations",
  depuisLaCarte: "Depuis la carte",
  operationsDepuis: (l) => `Opérations depuis la carte ${l}`,
  groupeConsulter: "Consulter",
  groupeOutils: "Outils",
  monSolde: "Mon solde",
  champNumero: "Numéro",

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
  sansReponseRienParti:
    "Le boîtier TOTEM qui porte votre carte n’a pas répondu : la demande est annulée, rien n’est parti.",
  sansReponseEnCours:
    "Le boîtier TOTEM qui porte votre carte a pris la demande mais n’a pas encore répondu : "
    + "elle peut encore aboutir. Regardez vos SMS avant de recommencer.",
  telephoneSansTotem:
    "Votre téléphone n’arrive pas à joindre TOTEM : vérifiez sa connexion. La demande "
    + "peut quand même aboutir — regardez vos SMS avant de recommencer.",
  sansReponseIncertaine:
    "Le boîtier TOTEM qui porte votre carte n’a pas répondu, et l’annulation n’a pas pu être "
    + "confirmée : la demande peut encore partir. Regardez vos SMS avant de recommencer.",
  sansReponseFinie:
    "Le boîtier TOTEM qui porte votre carte vient de finir la demande, mais sa réponse n’a pas "
    + "pu être relue. Regardez vos SMS avant de recommencer.",
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

  etapeConnexion: "Connexion",
  etapeEchange: "Opérateur",
  etapeCode: "Code secret",
  etapeFin: "Terminé",
  ouvertureSur: (carte: string) => `Ouverture de la session sur ${carte}…`,
  ouverture: "Ouverture de la session sur la carte…",
  reseauDemandeNumero: "Le réseau demande un numéro",
  reseauDemandeMontant: "Le réseau demande un montant",
  reseauDemandeReponse: "Le réseau attend une réponse",
  autreReponse: "Taper une autre réponse",
  voirEchange: "Voir l’échange avec l’opérateur",
  masquerEchange: "Masquer l’échange",
  vous: "Vous",
  operateur: "Opérateur",
  opReussie: "Opération réussie",
  opRefusee: "L’opérateur a refusé",
  opReponse: "Réponse de l’opérateur",
  opInterrompue: "La session s’est arrêtée",
  repondreQuandMeme: "Répondre quand même à l’opérateur",
  recap: "Récapitulatif",
  recapOperation: "Opération",
  recapVers: "Vers",
  recapMontant: "Montant",
  clientsRecents: "Récents",

  combien: "Combien ?",
  continuer: "Continuer",
  retour: "Retour",
  verifiez: "Vérifiez avant d’envoyer",
  vers: "à",
  depuis: (carte: string) => `depuis ${carte}`,
  confirmer: "Confirmer",
  codeEnsuite: "Votre code secret vous sera demandé à la fin.",
  connexionA: (op: string) => `Connexion à ${op}…`,
  onParleA: (op: string) => `On parle avec ${op}…`,
  reseau: "le réseau",
  codeTitre: "Votre code secret",
  codeNote: "Jamais affiché, jamais gardé.",
  operateurDemande: (op: string) => `${op} demande`,
  details: "Détails",
  masquerDetails: "Masquer les détails",
  saisirAutrement: "Taper un numéro",
  numeroPlaceholder: "Tapez ou collez le numéro",
  reponsePlaceholder: "Tapez ou collez votre réponse",
  partira: (valeur: string) => `Partira : ${valeur}`,
  numeroIntrouvable: "Aucun numéro clair ici — n’en gardez qu’un.",
  montantIntrouvable: "Aucun montant clair ici.",
  copier: "Copier",
  copie: "Copié",
  envoye: (valeur: string) => `Envoyé : ${valeur}`,
};

export const textesGuichet = { en, fr } as const;
