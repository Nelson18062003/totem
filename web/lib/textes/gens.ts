// Les textes des gens du commerce — et de ce que chaque rôle voit en arrivant.
//
// Deux écrans partagent ce dictionnaire, et ce n'est pas un hasard : `/gens`
// distribue les clés, l'accueil montre ce que la clé ouvre. Les deux disent la
// MÊME chose d'un rôle, et il faut qu'ils la disent avec les mêmes mots — une
// personne invitée « au comptoir » qui lirait ailleurs « opérateur » croirait
// à deux choses différentes.
//
// TROIS RÈGLES D'ÉCRITURE ICI
//
// · Le rôle se nomme en toutes lettres : « au comptoir », jamais « operateur ».
//   Le mot technique ne sort de la base sous aucun prétexte.
//
// · Ce qu'un rôle permet ET ce qu'il interdit se lisent AVANT de valider. Un
//   rôle qu'on découvre par un refus se vit comme une panne, et pousse à
//   emprunter le compte du patron.
//
// · Reprendre une clé se raconte au futur, avant le geste, avec ses trois
//   conséquences. « C'est immédiat » ne se devine pas : si l'écran ne l'écrit
//   pas, personne ne sait que le téléphone se ferme dans la seconde — et la
//   propriétaire appellera quelqu'un au lieu d'appuyer.

