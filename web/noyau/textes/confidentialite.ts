// La politique de confidentialité — la page que Google Play EXIGE.
//
// Elle n'est pas une formalité juridique recopiée d'ailleurs : elle décrit
// ce que CETTE application fait, et rien d'autre. Un modèle générique dirait
// « nous pouvons collecter des données de localisation » alors que
// l'application n'y touche pas, et « nous utilisons des cookies » alors
// qu'elle n'en pose aucun. Écrire faux, même dans le sens de la prudence,
// c'est mentir à qui lit — et se contredire soi-même devant le formulaire
// « Sécurité des données » du Play Store, qui doit correspondre au mot près.
//
// Elle est PUBLIQUE, forcément : un examinateur du Play Store l'ouvre sans
// compte. C'est la seule page de la plateforme dans ce cas avec la connexion.

const en = {
  titre: "Privacy Policy",
  maj: "Last updated: 29 August 2026",

  quoiTitre: "What TOTEM is",
  quoi:
    "TOTEM lets one person — the owner of the Mobile Money SIM cards — manage " +
    "those cards from a screen instead of from USSD menus. The SIMs sit in a " +
    "terminal wherever the owner keeps it; the app is an interface onto that " +
    "terminal. It is not a payment service, a wallet, or a bank: no money " +
    "moves through it, and it holds no funds.",

  collecteTitre: "What the app collects about you",
  collecte:
    "Nothing, apart from one thing: if you accept notifications, the app asks " +
    "Android for a notification token and sends it to the platform, so the " +
    "terminal knows which phone to ring. That token identifies a device, not " +
    "a person. It says nothing about you, cannot locate you, and opens access " +
    "to nothing.",
  collecteListe: [
    "No advertising, no advertising identifier.",
    "No analytics, no usage tracking, no third-party SDK of that kind.",
    "No contacts, no location, no camera, no microphone, no files.",
    "No account is created for anyone but the terminal's owner.",
  ],

  smsTitre: "The app does not read your text messages",
  sms:
    "This deserves saying plainly, because a money app that shows text " +
    "messages invites the question. The messages you see come from the modem " +
    "in that terminal, which receives them on its own SIM cards. The app requests no " +
    "SMS permission — Android would show it if it did — and could not read " +
    "the messages on your phone even if it wanted to.",

  permissionsTitre: "Permissions the app requests",
  permissions: [
    ["Notifications", "to ring when money arrives. Refusing it changes nothing else."],
    ["Network state", "to know whether the phone is online before asking the platform."],
    ["Start after reboot", "so notifications still arrive after the phone restarts."],
  ],
  permissionsNote:
    "That is the whole list. The last two come with the notification library " +
    "and are not used for anything else.",

  telephoneTitre: "What is stored on your phone",
  telephone: [
    ["The session token", "in the system keystore — the one your fingerprint or face unlocks. It is what keeps you signed in. Signing out erases it."],
    ["Your platform's address", "in ordinary storage. A web address is not a secret."],
  ],
  telephoneNote:
    "Your password is never stored on the phone — not in the keystore, not " +
    "anywhere. It leaves the screen the moment it is sent, and what comes " +
    "back is a token.",

  codeTitre: "The Mobile Money PIN",
  code:
    "It is never stored, never written into a message, never logged. It is " +
    "typed only at the moment of an operation, travels straight to the " +
    "operator through the terminal, and is kept nowhere afterwards. No " +
    "notification ever contains it, or any one-time code: those are shown as " +
    "“a code arrived”, without a single digit.",

  tiersTitre: "Who else sees anything",
  tiers: [
    ["Expo and Google (Firebase Cloud Messaging)", "carry notifications to your phone. They therefore see the text of a notification, which can name an amount and the other party to a payment. This is the only way to ring an Android phone; there is no alternative that avoids it."],
    ["Supabase", "hosts the database: the messages the terminal has received, the cards, the receipts."],
    ["Vercel", "hosts the platform the app talks to."],
  ],
  tiersNote:
    "Nothing is sold, rented, or shared with anyone else. There is no " +
    "advertising network, no data broker, no analytics provider.",

  gardeTitre: "How long data is kept",
  garde:
    "Payment records and receipts stay as long as the owner keeps them: they " +
    "are their own business records. A notification token is removed as soon " +
    "as the notification service reports the app is no longer installed. " +
    "Signing out erases the session on the phone immediately.",

  supprimerTitre: "Deleting your data",
  supprimer:
    "The owner can empty the database at any time from the Supabase project, " +
    "or ask for it at the address below. Uninstalling the app removes " +
    "everything it kept on the phone.",
  supprimerLien: "The whole procedure, step by step: delete your account and data.",

  contactTitre: "Contact",
  contact: "Questions about this policy:",
  contactSansAdresse:
    "Use the developer email address shown on this app\u2019s Google Play " +
    "listing, under \u201cApp support\u201d.",
};

