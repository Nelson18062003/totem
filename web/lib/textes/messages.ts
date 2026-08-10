// Les textes de « ce qui arrive sur votre téléphone ».
//
// Cette page n'est pas un panneau de réglages : c'est une page qui RASSURE.
// Elle montre le catalogue complet de ce que TOTEM envoie, pour qu'il n'y ait
// aucune surprise possible — et c'est elle qu'on ira relire le jour où un faux
// message arrivera.
//
// D'où deux choses écrites ici en toutes lettres, et pas dans un commentaire
// de code : ce qui protège ne se débraye pas, et aucun message de TOTEM ne
// demande jamais le code PIN.
//
// Ce fichier décrit des GENRES — ce que c'est, quand ça part. Les phrases
// réellement envoyées vivent ailleurs (`lib/textes/courrier.ts`) et changeront
// sans toucher à cette page.

const en = {
  titre: "What lands on your phone",
  sousTitre:
    "Everything TOTEM can ever send you is on this page. Nothing else exists, "
    + "and nothing arrives without a reason written here.",

  // La phrase qui protège vraiment. En évidence, en haut : c'est celle qu'on
  // vient relire quand un faux message arrive.
  jamaisTitre: "No TOTEM message ever asks you for anything",
  jamaisDit:
    "No message from TOTEM ever asks for your PIN code, nor for a password, "
    + "nor to call a number back. Not one. If a message asks you for any of "
    + "those three things, it is not from us — whatever name it carries.",
  jamaisQuoiFaire:
    "If you got one: do not answer it, and tell the person who gave you your "
    + "key. Your account is not in danger for having received it.",

  // La règle de la page, dite à l'écran et pas seulement dans le code.
  regleTitre: "What protects you has no switch",
  regleDit:
    "Four of these messages cannot be turned off, and that is on purpose. A "
    + "message you can switch off is a message that would not have warned you "
    + "the day it mattered — the evening your shop opened from a phone you "
    + "have never seen. TOTEM would rather send one message too many than "
    + "stay quiet that evening.",

  catalogue: "Everything we send",
  toujours: "Always on",
  recevoir: "Receive",
  protegeCourt: "Protects you",
  quand: "When",

  genres: {
    code: {
      nom: "The six digits to get in",
      quoi: "The code you type to open TOTEM. Nothing else is in that "
        + "message: no link, no amount, no name.",
      quand: "Each time you sign in without your phone's lock.",
      pourquoiToujours:
        "It is the door itself. Switching it off would lock you out of your "
        + "own shop the first day you change phone.",
    },
    invitation: {
      nom: "Someone is giving you a key",
      quoi: "Who is inviting you, which shop, and what you will be able to "
        + "do there.",
      quand: "When an owner invites you, once.",
      pourquoiToujours:
        "Without it, an invitation reaches nobody — there is no account yet "
        + "to send it anywhere else.",
    },
    bienvenue: {
      nom: "Your account exists",
      quoi: "A short message saying the account is open, and what your key "
        + "opens.",
      quand: "Once, right after your first code worked.",
      pourquoiToujours: "",
    },
    alerte_appareil: {
      nom: "An entry from a phone we had never seen",
      quoi: "Where, when, and how to close everything if it was not you.",
      quand: "Every time this account opens on a device it does not know.",
      pourquoiToujours:
        "This is the message that warns you of a break-in. It is exactly the "
        + "one somebody else would want switched off.",
    },
    cle_retiree: {
      nom: "A phone was removed from the account",
      quoi: "Which phone stopped recognising you, and who removed it.",
      quand: "When a phone is removed — by you, or by the owner of the shop.",
      pourquoiToujours:
        "Somebody touched the keys of your account. You hear about it the "
        + "same minute, always.",
    },
    encaissement: {
      nom: "Each payment received",
      quoi: "That money came in, and from which shop. Never the amount, "
        + "never the balance.",
      quand: "Each time the terminal records a payment.",
      pourquoiToujours: "",
    },
    rapport: {
      nom: "The evening summary",
      quoi: "How the day went, in a few lines: how many payments, how many "
        + "receipts, and whether anything is waiting for you.",
      quand: "Once a day, after closing time.",
      pourquoiToujours: "",
    },
    terminal: {
      nom: "The terminal has gone quiet",
      quoi: "Power cut, no network, or the box unplugged — and since when.",
      quand: "When the terminal stops giving news for more than a few minutes.",
      pourquoiToujours: "",
    },
  },

  // Ce que chaque message respecte, quel que soit son genre.
  formeTitre: "What every message obeys",
  forme: [
    {
      titre: "Never an amount, never a balance",
      dit: "It is read on a locked screen, at a counter, with people around. "
        + "The figures stay in TOTEM, where you open them yourself.",
    },
    {
      titre: "Never a code and a link in the same message",
      dit: "That pairing is the shape of a scam. Keeping the two apart is "
        + "what makes the real message recognisable.",
    },
    {
      titre: "The shop is named, every time",
      dit: "Somebody who works in two shops has to know which door just "
        + "opened.",
    },
  ],

  changeRate:
    "That change did not go through. Nothing has moved — try again in a "
    + "moment.",
  changeProtege:
    "This message protects you: it has no switch, and this screen never "
    + "pretended it had one.",
};

