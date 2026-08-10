// Les mots de la porte du super-administrateur — planches A1 à A7.
//
// CE QUE CES PHRASES PORTENT, ET QU'AUCUN ÉCRAN NE DOIT RÉÉCRIRE
//
// 1. LE DOIGT EST LA RÈGLE, LE MAIL EST LE SECOURS. Les mots le disent avant
//    la mise en page : « on attend votre doigt », et non « choisissez une
//    méthode ». Deux chemins présentés comme équivalents seraient un mensonge
//    — l'un prouve un appareil, l'autre prouve une boîte aux lettres.
//
// 2. LE REFUS NE DIT JAMAIS SI L'ADRESSE EXISTE. La planche A4 se contredisait :
//    elle promettait « une seule phrase, toujours la même » tout en montrant
//    trois refus différents. La promesse est réécrite ici et elle est plus
//    juste : ce que la porte tait, c'est l'EXISTENCE DU COMPTE. Savoir qu'un
//    code a expiré n'apprend rien à un inconnu, puisqu'il n'a pas de code ;
//    savoir qu'une adresse est connue transforme la porte en annuaire du
//    personnel.
//
// 3. LE NOMBRE DE CODES DE SECOURS NE S'ÉCRIT PAS À LA MAIN. Toutes les phrases
//    qui le mentionnent le reçoivent en paramètre, et l'appelant passe
//    `CODES_DE_SECOURS` — lequel vient de `lib/papier.ts`, qui les fabrique.
//    Un « huit » recopié sur un écran se découvre le soir où quelqu'un compte
//    ses codes restants. `tests/test_porte_admin.py` refuse tout chiffre écrit
//    en dur à côté de ces mots.
//
// 4. AUCUN OBJET DE MESSAGE NE CONTIENT DE CODE. L'objet s'affiche sur un écran
//    verrouillé, dans un train ; il nomme l'appareil qui a demandé. C'est la
//    règle qui se casse le plus silencieusement, parce que « votre code
//    408 913 » a l'air serviable.
//
// POURQUOI LES DEUX LETTRES SONT ÉCRITES ICI ET NON DANS `textes/courrier.ts`
// Les cinq messages de `courrier.ts` nomment tous UN COMMERCE — « Votre clé
// pour Marché · Bafoussam ». La console n'en a aucun, et le seul genre qui s'en
// approche, « alerte_appareil », affirme « un appareil que nous n'avions jamais
// vu » : c'est faux pour une entrée quotidienne, et cette porte les notifie
// TOUTES. Écrire une phrase fausse dans une lettre de sécurité est précisément
// ce qui apprend aux gens à ne plus les lire.
//
// Les deux phrases obligatoires — que faire si ce n'était pas vous, et le
// rappel sur le code PIN — ne sont pas réécrites pour autant : elles sont
// REPRISES de `textes/courrier.ts`, mot pour mot, et le test vérifie qu'elles
// sont là. Le jour où `courrier.ts` accueillera un sixième genre, les deux
// fonctions du bas de ce fichier disparaissent en une ligne.

import type { Langue } from "../langue";
import { textesCourrier, type Message } from "./courrier";

// --- Les deux horloges ------------------------------------------------------
//
// Paris et Douala, côte à côte, sur toutes les lettres. Nelson pilote depuis la
// France une flotte qui vit au Cameroun : sans les deux heures, il doit faire
// une soustraction pour savoir si une entrée de 22 h était la sienne. En août
// l'écart est d'une heure, en janvier de zéro — d'où les fuseaux nommés plutôt
// qu'un décalage écrit en dur, qui aurait été faux la moitié de l'année.

const HEURE_PARIS = "Europe/Paris";
const HEURE_DOUALA = "Africa/Douala";

function heure(quand: Date, fuseau: string, langue: Langue): string {
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    hour: "2-digit", minute: "2-digit", timeZone: fuseau,
  }).format(quand);
}

/** « 14:02 Paris · 13:02 Douala ». Jamais une seule heure. */
export function deuxHorloges(quand: Date, langue: Langue): string {
  return `${heure(quand, HEURE_PARIS, langue)} Paris · `
    + `${heure(quand, HEURE_DOUALA, langue)} Douala`;
}

/** Le jour, dans la langue de la personne. */
export function jourLisible(quand: Date, langue: Langue): string {
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    day: "numeric", month: "long", timeZone: HEURE_PARIS,
  }).format(quand);
}

// --- Les écrans -------------------------------------------------------------

