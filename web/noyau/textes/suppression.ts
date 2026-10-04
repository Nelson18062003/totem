// La page « Supprimer votre compte » — celle que les magasins réclament à une
// adresse publique, à côté de la politique de confidentialité.
//
// Apple exige que toute application où l'on crée un compte permette de le
// supprimer DANS l'application. Google exige en plus une adresse web où l'on
// lit la marche à suivre, et le formulaire « Sécurité des données » refuse le
// lien s'il manque l'une de ces trois choses :
//   1. le nom de l'application ou de l'éditeur affiché sur la fiche ;
//   2. la MARCHE À SUIVRE pour supprimer ;
//   3. ce qui est effacé, ce qui est gardé, et combien de temps.
//
// Elle ne promet donc rien de générique. Chaque ligne correspond à une chose
// que la plateforme fait vraiment (`POST /api/moi/suppression`, et l'effacement
// en cascade de la base) — sans quoi on écrirait, sous une adresse publique,
// un engagement qu'on ne tiendrait pas.
//
// La page porte AUSSI un formulaire : on peut supprimer son compte d'ici,
// sans l'application, avec son courriel et son mot de passe.

const en = {
  titre: "Deleting your TOTEM account",
  maj: "Last updated: 4 October 2026",

  appliTitre: "Which app this is about",
  appli:
    "This page covers TOTEM, the app published by Bonzinilabs on the App " +
    "Store (iPhone) and on Google Play (Android) under the name TOTEM — " +
    "bundle and package name com.bonzinilabs.totem — and the platform it " +
    "connects to.",

  commentTitre: "How to delete your account",
  comment: "Three ways, all of them final:",
  commentEtapes: [
    "In the app, on iPhone or Android: Settings → Delete my account. Type your password to confirm. The account is deleted at once.",
    "On this page: enter your email and your password in the form below.",
    "If you can no longer sign in: write to the address at the bottom of this page, from the email address of your account, with the word DELETE in the subject line. The account is deleted within 30 days, usually within a few days.",
  ],
  commentNote:
    "The owner account of the TOTEM platform and the demo account cannot be " +
    "deleted this way.",

  formulaireTitre: "Delete my account now",
  formulaireAide:
    "This cannot be undone. Your account and your personal details are " +
    "erased immediately.",
  courriel: "Email",
  motDePasse: "Password",
  confirmer: "Delete my account permanently",
  enCours: "Deleting…",
  fait:
    "Your account has been deleted. Your personal details, your card " +
    "assignments and your notification tokens are gone.",
  impossible: "The account could not be deleted right now. Try again.",

  effaceTitre: "What is deleted, immediately",
  efface: [
    ["Your account", "your first name, last name, postal address, email address, phone number, the password fingerprint and the date of your last sign-in. The password itself was never stored."],
    ["Your card assignments", "the link between your account and your SIM cards: no one can see them through your account any more."],
    ["Your notification tokens", "every token registered by your phones is removed, and they stop receiving notifications."],
    ["Your session", "any session still open in your name stops working at once, on every phone and browser."],
  ],
  effaceNote:
    "Nothing is kept in a backup copy for later re-use: deletion is a delete, " +
    "not a flag. Uninstalling the app also removes everything it kept on the " +
    "phone, including the session in the system keystore.",

  gardeTitre: "What is kept, and for how long",
  garde: [
    ["The messages of your SIM cards", "they belong to the CARD, not to the account: as long as the card stays in a TOTEM box, its messages, receipts and saved beneficiaries stay with it. To have the card withdrawn and its messages erased too, say so by email (address below): it is done within 30 days."],
    ["Server logs", "the hosting providers keep ordinary access logs for a short period on their own schedule. They hold no account data."],
  ],
  gardeNote: "",

  contactTitre: "Where to write",
  contact: "Send your deletion request to:",
  contactSansAdresse:
    "Use the developer email address shown on TOTEM's App Store or Google " +
    "Play listing, under “App support”.",
  voirAussi: "See also the full privacy policy.",
};