const fr: typeof en = {
  titre: "Politique de confidentialité",
  maj: "Dernière mise à jour : 29 août 2026",

  quoiTitre: "Ce qu’est TOTEM",
  quoi:
    "TOTEM permet à une personne — le propriétaire des cartes SIM Mobile " +
    "Money — de gérer ces cartes depuis un écran plutôt que depuis des menus " +
    "USSD. Les SIM sont dans un terminal, là où le propriétaire le garde ; " +
    "l’application est une interface sur ce terminal. Ce n’est ni un service " +
    "de paiement, ni un portefeuille, ni une banque : aucun argent n’y " +
    "transite, et elle ne détient aucun fonds.",

  collecteTitre: "Ce que l’application collecte sur vous",
  collecte:
    "Rien, à une chose près : si vous acceptez les notifications, " +
    "l’application demande à Android un jeton de notification et l’envoie à " +
    "la plateforme, pour que le terminal sache quel téléphone faire sonner. " +
    "Ce jeton identifie un appareil, pas une personne. Il ne dit rien de " +
    "vous, ne permet pas de vous localiser, et n’ouvre l’accès à rien.",
  collecteListe: [
    "Aucune publicité, aucun identifiant publicitaire.",
    "Aucune mesure d’audience, aucun suivi d’usage, aucun mouchard.",
    "Ni contacts, ni position, ni appareil photo, ni micro, ni fichiers.",
    "Aucun compte n’est créé pour quelqu’un d’autre que le propriétaire.",
  ],

  smsTitre: "L’application ne lit pas vos SMS",
  sms:
    "Cela mérite d’être dit franchement, parce qu’une application d’argent " +
    "qui affiche des SMS appelle la question. Les messages que vous voyez " +
    "viennent du modem de ce terminal, qui les reçoit sur ses propres cartes SIM. " +
    "L’application ne demande aucune autorisation SMS — Android l’afficherait " +
    "si elle le faisait — et ne pourrait pas lire les messages de votre " +
    "téléphone même si elle le voulait.",

  permissionsTitre: "Les autorisations demandées",
  permissions: [
    ["Notifications", "pour sonner quand de l’argent arrive. Refuser ne change rien d’autre."],
    ["État du réseau", "pour savoir si le téléphone est en ligne avant d’interroger la plateforme."],
    ["Démarrer après un redémarrage", "pour que les notifications arrivent encore après un redémarrage."],
  ],
  permissionsNote:
    "C’est toute la liste. Les deux dernières viennent avec la bibliothèque " +
    "de notifications et ne servent à rien d’autre.",

  telephoneTitre: "Ce qui est rangé sur votre téléphone",
  telephone: [
    ["Le jeton de session", "dans le coffre du système — celui qu’ouvre votre doigt ou votre visage. C’est lui qui vous garde connecté. La déconnexion l’efface."],
    ["L’adresse de votre plateforme", "dans un rangement ordinaire. Une adresse web n’est pas un secret."],
  ],
  telephoneNote:
    "Votre mot de passe n’est jamais rangé sur le téléphone — ni dans le " +
    "coffre, ni ailleurs. Il quitte l’écran au moment de l’envoi, et ce qui " +
    "revient est un jeton.",

  codeTitre: "Le code PIN Mobile Money",
  code:
    "Il n’est jamais enregistré, jamais écrit dans un message, jamais " +
    "journalisé. Il ne se saisit qu’au moment d’une opération, part droit " +
    "chez l’opérateur par le terminal, et n’est conservé nulle part ensuite. " +
    "Aucune notification ne le contient, ni aucun code à usage unique : " +
    "ceux-là s’affichent en « un code est arrivé », sans un chiffre.",

  tiersTitre: "Qui d’autre voit quelque chose",
  tiers: [
    ["Expo et Google (Firebase Cloud Messaging)", "acheminent les notifications jusqu’à votre téléphone. Ils voient donc le texte d’une notification, qui peut nommer un montant et l’autre partie d’un paiement. C’est le seul chemin pour faire sonner un téléphone Android ; il n’existe pas d’alternative qui l’évite."],
    ["Supabase", "héberge la base de données : les messages reçus par le terminal, les cartes, les reçus."],
    ["Vercel", "héberge la plateforme à laquelle l’application parle."],
  ],
  tiersNote:
    "Rien n’est vendu, loué, ni partagé avec qui que ce soit d’autre. Aucune " +
    "régie publicitaire, aucun courtier en données, aucun outil de mesure.",

  gardeTitre: "Combien de temps les données sont gardées",
  garde:
    "Les paiements et les reçus restent tant que le propriétaire les garde : " +
    "ce sont ses propres écritures. Un jeton de notification est retiré dès " +
    "que le service de notification signale que l’application n’est plus " +
    "installée. La déconnexion efface la session du téléphone aussitôt.",

  supprimerTitre: "Supprimer vos données",
  supprimer:
    "Le propriétaire peut vider la base à tout moment depuis le projet " +
    "Supabase, ou en faire la demande à l’adresse ci-dessous. Désinstaller " +
    "l’application retire tout ce qu’elle gardait sur le téléphone.",
  supprimerLien: "La marche à suivre, pas à pas : supprimer votre compte et vos données.",

  contactTitre: "Contact",
  contact: "Questions sur cette politique :",
  contactSansAdresse:
    "Utilisez l\u2019adresse du d\u00e9veloppeur affich\u00e9e sur la fiche Google Play " +
    "de cette application, \u00e0 la rubrique \u00ab Assistance \u00bb.",
};

export const textesConfidentialite = { en, fr } as const;
