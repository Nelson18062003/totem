// Les messages que TOTEM dépose dans une boîte mail — les cinq, et rien d'autre.
//
// CE QUI A CHANGÉ DEPUIS LA MAQUETTE
// « maquettes/C10-messages.src.html » dessinait des SMS : 160 signes, aucune
// mise en page, un coût à chaque envoi. Tout est passé au courriel — un numéro
// camerounais inutilisé est recyclé et réattribué, une adresse suit la personne
// (docs/COMMENT-ON-ENTRE.md). La maquette reste vraie sur le fond et périmée
// sur le canal. Seules les alertes du robot Telegram vivent encore ailleurs.
//
// QUATRE RÈGLES QUI ONT ÉCRIT CES PHRASES
//
// 1. LE CODE N'EST JAMAIS DANS L'OBJET. L'objet s'affiche sur un écran
//    verrouillé, au comptoir, devant d'autres gens. Il nomme l'appareil ou la
//    raison, jamais les six chiffres. C'est la règle qui se casse le plus
//    silencieusement : « TOTEM : votre code 408 913 » a l'air serviable et
//    livre la boutique à qui regarde par-dessus l'épaule.
//
// 2. JAMAIS UN CODE ET UN LIEN DANS LE MÊME MESSAGE. Cette paire est la forme
//    même de l'hameçonnage, et la tenir séparée est ce qui rend le vrai message
//    reconnaissable. Le message qui porte le code n'a donc AUCUN lien ; celui
//    qui porte un lien n'a aucun code.
//
// 3. DEUX PHRASES SUR TOUS LES MESSAGES, SANS EXCEPTION : ce qu'il faut faire
//    si ce n'était pas vous, et le rappel que TOTEM ne demande jamais le code
//    PIN. Elles ne sont pas laissées au bon vouloir de chaque texte —
//    « composer » les ajoute lui-même, à la fin de tout. On ne peut pas en
//    oublier une en écrivant un sixième message.
//
// 4. NI MONTANT NI SOLDE. Un message se lit sur un écran verrouillé ; il parle
//    de la porte, jamais de l'argent qui est derrière.
//
// LE HTML RESTE LISIBLE UNE FOIS DÉGRADÉ : aucune image, aucun tableau de mise
// en page, aucun pixel de suivi, aucun lien de traçage, et les adresses
// s'affichent en entier. Ce qui se lit dans la version texte se lit aussi dans
// la version HTML, et inversement.

import type { Langue } from "../langue";

/** Les cinq messages. Il n'y en a pas un sixième ailleurs. */
export type Genre =
  | "code"
  | "invitation"
  | "bienvenue"
  | "alerte_appareil"
  | "cle_retiree";

/** Les cinq raisons pour lesquelles six chiffres partent. Elles changent la
 *  phrase : « accepter votre clé » et « confirmer ce que vous venez de
 *  demander » ne se lisent pas de la même façon à sept heures du matin. */
export type Motif = "invitation" | "entree" | "appareil" | "adresse" | "geste";

/** Ce qui part vraiment : un objet, une version texte, une version HTML. */
export type Message = { objet: string; texte: string; html: string };

export type Contenu =
  | {
      genre: "code";
      motif: Motif;
      commerce: string;
      /** Déjà écrit comme on le lit : « 408 913 ». */
      code: string;
      minutes: number;
      appareil?: string | null;
      lieu?: string | null;
    }
  | {
      genre: "invitation";
      invitant: string;
      commerce: string;
      nom: string;
      lien: string;
      jours: number;
    }
  | { genre: "bienvenue"; commerce: string; nom: string; lien?: string | null }
  | {
      genre: "alerte_appareil";
      commerce: string;
      quand: string;
      appareil?: string | null;
      lieu?: string | null;
    }
  | {
      genre: "cle_retiree";
      commerce: string;
      quand: string;
      appareil?: string | null;
    };

// --- Les textes ------------------------------------------------------------