const fr: typeof en = {
  titre: "Supprimer votre compte TOTEM",
  maj: "Dernière mise à jour : 4 octobre 2026",

  appliTitre: "De quelle application il s’agit",
  appli:
    "Cette page concerne TOTEM, l’application publiée par Bonzinilabs sur " +
    "l’App Store (iPhone) et sur Google Play (Android) sous le nom TOTEM — " +
    "identifiant com.bonzinilabs.totem — et la plateforme à laquelle elle se " +
    "connecte.",

  commentTitre: "Comment supprimer votre compte",
  comment: "Trois façons, toutes définitives :",
  commentEtapes: [
    "Dans l’application, sur iPhone ou Android : Réglages → Supprimer mon compte. Tapez votre mot de passe pour confirmer. Le compte est supprimé aussitôt.",
    "Sur cette page : entrez votre courriel et votre mot de passe dans le formulaire ci-dessous.",
    "Si vous ne pouvez plus vous connecter : écrivez à l’adresse en bas de cette page, depuis l’adresse électronique de votre compte, avec le mot SUPPRIMER en objet. Le compte est supprimé sous 30 jours, en général sous quelques jours.",
  ],
  commentNote:
    "Le compte du propriétaire de la plateforme TOTEM et le compte de " +
    "démonstration ne se suppriment pas par ce chemin.",

  formulaireTitre: "Supprimer mon compte maintenant",
  formulaireAide:
    "C’est définitif. Votre compte et vos informations personnelles sont " +
    "effacés immédiatement.",
  courriel: "Courriel",
  motDePasse: "Mot de passe",
  confirmer: "Supprimer définitivement mon compte",
  enCours: "Suppression…",
  fait:
    "Votre compte a été supprimé. Vos informations personnelles, les " +
    "attributions de vos cartes et vos jetons de notification ont disparu.",
  impossible: "Le compte n’a pas pu être supprimé pour l’instant. Réessayez.",

  effaceTitre: "Ce qui est effacé, immédiatement",
  efface: [
    ["Votre compte", "votre prénom, votre nom, votre adresse postale, votre adresse électronique, votre numéro de téléphone, l’empreinte du mot de passe et la date de votre dernière connexion. Le mot de passe lui-même n’a jamais été enregistré."],
    ["Les attributions de vos cartes", "le lien entre votre compte et vos cartes SIM : plus personne ne les voit à travers votre compte."],
    ["Vos jetons de notification", "chaque jeton déposé par vos téléphones est retiré, et ils cessent de recevoir des notifications."],
    ["Votre session", "toute session encore ouverte à votre nom cesse de fonctionner aussitôt, sur chaque téléphone et chaque navigateur."],
  ],
  effaceNote:
    "Rien n’est conservé dans une copie de secours en vue d’un réemploi : une " +
    "suppression efface, elle ne marque pas. Désinstaller l’application " +
    "retire par ailleurs tout ce qu’elle gardait sur le téléphone, y compris " +
    "la session rangée dans le coffre du système.",

  gardeTitre: "Ce qui est gardé, et combien de temps",
  garde: [
    ["Les messages de vos cartes SIM", "ils suivent la CARTE, pas le compte : tant que la carte reste dans un boîtier TOTEM, ses messages, ses reçus et ses bénéficiaires enregistrés restent avec elle. Pour faire retirer la carte et effacer aussi ses messages, dites-le par courriel (adresse ci-dessous) : c’est fait sous 30 jours."],
    ["Les journaux des serveurs", "les hébergeurs gardent des journaux d’accès ordinaires pendant une courte période, selon leur propre règle. Ils ne contiennent aucune donnée de compte."],
  ],
  gardeNote: "",

  contactTitre: "À qui écrire",
  contact: "Adressez votre demande à :",
  contactSansAdresse:
    "Utilisez l’adresse du développeur affichée sur la fiche App Store ou " +
    "Google Play de TOTEM, à la rubrique « Assistance ».",
  voirAussi: "Voir aussi la politique de confidentialité complète.",
};

export const textesSuppression = { en, fr } as const;
