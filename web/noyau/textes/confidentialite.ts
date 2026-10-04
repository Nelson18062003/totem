// La politique de confidentialité — la page que l'App Store ET le Play Store
// exigent, à une adresse publique.
//
// Elle n'est pas une formalité juridique recopiée d'ailleurs : elle décrit
// ce que CETTE application fait, et rien d'autre. Un modèle générique dirait
// « nous pouvons collecter des données de localisation » alors que
// l'application n'y touche pas, et « nous utilisons des cookies » alors
// qu'elle n'en pose aucun. Écrire faux, même dans le sens de la prudence,
// c'est mentir à qui lit — et se contredire devant les deux formulaires des
// magasins (« Confidentialité de l'app » chez Apple, « Sécurité des données »
// chez Google), qui doivent correspondre au mot près.
//
// TOTEM EST UNE APPLICATION GRAND PUBLIC. N'importe qui crée son compte,
// puis TOTEM attribue à ce compte la ou les cartes SIM de la personne. La
// politique dit donc exactement ce que l'inscription demande (prénom, nom,
// adresse, courriel, téléphone, mot de passe), ce que les cartes apportent
// (leurs SMS), qui d'autre y a accès, et comment tout effacer — DANS
// l'application, comme Apple l'exige.
//
// Elle est PUBLIQUE, forcément : un examinateur l'ouvre sans compte.

