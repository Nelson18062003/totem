// Les textes de l'écran des réglages — la page serveur et ses composants
// interactifs. L'anglais s'écrit pour lui-même, le français aussi : aucun des
// deux n'est une traduction mot à mot de l'autre.
//
// Ne changent jamais de langue : les codes USSD (#148#…), les valeurs saisies,
// « ICCID », les noms d'opérateurs, la commande Telegram /reglages. Les
// erreurs venues des routes API ou du robot arrivent déjà localisées et
// s'affichent telles quelles.

const en = {
  titre: "Settings",
  sousTitre: "The terminal, the accounts, security.",
  proprietaire: "Terminal owner",

  // --- Le terminal
  terminal: "Terminal",
  enLigne: "Online",
  muet: "Silent",
  misAJour: (d: string) => `updated ${d}`,
  nom: "Name",
  version: "Version",
  aucunTerminal:
    "No terminal has made itself known yet. As soon as the robot gets network, its status will appear here.",
  redemarrer: "Restart the terminal",

  // --- Les comptes
  comptes: "Accounts",
  voirSoldes: "See the balances",
  aucuneCarte: "No card has been seen by the terminal yet.",
  carte: (fin: string) => `card ${fin}`,
  retireeJournal: (d: string) => `removed ${d} · record kept`,
  noteIccid:
    "A card is known by its ICCID, never by the network it picks up: an MTN chip stays “MTN” even abroad, roaming. Changing cards opens a separate account — balances never mix, and the old card finds its record again if it comes back.",
  // La note sur le numéro se compose en trois morceaux, autour du mot mis en
  // valeur et de la commande Telegram (qui ne se traduit pas).
  noteNumeroAvant: "The ",
  noteNumeroMot: "number",
  noteNumeroMilieu:
    " cannot be read from the chip or the network: most prepaid SIMs never declare it. Tap it above to set it",
  noteNumeroFin:
    ". Without it, a deposit or a transfer shows up with no way to tell whether the money came in or went out: the receipt says “Net amount” instead of “Amount received” or “Amount sent”.",

  // --- Le numéro d'une puce (réglage interactif)
  neufChiffres: "Nine digits, for example 696103864.",
  pasRepondu: "The terminal didn’t answer. Is it online?",
  majRequise:
    "Your terminal needs an update before this can be set from here.",
  aRefuse: "The terminal said no.",
  pasPartie: "The request could not be sent. Try again.",
  reglerNumero: (libelle: string) => `Set the number of ${libelle}`,
  numeroARenseigner: "no number yet",
  reglerNom: (libelle: string) => `Set the name of ${libelle}`,
  nomARenseigner: "Add a name",
  nomPlaceholder: "e.g. NGANGOM JONAS",
  nomTropCourt: "That name is too short.",
  enregistrement: "The terminal is saving…",
  annuler: "Cancel",

  // --- Les notifications
  notifications: "Notifications",
  notifPaiement: "Every payment received",
  notifRapport: "Daily report (9 pm)",
  notifCourant: "Power cuts and low voltage",

  // --- Les codes USSD
  codesUssd: "USSD codes",
  carteEnPlace: (op: string) => `${op} · current card`,
  aucunCode: (op: string) =>
    `No ${op} code has been taken down in the field yet — and a digit that moves money is not something to guess. Enter the ones from the real phone below.`,
  // Les libellés du catalogue de départ (lib/codes.ts), par clé. Un raccourci
  // ajouté à la main garde le nom que son auteur lui a donné.
  libellesCodes: {
    menu: "Menu",
    depot: "Deposit",
    retrait: "Withdrawal",
    transfert: "Transfer",
    solde: "Balance",
    mon_numero: "My number",
  } as Record<string, string | undefined>,
  modifierCode: "Edit this code",
  attribuer: "Set the code",
  retirerBouton: "Remove this button (back to the built-in code, if any)",
  exempleEtapes: "*126*1*{numero}*{montant}#",
  variableAide: {
    numero: "The recipient's or agent's number, as typed in the form",
    montant: "The amount, as typed in the form",
    point: "The agent's number (withdrawal)",
  } as Record<string, string>,
  modeDirect: "direct",
  modeGuide: "menu",

  // --- Le composeur : un code qui se construit bloc par bloc
  blocNom: {
    numero: "Recipient's number",
    montant: "Amount",
    point: "Agent's number",
  } as Record<string, string>,
  blocNature: {
    telephone: "phone number",
    montant: "amount",
  } as Record<string, string>,
  aideComposeur:
    "Tap a block to drop it where the cursor sits — or drag it into the code.",
  retirerBloc: "Remove this block",
  reseauRecevra: "The network will receive",
  codePret: "Ready to save",
  verdict: {
    vide: "Nothing to save yet.",
    malformee:
      "A block is half-written. Remove it and drop a whole one back in.",
    inconnue: (nom: string) =>
      `${nom} is not one of the three blocks — the network would get it as is.`,
    code: "A USSD code starts with * or # and ends with #.",
    etape: (e: string) =>
      `“${e}” is neither a menu choice (one or two digits) nor a block. ` +
      "A button stops at the question — never an amount, a number or the " +
      "secret code.",
  },
  nomExemple: "Name (“Bills”)",
  ajouter: "Add",
  annulerAjout: "Cancel adding",
  ajouterRaccourci: "Add a shortcut",
  noteCodes:
    "Each operator has its own codes: they belong to the network, and work with any card from that operator. What you save here goes into the robot's notebook and every screen uses it. Two ways to build one: drop the blocks into the code — the recipient's number, the amount — and it goes out complete in one shot, the network then only asking for your secret code; leave the blocks out and the code opens the menu, and the platform answers its questions one by one. Never type your secret code here: it is entered on its keypad when the moment comes, and is stored nowhere.",

  // --- La sécurité
  // --- Qui peut se connecter (réservé au propriétaire)
  // « comptes » plus haut, ce sont les SIM Mobile Money. Ici ce sont les
  // PERSONNES. Deux choses très différentes qui portaient le même mot.
  qui: "Who can sign in",
  quiAide:
    "Anyone can create an account. Nobody gets in until you let them.",
  roleProprietaire: "Owner",
  roleInvite: "Guest",
  enAttente: "Waiting",
  ouvert: "Allowed in",
  approuver: "Let in",
  fermer: "Block",
  supprimer: "Delete",
  supprimerSur: "Delete this account for good?",
  jamaisVenu: "Never signed in",
  vuLe: "Last signed in",
  aucunAutreCompte: "No other account yet.",
  // --- L'essai de notification
  // Le propriétaire vient d'installer l'application. Lui demander d'attendre
  // un vrai paiement pour savoir si son téléphone sonne serait cruel — et
  // s'il ne sonne pas, il chercherait longtemps.
  essai: "Does my phone ring?",
  essaiAide:
    "Sends a test notification to the phones signed in. It checks the phone " +
    "side — not the terminal itself.",
  essaiBouton: "Send a test",
  essaiEnCours: "Sending…",
  essaiTexte: "This is a test. Notifications are working.",
  essaiReussi: "Sent. Your phone should ring within a few seconds.",
  // « Aucun téléphone connecté » était un CONTRESENS. Le propriétaire EST
  // connecté — il vient de taper son courriel et son mot de passe — et le
  // message lui disait le contraire. Ce qui manque n'est pas une session,
  // c'est un APPAREIL INSCRIT pour recevoir les notifications. Deux choses
  // sans rapport, sous un même mot.
  essaiAucunAppareil:
    "No phone is registered for notifications. This is not about your " +
    "sign-in — you are signed in. It means no phone has yet told the " +
    "platform where to ring.",
  // Sur le navigateur, la précision qui manquait le plus : un navigateur
  // n'est pas un téléphone, et ne recevra jamais de notification. Sans
  // cela, on appuie sur « envoyer un essai » depuis un ordinateur en
  // attendant qu'il sonne.
  essaiDepuisNavigateur:
    "A browser never receives these notifications — only the TOTEM app on " +
    "a phone does. Open the app on your phone, then come back here.",
  essaiEchec: "Nothing could be sent.",
  essaiOublies: "phone(s) removed: the app is no longer installed on them.",

  // --- Ce qui a empêché ce téléphone de s'inscrire -----------------------
  // Cinq raisons, cinq gestes différents. Les confondre sous un « ça ne
  // marche pas » laisse chercher au hasard.
  sonnerieInscrit: "This phone will ring.",
  sonnerieRefusee:
    "Notifications are turned off for TOTEM. Android will not ask again — " +
    "turn them on in the phone's own settings.",
  sonnerieOuvrirReglages: "Open phone settings",
  sonnerieSimulateur:
    "This device cannot receive notifications (no Google services).",
  sonnerieSansProjet:
    "This build is not linked to its notification project. It needs " +
    "rebuilding — nothing you can fix from here.",
  sonnerieSansJeton:
    "The notification service gave nothing back. Check the connection, then " +
    "try again.",
  sonnerieEchec:
    "The phone could not be registered. Check the connection, then try again.",
  sonnerieInscrire: "Register this phone",
  sonnerieEnCours: "Registering…",
  securite: "Security",
  motDePasse: "Change the password",
  doubleAuth: "Two-step sign-in",
  activee: "On",
  notePin:
    "The Mobile Money PIN is stored nowhere: it is typed for each operation, then forgotten.",

  // --- La langue
  langue: "Language",
  langueActive: "Current language",
  noteLangue:
    "Every screen follows — dates, amounts, alerts. What the operator sends is never translated: it stays word for word, as the SIM received it.",

  // --- La sortie
  seDeconnecter: "Sign out",
  deconnexion: "Signing out…",
};

