// Les textes de l'écran des six chiffres, et des quatre refus de la porte.
//
// CE QUE CET ÉCRAN A DE PARTICULIER
// Il est lu par quelqu'un qui n'a pas encore de compte, sur un téléphone
// fêlé, entre deux clients. La moitié des visites s'y passe mal : le message
// tarde, le code est mal recopié, le réseau coupe. Les phrases de refus sont
// donc écrites avec le même soin que celles du succès — davantage, même,
// puisqu'on les lira plus souvent.
//
// TROIS RÈGLES D'ÉCRITURE, ET CHACUNE SE VOIT DANS LES PHRASES
//
// 1. AUCUN REFUS NE DIT « ERREUR ». Le mot ne dit ni ce qui s'est passé ni
//    quoi faire ; il donne seulement le sentiment d'avoir cassé quelque
//    chose. Chaque refus nomme le fait, puis le geste suivant.
//
// 2. LE REFUS « LES CHIFFRES N'OUVRENT PAS » NE DIT JAMAIS POURQUOI. Un code
//    faux et un code déjà servi reçoivent le même mot, exactement. Distinguer
//    les deux apprendrait à qui essaie que le code existait.
//
// 3. ON RALENTIT, ON N'ENFERME PAS — et la phrase le dit en toutes lettres.
//    Quelqu'un qui croit son commerce verrouillé va chercher le mot de passe
//    du patron sur WhatsApp : c'est-à-dire qu'il détruit exactement ce qu'on
//    est en train de construire.

