// Les textes de « je n'arrive plus à entrer ».
//
// Cet écran s'ouvre en panique, souvent depuis le téléphone d'un proche, par
// quelqu'un qui vient peut-être de se faire arracher le sien. Deux règles ont
// écrit chaque phrase :
//
// · FERMER VIENT AVANT RENTRER. La première chose dont cette personne a
//   besoin, ce n'est pas d'entrer — c'est que l'autre SORTE.
// · ON NE PROMET PAS CE QU'UNE MACHINE NE SAIT PAS FAIRE. Quand les trois
//   chemins sont morts, l'écran le dit et donne le nom de qui appeler, avec la
//   phrase à lui dire. Un « adressez-vous à l'assistance » sans nom ni phrase,
//   c'est « débrouillez-vous » écrit poliment.

const en = {
  titre: "You can't get in",
  sousTitre:
    "Two different problems, and they are not solved in the same order. "
    + "Close first, then come back.",

  // --- 1 · fermer ----------------------------------------------------------
  fermerSurtitre: "If your phone is in someone else's hands",
  fermerTitre: "Close everything, everywhere",
  fermerQuoi:
    "Every phone and every computer where this account is open is signed out "
    + "at once. Your receipts, your balances and your money are untouched — "
    + "and your Mobile Money PIN was never here for anyone to take.",
  fermerSansPreuve:
    "We ask you for no password and no code. Closing a door has never hurt "
    + "anyone: at worst, a wrongly closed account costs one sign-in.",
  fermerAdresse: "Your email address",
  fermerExemple: "you@example.cm",
  fermerBouton: "Send me the link that closes everything",
  fermerEnvoi: "Sending…",
  // Pourquoi un lien plutôt qu'un bouton : dit sous le bouton, parce que c'est
  // la question qu'on se pose en le regardant.
  fermerPourquoiUnLien:
    "Not a plain button: a button would let anyone close anyone, just by "
    + "knowing a name. The link goes to the address itself, so the person who "
    + "closes is the person whose account it is.",
  fermerEnvoye:
    "If that address has an account on TOTEM, the link is on its way. It is "
    + "good for one hour, and it works once.",
  fermerNeDitPas:
    "This screen says exactly the same thing whether or not the address is "
    + "known here. Nobody should be able to find out who runs a TOTEM by "
    + "typing addresses into it.",
  fermerRate:
    "The request did not leave this phone. Check the connection, and try "
    + "again — nothing has been closed yet.",

  // --- 2 · rentrer ---------------------------------------------------------
  rentrerTitre: "Then, getting back in",
  rentrerSousTitre:
    "Three ways. Which one is yours depends on what you still have in your "
    + "hands.",
  voies: {
    telephone: {
      nom: "Your phone's lock",
      quand: "If you still have the phone",
      dit: "Your fingerprint or your face, and you are in. Nothing to type, "
        + "nothing to wait for, no network to hope for.",
    },
    courriel: {
      nom: "A code by email",
      quand: "If you can open your mailbox",
      dit: "Six digits land in your inbox, good for ten minutes and for one "
        + "sign-in. This is the way on a borrowed phone, or on a new one.",
    },
    papier: {
      nom: "The paper with ten codes",
      quand: "If you have neither the phone nor the mailbox",
      dit: "One of the ten codes you printed and keep away from the shop. "
        + "Each one works once. This is the way when the phone was stolen "
        + "with your mailbox open inside it.",
    },
  },
  allerEntrer: "Go to the sign-in screen",

  // --- 3 · le recours humain ----------------------------------------------
  humainTitre: "And if none of the three works",
  humainDit:
    "Then no screen can bring you back, and pretending otherwise would only "
    + "cost you your evening. Tell the person who gave you the key — the "
    + "owner of the shop. She sees who you are and what you are asking, and "
    + "she opens the door again from her own phone.",
  humainQuoiDireTitre: "What to tell her",
  humainQuoiDire:
    "Your name, which shop, and that you have lost both the phone and the "
    + "paper. She takes back your key and gives you a new one from her "
    + "« people » screen. It takes her a minute.",
  humainProprietaire:
    "If the shop is yours — nobody gave you that key, you own it — then the "
    + "person to reach is whoever installed TOTEM for you. Their number is on "
    + "the installation sheet that came with the box.",
  humainDelai: "Expect an answer the same day, not within the minute.",

  // --- le reste ------------------------------------------------------------
  boutiqueTitre: "The shop keeps working meanwhile",
  boutiqueDit:
    "The terminal reads its messages and issues its receipts on its own. It "
    + "has never needed anyone to be signed in.",
  pinTitre: "TOTEM never asks for your PIN",
  pinDit:
    "Not to get in, not by message, not on the phone. No screen here asks for "
    + "your Mobile Money PIN, and nobody from TOTEM will ever ask you for it, "
    + "nor for a password, nor to call a number back.",

  // --- la page que le lien du courriel ouvre -------------------------------
  lienTitre: "Close everything on this account",
  lienDit:
    "One tap, and every phone and every computer where this account is open "
    + "is signed out. Nothing else moves: your receipts, your balances and "
    + "your money stay exactly where they are.",
  lienBouton: "Close everything now",
  lienEnCours: "Closing…",
  lienFaitTitre: "Done. Everything is closed.",
  lienFaitDit:
    "You can come back in whenever you want — with your phone's lock, with a "
    + "code by email, or with the paper.",
  lienRateTitre: "This link no longer works",
  lienRateDit:
    "It has already been used, or it is more than an hour old. Ask for "
    + "another one: it costs nothing, and nothing has been closed.",
  lienRetour: "Ask for a new link",

  // --- le courriel lui-même ------------------------------------------------
  // Un lien, et aucun code : un code et un lien dans le même message, c'est la
  // forme même de l'arnaque. Aucun montant, aucun solde : il se lit sur un
  // écran verrouillé, à un comptoir, avec des gens autour.
  courrielObjet: "Close everything on your TOTEM account",
  courrielDit:
    "Somebody — most likely you — asked to close every session on this TOTEM "
    + "account.",
  courrielGeste:
    "Open this link and tap the button. It is good for one hour, and it works "
    + "once:",
  courrielPasVous:
    "If this was not you, ignore this message. Nothing has been closed, and "
    + "nothing will be.",
  courrielSignature:
    "TOTEM never asks for your PIN, nor for a password, nor to call a number "
    + "back.",
};