const en = {
  console: "TOTEM ADMIN",
  ariane: "the console that watches every shop, and touches nobody's money",

  // — A1 : l'entrée ————————————————————————————————————————————————
  entree: {
    titre: "Sign in to the console",
    sous:
      "There is no password here, and there never was. Your phone's own lock "
      + "is what opens this door.",

    // Les mots du bouton partagé (`app/cle-boutons.tsx`). Ils sont plus fermes
    // ici que côté client : là-bas le doigt est un chemin, ici c'est LA porte.
    avecLeTelephone: "Unlock with this phone",
    avecLeTelephoneAide:
      "Your phone will ask for your fingerprint, your face or your lock code. "
      + "Nothing leaves it, and a fake TOTEM cannot borrow it.",
    telephoneEnCours: "Waiting for your phone…",
    telephoneRate: "That did not work. Try again, or use the backup below.",
    telephoneImpossible:
      "This browser cannot use a phone lock. Use the backup below, then set "
      + "this device up properly from a phone that can.",

    pourquoi:
      "This console sees seven terminals, twelve SIM cards and four shops at "
      + "once. A forced door here does not cost one shop — it costs all of "
      + "them. That is why the finger comes first, and why email is only a way "
      + "back in.",

    ouBien: "if your phone is out of reach",

    // Le secours, nommé secours.
    secoursTitre: "Email me a backup code",
    secoursAide: (minutes: number) =>
      `A mailbox proves no device: it opens from any screen in the world. So `
      + `this way in is announced — a letter goes out at the same time — and `
      + `the code only opens the door ${minutes} minute(s) later, which is the `
      + `time you have to stop it if it was not you.`,
    adresse: "Your email address",
    demander: "Send me a backup code",
    demandeEnCours: "Sending…",
    // La même phrase pour une adresse connue et pour une adresse inventée.
    parti: (adresse: string) =>
      `If ${adresse} belongs to an administrator, six digits are on their way, `
      + "and a letter says so.",

    papierTitre: "Neither phone nor mailbox? Your printed codes",
    papierAide: (combien: number) =>
      `The ${combien} codes on paper are the last way in, the day the phone `
      + "and the mailbox are out of reach at the same time. Each one opens the "
      + "door once.",
    papierCode: "One code from the paper",
    papierEntrer: "Sign in with this code",
    papierEnCours: "Checking…",
    papierRate: "That did not work. Check the paper, or try another code.",

    notePin:
      "Your Mobile Money PIN is never asked for here. It belongs to the SIM, "
      + "it is typed at the counter, and it takes no part in signing in. "
      + "Anyone asking you for it on this page is not us.",
  },

  // — A2 : les six chiffres ————————————————————————————————————————
  code: {
    titre: "Check your email",
    sous: (adresse: string) =>
      `Six digits are on their way to ${adresse}. Paste them or type them — `
      + "both work.",
    champ: "Your code",
    entrer: "Sign in",
    enCours: "Checking…",
    autreAdresse: "Use another address",
    renvoyer: "Send another one",
    // L'attente est dite en toutes lettres : un bouton grisé sans explication
    // se martèle, un bouton qui dit pourquoi s'attend.
    attente: (secondes: number) =>
      `This code opens the door in ${secondes} s — the letter warning you is `
      + "travelling at the same time.",
    pret: "You can type it now.",
    pasRecu: "It hasn't arrived",
    pasRecu1: "Give it a minute — email is sometimes slow from Douala.",
    pasRecu2: "Look in the spam folder.",
    pasRecu3:
      "Or go back and use your phone's lock, which needs no network at all.",
    seul:
      "This code opens the page you left open, on this screen, once. It cannot "
      + "be used anywhere else, by anyone.",
  },

  // — A4 : les refus, et ce qu'ils ne disent pas ————————————————————
  refus: {
    faux:
      "Those digits don't open the door. Check you are reading the newest "
      + "letter — an older one still shows an old code.",
    expire:
      "That code has expired. Codes last ten minutes, on purpose. Nothing is "
      + "wrong: ask for a fresh one.",
    lent: (mots: string) =>
      `Too many tries. This address is paused for ${mots}. The pause protects `
      + "you, not us — somebody else may be trying it. Your phone's lock keeps "
      + "working during the pause: it proves you hold the phone, which is what "
      + "the pause was protecting.",
    trop: (mots: string) =>
      `Too many codes asked for this address. Try again in ${mots}, or use `
      + "your phone's lock.",
    indisponible:
      "We could not do that just now. Nothing has changed on your account. "
      + "Try again, or use your phone's lock.",
    reseau: "Nothing left this device. Check the connection and try again.",
    // Ce que la porte tait, quoi qu'il arrive. Réécrit : ce n'est pas « une
    // seule phrase toujours la même », c'est « jamais l'existence du compte ».
    jamaisDit: "What this door never says",
    jamais1:
      "Whether the address exists. An unknown address gets the same page, the "
      + "same wait and the same sentence as a known one — otherwise the door "
      + "becomes a list of who works here.",
    jamais2:
      "Anything about the money. No balance, no shop name, no PIN — not before "
      + "signing in, and never on this page.",
    jamais3:
      "Which part was wrong. A wrong code and a code already used come back "
      + "identical: telling them apart would say the code existed.",
  },

  // — A3 : qui a le droit d'être administrateur ——————————————————————
  application: {
    titre: "Who may run the platform",
    sous:
      "Being an administrator is given by an administrator, and it is written "
      + "down: who asked, who said yes, and when it was taken back.",
    demanderTitre: "Ask for access to the platform",
    demanderAide:
      "Say what you need it for, in your own words. This creates nothing — it "
      + "puts your request on somebody's desk.",
    motif: "Why you need it",
    demander: "Send my request",
    demandeEnCours: "Sending…",
    demandePartie:
      "Your request is on the desk of the administrators. Nothing has changed "
      + "on your account yet.",
    deja: "You already have a request in progress.",
    vous: "You are an administrator of the platform.",
    aucun: "Nobody has asked yet",
    aucunDetail:
      "The first administrator is the founding account, named by TOTEM_ADMIN. "
      + "Everyone after that arrives through this page.",
    colonne: {
      qui: "Who",
      demande: "Asked",
      etat: "State",
      appareils: "Devices",
      geste: "",
    },
    etat: {
      attente: "waiting for a decision",
      accorde: "administrator",
      refuse: "refused",
      retire: "taken back",
    },
    accorder: "Grant",
    refuser: "Refuse",
    reprendre: "Take it back",
    motifReprise: "Why (written for someone who was not there)",
    sansAppareil:
      "no device yet — this account cannot get in without email, which is the "
      + "weakest way",
    unSeulAppareil:
      "one device only — a second one is what saves this account the day the "
      + "first is lost",
    pouvoir:
      "An administrator sees every shop and can move no money at all. That "
      + "separation is structural: the power simply does not exist in the code, "
      + "and no screen can hand it out.",
  },

  // — A6 : les appareils ————————————————————————————————————————————
  appareils: {
    titre: "Your devices",
    sous: "Everywhere this account is open, and everything that opens it",
    clesTitre: "The devices that open this account",
    clesNote: (heures: number) =>
      `a session lasts ${heures} hours, then your finger is asked again`,
    aucuneCle: "No device opens this account yet",
    aucuneCleDetail:
      "Right now this account can only be opened by email, which proves a "
      + "mailbox and not a phone. Set up this device, then a second one.",
    colonne: {
      appareil: "Device",
      ou: "Where",
      vue: "Last used",
      geste: "",
    },
    sauvegardee: "copied to your phone maker's account — it survives the phone",
    surCeTelephone: "on this phone only — losing it loses this key",
    retirer: "Remove",
    retirerCe: (appareil: string) => `Remove ${appareil}`,
    retirerMotif: "Why (written for someone who was not there)",
    sessionsTitre: "Open right now",
    sessionsNote: "signing one out takes effect at its next click",
    aucuneSession: "Nothing is open anywhere",
    celleCi: "this one",
    fermer: "Sign out",
    toutFermer: "Sign out everywhere",
    journalTitre: "What happened at the door",
    journalNote: "including the times nothing opened",
    aucunJournal: "Nothing has happened at this door yet",
    issue: {
      ouverte: "signed in",
      refusee: "refused",
      expiree: "code too late",
      ralentie: "paused after too many tries",
      invitation: "invitation accepted",
    },
    moyen: {
      cle: "phone lock",
      courriel: "code by email",
      papier: "paper code",
      invitation: "invitation",
      mot_de_passe: "founder password",
    },
    laDerniereLigne: "The last line",
    laDerniereLigneDit:
      "Nobody is above you. If you lose your devices, your paper and your "
      + "mailbox all at once, no one can let you back in — so a second "
      + "administrator is the only real fix.",
    versApplication: "See who may run the platform",
  },

  // — A5 : ajouter un appareil ——————————————————————————————————————
  ajouter: {
    titre: "Add a device",
    sous: "Four steps, and nothing changes on your account until the last one",
    // Le mot est « il manque », pas « vous pouvez ». C'est une réclamation.
    manqueTitre: (combien: number) =>
      combien === 1
        ? "One more device is missing"
        : `${combien} devices are missing`,
    manqueDit:
      "You have one device. One device is one accident away from an account "
      + "that only email can open — and a mailbox proves no phone. Add a "
      + "second, on another object: the laptop, the tablet, a key you plug in.",
    manqueAucun:
      "No device opens this account yet. Until one does, the only way in is a "
      + "code by email, which proves a mailbox and not a phone. Set this one "
      + "up, then a second.",
    assez: (combien: number) =>
      `${combien} devices open this account. That is the floor, not the ceiling `
      + "— one more costs nothing.",
    pas1: "Be on the device you want to add",
    pas1Dit:
      "The lock belongs to the object you are holding. Adding your laptop from "
      + "your phone is not possible, and that is what makes this safe.",
    pas2: "Press the button",
    pas2Dit:
      "Your phone or computer asks for your fingerprint, your face, or its own "
      + "lock code. Nothing is typed, nothing is remembered.",
    pas3: "Name it, so you know which one to remove later",
    pas3Dit:
      "We write down what the browser says — « Chrome on macOS ». It is rough "
      + "on purpose: enough for you to recognise an object in your pocket.",
    pas4: (combien: number) =>
      `Print your ${combien} backup codes and put them somewhere that is not a phone`,
    pas4Dit: (combien: number) =>
      `The ${combien} codes on paper are the day everything else is gone. They `
      + "are shown once, at the moment they are made, and never again.",
    versPapier: "Make my backup codes",
    poser: "Set up this device",
    poserAide:
      "Your phone will ask you to confirm. Nothing is saved until it does.",
    poserEnCours: "Waiting for this device…",
    poserFait:
      "This device is set up. It only opens this account from this object.",
    poserFaitSauvegardee:
      "This device is set up. Its key is copied to your phone maker's account, "
      + "so it survives a lost phone — which also means the maker's account "
      + "must be as well guarded as this one.",
    poserRate: "This device did not confirm. Try again.",
    poserImpossible:
      "This browser cannot hold a device key. Open this page on a phone or a "
      + "recent computer.",
    plusTard: "Later",
    partage:
      "This session was opened on a shared handset, and a key is never set up "
      + "on one: on a device several people hold, a key identifies nobody.",
    versAppareils: "Back to my devices",
  },

  // — A7 : les courriels de la porte ————————————————————————————————
  courriels: {
    titre: "The letters this door sends",
    sous: "What goes out, when, and what actually left",
    quoiTitre: "What goes out, and when",
    quandCode: "Every backup code",
    quandCodeDit:
      "The subject names the device that asked. The digits are inside, never "
      + "in the subject line — a subject shows up on a locked screen.",
    quandEntree: "Every single sign-in",
    quandEntreeDit:
      "Not only from a device we had never seen: every one. On this account, a "
      + "sign-in you did not make must catch your eye the same day.",
    quandRetrait: "When a device is removed",
    quandRetraitDit:
      "Removing a device is exactly what somebody would do after taking your "
      + "account, so it is announced too.",
    quandPapier: (combien: number) =>
      `When one of your ${combien} paper codes is left`,
    quandPapierDit:
      "Never the codes themselves — only the news that you are running out.",
    reglesTitre: "What every one of these letters obeys",
    regle1: "No code in a subject line",
    regle1Dit:
      "The subject names the device that asked. The digits stay inside the "
      + "letter, where a locked screen does not show them.",
    regle2: "Never a code and a link in the same letter",
    regle2Dit:
      "That pair is the shape of phishing itself. Keeping them apart is what "
      + "makes the real letter recognisable.",
    regle3: "Two clocks, always",
    regle3Dit:
      "Paris and Douala side by side. You should never do arithmetic to know "
      + "whether a sign-in at 22:00 was yours.",
    regle4: "One link at most, no image, no tracking",
    regle4Dit:
      "A letter carrying a code must survive a slow line in Douala, and a "
      + "tracking pixel tells somebody else when you read it.",
    journalTitre: "What actually left",
    journalNote: "the genre, the moment and the outcome — never the contents",
    aucunJournal: "No letter has gone out for this account yet",
    colonne: {
      quand: "When",
      genre: "Letter",
      vers: "To",
      issue: "Outcome",
    },
    genre: {
      code: "a code",
      invitation: "an invitation",
      bienvenue: "a welcome",
      alerte_appareil: "a sign-in notice",
      cle_retiree: "a device was removed",
    },
    issue: {
      partie: "accepted by the provider",
      refusee: "refused — trying again changes nothing",
      injoignable: "the network cut — trying again makes sense",
      sans_cle: "TOTEM was not configured: COURRIER_CLE is missing",
      sans_expediteur: "TOTEM was not configured: COURRIER_EXPEDITEUR is missing",
      adresse: "that address did not look like an address",
    },
    riendedans:
      "This journal holds the genre, the address, the moment and the outcome. "
      + "It holds no code, no token, no subject and no body — there is no "
      + "column for that, on purpose.",
  },

  // — Les deux lettres —————————————————————————————————————————————
  lettre: {
    entree: {
      objet: (appareil: string) => `Signed in to TOTEM ADMIN — ${appareil}`,
      dit: (appareil: string) =>
        `The platform console was opened from ${appareil}.`,
      quand: (horloges: string) => `At ${horloges}.`,
      ou: (lieu: string) => `Seen from ${lieu}.`,
      comment: {
        cle: "The way in: the lock of that device.",
        courriel: "The way in: a backup code sent to this mailbox.",
        papier: "The way in: one of your printed backup codes.",
      },
      siVous:
        "If that was you, there is nothing to do — this letter is a record. "
        + "You get one for every sign-in, and that is deliberate: on this "
        + "account, one you did not make must catch your eye the same day.",
      geste:
        "open your devices page, sign out everywhere, and remove the device "
        + "you do not recognise. Then set up a fresh one before doing anything "
        + "else.",
    },
    secours: {
      objet: (appareil: string) => `A backup code was asked for — ${appareil}`,
      dit: (appareil: string) =>
        `Somebody asked for a code by email to open the platform console from `
        + `${appareil}.`,
      quand: (horloges: string) => `At ${horloges}.`,
      ou: (lieu: string) => `Asked from ${lieu}.`,
      attente: (minutes: number) =>
        `That code does not open anything for ${minutes} minute(s). This letter `
        + "is travelling ahead of it on purpose: if it was not you, this is the "
        + "time you have.",
      siVous: "If that was you, type the digits when the wait is over.",
      geste:
        "do not type those digits anywhere, and open your devices page from a "
        + "device you trust: sign out everywhere, then remove anything you do "
        + "not recognise.",
    },
  },
};