/** Le compte à rebours du bouton « renvoyer » : « 0:48 ». */
export function compteARebours(secondes: number): string {
  const s = Math.max(0, Math.ceil(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Une attente, en minutes entières — jamais « 300000 ms », jamais « 4,7 ». */
export function enMinutes(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60000));
}

const en = {
  retour: "Back to the invitation",

  titre: "Check your inbox",
  // L'adresse s'affiche en gras au milieu de la phrase : c'est elle qu'on
  // vient vérifier du regard, et une phrase d'un seul tenant la noierait.
  envoyeA: "Six digits are on their way to",
  colle: "Paste them or type them — the space in the middle changes nothing.",

  libelle: "Your code",
  exemple: "6 digits",
  continuer: "Continue",
  verification: "Checking…",

  renvoyer: "Send another",
  renvoiEnCours: "Sending…",
  renvoyerDans: (reste: string) => `You can ask for another in ${reste}`,
  renvoiParti: "New digits are on their way. Use the last ones you received.",

  // Ce qu'on peut dire à un inconnu, et rien de plus : ce que le code PEUT,
  // pas qui vous êtes.
  portee:
    "These six digits work for ten minutes, on this page, once. After that "
    + "they simply stop — ask for new ones, and nothing is lost.",
  jamaisPin:
    "TOTEM never asks for your Mobile Money PIN — not here, not by message, "
    + "not by phone.",

  aideTitre: "I haven't received anything",
  aide: {
    indesirables: {
      titre: "Look in the junk mail",
      dit: "A first message from an address your inbox has never seen often "
        + "lands there. Marking it as wanted brings the next ones back.",
    },
    adresse: {
      titre: (adresse: string) => `Is ${adresse} really your address?`,
      dit: "The person who invited you typed it. If a letter is wrong, no "
        + "code will ever arrive — they can correct it and invite you again.",
    },
    prevenir: {
      titre: "Tell the person who invited you",
      dit: "They can send you a fresh link, to another address if that one is "
        + "not the right one.",
    },
  },

  // Les quatre façons dont la porte refuse. Aucune n'est un cul-de-sac :
  // chacune porte le geste qui vient après.
  refus: {
    faux: {
      titre: "Those digits don't open",
      dit: "Check them and try again. On a cracked screen 0 and O look alike "
        + "— we only ever send digits, never letters.",
      note: "After several tries the door gets slower. It never locks.",
    },
    expire: {
      titre: "Those digits have expired",
      dit: "A code lasts ten minutes, on purpose. Nothing is wrong with your "
        + "invitation — ask for new digits and they will work.",
      geste: "Send me new digits",
    },
    lent: {
      titre: (duree: string) => `Wait ${duree}, then try again`,
      dit: "Several codes in a row did not open. We slow the door down — we "
        + "do not lock it. This is your shop, and nobody at TOTEM can shut "
        + "you out of it.",
      note: "Your digits stay valid while you wait, if they are less than ten "
        + "minutes old.",
    },
    trop: {
      titre: "That's a lot of messages",
      dit: (duree: string) =>
        `Several codes have already gone to your address. We stop for ${duree} `
        + "so your inbox stays usable — and so our messages keep arriving, "
        + "yours and everyone else's.",
      note: "The last digits you received still work, if they are less than "
        + "ten minutes old.",
    },
    indisponible: {
      titre: "The message could not leave",
      dit: "Nothing was created, and nothing is lost. Try again in a moment. "
        + "If it happens twice, tell the person who invited you.",
      geste: "Try again",
    },
    ferme: {
      titre: "This account is not open",
      dit: "Your address answered, so the digits were right. The account "
        + "behind it is on hold — the person who invited you can lift that.",
    },
  },

  // La minute, écrite comme on la dit.
  minutes: (n: number) => (n === 1 ? "one minute" : `${n} minutes`),
};

const fr: typeof en = {
  retour: "Revenir à l'invitation",

  titre: "Regardez votre boîte mail",
  envoyeA: "Six chiffres partent vers",
  colle: "Collez-les ou tapez-les — l'espace au milieu ne change rien.",

  libelle: "Votre code",
  exemple: "6 chiffres",
  continuer: "Continuer",
  verification: "Vérification…",

  renvoyer: "En renvoyer un",
  renvoiEnCours: "Envoi…",
  renvoyerDans: (reste: string) => `Vous pourrez en redemander dans ${reste}`,
  renvoiParti:
    "De nouveaux chiffres partent. Servez-vous des derniers reçus.",

  portee:
    "Ces six chiffres marchent dix minutes, sur cette page, une seule fois. "
    + "Ensuite ils s'arrêtent — vous en redemandez, et rien n'est perdu.",
  jamaisPin:
    "TOTEM ne demande jamais votre code PIN Mobile Money — ni ici, ni par "
    + "message, ni par téléphone.",

  aideTitre: "Je n'ai rien reçu",
  aide: {
    indesirables: {
      titre: "Regardez dans les indésirables",
      dit: "Un premier message venu d'une adresse que votre boîte n'a jamais "
        + "vue y tombe souvent. Le marquer comme voulu ramène les suivants.",
    },
    adresse: {
      titre: (adresse: string) => `Est-ce bien votre adresse, ${adresse} ?`,
      dit: "C'est la personne qui vous invite qui l'a saisie. S'il y manque "
        + "une lettre, aucun code n'arrivera jamais — elle peut la corriger "
        + "et vous réinviter.",
    },
    prevenir: {
      titre: "Prévenez la personne qui vous invite",
      dit: "Elle peut vous renvoyer un lien, vers une autre adresse si "
        + "celle-ci n'est pas la bonne.",
    },
  },

  refus: {
    faux: {
      titre: "Ces chiffres n'ouvrent pas",
      dit: "Relisez-les et réessayez. Sur un écran fêlé, le 0 et le O se "
        + "ressemblent — nous n'envoyons que des chiffres, jamais de lettres.",
      note: "Après plusieurs essais, la porte devient plus lente. Elle ne se "
        + "verrouille jamais.",
    },
    expire: {
      titre: "Ces chiffres ont expiré",
      dit: "Un code dure dix minutes, exprès. Votre invitation n'a rien — "
        + "demandez de nouveaux chiffres, ils marcheront.",
      geste: "M'envoyer de nouveaux chiffres",
    },
    lent: {
      titre: (duree: string) => `Attendez ${duree}, puis réessayez`,
      dit: "Plusieurs codes de suite n'ont pas ouvert. On ralentit la porte — "
        + "on ne la verrouille pas. C'est votre commerce, et personne chez "
        + "TOTEM ne peut vous en fermer l'accès.",
      note: "Vos chiffres restent valables pendant l'attente, s'ils ont moins "
        + "de dix minutes.",
    },
    trop: {
      titre: "Cela fait beaucoup de messages",
      dit: (duree: string) =>
        `Plusieurs codes sont déjà partis vers votre adresse. On s'arrête ${duree} `
        + "pour que votre boîte reste utilisable — et pour que nos messages "
        + "continuent d'arriver, les vôtres comme ceux des autres.",
      note: "Les derniers chiffres reçus marchent encore, s'ils ont moins de "
        + "dix minutes.",
    },
    indisponible: {
      titre: "Le message n'a pas pu partir",
      dit: "Rien n'a été créé, et rien n'est perdu. Réessayez dans un moment. "
        + "Si cela recommence, prévenez la personne qui vous invite.",
      geste: "Réessayer",
    },
    ferme: {
      titre: "Ce compte n'est pas ouvert",
      dit: "Votre adresse a répondu : les chiffres étaient bons. Le compte "
        + "derrière est en suspens — la personne qui vous invite peut le "
        + "rouvrir.",
    },
  },

  minutes: (n: number) => (n === 1 ? "une minute" : `${n} minutes`),
};

export const textesCode = { en, fr } as const;

/** Le nom des quatre refus, tel qu'il circule entre la route et l'écran. */
export type GenreRefus = keyof typeof en.refus;

/** Une attente en toutes lettres : « 5 minutes », « une minute ». */
export function attenteEnMots(ms: number, langue: "en" | "fr"): string {
  return textesCode[langue].minutes(enMinutes(ms));
}