const en = {
  // Les deux phrases obligatoires. « pasVous » reçoit le geste à faire, qui
  // change d'un message à l'autre : prévenir quelqu'un n'est pas fermer ses
  // sessions.
  pasVous: (geste: string) => `If this was not you, ${geste}`,
  jamaisPin:
    "TOTEM never asks for your Mobile Money PIN. Not by email, not by phone, "
    + "not on any screen. Whoever asks you for it is not us.",
  signature: "TOTEM",

  code: {
    // Aucun de ces objets ne contient les six chiffres : ils nomment la
    // boutique ou la raison, parce qu'ils s'affichent sur un écran verrouillé.
    objet: {
      invitation: (commerce: string) => `Your key to ${commerce}`,
      entree: (commerce: string) => `Signing in to ${commerce}`,
      appareil: (commerce: string) => `A device we had not seen, on ${commerce}`,
      adresse: (_commerce: string) => "Confirming your new email address",
      geste: (commerce: string) => `Confirming an action on ${commerce}`,
    },
    intro: {
      invitation: (commerce: string) =>
        `Six digits to accept your key to ${commerce}.`,
      entree: (commerce: string) => `Six digits to sign in to ${commerce}.`,
      appareil: (commerce: string) =>
        `Six digits to open ${commerce} on this device.`,
      adresse: (_commerce: string) =>
        "Six digits to confirm this address is really yours.",
      geste: (commerce: string) =>
        `Six digits to confirm what you just asked for on ${commerce}.`,
    },
    duree: (minutes: number) =>
      `Good for ${minutes} minutes, and once only.`,
    depuis: (appareil: string) => `Requested from ${appareil}.`,
    // Dite en toutes lettres, parce que c'est ce qui rend le vrai message
    // reconnaissable d'un faux.
    sansLien:
      "This message carries no link, and never will: a code and a link "
      + "together is what a fake TOTEM sends.",
    geste: (commerce: string) =>
      "do not type these digits anywhere. Somebody is trying to get into "
      + `${commerce} with your address, and nothing opens without them. Tell `
      + "the owner of the shop.",
  },

  invitation: {
    objet: (invitant: string, commerce: string) =>
      `${invitant} is giving you a key to ${commerce}`,
    salut: (nom: string) => `${nom},`,
    dit: (invitant: string, commerce: string) =>
      `${invitant} is giving you a key to ${commerce}. Not to the money — to `
      + "what it leaves behind: the balances, and the receipts.",
    ouvrir: "Open this link to see what the key allows, and what it does not:",
    rienEncore:
      "Opening the link creates nothing. The account exists only once you "
      + "have accepted and typed the six digits we will then send here.",
    duree: (jours: number) => `The link works for ${jours} days.`,
    geste: (invitant: string) =>
      `ignore this message and tell ${invitant}. As long as you do not accept, `
      + "nothing is created in your name.",
  },

  bienvenue: {
    objet: (commerce: string) => `Your key to ${commerce} is open`,
    salut: (nom: string) => `${nom},`,
    dit: (commerce: string) =>
      `Your account is open, and your key to ${commerce} works. Your email `
      + "address has been confirmed — that is what the six digits proved.",
    doigt:
      "From your settings you can set up your phone's own lock: next time, "
      + "your fingerprint gets you in. Nothing to remember, nothing to type.",
    mailReste:
      "Email stays open too. A phone gets lost, a sensor refuses a wet "
      + "finger — the two ways in coexist, on purpose.",
    ouvrir: "Your shop:",
    geste: (commerce: string) =>
      `tell the owner of ${commerce} straight away. An account created by `
      + "mistake is closed in one gesture.",
  },

  alerte_appareil: {
    objet: (commerce: string) =>
      `${commerce} was opened from a device you had never used`,
    dit: (commerce: string, quand: string) =>
      `${commerce} was opened at ${quand} from a device we had never seen on `
      + "your account.",
    depuis: (appareil: string) => `The device: ${appareil}.`,
    siVous: "If that was you, there is nothing to do. This message is a record.",
    geste: (commerce: string) =>
      "open your settings and close every session, then set your phone up "
      + `again. Tell the owner of ${commerce} as well — they can take the key `
      + "back from the shop page.",
  },

  cle_retiree: {
    objet: () => "A phone was removed from your account",
    dit: (commerce: string, quand: string) =>
      `A phone was removed from your account on ${commerce} at ${quand}. That `
      + "phone will no longer recognise you.",
    quel: (appareil: string) => `The phone: ${appareil}.`,
    mailReste:
      "You can still get in by email, exactly as the first time. Removing a "
      + "phone locks nobody out.",
    geste: (commerce: string) =>
      `tell the owner of ${commerce} now, and set up your phone again from `
      + "your settings.",
  },
};