const en = {
  titre: "Privacy Policy",
  maj: "Last updated: 4 October 2026",

  quoiTitre: "What TOTEM is",
  quoi:
    "TOTEM lets anyone reach their Mobile Money accounts — the ones tied to " +
    "their SIM cards — from wherever they are in the world. Your SIM card " +
    "sits in a TOTEM box (one of ours, or your own); the app on your iPhone " +
    "or Android phone shows what that card receives and sends the requests " +
    "you make to it. TOTEM is not a bank, a wallet or a payment service: no " +
    "money moves through it and it holds no funds. Your money stays with " +
    "your Mobile Money operator.",

  collecteTitre: "What we collect, and why",
  collecte:
    "Only what is needed to open your account, assign your card to you, and " +
    "show you what your card receives:",
  collecteListe: [
    ["First name and last name", "to know whose account it is, and to assign the right SIM card to the right person."],
    ["Postal address", "to send or collect your SIM card or TOTEM box, and to reach you about its installation."],
    ["Email address", "it is your sign-in identifier."],
    ["Phone number", "to reach you about your card and your account."],
    ["Password", "never stored as such: only a one-way fingerprint (PBKDF2) is kept, from which the password cannot be recovered."],
    ["The text messages of YOUR cards", "the messages your SIM cards receive in their TOTEM box (payments, balances, operator messages), and the requests you send (balance checks, USSD codes, the numbers and amounts you type). This is what the app shows you."],
    ["The beneficiaries you save", "the names and numbers you choose to keep for your transfers."],
    ["A notification token", "if you accept notifications, so that your phone can ring when money arrives. It identifies a device, not a person."],
    ["The date of your last sign-in", "to show you, and the TOTEM team, that an account is in use."],
  ] as [string, string][],
  collecteNon: [
    "No advertising, no advertising identifier, no tracking across apps or websites.",
    "No analytics, no usage measurement, no third-party SDK of that kind.",
    "No contacts, no location, no camera, no microphone, no photos, no files.",
    "No data is sold, rented or used to profile you.",
  ],

  smsTitre: "The app does not read the text messages on your phone",
  sms:
    "This deserves saying plainly, because a money app that shows text " +
    "messages invites the question. The messages you see are those received " +
    "by YOUR SIM cards, in their TOTEM box. The app on your phone requests no " +
    "SMS permission — iOS and Android would show it if it did — and could not " +
    "read the messages on your phone even if it wanted to.",

  accesTitre: "Who can see your cards",
  acces:
    "You see only the cards assigned to your account, and nothing else. The " +
    "TOTEM team, which runs the platform and the boxes, has access to every " +
    "card placed in a TOTEM box and to its messages: that is what allows it " +
    "to assign your card to your account, and to fix a box that stops " +
    "working. No one else does, apart from the services named below under " +
    "“Who else sees anything”.",

  permissionsTitre: "Permissions the app requests",
  permissions: [
    ["Notifications (iPhone and Android)", "to ring when money arrives. Refusing it changes nothing else."],
    ["Network state (Android)", "to know whether the phone is online before asking the platform."],
    ["Start after reboot (Android)", "so notifications still arrive after the phone restarts."],
  ],
  permissionsNote:
    "That is the whole list. The last two come with the notification library " +
    "on Android and are not used for anything else. On iPhone, notifications " +
    "are the only permission asked.",

  telephoneTitre: "What is stored on your phone",
  telephone: [
    ["The session token", "in the system keystore (Keychain on iPhone, Keystore on Android). It is what keeps you signed in. Signing out or deleting your account erases it."],
    ["The last figures you saw", "so the app can show them, marked as dated, when you are offline. They are erased when you sign out."],
  ],
  telephoneNote:
    "Your password is never stored on the phone — not in the keystore, not " +
    "anywhere. It leaves the screen the moment it is sent, and what comes " +
    "back is a token.",

  codeTitre: "The Mobile Money PIN",
  code:
    "It is never stored, never written into a message, never logged. It is " +
    "typed only at the moment of an operation, passes through the platform " +
    "only for the time the box needs to dial it to the operator, and is " +
    "erased as soon as the request is closed. No notification ever contains " +
    "it, or any one-time code.",

  tiersTitre: "Who else sees anything",
  tiers: [
    ["Apple (Apple Push Notification service), Google (Firebase Cloud Messaging) and Expo", "carry notifications to your phone. They therefore see the text of a notification, which can name an amount and the other party to a payment. This is the only way to ring a phone."],
    ["Supabase", "hosts the database: your account, the messages your cards received, the receipts."],
    ["Vercel", "hosts the platform the app talks to."],
    ["Telegram", "is the messaging service through which each TOTEM box reports to the team that runs it. A box sends a copy of every operator SMS it receives — one-time codes included — and of the PDF receipts to the private Telegram chat of whoever runs the box: the TOTEM team for a card placed with TOTEM, you if the box is your own. Telegram therefore carries those messages. It never receives your password or your Mobile Money PIN."],
  ],
  tiersNote:
    "Beyond the services above, nothing is sold, rented, or shared with " +
    "anyone. There is no advertising network, no data broker, no analytics " +
    "provider.",

  gardeTitre: "How long data is kept",
  garde:
    "Your account is kept until you delete it. The messages of a card stay " +
    "with that card while it is in a TOTEM box; when the card is withdrawn, " +
    "you can ask for them to be erased. A notification token is removed as " +
    "soon as the notification service reports the app is no longer installed.",

  supprimerTitre: "Deleting your account",
  supprimer:
    "You can delete your account at any time, yourself, in the app: Settings " +
    "→ Delete my account. You can also do it from the web page linked below, " +
    "or by writing to us. Your account, your personal details, your card " +
    "assignments and your notification tokens are erased at once, and your " +
    "session stops working.",
  supprimerLien: "Delete your account, step by step.",

  contactTitre: "Contact",
  contact: "Questions about this policy:",
  contactSansAdresse:
    "Use the developer email address shown on TOTEM’s App Store or " +
    "Google Play listing, under “App support”.",
};