const fr: typeof en = {
  console: "TOTEM ADMIN",
  ariane: "la console qui surveille tous les commerces, et ne touche l'argent d'aucun",

  entree: {
    titre: "Entrer dans la console",
    sous:
      "Il n'y a pas de mot de passe ici, et il n'y en a jamais eu. C'est le "
      + "verrouillage de votre téléphone qui ouvre cette porte.",

    avecLeTelephone: "Déverrouiller avec ce téléphone",
    avecLeTelephoneAide:
      "Votre téléphone va demander votre empreinte, votre visage ou son code "
      + "de verrouillage. Rien n'en sort, et un faux TOTEM ne peut pas s'en "
      + "servir.",
    telephoneEnCours: "On attend votre téléphone…",
    telephoneRate: "Ça n'a pas marché. Réessayez, ou passez par le secours ci-dessous.",
    telephoneImpossible:
      "Ce navigateur ne sait pas se servir du verrouillage d'un téléphone. "
      + "Passez par le secours ci-dessous, puis installez proprement cet accès "
      + "depuis un appareil qui sait le faire.",

    pourquoi:
      "Cette console voit sept boîtiers, douze puces et quatre commerces à la "
      + "fois. Une porte forcée ici ne coûte pas une boutique : elle les coûte "
      + "toutes. C'est pour cela que le doigt passe devant, et que le mail "
      + "n'est qu'un chemin de retour.",

    ouBien: "si votre téléphone est hors de portée",

    secoursTitre: "M'envoyer un code de secours par mail",
    secoursAide: (minutes: number) =>
      "Une boîte aux lettres ne prouve aucun appareil : elle s'ouvre depuis "
      + "n'importe quel écran du monde. Ce chemin s'annonce donc — une lettre "
      + `part en même temps — et le code n'ouvre la porte que ${minutes} minute(s) `
      + "plus tard, ce qui vous laisse le temps de l'arrêter si ce n'était pas "
      + "vous.",
    adresse: "Votre adresse mail",
    demander: "M'envoyer un code de secours",
    demandeEnCours: "Envoi…",
    parti: (adresse: string) =>
      `Si ${adresse} appartient à un administrateur, six chiffres sont en `
      + "route, et une lettre le dit.",

    papierTitre: "Ni téléphone ni boîte mail ? Vos codes imprimés",
    papierAide: (combien: number) =>
      `Les ${combien} codes sur papier sont le dernier chemin, le jour où le `
      + "téléphone et la boîte mail sont hors de portée en même temps. Chacun "
      + "ouvre la porte une fois.",
    papierCode: "Un code du papier",
    papierEntrer: "Entrer avec ce code",
    papierEnCours: "Vérification…",
    papierRate: "Ça n'a pas marché. Vérifiez le papier, ou essayez un autre code.",

    notePin:
      "Votre code PIN Mobile Money n'est jamais demandé ici. Il appartient à la "
      + "puce, il se compose au comptoir, et il ne participe pas à l'entrée. "
      + "Quiconque vous le demande sur cette page n'est pas nous.",
  },

  code: {
    titre: "Regardez votre boîte mail",
    sous: (adresse: string) =>
      `Six chiffres sont en route vers ${adresse}. Collez-les ou tapez-les — `
      + "les deux marchent.",
    champ: "Votre code",
    entrer: "Entrer",
    enCours: "Vérification…",
    autreAdresse: "Utiliser une autre adresse",
    renvoyer: "En envoyer un autre",
    attente: (secondes: number) =>
      `Ce code ouvrira la porte dans ${secondes} s — la lettre qui vous `
      + "prévient voyage en même temps.",
    pret: "Vous pouvez le taper maintenant.",
    pasRecu: "Il n'arrive pas",
    pasRecu1: "Laissez-lui une minute — le mail est parfois lent depuis Douala.",
    pasRecu2: "Regardez dans les indésirables.",
    pasRecu3:
      "Ou revenez en arrière et servez-vous du verrouillage de votre "
      + "téléphone, qui ne demande aucun réseau.",
    seul:
      "Ce code ouvre la page que vous avez laissée ouverte, sur cet écran, une "
      + "fois. Il ne sert nulle part ailleurs, à personne.",
  },

  refus: {
    faux:
      "Ces chiffres n'ouvrent pas. Vérifiez que vous lisez la lettre la plus "
      + "récente — une ancienne montre encore un vieux code.",
    expire:
      "Ce code a expiré. Les codes durent dix minutes, exprès. Rien ne va mal : "
      + "demandez-en un neuf.",
    lent: (mots: string) =>
      `Trop d'essais. Cette adresse est en pause pendant ${mots}. La pause vous `
      + "protège, pas nous — quelqu'un d'autre essaie peut-être. Le "
      + "verrouillage de votre téléphone continue de marcher pendant la pause : "
      + "il prouve que vous tenez le téléphone, et c'est justement ce que la "
      + "pause protégeait.",
    trop: (mots: string) =>
      `Trop de codes demandés pour cette adresse. Réessayez dans ${mots}, ou `
      + "servez-vous du verrouillage de votre téléphone.",
    indisponible:
      "Nous n'avons pas pu le faire à l'instant. Rien n'a changé sur votre "
      + "compte. Réessayez, ou servez-vous du verrouillage de votre téléphone.",
    reseau: "Rien n'est parti de cet appareil. Vérifiez la connexion et réessayez.",
    jamaisDit: "Ce que cette porte ne dit jamais",
    jamais1:
      "Si l'adresse existe. Une adresse inconnue reçoit la même page, la même "
      + "attente et la même phrase qu'une adresse connue — sinon la porte "
      + "devient la liste de qui travaille ici.",
    jamais2:
      "Quoi que ce soit sur l'argent. Aucun solde, aucun nom de commerce, aucun "
      + "code PIN — ni avant d'entrer, ni jamais sur cette page.",
    jamais3:
      "Quelle partie était fausse. Un code faux et un code déjà servi repartent "
      + "à l'identique : les distinguer dirait que le code existait.",
  },

  application: {
    titre: "Qui a le droit d'administrer la plateforme",
    sous:
      "Être administrateur se donne par un administrateur, et cela s'écrit : "
      + "qui a demandé, qui a dit oui, et quand on l'a repris.",
    demanderTitre: "Demander l'accès à la plateforme",
    demanderAide:
      "Dites à quoi cela doit vous servir, dans vos mots. Cela ne crée rien : "
      + "cela pose votre demande sur le bureau de quelqu'un.",
    motif: "Pourquoi vous en avez besoin",
    demander: "Envoyer ma demande",
    demandeEnCours: "Envoi…",
    demandePartie:
      "Votre demande est sur le bureau des administrateurs. Rien n'a encore "
      + "changé sur votre compte.",
    deja: "Vous avez déjà une demande en cours.",
    vous: "Vous êtes administrateur de la plateforme.",
    aucun: "Personne n'a encore demandé",
    aucunDetail:
      "Le premier administrateur est le compte fondateur, désigné par "
      + "TOTEM_ADMIN. Tous les suivants arrivent par cette page.",
    colonne: {
      qui: "Qui",
      demande: "Demandé",
      etat: "État",
      appareils: "Appareils",
      geste: "",
    },
    etat: {
      attente: "attend une décision",
      accorde: "administrateur",
      refuse: "refusé",
      retire: "repris",
    },
    accorder: "Accorder",
    refuser: "Refuser",
    reprendre: "Reprendre",
    motifReprise: "Pourquoi (écrit pour quelqu'un qui n'était pas là)",
    sansAppareil:
      "aucun appareil — ce compte ne peut entrer que par mail, ce qui est le "
      + "chemin le plus faible",
    unSeulAppareil:
      "un seul appareil — c'est le second qui sauve ce compte le jour où le "
      + "premier est perdu",
    pouvoir:
      "Un administrateur voit tous les commerces et ne peut déplacer aucun "
      + "argent. Cette séparation est structurelle : le pouvoir n'existe pas "
      + "dans le code, et aucun écran ne peut le distribuer.",
  },

  appareils: {
    titre: "Vos appareils",
    sous: "Partout où ce compte est ouvert, et tout ce qui l'ouvre",
    clesTitre: "Les appareils qui ouvrent ce compte",
    clesNote: (heures: number) =>
      `une session dure ${heures} heures, puis on redemande votre doigt`,
    aucuneCle: "Aucun appareil n'ouvre encore ce compte",
    aucuneCleDetail:
      "Pour l'instant, ce compte ne s'ouvre que par mail, ce qui prouve une "
      + "boîte aux lettres et non un téléphone. Installez cet appareil, puis un "
      + "second.",
    colonne: {
      appareil: "Appareil",
      ou: "Où",
      vue: "Dernière fois",
      geste: "",
    },
    sauvegardee:
      "recopié dans le compte du fabricant — il survit au téléphone",
    surCeTelephone:
      "sur ce téléphone seulement — le perdre, c'est perdre cette clé",
    retirer: "Retirer",
    retirerCe: (appareil: string) => `Retirer ${appareil}`,
    retirerMotif: "Pourquoi (écrit pour quelqu'un qui n'était pas là)",
    sessionsTitre: "Ouvert en ce moment",
    sessionsNote: "fermer une session prend effet à son prochain clic",
    aucuneSession: "Rien n'est ouvert nulle part",
    celleCi: "celle-ci",
    fermer: "Fermer",
    toutFermer: "Tout fermer, partout",
    journalTitre: "Ce qui s'est passé à la porte",
    journalNote: "y compris les fois où rien ne s'est ouvert",
    aucunJournal: "Rien ne s'est encore passé à cette porte",
    issue: {
      ouverte: "entrée",
      refusee: "refusée",
      expiree: "code trop tard",
      ralentie: "pause après trop d'essais",
      invitation: "invitation acceptée",
    },
    moyen: {
      cle: "verrouillage du téléphone",
      courriel: "code par mail",
      papier: "code du papier",
      invitation: "invitation",
      mot_de_passe: "mot de passe fondateur",
    },
    laDerniereLigne: "La dernière ligne",
    laDerniereLigneDit:
      "Personne n'est au-dessus de vous. Si vous perdez vos appareils, votre "
      + "papier et votre boîte mail en même temps, personne ne peut vous faire "
      + "rentrer — un second administrateur est la seule vraie réponse.",
    versApplication: "Voir qui a le droit d'administrer",
  },

  ajouter: {
    titre: "Ajouter un appareil",
    sous: "Quatre étapes, et rien ne change sur votre compte avant la dernière",
    manqueTitre: (combien: number) =>
      combien === 1
        ? "Il manque un appareil"
        : `Il manque ${combien} appareils`,
    manqueDit:
      "Vous avez un appareil. Un appareil, c'est un accident avant un compte "
      + "que seul le mail ouvre — et une boîte aux lettres ne prouve aucun "
      + "téléphone. Ajoutez-en un second, sur un AUTRE objet : l'ordinateur, la "
      + "tablette, une clé qu'on branche.",
    manqueAucun:
      "Aucun appareil n'ouvre encore ce compte. Tant que c'est le cas, le seul "
      + "chemin est un code par mail, qui prouve une boîte aux lettres et non "
      + "un téléphone. Installez celui-ci, puis un second.",
    assez: (combien: number) =>
      `${combien} appareils ouvrent ce compte. C'est le plancher, pas le `
      + "plafond — un de plus ne coûte rien.",
    pas1: "Soyez sur l'appareil que vous voulez ajouter",
    pas1Dit:
      "Le verrouillage appartient à l'objet que vous tenez. Ajouter votre "
      + "ordinateur depuis votre téléphone est impossible, et c'est exactement "
      + "ce qui rend cela sûr.",
    pas2: "Appuyez sur le bouton",
    pas2Dit:
      "Votre téléphone ou votre ordinateur demande votre empreinte, votre "
      + "visage, ou son propre code. Rien ne se tape, rien ne se retient.",
    pas3: "On le nomme, pour que vous sachiez lequel retirer plus tard",
    pas3Dit:
      "On note ce que le navigateur dit — « Chrome sur macOS ». C'est grossier "
      + "exprès : assez pour que vous reconnaissiez un objet de votre poche.",
    pas4: (combien: number) =>
      `Imprimez vos ${combien} codes de secours et rangez-les ailleurs que dans un téléphone`,
    pas4Dit: (combien: number) =>
      `Les ${combien} codes sur papier sont le jour où tout le reste a disparu. `
      + "Ils s'affichent une fois, au moment où on les fabrique, et jamais plus.",
    versPapier: "Fabriquer mes codes de secours",
    poser: "Installer cet appareil",
    poserAide:
      "Votre téléphone va demander confirmation. Rien n'est enregistré avant.",
    poserEnCours: "On attend cet appareil…",
    poserFait:
      "Cet appareil est installé. Il n'ouvre ce compte que depuis cet objet.",
    poserFaitSauvegardee:
      "Cet appareil est installé. Sa clé est recopiée dans le compte du "
      + "fabricant, donc elle survit au téléphone perdu — ce qui veut dire "
      + "aussi que ce compte-là doit être gardé aussi bien que celui-ci.",
    poserRate: "Cet appareil n'a pas confirmé. Réessayez.",
    poserImpossible:
      "Ce navigateur ne sait pas porter de clé d'appareil. Ouvrez cette page "
      + "sur un téléphone ou un ordinateur récent.",
    plusTard: "Plus tard",
    partage:
      "Cette session a été ouverte sur un combiné partagé, et on n'y pose "
      + "jamais de clé : sur un appareil que plusieurs personnes tiennent, une "
      + "clé n'identifie personne.",
    versAppareils: "Revenir à mes appareils",
  },

  courriels: {
    titre: "Les lettres que cette porte envoie",
    sous: "Ce qui part, quand, et ce qui est vraiment parti",
    quoiTitre: "Ce qui part, et quand",
    quandCode: "À chaque code de secours",
    quandCodeDit:
      "L'objet nomme l'appareil qui a demandé. Les chiffres sont dedans, jamais "
      + "dans l'objet — un objet s'affiche sur un écran verrouillé.",
    quandEntree: "À chaque entrée, sans exception",
    quandEntreeDit:
      "Pas seulement depuis un appareil inconnu : toutes. Sur ce compte, une "
      + "entrée que vous n'avez pas faite doit vous sauter aux yeux le jour "
      + "même.",
    quandRetrait: "Quand un appareil est retiré",
    quandRetraitDit:
      "Retirer un appareil est exactement ce que ferait quelqu'un qui vient de "
      + "prendre votre compte : cela s'annonce aussi.",
    quandPapier: (combien: number) =>
      `Quand il reste un seul de vos ${combien} codes papier`,
    quandPapierDit:
      "Jamais les codes eux-mêmes — seulement la nouvelle qu'ils s'épuisent.",
    reglesTitre: "Ce que chacune de ces lettres respecte",
    regle1: "Aucun code dans un objet",
    regle1Dit:
      "L'objet nomme l'appareil qui a demandé. Les chiffres restent dans la "
      + "lettre, là où un écran verrouillé ne les montre pas.",
    regle2: "Jamais un code et un lien dans la même lettre",
    regle2Dit:
      "Cette paire est la forme même de l'hameçonnage. Les tenir séparés est ce "
      + "qui rend la vraie lettre reconnaissable.",
    regle3: "Deux horloges, toujours",
    regle3Dit:
      "Paris et Douala côte à côte. On ne doit jamais faire une soustraction "
      + "pour savoir si l'entrée de 22 h était la sienne.",
    regle4: "Un lien au plus, aucune image, aucun traçage",
    regle4Dit:
      "Une lettre qui porte un code doit survivre à une ligne lente à Douala, "
      + "et un pixel de suivi apprend à quelqu'un d'autre quand vous l'avez "
      + "lue.",
    journalTitre: "Ce qui est vraiment parti",
    journalNote: "le genre, le moment et l'issue — jamais le contenu",
    aucunJournal: "Aucune lettre n'est encore partie pour ce compte",
    colonne: {
      quand: "Quand",
      genre: "Lettre",
      vers: "Vers",
      issue: "Issue",
    },
    genre: {
      code: "un code",
      invitation: "une invitation",
      bienvenue: "une bienvenue",
      alerte_appareil: "un avis d'entrée",
      cle_retiree: "un appareil retiré",
    },
    issue: {
      partie: "acceptée par le fournisseur",
      refusee: "refusée — réessayer ne change rien",
      injoignable: "le réseau a coupé — réessayer a du sens",
      sans_cle: "TOTEM n'était pas configuré : COURRIER_CLE manque",
      sans_expediteur: "TOTEM n'était pas configuré : COURRIER_EXPEDITEUR manque",
      adresse: "cette adresse n'avait pas la forme d'une adresse",
    },
    riendedans:
      "Ce journal garde le genre, l'adresse, le moment et l'issue. Il ne garde "
      + "ni code, ni jeton, ni objet, ni corps — il n'y a aucune colonne pour "
      + "cela, exprès.",
  },

  lettre: {
    entree: {
      objet: (appareil: string) => `Entrée dans TOTEM ADMIN — ${appareil}`,
      dit: (appareil: string) =>
        `La console de la plateforme a été ouverte depuis ${appareil}.`,
      quand: (horloges: string) => `À ${horloges}.`,
      ou: (lieu: string) => `Vue depuis ${lieu}.`,
      comment: {
        cle: "Le chemin : le verrouillage de cet appareil.",
        courriel: "Le chemin : un code de secours envoyé dans cette boîte.",
        papier: "Le chemin : un de vos codes de secours imprimés.",
      },
      siVous:
        "Si c'était vous, il n'y a rien à faire — cette lettre est une trace. "
        + "Vous en recevez une à chaque entrée, et c'est délibéré : sur ce "
        + "compte, une entrée que vous n'avez pas faite doit vous sauter aux "
        + "yeux le jour même.",
      geste:
        "ouvrez votre page des appareils, fermez tout partout, et retirez "
        + "l'appareil que vous ne reconnaissez pas. Puis installez-en un neuf "
        + "avant toute autre chose.",
    },
    secours: {
      objet: (appareil: string) => `Un code de secours a été demandé — ${appareil}`,
      dit: (appareil: string) =>
        "Quelqu'un a demandé un code par mail pour ouvrir la console de la "
        + `plateforme depuis ${appareil}.`,
      quand: (horloges: string) => `À ${horloges}.`,
      ou: (lieu: string) => `Demandé depuis ${lieu}.`,
      attente: (minutes: number) =>
        `Ce code n'ouvre rien pendant ${minutes} minute(s). Cette lettre le `
        + "précède exprès : si ce n'était pas vous, c'est le temps dont vous "
        + "disposez.",
      siVous: "Si c'était vous, tapez les chiffres quand l'attente est finie.",
      geste:
        "ne recopiez ces chiffres nulle part, et ouvrez votre page des "
        + "appareils depuis un appareil de confiance : fermez tout partout, "
        + "puis retirez ce que vous ne reconnaissez pas.",
    },
  },
};