const fr: typeof en = {
  titre: "Réglages",
  sousTitre: "Le terminal, les comptes, la sécurité.",
  proprietaire: "Propriétaire du terminal",

  terminal: "Terminal",
  enLigne: "En ligne",
  muet: "Muet",
  misAJour: (d) => `mis à jour ${d}`,
  nom: "Nom",
  version: "Version",
  aucunTerminal:
    "Aucun terminal ne s’est encore annoncé dans la base. Dès que le robot aura du réseau, son état apparaîtra ici.",
  redemarrer: "Redémarrer le terminal",

  comptes: "Comptes",
  voirSoldes: "Voir les soldes",
  aucuneCarte: "Aucune carte encore vue par le terminal.",
  carte: (fin) => `carte ${fin}`,
  retireeJournal: (d) => `retirée le ${d} · journal conservé`,
  noteIccid:
    "Une carte est identifiée par son ICCID, jamais par le réseau capté : une puce MTN reste « MTN » même à l’étranger, en itinérance. Changer de carte ouvre un compte distinct — les soldes ne se mélangent pas, et l’ancienne retrouve son journal si on la remet.",
  noteNumeroAvant: "Le ",
  noteNumeroMot: "numéro",
  noteNumeroMilieu:
    " ne se lit ni sur la puce ni sur le réseau : la plupart des SIM prépayées ne le déclarent pas. Touchez-le ci-dessus pour l’inscrire",
  noteNumeroFin:
    ". Sans lui, un dépôt ou un transfert s’affiche sans qu’on sache s’il sort ou entre : le reçu écrit « Montant net » au lieu de « Montant reçu » ou « Montant envoyé ».",

  neufChiffres: "Neuf chiffres, par exemple 696103864.",
  pasRepondu: "Le terminal n’a pas répondu. Est-il en ligne ?",
  majRequise:
    "Ton terminal doit être mis à jour pour régler cela d’ici.",
  aRefuse: "Le terminal a refusé.",
  pasPartie: "La demande n’a pas pu partir. Réessayez.",
  reglerNumero: (libelle) => `Régler le numéro de ${libelle}`,
  numeroARenseigner: "numéro à renseigner",
  reglerNom: (libelle) => `Régler le nom de ${libelle}`,
  nomARenseigner: "Ajouter un nom",
  nomPlaceholder: "ex. NGANGOM JONAS",
  nomTropCourt: "Ce nom est trop court.",
  enregistrement: "Le terminal enregistre…",
  annuler: "Annuler",

  notifications: "Notifications",
  notifPaiement: "Chaque paiement reçu",
  notifRapport: "Rapport quotidien (21 h)",
  notifCourant: "Coupure de courant et sous-tension",

  codesUssd: "Codes USSD",
  carteEnPlace: (op) => `${op} · carte en place`,
  aucunCode: (op) =>
    `Aucun code ${op} n’a encore été relevé sur le terrain — et on ne devine pas un chiffre qui déplace de l’argent. Saisissez ceux du vrai téléphone ci-dessous.`,
  libellesCodes: {
    menu: "Menu",
    depot: "Dépôt",
    retrait: "Retrait",
    transfert: "Transfert",
    solde: "Solde",
    mon_numero: "Mon numéro",
  } as Record<string, string | undefined>,
  modifierCode: "Modifier ce code",
  attribuer: "Attribuer le code",
  retirerBouton: "Retirer ce bouton (retour au code d’origine, s’il existe)",
  exempleEtapes: "*126*1*{numero}*{montant}#",
  variableAide: {
    numero: "Le numéro du bénéficiaire ou de l’agent, tel que saisi au formulaire",
    montant: "Le montant, tel que saisi au formulaire",
    point: "Le numéro de l’agent (retrait)",
  } as Record<string, string>,
  modeDirect: "direct",
  modeGuide: "menu",

  blocNom: {
    numero: "Numéro du bénéficiaire",
    montant: "Montant",
    point: "Numéro de l’agent",
  } as Record<string, string>,
  blocNature: {
    telephone: "numéro de téléphone",
    montant: "montant",
  } as Record<string, string>,
  aideComposeur:
    "Touchez un bloc pour le poser là où est le curseur — ou glissez-le dans le code.",
  retirerBloc: "Retirer ce bloc",
  reseauRecevra: "Le réseau recevra",
  codePret: "Prêt à enregistrer",
  verdict: {
    vide: "Rien à enregistrer pour l’instant.",
    malformee:
      "Un bloc est écrit à moitié. Retirez-le et reposez-en un entier.",
    inconnue: (nom) =>
      `${nom} n’est pas l’un des trois blocs — le réseau le recevrait tel quel.`,
    code: "Un code USSD commence par * ou # et finit par #.",
    etape: (e) =>
      `« ${e} » n’est ni un choix de menu (un ou deux chiffres) ni un bloc. ` +
      "Un bouton s’arrête à la question — jamais un montant, un numéro ou " +
      "le code secret.",
  },
  nomExemple: "Nom (« Factures »)",
  ajouter: "Ajouter",
  annulerAjout: "Annuler l’ajout",
  ajouterRaccourci: "Ajouter un raccourci",
  noteCodes:
    "Chaque opérateur a ses propres codes ; ils appartiennent au réseau et suivront toute carte du même opérateur. Ce qui s’enregistre ici entre au carnet du robot, et tous les écrans s’en servent. Deux façons de construire un code : posez-y les blocs — le numéro du bénéficiaire, le montant — et il part COMPLET, d’un seul coup, le réseau ne demandant plus que le code secret ; sans blocs, le code ouvre le menu et la plateforme répond à ses questions une à une. N’écrivez jamais votre code secret ici : il se compose sur son pavé au moment voulu, et n’est enregistré nulle part.",

  qui: "Qui peut se connecter",
  quiAide:
    "N’importe qui peut créer un compte. Personne n’entre tant que vous ne " +
    "l’avez pas laissé entrer.",
  roleProprietaire: "Propriétaire",
  roleInvite: "Invité",
  enAttente: "En attente",
  ouvert: "Peut entrer",
  approuver: "Laisser entrer",
  fermer: "Bloquer",
  supprimer: "Supprimer",
  supprimerSur: "Supprimer ce compte définitivement ?",
  jamaisVenu: "Jamais connecté",
  vuLe: "Dernière connexion",
  aucunAutreCompte: "Aucun autre compte pour l’instant.",
  essai: "Est-ce que mon téléphone sonne ?",
  essaiAide:
    "Envoie une notification d’essai aux téléphones connectés. Elle vérifie " +
    "le côté téléphone — pas le terminal lui-même.",
  essaiBouton: "Envoyer un essai",
  essaiEnCours: "Envoi…",
  essaiTexte: "Ceci est un essai. Les notifications fonctionnent.",
  essaiReussi: "Envoyé. Votre téléphone devrait sonner dans quelques secondes.",
  essaiAucunAppareil:
    "Aucun téléphone n’est inscrit pour les notifications. Cela ne concerne " +
    "pas votre connexion — vous êtes bien connecté. Cela veut dire qu’aucun " +
    "téléphone n’a encore dit à la plateforme où sonner.",
  essaiDepuisNavigateur:
    "Un navigateur ne reçoit jamais ces notifications — seule l’application " +
    "TOTEM sur un téléphone les reçoit. Ouvrez l’application sur votre " +
    "téléphone, puis revenez ici.",
  essaiEchec: "Rien n’a pu être envoyé.",
  essaiOublies: "téléphone(s) retiré(s) : l’application n’y est plus installée.",

  sonnerieInscrit: "Ce téléphone sonnera.",
  sonnerieRefusee:
    "Les notifications sont désactivées pour TOTEM. Android ne le redemandera " +
    "pas — activez-les dans les réglages du téléphone.",
  sonnerieOuvrirReglages: "Ouvrir les réglages du téléphone",
  sonnerieSimulateur:
    "Cet appareil ne peut pas recevoir de notifications (pas de services Google).",
  sonnerieSansProjet:
    "Cette version n’est pas rattachée à son projet de notification. Il faut " +
    "la recompiler — rien à corriger d’ici.",
  sonnerieSansJeton:
    "Le service de notification n’a rien rendu. Vérifiez la connexion, puis " +
    "réessayez.",
  sonnerieEchec:
    "Le téléphone n’a pas pu être inscrit. Vérifiez la connexion, puis " +
    "réessayez.",
  sonnerieInscrire: "Inscrire ce téléphone",
  sonnerieEnCours: "Inscription…",
  securite: "Sécurité",
  motDePasse: "Changer le mot de passe",
  doubleAuth: "Double authentification",
  activee: "Activée",
  notePin:
    "Le code PIN Mobile Money n’est enregistré nulle part : il se saisit à chaque opération, puis disparaît.",

  langue: "Langue",
  langueActive: "Langue actuelle",
  noteLangue:
    "Tout l’écran suit — dates, montants, alertes. Ce que l’opérateur envoie n’est jamais traduit : mot pour mot, tel que la carte l’a reçu.",

  seDeconnecter: "Se déconnecter",
  deconnexion: "Déconnexion…",
};

export const textesReglages = { en, fr } as const;
