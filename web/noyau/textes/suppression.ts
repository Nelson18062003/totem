// La page « Supprimer vos données » — celle que Google Play réclame à une
// adresse publique, à côté de la politique de confidentialité.
//
// Google en attend trois choses, et le formulaire refuse le lien s'il en
// manque une :
//   1. qu'elle nomme l'application ou l'éditeur affiché sur la fiche ;
//   2. qu'elle décrive la MARCHE À SUIVRE pour demander la suppression ;
//   3. qu'elle dise ce qui est effacé, ce qui est gardé, et combien de temps.
//
// Elle ne promet donc rien de générique. Chaque ligne ci-dessous correspond à
// une chose que la plateforme fait vraiment — sans quoi on écrirait un
// engagement qu'on ne tiendrait pas, sous une adresse publique.

const en = {
  titre: "Deleting your TOTEM account and data",
  maj: "Last updated: 30 August 2026",

  appliTitre: "Which app this is about",
  appli:
    "This page covers TOTEM, the Android app published under the package " +
    "name com.bonzinilabs.totem, and the platform it connects to. It is the " +
    "same app you see on Google Play under the name TOTEM.",

  commentTitre: "How to ask for your account and data to be deleted",
  comment:
    "Send an email to the address at the bottom of this page, from the email " +
    "address your TOTEM account uses, with the word DELETE in the subject " +
    "line. Nothing else is needed: the address you write from is what " +
    "identifies the account.",
  commentEtapes: [
    "Write from the email address of the account you want deleted.",
    "Subject line: DELETE.",
    "You get a reply confirming the deletion, or asking one question if the " +
      "address matches no account.",
    "The account and everything attached to it are gone within 30 days, and " +
      "usually within a few days.",
  ],
  commentNote:
    "There is no form to fill in and no account needed to ask. If you can no " +
    "longer sign in, write anyway from the address you used — that is enough.",

  effaceTitre: "What is deleted",
  efface: [
    ["Your account", "the email address, the password fingerprint, the role, and the date it was created. The password itself was never stored, so there is nothing there to delete."],
    ["Your notification tokens", "the identifiers that let the terminal ring your phone. Every token registered by your phone is removed, and your phone stops receiving notifications immediately."],
    ["Your session", "any session still open in your name stops working at once."],
  ],
  effaceNote:
    "Nothing is kept in a backup copy for later re-use: deletion is a delete, " +
    "not a flag. Uninstalling the app also removes everything it kept on the " +
    "phone, including the session in the system keystore.",

  gardeTitre: "What is kept, and for how long",
  garde: [
    ["The terminal's own records", "the text messages the SIM cards received, the payments, the receipts. These belong to the owner of those SIM cards — they are their business records, not personal data about you, and they are not deleted by your request. They contain no account of yours."],
    ["Server logs", "the hosting providers keep ordinary access logs for a short period on their own schedule. They hold no account data and are not searchable by us."],
  ],
  gardeNote:
    "If you are the owner of the terminal and want those records gone too, " +
    "say so in the same email: the whole database can be emptied.",

  contactTitre: "Where to write",
  contact: "Send your deletion request to:",
  contactSansAdresse:
    "Use the developer email address shown on this app's Google Play listing, " +
    "under “App support”.",
  voirAussi: "See also the full privacy policy.",
};

const fr: typeof en = {
  titre: "Supprimer votre compte TOTEM et vos données",
  maj: "Dernière mise à jour : 30 août 2026",

  appliTitre: "De quelle application il s'agit",
  appli:
    "Cette page concerne TOTEM, l'application Android publiée sous le nom de " +
    "paquet com.bonzinilabs.totem, et la plateforme à laquelle elle se " +
    "connecte. C'est la même application que celle affichée sur Google Play " +
    "sous le nom TOTEM.",

  commentTitre: "Comment demander la suppression de votre compte et de vos données",
  comment:
    "Écrivez à l'adresse indiquée en bas de cette page, depuis l'adresse " +
    "électronique de votre compte TOTEM, avec le mot SUPPRIMER en objet. " +
    "Rien d'autre n'est demandé : l'adresse d'où vous écrivez suffit à " +
    "identifier le compte.",
  commentEtapes: [
    "Écrivez depuis l'adresse électronique du compte à supprimer.",
    "Objet du message : SUPPRIMER.",
    "Vous recevez une réponse qui confirme la suppression, ou qui pose une " +
      "question si l'adresse ne correspond à aucun compte.",
    "Le compte et tout ce qui s'y rattache disparaissent sous 30 jours, et " +
      "en général sous quelques jours.",
  ],
  commentNote:
    "Il n'y a pas de formulaire à remplir, et il n'est pas nécessaire d'avoir " +
    "un compte ouvert pour demander. Si vous n'arrivez plus à vous connecter, " +
    "écrivez quand même depuis l'adresse que vous utilisiez : cela suffit.",

  effaceTitre: "Ce qui est effacé",
  efface: [
    ["Votre compte", "l'adresse électronique, l'empreinte du mot de passe, le rôle, la date de création. Le mot de passe lui-même n'a jamais été enregistré : il n'y a rien à en effacer."],
    ["Vos jetons de notification", "les identifiants qui permettent au terminal de faire sonner votre téléphone. Chaque jeton déposé par votre téléphone est retiré, et le téléphone cesse aussitôt de recevoir des notifications."],
    ["Votre session", "toute session encore ouverte à votre nom cesse de fonctionner immédiatement."],
  ],
  effaceNote:
    "Rien n'est conservé dans une copie de secours en vue d'un réemploi : une " +
    "suppression efface, elle ne marque pas. Désinstaller l'application " +
    "retire par ailleurs tout ce qu'elle gardait sur le téléphone, y compris " +
    "la session rangée dans le coffre du système.",

  gardeTitre: "Ce qui est gardé, et combien de temps",
  garde: [
    ["Les écritures du terminal", "les SMS reçus par les cartes SIM, les paiements, les reçus. Ils appartiennent au propriétaire de ces cartes — ce sont ses propres écritures, pas des données personnelles vous concernant, et votre demande ne les efface pas. Ils ne contiennent aucun compte à vous."],
    ["Les journaux des serveurs", "les hébergeurs gardent des journaux d'accès ordinaires pendant une courte période, selon leur propre règle. Ils ne contiennent aucune donnée de compte et nous ne pouvons pas y chercher."],
  ],
  gardeNote:
    "Si vous êtes le propriétaire du terminal et voulez aussi voir " +
    "disparaître ces écritures, dites-le dans le même message : la base peut " +
    "être vidée entièrement.",

  contactTitre: "À qui écrire",
  contact: "Adressez votre demande de suppression à :",
  contactSansAdresse:
    "Utilisez l'adresse du développeur affichée sur la fiche Google Play de " +
    "cette application, à la rubrique « Assistance ».",
  voirAussi: "Voir aussi la politique de confidentialité complète.",
};

export const textesSuppression = { en, fr } as const;