export const textesAdminPorte = { en, fr } as const;

// --- Les deux lettres, fabriquées ------------------------------------------
//
// Elles ne passent pas par `composer` de `textes/courrier.ts` : voir l'en-tête.
// Ce qu'elles lui reprennent, en revanche, ce sont les DEUX PHRASES
// OBLIGATOIRES — ce qu'il faut faire si ce n'était pas vous, et le rappel sur
// le code PIN. Elles sont ajoutées ici de la même façon, à la fin de tout, et
// `tests/test_porte_admin.py` vérifie qu'elles y sont.

function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Le corps, dans les deux formes, à partir d'UNE liste de phrases.
 *
 * Écrire le texte et le HTML séparément, c'est les laisser diverger — et c'est
 * toujours la version texte, celle que lisent les vieux clients de messagerie
 * et les lecteurs d'écran, qui perd la phrase importante.
 *
 * Aucune image, aucun pixel de suivi, aucun lien : une lettre de cette porte
 * ne porte jamais de lien, parce qu'elle accompagne parfois un code, et qu'un
 * code avec un lien est la forme même de l'hameçonnage.
 */
function rendre(phrases: string[], notes: string[], langue: Langue) {
  const texte = [...phrases, ...notes].join("\n\n");
  const corps = [
    ...phrases.map((p) => `<p style="margin:16px 0">${echapper(p)}</p>`),
    ...notes.map((n) =>
      `<p style="margin:16px 0;font-size:13px;line-height:20px;color:#5b5b5b">`
      + `${echapper(n)}</p>`),
  ].join("\n");
  const html =
    `<!doctype html>\n<html lang="${langue}">\n<head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width"></head>\n`
    + `<body style="margin:0;padding:24px;background:#faf7f2">\n`
    + `<div style="max-width:520px;margin:0 auto;font-family:system-ui,-apple-system,`
    + `Segoe UI,Roboto,sans-serif;font-size:15px;line-height:23px;color:#1c1a17">\n`
    + `<p style="margin:0 0 24px;font-size:15px;font-weight:700;letter-spacing:.18em">TOTEM ADMIN</p>\n`
    + `${corps}\n</div>\n</body>\n</html>`;
  return { texte, html };
}