const fr: typeof en = {
  titre: "Politique de confidentialité",
  maj: "Dernière mise à jour : 4 octobre 2026",

  quoiTitre: "Ce qu’est TOTEM",
  quoi:
    "TOTEM permet à chacun d’atteindre ses comptes Mobile Money — ceux de " +
    "ses cartes SIM — d’où qu’il soit dans le monde. Votre carte SIM est " +
    "placée dans un boîtier TOTEM (l’un des nôtres, ou le vôtre) ; " +
    "l’application, sur iPhone ou sur Android, montre ce que cette carte " +
    "reçoit et lui transmet les demandes que vous faites. TOTEM n’est ni une " +
    "banque, ni un portefeuille, ni un service de paiement : aucun argent n’y " +
    "transite et elle ne détient aucun fonds. Votre argent reste chez votre " +
    "opérateur Mobile Money.",

  collecteTitre: "Ce que nous collectons, et pourquoi",
  collecte:
    "Seulement ce qu’il faut pour ouvrir votre compte, vous attribuer votre " +
    "carte et vous montrer ce qu’elle reçoit :",
  collecteListe: [
    ["Le prénom et le nom", "pour savoir à qui est le compte, et attribuer la bonne carte SIM à la bonne personne."],
    ["L’adresse postale", "pour envoyer ou récupérer votre carte SIM ou votre boîtier TOTEM, et vous joindre pour son installation."],
    ["L’adresse électronique", "c’est votre identifiant de connexion."],
    ["Le numéro de téléphone", "pour vous joindre au sujet de votre carte et de votre compte."],
    ["Le mot de passe", "jamais enregistré tel quel : seule une empreinte à sens unique (PBKDF2) est gardée, dont on ne peut pas retrouver le mot de passe."],
    ["Les SMS de VOS cartes", "les messages que vos cartes SIM reçoivent dans leur boîtier TOTEM (paiements, soldes, messages de l’opérateur), et les demandes que vous envoyez (consultations de solde, codes USSD, numéros et montants que vous tapez). C’est ce que l’application vous montre."],
    ["Les bénéficiaires que vous enregistrez", "les noms et numéros que vous choisissez de garder pour vos transferts."],
    ["Un jeton de notification", "si vous acceptez les notifications, pour que votre téléphone sonne quand de l’argent arrive. Il identifie un appareil, pas une personne."],
    ["La date de votre dernière connexion", "pour montrer, à vous et à l’équipe TOTEM, qu’un compte est utilisé."],
  ] as [string, string][],
  collecteNon: [
    "Aucune publicité, aucun identifiant publicitaire, aucun pistage d’une application ou d’un site à l’autre.",
    "Aucune mesure d’audience, aucun suivi d’usage, aucun mouchard.",
    "Ni contacts, ni position, ni appareil photo, ni micro, ni photos, ni fichiers.",
    "Aucune donnée n’est vendue, louée, ni utilisée pour vous profiler.",
  ],

  smsTitre: "L’application ne lit pas les SMS de votre téléphone",
  sms:
    "Cela mérite d’être dit franchement, parce qu’une application d’argent " +
    "qui affiche des SMS appelle la question. Les messages que vous voyez sont " +
    "ceux que reçoivent VOS cartes SIM, dans leur boîtier TOTEM. L’application " +
    "de votre téléphone ne demande aucune autorisation SMS — iOS et Android " +
    "l’afficheraient si elle le faisait — et ne pourrait pas lire les messages " +
    "de votre téléphone même si elle le voulait.",

  accesTitre: "Qui peut voir vos cartes",
  acces:
    "Vous ne voyez que les cartes attribuées à votre compte, et rien d’autre. " +
    "L’équipe TOTEM, qui fait fonctionner la plateforme et les boîtiers, a " +
    "accès à toutes les cartes placées dans un boîtier TOTEM et à leurs " +
    "messages : c’est ce qui lui permet d’attribuer votre carte à votre " +
    "compte, et de réparer un boîtier qui ne répond plus. Personne d’autre, " +
    "hormis les services nommés plus bas, sous « Qui d’autre voit quelque " +
    "chose ».",

  permissionsTitre: "Les autorisations demandées",
  permissions: [
    ["Notifications (iPhone et Android)", "pour sonner quand de l’argent arrive. Refuser ne change rien d’autre."],
    ["État du réseau (Android)", "pour savoir si le téléphone est en ligne avant d’interroger la plateforme."],
    ["Démarrer après un redémarrage (Android)", "pour que les notifications arrivent encore après un redémarrage."],
  ],
  permissionsNote:
    "C’est toute la liste. Les deux dernières viennent avec la bibliothèque " +
    "de notifications sur Android et ne servent à rien d’autre. Sur iPhone, " +
    "les notifications sont la seule autorisation demandée.",

  telephoneTitre: "Ce qui est rangé sur votre téléphone",
  telephone: [
    ["Le jeton de session", "dans le coffre du système (le trousseau sur iPhone, le Keystore sur Android). C’est lui qui vous garde connecté. La déconnexion ou la suppression du compte l’efface."],
    ["Les derniers chiffres affichés", "pour les montrer, marqués comme datés, quand vous êtes hors ligne. Ils s’effacent à la déconnexion."],
  ],
  telephoneNote:
    "Votre mot de passe n’est jamais rangé sur le téléphone — ni dans le " +
    "coffre, ni ailleurs. Il quitte l’écran au moment de l’envoi, et ce qui " +
    "revient est un jeton.",

  codeTitre: "Le code secret Mobile Money",
  code:
    "Il n’est jamais enregistré, jamais écrit dans un message, jamais " +
    "journalisé. Il ne se saisit qu’au moment d’une opération, ne passe par la " +
    "plateforme que le temps que le boîtier le compose chez l’opérateur, et " +
    "s’efface dès que la demande est close. Aucune notification ne le " +
    "contient, ni aucun code à usage unique.",

  tiersTitre: "Qui d’autre voit quelque chose",
  tiers: [
    ["Apple (service de notifications d’Apple), Google (Firebase Cloud Messaging) et Expo", "acheminent les notifications jusqu’à votre téléphone. Ils voient donc le texte d’une notification, qui peut nommer un montant et l’autre partie d’un paiement. C’est le seul chemin pour faire sonner un téléphone."],
    ["Supabase", "héberge la base de données : votre compte, les messages reçus par vos cartes, les reçus."],
    ["Vercel", "héberge la plateforme à laquelle l’application parle."],
    ["Telegram", "est la messagerie par laquelle chaque boîtier TOTEM rend compte à qui le fait fonctionner. Un boîtier envoie une copie de chaque SMS d’opérateur qu’il reçoit — codes à usage unique compris — et des reçus PDF dans la discussion Telegram privée de celui qui tient le boîtier : l’équipe TOTEM pour une carte confiée à TOTEM, vous-même si le boîtier est le vôtre. Telegram transporte donc ces messages. Il ne reçoit jamais votre mot de passe ni votre code secret Mobile Money."],
  ],
  tiersNote:
    "En dehors des services ci-dessus, rien n’est vendu, loué, ni partagé " +
    "avec qui que ce soit. Aucune régie publicitaire, aucun courtier en " +
    "données, aucun outil de mesure.",

  gardeTitre: "Combien de temps les données sont gardées",
  garde:
    "Votre compte est gardé jusqu’à ce que vous le supprimiez. Les messages " +
    "d’une carte restent avec cette carte tant qu’elle est dans un boîtier " +
    "TOTEM ; quand la carte est retirée, vous pouvez en demander l’effacement. " +
    "Un jeton de notification est retiré dès que le service de notification " +
    "signale que l’application n’est plus installée.",

  supprimerTitre: "Supprimer votre compte",
  supprimer:
    "Vous pouvez supprimer votre compte à tout moment, vous-même, dans " +
    "l’application : Réglages → Supprimer mon compte. Vous pouvez aussi le " +
    "faire depuis la page web ci-dessous, ou en nous écrivant. Votre compte, " +
    "vos informations personnelles, les attributions de vos cartes et vos " +
    "jetons de notification sont effacés aussitôt, et votre session cesse de " +
    "fonctionner.",
  supprimerLien: "Supprimer votre compte, pas à pas.",

  contactTitre: "Contact",
  contact: "Questions sur cette politique :",
  contactSansAdresse:
    "Utilisez l’adresse du développeur affichée sur la fiche " +
    "App Store ou Google Play de TOTEM, à la rubrique « Assistance ».",
};

export const textesConfidentialite = { en, fr } as const;