const fr: typeof en = {
  pasVous: (geste: string) => `Si ce n'était pas vous, ${geste}`,
  jamaisPin:
    "TOTEM ne demande jamais votre code PIN Mobile Money. Ni par mail, ni par "
    + "téléphone, ni sur aucun écran. Quiconque vous le demande n'est pas nous.",
  signature: "TOTEM",

  code: {
    objet: {
      invitation: (commerce: string) => `Votre clé pour ${commerce}`,
      entree: (commerce: string) => `Entrer dans ${commerce}`,
      appareil: (commerce: string) =>
        `Un appareil que nous n'avions pas vu, sur ${commerce}`,
      adresse: (_commerce: string) => "Confirmer votre nouvelle adresse mail",
      geste: (commerce: string) => `Confirmer une action sur ${commerce}`,
    },
    intro: {
      invitation: (commerce: string) =>
        `Six chiffres pour accepter votre clé de ${commerce}.`,
      entree: (commerce: string) => `Six chiffres pour entrer dans ${commerce}.`,
      appareil: (commerce: string) =>
        `Six chiffres pour ouvrir ${commerce} sur cet appareil.`,
      adresse: (_commerce: string) =>
        "Six chiffres pour confirmer que cette adresse est bien la vôtre.",
      geste: (commerce: string) =>
        `Six chiffres pour confirmer ce que vous venez de demander sur ${commerce}.`,
    },
    duree: (minutes: number) =>
      `Valables ${minutes} minutes, et une seule fois.`,
    depuis: (appareil: string) => `Demandés depuis ${appareil}.`,
    sansLien:
      "Ce message ne porte aucun lien, et n'en portera jamais : un code et un "
      + "lien ensemble, c'est ce qu'envoie un faux TOTEM.",
    geste: (commerce: string) =>
      "ne recopiez ces chiffres nulle part. Quelqu'un essaie d'entrer dans "
      + `${commerce} avec votre adresse, et rien ne s'ouvre sans eux. Prévenez `
      + "le propriétaire du commerce.",
  },

  invitation: {
    objet: (invitant: string, commerce: string) =>
      `${invitant} vous donne une clé de ${commerce}`,
    salut: (nom: string) => `${nom},`,
    dit: (invitant: string, commerce: string) =>
      `${invitant} vous donne une clé de ${commerce}. Pas de l'argent — de ce `
      + "qu'il laisse derrière lui : les soldes, et les reçus.",
    ouvrir:
      "Ouvrez ce lien pour voir ce que la clé permet, et ce qu'elle ne permet pas :",
    rienEncore:
      "Ouvrir le lien ne crée rien. Le compte n'existera qu'une fois que vous "
      + "aurez accepté et saisi les six chiffres que nous enverrons alors ici.",
    duree: (jours: number) => `Le lien fonctionne pendant ${jours} jours.`,
    geste: (invitant: string) =>
      `ignorez ce message et prévenez ${invitant}. Tant que vous n'acceptez `
      + "pas, rien n'est créé à votre nom.",
  },

  bienvenue: {
    objet: (commerce: string) => `Votre clé de ${commerce} est ouverte`,
    salut: (nom: string) => `${nom},`,
    dit: (commerce: string) =>
      `Votre compte est ouvert, et votre clé de ${commerce} fonctionne. Votre `
      + "adresse mail est confirmée — c'est ce que les six chiffres ont prouvé.",
    doigt:
      "Depuis vos réglages, vous pouvez configurer le verrouillage de votre "
      + "téléphone : la prochaine fois, votre empreinte vous fait entrer. Rien "
      + "à retenir, rien à taper.",
    mailReste:
      "Le mail reste ouvert aussi. Un téléphone se perd, un capteur refuse un "
      + "doigt mouillé — les deux chemins coexistent, exprès.",
    ouvrir: "Votre commerce :",
    geste: (commerce: string) =>
      `prévenez tout de suite le propriétaire de ${commerce}. Un compte créé `
      + "par erreur se ferme d'un geste.",
  },

  alerte_appareil: {
    objet: (commerce: string) =>
      `${commerce} a été ouvert depuis un appareil que vous n'aviez jamais utilisé`,
    dit: (commerce: string, quand: string) =>
      `${commerce} a été ouvert à ${quand} depuis un appareil que nous n'avions `
      + "jamais vu sur votre compte.",
    depuis: (appareil: string) => `L'appareil : ${appareil}.`,
    siVous:
      "Si c'était vous, il n'y a rien à faire. Ce message est une trace.",
    geste: (commerce: string) =>
      "ouvrez vos réglages et fermez toutes les sessions, puis reconfigurez "
      + `votre téléphone. Prévenez aussi le propriétaire de ${commerce} — il `
      + "peut reprendre la clé depuis la page du commerce.",
  },

  cle_retiree: {
    objet: () => "Un téléphone a été retiré de votre compte",
    dit: (commerce: string, quand: string) =>
      `Un téléphone a été retiré de votre compte sur ${commerce} à ${quand}. Ce `
      + "téléphone ne vous reconnaîtra plus.",
    quel: (appareil: string) => `Le téléphone : ${appareil}.`,
    mailReste:
      "Vous pouvez toujours entrer par mail, exactement comme la première "
      + "fois. Retirer un téléphone n'enferme personne dehors.",
    geste: (commerce: string) =>
      `prévenez tout de suite le propriétaire de ${commerce}, et reconfigurez `
      + "votre téléphone depuis vos réglages.",
  },
};