const en = {
  // --- L'écran des gens ----------------------------------------------------
  titre: "Who has a key to your shop",
  sousTitre:
    "You can take a key back at any moment, and it stops working the same "
    + "second — not at that person's next sign-in.",

  vous: "you",
  ici: "signed in now",
  vuLe: (quand: string) => `last in ${quand}`,
  jamaisVu: "has not come in yet",
  depuis: (quand: string) => `since ${quand}`,
  retireLe: (quand: string) => `key taken back on ${quand}`,
  // Rien ne s'efface : une personne partie reste dans la liste, datée.
  partis: "No longer with a key",
  personne: "Nobody has a key yet, apart from you.",

  // Les quatre rôles, en toutes lettres. Ces mots-là sont les seuls qui
  // paraissent à l'écran ; « operateur », « lecteur » restent en base.
  role: {
    proprietaire: "the owner",
    operateur: "at the counter",
    lecteur: "read only",
    admin: "the platform",
  },
  // Ce que le rôle permet — lu avant de donner la clé, pas après.
  permet: {
    proprietaire: [
      "Read the balances and download every receipt",
      "Send money, at the counter, with the SIM's own PIN",
      "Give a key to someone, and take it back",
    ],
    operateur: [
      "Read the balances, whenever they want",
      "Classify what arrives and hand out the receipts",
    ],
    lecteur: [
      "Read the balances, whenever they want",
      "Download any receipt, in both languages",
    ],
    admin: [
      "See the fleet, the versions and the journal",
      "Read this shop to help, and only to help",
    ],
  },
  // Et ce qu'il interdit. Un rôle sans interdit ne se comprend pas.
  interdit: {
    proprietaire: [
      "Nothing. This is the whole shop, money included.",
    ],
    operateur: [
      "Cannot send money — that stays yours",
      "Cannot give a key to anyone, nor take one back",
    ],
    lecteur: [
      "Cannot send money, and no button will ever let them",
      "Cannot classify an SMS, nor issue a receipt",
    ],
    admin: [
      "Can never move money, by any path — that separation is built in",
      "Cannot give a key to your shop",
    ],
  },

  // --- Donner une clé ------------------------------------------------------
  donner: "Give someone a key",
  donnerTitre: "Give a key",
  nom: "Their name",
  nomAide: "As you call them: J. Eyenga",
  courriel: "Their email address",
  // L'adresse, pas le numéro : la question sera posée, autant y répondre ici.
  courrielAide: "The six digits will be sent there. A number changes with the SIM; an address follows the person.",
  quelRole: "What they will be",
  ceQuIlPourra: "What they will be able to do",
  ceQuIlNePourraPas: "What they will not be able to do",
  envoyer: "Create the link",
  envoiEnCours: "Creating…",
  renoncer: "Not now",

  // Le lien, montré une seule fois : le jeton n'existe en clair que dans ce
  // message. La base n'en garde que l'empreinte, et rien ne pourra le relire.
  lienTitre: (nom: string) => `The link for ${nom}`,
  lienDit:
    "Send it by WhatsApp, the way you send everything else. It shows once, "
    + "here, and cannot be shown again — if it gets lost, cancel the invitation "
    + "and make a new one.",
  copier: "Copy the link",
  copie: "Copied",
  lienSeul:
    "The link alone opens nothing: six digits go to their address as well.",
  fini: "Done",

  // --- Les invitations qui attendent ---------------------------------------
  attenteTitre: "Waiting for an answer",
  inviteeLe: (quand: string) => `invited ${quand}`,
  pasRepondu: "has not answered yet",
  // Le signal qui compte : quelqu'un a ouvert le lien avant la personne visée.
  ouvertAvant: "This link was opened before your person got it",
  ouvertAvantDit:
    "That may be nothing — a forwarded message, a preview. It may also be "
    + "someone else. The safe gesture is to cancel it and send a fresh one.",
  annuler: "Cancel this invitation",
  annulEnCours: "Cancelling…",

  // --- Les appareils -------------------------------------------------------
  appareils: "Their open devices",
  aucunAppareil: "Nothing open right now.",
  appareilPartage: "counter phone",
  fermerAppareil: "Close this one",
  fermetureEnCours: "Closing…",
  avecLeTelephone: (n: number) =>
    n === 1 ? "1 phone opens with its own lock" : `${n} phones open with their own lock`,

  // --- Reprendre la clé ----------------------------------------------------
  // Le bouton de la rangée n'annonce pas « reprendre » : il ouvre ce qui
  // concerne la clé de cette personne — ses appareils d'abord, la reprise
  // ensuite. Fermer l'ordinateur du comptoir laissé ouvert suffit souvent,
  // et ne coûte pas sa clé à quelqu'un qui travaille demain matin.
  saCle: "Their key",
  reprendreTitre: (nom: string) => `Take ${nom}'s key back?`,
  reprendreDit: (n: number) =>
    n === 0
      ? "Nothing of theirs is open right now."
      : n === 1
        ? "One device of theirs is open right now."
        : `${n} devices of theirs are open right now.`,
  // Les trois conséquences, dites avant le geste. La première est TOUT
  // l'écart entre une case cochée et une sécurité.
  consequences: [
    "Their phone closes within the second — not at their next sign-in, now.",
    "Their fingerprint will not open it again either: the key is checked at every entry.",
    "The receipts they handed out stay in the journal, with their name on them.",
    "Nothing changes for your money, your SIMs, or your PIN.",
  ],
  garder: "Keep the key",
  reprendreMaintenant: "Take it back now",
  repriseEnCours: "Taking it back…",
  reprise: "Done. That key no longer opens anything.",
  // On ne se ferme pas la porte à soi-même.
  pasVous: "You cannot take back your own key from here.",

  // --- Ce qui n'a pas marché ------------------------------------------------
  rate: "That did not work. Try again in a moment.",
  champsManquants: "A name and an email address are needed.",
  adresseDouteuse: "That address does not look like an address. Check it.",
  sansCommerceTitre: "Your shop is not named yet",
  sansCommerceDit:
    "A key is given to a shop, and yours has no name in TOTEM yet. Name it in "
    + "Settings, and this page will work.",
  versReglages: "Go to Settings",

  // --- L'accueil, selon le rôle --------------------------------------------
  // Le lien vers les gens, pour la propriétaire.
  lesGens: "The people of your shop",
  lesGensAide: (n: number) =>
    n === 1 ? "1 person has a key" : `${n} people have a key`,

  // Le geste réservé, montré à qui ne fait pas sortir l'argent. Ce n'est pas
  // un bouton grisé : c'est qui peut le faire, et comment le lui demander.
  reserveTitre: (nom: string) => `Sending money is ${nom}'s`,
  reserveTitreSansNom: "Sending money belongs to the owner",
  reserveDit:
    "You read the balances and you hand out the receipts. Moving the money is "
    + "done at the counter, with the SIM's own PIN, by the person who owns it — "
    + "not from a web page, and not by TOTEM.",
  appeler: (nom: string) => `Call ${nom}`,
  // « Appelez quelqu'un » n'est un chemin que s'il porte un numéro ET la
  // phrase à dire.
  quoiDire:
    "Say what you need: the amount, the number, and who is waiting at the counter.",
  sansNumero:
    "No phone number recorded for the owner. Ask them to add it in Settings.",

  // Le solde, pour qui ne compose aucun code : la phrase de l'accueil invite à
  // « appuyer sur la flèche », et la flèche n'est pas là. Un écran qui désigne
  // un bouton absent se lit comme une panne.
  soldeInconnu:
    "No balance known yet. It will show as soon as someone asks the network.",

  // La lecture seule : elle lit, elle télécharge, rien d'autre.
  lectureSeuleTitre: "You are here to read",
  lectureSeuleDit:
    "The balances, what comes in, and every receipt — you can download them "
    + "all. Nothing here classifies, issues or sends: those gestures belong to "
    + "the counter and to the owner.",

  // La plateforme : elle voit, elle administre, elle ne bouge aucun argent.
  plateformeTitre: "You are on the platform's side",
  plateformeDit:
    "You see this shop to help it. No path from here moves a single franc — "
    + "not a hidden one, not a forgotten one: the power simply does not exist "
    + "in your key.",
};