const fr: typeof en = {
  titre: "Vous n'arrivez plus à entrer",
  sousTitre:
    "Deux problèmes différents, et ils ne se règlent pas dans le même ordre. "
    + "On ferme d'abord, on rentre ensuite.",

  fermerSurtitre: "Si votre téléphone est entre d'autres mains",
  fermerTitre: "Fermez tout, partout",
  fermerQuoi:
    "Tous les téléphones et tous les ordinateurs où ce compte est ouvert se "
    + "referment d'un coup. Vos reçus, vos soldes et votre argent n'y "
    + "touchent pas — et votre code PIN Mobile Money n'a jamais été ici, "
    + "personne ne peut le prendre.",
  fermerSansPreuve:
    "On ne vous demande ni mot de passe, ni code. Fermer une porte n'a jamais "
    + "nui à personne : au pire, un compte fermé à tort coûte une reconnexion.",
  fermerAdresse: "Votre adresse mail",
  fermerExemple: "vous@exemple.cm",
  fermerBouton: "M'envoyer le lien qui ferme tout",
  fermerEnvoi: "Envoi…",
  fermerPourquoiUnLien:
    "Pas un simple bouton : un bouton permettrait à n'importe qui de fermer "
    + "n'importe qui, en connaissant seulement un nom. Le lien part sur "
    + "l'adresse elle-même — celui qui ferme est donc celui dont c'est le "
    + "compte.",
  fermerEnvoye:
    "Si cette adresse a un compte sur TOTEM, le lien est parti. Il vaut une "
    + "heure, et il ne sert qu'une fois.",
  fermerNeDitPas:
    "Cet écran dit exactement la même chose que l'adresse soit connue ici ou "
    + "non. Personne ne doit pouvoir découvrir qui tient un TOTEM en tapant "
    + "des adresses dedans.",
  fermerRate:
    "La demande n'est pas partie de ce téléphone. Vérifiez la connexion et "
    + "recommencez — rien n'a encore été fermé.",

  rentrerTitre: "Ensuite, pour rentrer",
  rentrerSousTitre:
    "Trois chemins. Lequel est le vôtre dépend de ce qui vous reste entre les "
    + "mains.",
  voies: {
    telephone: {
      nom: "Le verrouillage de votre téléphone",
      quand: "Si vous avez encore l'appareil",
      dit: "Votre empreinte ou votre visage, et vous êtes entré. Rien à "
        + "taper, rien à attendre, aucun réseau à espérer.",
    },
    courriel: {
      nom: "Un code par mail",
      quand: "Si vous pouvez ouvrir votre boîte",
      dit: "Six chiffres arrivent dans votre boîte, bons dix minutes et pour "
        + "une seule entrée. C'est le chemin sur un téléphone emprunté, ou "
        + "sur un téléphone neuf.",
    },
    papier: {
      nom: "Le papier de dix codes",
      quand: "Si vous n'avez ni le téléphone ni la boîte",
      dit: "Un des dix codes que vous avez imprimés et rangés ailleurs que "
        + "dans la boutique. Chacun sert une fois. C'est le chemin le jour où "
        + "le téléphone a été volé avec la boîte mail ouverte dedans.",
    },
  },
  allerEntrer: "Aller à l'écran d'entrée",

  humainTitre: "Et si aucun des trois ne marche",
  humainDit:
    "Alors aucun écran ne vous fera rentrer, et prétendre le contraire ne "
    + "vous coûterait que votre soirée. Prévenez la personne qui vous a donné "
    + "la clé — la propriétaire du commerce. Elle voit qui vous êtes et ce que "
    + "vous demandez, et elle rouvre la porte depuis son propre téléphone.",
  humainQuoiDireTitre: "Ce qu'il faut lui dire",
  humainQuoiDire:
    "Votre nom, quel commerce, et que vous avez perdu le téléphone ET le "
    + "papier. Elle reprend votre clé et vous en donne une neuve depuis son "
    + "écran « les gens ». Cela lui prend une minute.",
  humainProprietaire:
    "Si le commerce est le vôtre — personne ne vous a donné cette clé, elle "
    + "est à vous — alors la personne à joindre est celle qui a installé "
    + "TOTEM chez vous. Son numéro est sur la fiche d'installation livrée avec "
    + "le boîtier.",
  humainDelai: "Comptez une réponse dans la journée, pas dans la minute.",

  boutiqueTitre: "La boutique continue pendant ce temps",
  boutiqueDit:
    "Le terminal relève ses messages et établit ses reçus tout seul. Il n'a "
    + "jamais eu besoin que quelqu'un soit connecté.",
  pinTitre: "TOTEM ne demande jamais votre code PIN",
  pinDit:
    "Ni pour entrer, ni par message, ni par téléphone. Aucun écran d'ici ne "
    + "demande votre code PIN Mobile Money, et personne de chez TOTEM ne vous "
    + "le demandera jamais, ni un mot de passe, ni de rappeler un numéro.",

  lienTitre: "Fermer tout sur ce compte",
  lienDit:
    "Un geste, et tous les téléphones et tous les ordinateurs où ce compte "
    + "est ouvert se referment. Rien d'autre ne bouge : vos reçus, vos soldes "
    + "et votre argent restent exactement où ils sont.",
  lienBouton: "Tout fermer maintenant",
  lienEnCours: "Fermeture…",
  lienFaitTitre: "C'est fait. Tout est fermé.",
  lienFaitDit:
    "Vous pourrez revenir quand vous voudrez — avec le verrouillage de votre "
    + "téléphone, avec un code par mail, ou avec le papier.",
  lienRateTitre: "Ce lien ne marche plus",
  lienRateDit:
    "Il a déjà servi, ou il a plus d'une heure. Demandez-en un autre : cela "
    + "ne coûte rien, et rien n'a été fermé.",
  lienRetour: "Demander un nouveau lien",

  courrielObjet: "Fermer tout sur votre compte TOTEM",
  courrielDit:
    "Quelqu'un — sans doute vous — a demandé à fermer toutes les sessions de "
    + "ce compte TOTEM.",
  courrielGeste:
    "Ouvrez ce lien et appuyez sur le bouton. Il vaut une heure, et il ne sert "
    + "qu'une fois :",
  courrielPasVous:
    "Si ce n'était pas vous, ignorez ce message. Rien n'a été fermé, et rien "
    + "ne le sera.",
  courrielSignature:
    "TOTEM ne demande jamais votre code PIN, ni un mot de passe, ni de "
    + "rappeler un numéro.",
};

export const textesRetour = { en, fr } as const;
