// Les textes de l'invitation — le seul écran de TOTEM vu par quelqu'un qui
// n'a encore aucun compte, aucune préférence de langue, et aucune raison de
// nous faire confiance.
//
// Il s'écrit donc sans rien supposer, et il nomme des objets : une clé, une
// boutique, un papier. Jamais « authentification », jamais « jeton ».

const en = {
  // La marque et la bascule sont au-dessus de tout, avant même le titre :
  // la personne qui ouvre ce lien n'a pas encore choisi de langue, et
  // personne ne l'a choisie pour elle.
  langue: "Language",

  titre: (invitant: string) => `${invitant} is giving you a key to her shop`,
  sousTitre:
    "Not to her money — only to what it leaves behind: the balances, and the "
    + "receipts. You will see them from your own phone.",

  invitePar: "Invited by",
  leCommerce: "The shop",
  vousSerez: "You will be",

  role: {
    proprietaire: "the owner",
    operateur: "at the counter",
    lecteur: "a viewer",
    admin: "an administrator",
  },

  ceQueCaVeutDire: "What that means, exactly",
  // Ce que chaque rôle peut, et ce qu'il ne peut pas — dit AVANT d'accepter.
  // Un rôle qu'on découvre par un refus se vit comme une panne.
  peut: {
    proprietaire: [
      "Read the balances and download every receipt",
      "Send money, with the SIM's own PIN, at the counter",
      "Give a key to someone, and take it back",
    ],
    operateur: [
      "Read the balances, whenever you want",
      "Classify what arrives and hand out the receipts",
    ],
    lecteur: [
      "Read the two balances, whenever you want",
      "Download any receipt, in both languages",
    ],
    admin: ["See the fleet, the versions and the journal"],
  },
  peutPas: {
    proprietaire: [] as string[],
    operateur: [
      "You cannot send money — that belongs to the owner, at the counter",
      "The owner can take this key back at any moment",
    ],
    lecteur: [
      "You cannot send money, and no button here will ever let you",
      "The owner can take this key back at any moment",
    ],
    admin: [
      "An administrator can never move money, by any path",
    ],
  },

  accepter: "Accept, and set up my way in",
  apres: (numero: string) =>
    `Next: six digits sent to ${numero}. Nothing exists until they work.`,

  jamaisPinTitre: "TOTEM never asks for your Mobile Money PIN",
  jamaisPin:
    "Not on this page, not on any other, not by message, not by phone. "
    + "Anyone who asks you for it is not us — whatever the link looked like.",

  // Les quatre façons dont un lien n'ouvre rien. Aucune n'est un cul-de-sac,
  // et aucune ne dit « lien invalide » : cette phrase pousse à réessayer,
  // alors que dans trois cas sur quatre il faut prévenir quelqu'un.
  echec: {
    inconnue: {
      titre: "This link does not open anything",
      dit: "It may have been mistyped, or it may be very old. Ask the person "
        + "who invited you to send a new one.",
    },
    expiree: {
      titre: "This invitation has expired",
      dit: "An invitation lasts seven days. Nothing is wrong — ask for a new "
        + "one and it will work.",
    },
    deja_ouverte: {
      titre: "Someone opened this invitation before you",
      dit: "An invitation works once. If that was not you, say so now: the "
        + "account it created can be cancelled in one gesture, and a fresh "
        + "link sent to you.",
    },
    annulee: {
      titre: "This invitation was cancelled",
      dit: "The person who invited you took it back. If that surprises you, "
        + "the simplest thing is to call them.",
    },
  },
  prevenir: (invitant: string) => `Tell ${invitant}`,
  pourquoiUnLienNeSuffitPas:
    "This is why a link alone is never enough: a code goes to your number "
    + "too, and without it the link opens nothing.",
};

const fr: typeof en = {
  langue: "Langue",

  titre: (invitant: string) => `${invitant} vous donne une clé de son commerce`,
  sousTitre:
    "Pas de son argent — seulement de ce qu'il laisse derrière lui : les "
    + "soldes, et les reçus. Vous les verrez depuis votre propre téléphone.",

  invitePar: "Invité par",
  leCommerce: "Le commerce",
  vousSerez: "Vous serez",

  role: {
    proprietaire: "le propriétaire",
    operateur: "au comptoir",
    lecteur: "lecteur",
    admin: "administrateur",
  },

  ceQueCaVeutDire: "Ce que ça veut dire, exactement",
  peut: {
    proprietaire: [
      "Lire les soldes et télécharger chaque reçu",
      "Envoyer de l'argent, avec le code de la puce, au comptoir",
      "Donner une clé à quelqu'un, et la reprendre",
    ],
    operateur: [
      "Lire les soldes, quand vous voulez",
      "Classer ce qui arrive et remettre les reçus",
    ],
    lecteur: [
      "Lire les deux soldes, quand vous voulez",
      "Télécharger n'importe quel reçu, dans les deux langues",
    ],
    admin: ["Voir la flotte, les versions et le journal"],
  },
  peutPas: {
    proprietaire: [] as string[],
    operateur: [
      "Vous ne pouvez pas envoyer d'argent — cela appartient au propriétaire, au comptoir",
      "Le propriétaire peut reprendre cette clé à tout moment",
    ],
    lecteur: [
      "Vous ne pouvez pas envoyer d'argent, et aucun bouton ici ne vous le permettra",
      "Le propriétaire peut reprendre cette clé à tout moment",
    ],
    admin: [
      "Un administrateur ne peut jamais déplacer d'argent, par aucun chemin",
    ],
  },

  accepter: "Accepter, et choisir comment j'entre",
  apres: (numero: string) =>
    `Ensuite : six chiffres envoyés au ${numero}. Rien n'existe avant qu'ils marchent.`,

  jamaisPinTitre: "TOTEM ne demande jamais votre code PIN Mobile Money",
  jamaisPin:
    "Ni sur cette page, ni sur une autre, ni par message, ni par téléphone. "
    + "Quiconque vous le demande n'est pas nous — quelle que soit l'allure du lien.",

  echec: {
    inconnue: {
      titre: "Ce lien n'ouvre rien",
      dit: "Il a peut-être été mal recopié, ou il est très ancien. Demandez à "
        + "la personne qui vous a invité de vous en renvoyer un.",
    },
    expiree: {
      titre: "Cette invitation a expiré",
      dit: "Une invitation dure sept jours. Rien n'est cassé — demandez-en une "
        + "nouvelle et elle marchera.",
    },
    deja_ouverte: {
      titre: "Quelqu'un a ouvert cette invitation avant vous",
      dit: "Une invitation ne sert qu'une fois. Si ce n'était pas vous, "
        + "dites-le maintenant : le compte qu'elle a créé peut être annulé "
        + "d'un geste, et un nouveau lien vous être envoyé.",
    },
    annulee: {
      titre: "Cette invitation a été annulée",
      dit: "La personne qui vous a invité l'a reprise. Si cela vous étonne, le "
        + "plus simple est de l'appeler.",
    },
  },
  prevenir: (invitant: string) => `Prévenir ${invitant}`,
  pourquoiUnLienNeSuffitPas:
    "C'est pour cela qu'un lien seul ne suffit jamais : un code part aussi sur "
    + "votre numéro, et sans lui le lien n'ouvre rien.",
};

export const textesInvitation = { en, fr } as const;