export const textesCourrier = { en, fr } as const;

// --- La fabrication du message ---------------------------------------------

/**
 * Une ligne du message, avant qu'elle soit rendue en texte ou en HTML.
 *
 * Le HTML et le texte sont écrits UNE fois, à partir de la même liste. Deux
 * rédactions parallèles finiraient par diverger, et c'est toujours la version
 * texte — celle que lisent les vieux clients de messagerie et les lecteurs
 * d'écran — qui perdrait la phrase importante.
 */
type Ligne =
  | { sorte: "phrase"; texte: string }
  | { sorte: "chiffres"; texte: string }
  | { sorte: "lien"; texte: string }
  | { sorte: "note"; texte: string };

function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Le corps d'un message, dans les deux formes.
 *
 * Le lien s'affiche EN ENTIER, et son texte visible est l'adresse elle-même :
 * un lien dont le texte ne dit pas où il va est exactement ce qu'on apprend
 * aux gens à ne pas ouvrir. Aucune image, aucun pixel de suivi, aucune
 * redirection de comptage — l'adresse écrite est l'adresse visitée.
 */
function rendre(lignes: Ligne[], langue: Langue): { texte: string; html: string } {
  const texte = lignes.map((l) => l.texte).join("\n\n");

  const corps = lignes
    .map((l) => {
      const t = echapper(l.texte);
      switch (l.sorte) {
        case "chiffres":
          return `<p style="margin:20px 0;font-family:ui-monospace,Menlo,monospace;`
            + `font-size:28px;line-height:36px;font-weight:700;letter-spacing:.16em">`
            + `${t}</p>`;
        case "lien":
          return `<p style="margin:16px 0;word-break:break-all">`
            + `<a href="${t}" style="color:#8a3b1e">${t}</a></p>`;
        case "note":
          return `<p style="margin:16px 0;font-size:13px;line-height:20px;color:#5b5b5b">`
            + `${t}</p>`;
        default:
          return `<p style="margin:16px 0">${t}</p>`;
      }
    })
    .join("\n");

  const html =
    `<!doctype html>\n<html lang="${langue}">\n<head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width"></head>\n`
    + `<body style="margin:0;padding:24px;background:#faf7f2">\n`
    + `<div style="max-width:520px;margin:0 auto;font-family:system-ui,-apple-system,`
    + `Segoe UI,Roboto,sans-serif;font-size:15px;line-height:23px;color:#1c1a17">\n`
    + `<p style="margin:0 0 24px;font-size:15px;font-weight:700;letter-spacing:.18em">TOTEM</p>\n`
    + `${corps}\n</div>\n</body>\n</html>`;

  return { texte, html };
}