const fr: typeof en = {
  titre: "Qui a une clé de votre commerce",
  sousTitre:
    "Vous pouvez reprendre une clé à tout moment, et elle cesse de marcher "
    + "dans la seconde — pas à la prochaine entrée de la personne.",

  vous: "vous",
  ici: "connectée en ce moment",
  vuLe: (quand) => `vue ${quand}`,
  jamaisVu: "n'est pas encore venue",
  depuis: (quand) => `depuis ${quand}`,
  retireLe: (quand) => `clé reprise le ${quand}`,
  partis: "N'ont plus de clé",
  personne: "Personne n'a encore de clé, à part vous.",

  role: {
    proprietaire: "le propriétaire",
    operateur: "au comptoir",
    lecteur: "lecture seule",
    admin: "la plateforme",
  },
  permet: {
    proprietaire: [
      "Lire les soldes et télécharger chaque reçu",
      "Envoyer de l'argent, au comptoir, avec le code de la puce",
      "Donner une clé à quelqu'un, et la reprendre",
    ],
    operateur: [
      "Lire les soldes, quand elle veut",
      "Classer ce qui arrive et remettre les reçus",
    ],
    lecteur: [
      "Lire les soldes, quand elle veut",
      "Télécharger n'importe quel reçu, dans les deux langues",
    ],
    admin: [
      "Voir la flotte, les versions et le journal",
      "Lire ce commerce pour l'aider, et seulement pour l'aider",
    ],
  },
  interdit: {
    proprietaire: [
      "Rien. C'est tout le commerce, l'argent compris.",
    ],
    operateur: [
      "Ne peut pas envoyer d'argent — cela reste à vous",
      "Ne peut donner de clé à personne, ni en reprendre une",
    ],
    lecteur: [
      "Ne peut pas envoyer d'argent, et aucun bouton ne le lui permettra",
      "Ne peut ni classer un SMS, ni établir un reçu",
    ],
    admin: [
      "Ne peut jamais déplacer d'argent, par aucun chemin — la séparation est construite ainsi",
      "Ne peut donner aucune clé de votre commerce",
    ],
  },

  donner: "Donner une clé à quelqu'un",
  donnerTitre: "Donner une clé",
  nom: "Son nom",
  nomAide: "Tel que vous l'appelez : J. Eyenga",
  courriel: "Son adresse mail",
  courrielAide: "Les six chiffres partiront là. Un numéro change avec la puce ; une adresse suit la personne.",
  quelRole: "Ce qu'elle sera",
  ceQuIlPourra: "Ce qu'elle pourra faire",
  ceQuIlNePourraPas: "Ce qu'elle ne pourra pas faire",
  envoyer: "Créer le lien",
  envoiEnCours: "Création…",
  renoncer: "Pas maintenant",

  lienTitre: (nom) => `Le lien pour ${nom}`,
  lienDit:
    "Envoyez-le par WhatsApp, comme vous envoyez tout le reste. Il s'affiche "
    + "une seule fois, ici, et ne pourra pas être réaffiché — s'il se perd, "
    + "annulez l'invitation et refaites-en une.",
  copier: "Copier le lien",
  copie: "Copié",
  lienSeul:
    "Le lien seul n'ouvre rien : six chiffres partent aussi sur son adresse.",
  fini: "Terminé",

  attenteTitre: "En attente de réponse",
  inviteeLe: (quand) => `invitée ${quand}`,
  pasRepondu: "n'a pas encore répondu",
  ouvertAvant: "Ce lien a été ouvert avant que votre personne ne le reçoive",
  ouvertAvantDit:
    "Ce n'est peut-être rien — un message transféré, un aperçu. Ce peut être "
    + "aussi quelqu'un d'autre. Le geste sûr est de l'annuler et d'en envoyer "
    + "un neuf.",
  annuler: "Annuler cette invitation",
  annulEnCours: "Annulation…",

  appareils: "Ses appareils ouverts",
  aucunAppareil: "Rien d'ouvert en ce moment.",
  appareilPartage: "téléphone du comptoir",
  fermerAppareil: "Fermer celui-ci",
  fermetureEnCours: "Fermeture…",
  avecLeTelephone: (n) =>
    n === 1
      ? "1 téléphone entre avec son propre verrouillage"
      : `${n} téléphones entrent avec leur propre verrouillage`,

  saCle: "Sa clé",
  reprendreTitre: (nom) => `Reprendre la clé de ${nom} ?`,
  reprendreDit: (n) =>
    n === 0
      ? "Rien à elle n'est ouvert en ce moment."
      : n === 1
        ? "Un de ses appareils est ouvert en ce moment."
        : `${n} de ses appareils sont ouverts en ce moment.`,
  consequences: [
    "Son téléphone se ferme dans la seconde — pas à sa prochaine entrée, maintenant.",
    "Son empreinte ne le rouvrira pas non plus : la clé est revérifiée à chaque entrée.",
    "Les reçus qu'elle a remis restent au journal, à son nom.",
    "Rien ne change pour votre argent, vos puces, ni votre code.",
  ],
  garder: "Garder la clé",
  reprendreMaintenant: "Reprendre maintenant",
  repriseEnCours: "Reprise…",
  reprise: "C'est fait. Cette clé n'ouvre plus rien.",
  pasVous: "Vous ne pouvez pas reprendre votre propre clé depuis ici.",

  rate: "Ça n'a pas marché. Réessayez dans un instant.",
  champsManquants: "Il faut un nom et une adresse mail.",
  adresseDouteuse: "Cette adresse ne ressemble pas à une adresse. Vérifiez-la.",
  sansCommerceTitre: "Votre commerce n'a pas encore de nom",
  sansCommerceDit:
    "Une clé se donne pour un commerce, et le vôtre n'en a pas encore dans "
    + "TOTEM. Nommez-le dans les réglages, et cette page marchera.",
  versReglages: "Aller aux réglages",

  lesGens: "Les gens de votre commerce",
  lesGensAide: (n) =>
    n === 1 ? "1 personne a une clé" : `${n} personnes ont une clé`,

  reserveTitre: (nom) => `Envoyer de l'argent appartient à ${nom}`,
  reserveTitreSansNom: "Envoyer de l'argent appartient au propriétaire",
  reserveDit:
    "Vous lisez les soldes et vous remettez les reçus. Déplacer l'argent se "
    + "fait au comptoir, avec le code de la puce, par la personne qui la "
    + "possède — pas depuis une page web, et pas par TOTEM.",
  appeler: (nom) => `Appeler ${nom}`,
  quoiDire:
    "Dites ce qu'il vous faut : le montant, le numéro, et qui attend au comptoir.",
  sansNumero:
    "Aucun numéro n'est enregistré pour le propriétaire. Demandez-lui de "
    + "l'ajouter dans les réglages.",

  soldeInconnu:
    "Aucun solde connu pour l'instant. Il apparaîtra dès que quelqu'un "
    + "interrogera le réseau.",

  lectureSeuleTitre: "Vous êtes ici pour lire",
  lectureSeuleDit:
    "Les soldes, ce qui arrive, et chaque reçu — vous pouvez tout télécharger. "
    + "Rien ici ne classe, n'établit ni n'envoie : ces gestes appartiennent au "
    + "comptoir et au propriétaire.",

  plateformeTitre: "Vous êtes du côté de la plateforme",
  plateformeDit:
    "Vous voyez ce commerce pour l'aider. Aucun chemin d'ici ne déplace un "
    + "seul franc — ni caché, ni oublié : le pouvoir n'existe simplement pas "
    + "dans votre clé.",
};

export const textesGens = { en, fr } as const;