const fr: typeof en = {
  titre: "Ce qui arrive sur votre téléphone",
  sousTitre:
    "Tout ce que TOTEM peut vous envoyer est sur cette page. Rien d'autre "
    + "n'existe, et rien n'arrive sans une raison écrite ici.",

  jamaisTitre: "Aucun message de TOTEM ne vous demande jamais quoi que ce soit",
  jamaisDit:
    "Aucun message de TOTEM ne demande votre code PIN, ni un mot de passe, ni "
    + "de rappeler un numéro. Aucun. Si un message vous demande une de ces "
    + "trois choses, il ne vient pas de nous — quel que soit le nom qu'il "
    + "porte.",
  jamaisQuoiFaire:
    "Si vous en avez reçu un : n'y répondez pas, et prévenez la personne qui "
    + "vous a donné votre clé. Votre compte n'est pas en danger pour l'avoir "
    + "reçu.",

  regleTitre: "Ce qui vous protège n'a pas d'interrupteur",
  regleDit:
    "Quatre de ces messages ne s'éteignent pas, et c'est voulu. Un message "
    + "qu'on peut éteindre est un message qui n'aurait pas prévenu le jour où "
    + "il fallait — le soir où votre commerce s'est ouvert depuis un téléphone "
    + "que vous n'avez jamais vu. TOTEM préfère envoyer un message de trop que "
    + "se taire ce soir-là.",

  catalogue: "Tout ce que nous envoyons",
  toujours: "Toujours envoyé",
  recevoir: "Recevoir",
  protegeCourt: "Vous protège",
  quand: "Quand",

  genres: {
    code: {
      nom: "Les six chiffres pour entrer",
      quoi: "Le code que vous recopiez pour ouvrir TOTEM. Rien d'autre dans "
        + "ce message : pas de lien, pas de montant, pas de nom.",
      quand: "À chaque entrée sans le verrouillage de votre téléphone.",
      pourquoiToujours:
        "C'est la porte elle-même. L'éteindre reviendrait à vous enfermer "
        + "dehors le premier jour où vous changez de téléphone.",
    },
    invitation: {
      nom: "Untel vous donne une clé",
      quoi: "Qui vous invite, quel commerce, et ce que vous pourrez y faire.",
      quand: "Quand une propriétaire vous invite, une seule fois.",
      pourquoiToujours:
        "Sans elle, une invitation n'arrive nulle part — il n'y a pas encore "
        + "de compte où l'envoyer autrement.",
    },
    bienvenue: {
      nom: "Le compte existe",
      quoi: "Un mot court qui dit que le compte est ouvert, et ce que votre "
        + "clé ouvre.",
      quand: "Une fois, juste après que votre premier code a marché.",
      pourquoiToujours: "",
    },
    alerte_appareil: {
      nom: "Une entrée depuis un appareil jamais vu",
      quoi: "Où, quand, et comment tout fermer si ce n'était pas vous.",
      quand: "Chaque fois que ce compte s'ouvre sur un appareil inconnu.",
      pourquoiToujours:
        "C'est le message qui prévient d'une intrusion. C'est exactement "
        + "celui qu'un autre aimerait voir éteint.",
    },
    cle_retiree: {
      nom: "Un téléphone a été retiré du compte",
      quoi: "Quel téléphone ne vous reconnaît plus, et qui l'a retiré.",
      quand: "Quand un téléphone est retiré — par vous, ou par la "
        + "propriétaire du commerce.",
      pourquoiToujours:
        "Quelqu'un a touché aux clés de votre compte. Vous l'apprenez dans la "
        + "minute, toujours.",
    },
    encaissement: {
      nom: "Chaque paiement reçu",
      quoi: "Que de l'argent est entré, et dans quel commerce. Jamais le "
        + "montant, jamais le solde.",
      quand: "À chaque paiement enregistré par le terminal.",
      pourquoiToujours: "",
    },
    rapport: {
      nom: "Le récapitulatif du soir",
      quoi: "Comment la journée s'est passée, en quelques lignes : combien de "
        + "paiements, combien de reçus, et si quelque chose vous attend.",
      quand: "Une fois par jour, après la fermeture.",
      pourquoiToujours: "",
    },
    terminal: {
      nom: "Le terminal s'est tu",
      quoi: "Coupure de courant, plus de réseau, ou boîtier débranché — et "
        + "depuis quand.",
      quand: "Quand le terminal cesse de donner des nouvelles plus de "
        + "quelques minutes.",
      pourquoiToujours: "",
    },
  },

  formeTitre: "Ce que chaque message respecte",
  forme: [
    {
      titre: "Jamais un montant, jamais un solde",
      dit: "Il se lit sur un écran verrouillé, à un comptoir, avec des gens "
        + "autour. Les chiffres restent dans TOTEM, où c'est vous qui les "
        + "ouvrez.",
    },
    {
      titre: "Jamais un code et un lien dans le même message",
      dit: "Ce couple-là est la forme même de l'arnaque. C'est en les gardant "
        + "séparés que le vrai message reste reconnaissable.",
    },
    {
      titre: "Le commerce est nommé, à chaque fois",
      dit: "Quelqu'un qui travaille dans deux commerces doit savoir quelle "
        + "porte vient de s'ouvrir.",
    },
  ],

  changeRate:
    "Ce changement n'est pas passé. Rien n'a bougé — réessayez dans un "
    + "instant.",
  changeProtege:
    "Ce message vous protège : il n'a pas d'interrupteur, et cet écran n'a "
    + "jamais fait semblant du contraire.",
};

export const textesMessages = { en, fr } as const;