/**
 * Composer un message. Le seul chemin par lequel un courriel de TOTEM naît.
 *
 * C'est ici, et nulle part ailleurs, que sont ajoutées les deux phrases
 * obligatoires : ce qu'il faut faire si ce n'était pas vous, et le rappel sur
 * le code PIN. Un sixième message écrit dans six mois les portera sans que son
 * auteur ait à y penser.
 */
export function composer(langue: Langue, c: Contenu): Message {
  const t = textesCourrier[langue];
  let objet: string;
  let geste: string;
  const lignes: Ligne[] = [];

  switch (c.genre) {
    case "code": {
      objet = t.code.objet[c.motif](c.commerce);
      geste = t.code.geste(c.commerce);
      lignes.push({ sorte: "phrase", texte: t.code.intro[c.motif](c.commerce) });
      lignes.push({ sorte: "chiffres", texte: c.code });
      lignes.push({ sorte: "phrase", texte: t.code.duree(c.minutes) });
      const ou = [c.appareil, c.lieu].filter(Boolean).join(", ");
      if (ou) lignes.push({ sorte: "phrase", texte: t.code.depuis(ou) });
      lignes.push({ sorte: "note", texte: t.code.sansLien });
      break;
    }
    case "invitation": {
      objet = t.invitation.objet(c.invitant, c.commerce);
      geste = t.invitation.geste(c.invitant);
      lignes.push({ sorte: "phrase", texte: t.invitation.salut(c.nom) });
      lignes.push({ sorte: "phrase", texte: t.invitation.dit(c.invitant, c.commerce) });
      lignes.push({ sorte: "phrase", texte: t.invitation.ouvrir });
      lignes.push({ sorte: "lien", texte: c.lien });
      lignes.push({ sorte: "phrase", texte: t.invitation.rienEncore });
      lignes.push({ sorte: "note", texte: t.invitation.duree(c.jours) });
      break;
    }
    case "bienvenue": {
      objet = t.bienvenue.objet(c.commerce);
      geste = t.bienvenue.geste(c.commerce);
      lignes.push({ sorte: "phrase", texte: t.bienvenue.salut(c.nom) });
      lignes.push({ sorte: "phrase", texte: t.bienvenue.dit(c.commerce) });
      lignes.push({ sorte: "phrase", texte: t.bienvenue.doigt });
      lignes.push({ sorte: "note", texte: t.bienvenue.mailReste });
      if (c.lien) {
        lignes.push({ sorte: "phrase", texte: t.bienvenue.ouvrir });
        lignes.push({ sorte: "lien", texte: c.lien });
      }
      break;
    }
    case "alerte_appareil": {
      objet = t.alerte_appareil.objet(c.commerce);
      geste = t.alerte_appareil.geste(c.commerce);
      lignes.push({ sorte: "phrase", texte: t.alerte_appareil.dit(c.commerce, c.quand) });
      const ou = [c.appareil, c.lieu].filter(Boolean).join(", ");
      if (ou) lignes.push({ sorte: "phrase", texte: t.alerte_appareil.depuis(ou) });
      lignes.push({ sorte: "phrase", texte: t.alerte_appareil.siVous });
      break;
    }
    case "cle_retiree": {
      objet = t.cle_retiree.objet();
      geste = t.cle_retiree.geste(c.commerce);
      lignes.push({ sorte: "phrase", texte: t.cle_retiree.dit(c.commerce, c.quand) });
      if (c.appareil) lignes.push({ sorte: "phrase", texte: t.cle_retiree.quel(c.appareil) });
      lignes.push({ sorte: "phrase", texte: t.cle_retiree.mailReste });
      break;
    }
  }

  lignes.push({ sorte: "phrase", texte: t.pasVous(geste) });
  lignes.push({ sorte: "note", texte: t.jamaisPin });
  lignes.push({ sorte: "note", texte: t.signature });

  const { texte, html } = rendre(lignes, langue);
  return { objet, texte, html };
}