export type FaitsDuneEntree = {
  quand: Date;
  appareil: string | null;
  lieu: string | null;
  moyen: "cle" | "courriel" | "papier";
};

/** « Entrée dans TOTEM ADMIN — Chrome sur macOS ». Aucun code dans l'objet. */
export function lettreDuneEntree(langue: Langue, f: FaitsDuneEntree): Message {
  const t = textesAdminPorte[langue];
  const commun = textesCourrier[langue];
  const appareil = f.appareil || (langue === "en" ? "a browser" : "un navigateur");
  const phrases = [
    t.lettre.entree.dit(appareil),
    t.lettre.entree.quand(deuxHorloges(f.quand, langue)),
    ...(f.lieu ? [t.lettre.entree.ou(f.lieu)] : []),
    t.lettre.entree.comment[f.moyen],
    t.lettre.entree.siVous,
    commun.pasVous(t.lettre.entree.geste),
  ];
  const { texte, html } = rendre(phrases, [commun.jamaisPin, commun.signature], langue);
  return { objet: t.lettre.entree.objet(appareil), texte, html };
}

export type FaitsDunSecours = {
  quand: Date;
  appareil: string | null;
  lieu: string | null;
  minutes: number;
};

/** La lettre qui précède le code de secours, et qui est tout son intérêt. */
export function lettreDunSecours(langue: Langue, f: FaitsDunSecours): Message {
  const t = textesAdminPorte[langue];
  const commun = textesCourrier[langue];
  const appareil = f.appareil || (langue === "en" ? "a browser" : "un navigateur");
  const phrases = [
    t.lettre.secours.dit(appareil),
    t.lettre.secours.quand(deuxHorloges(f.quand, langue)),
    ...(f.lieu ? [t.lettre.secours.ou(f.lieu)] : []),
    t.lettre.secours.attente(f.minutes),
    t.lettre.secours.siVous,
    commun.pasVous(t.lettre.secours.geste),
  ];
  const { texte, html } = rendre(phrases, [commun.jamaisPin, commun.signature], langue);
  return { objet: t.lettre.secours.objet(appareil), texte, html };
}
