// Les textes de l'entrée quotidienne — l'écran le plus vu de la plateforme.
//
// TROIS CHEMINS, ET CHACUN EST NOMMÉ PAR LE GESTE
// « Le verrouillage de votre téléphone », pas « clé d'accès » ni « WebAuthn ».
// « Le papier de dix codes », pas « codes de récupération ». Celui qui lit
// tient une boutique ; il doit reconnaître l'objet qu'il a dans la main.
//
// AUCUNE PHRASE ICI NE DIT SI UN COMPTE EXISTE
// « codeParti » est écrite au conditionnel exprès : elle s'affiche à
// l'identique pour une adresse connue et pour une adresse inventée. Sans
// cela, l'écran d'entrée devient un annuaire des clients de TOTEM — il suffit
// de taper des adresses et de lire la réponse. La même prudence vaut pour
// « papierRate » et « codeRate » : « ça n'a pas marché », jamais « ce code
// n'existe pas » ni « cette adresse est inconnue ».
//
// LE MOT DE PASSE FONDATEUR EST NOMMÉ PAR SON DESTINATAIRE, PAS PAR SA FORME
// « Password » se lit comme la voie normale et invite tout le monde à
// essayer. « Je suis le propriétaire fondateur, mon compte n'existe pas
// encore » ne s'adresse qu'à une personne, et les autres passent devant sans
// s'arrêter.

const en = {
  // — L'en-tête ------------------------------------------------------------
  titre: "Sign in",
  sousTitre: "Three ways in. Take whichever one works today.",
  langue: "Language",

  // — Chemin 1 : le verrouillage du téléphone ------------------------------
  avecLeTelephone: "Use your phone's lock",
  avecLeTelephoneAide: "Your fingerprint or your face. Nothing to type.",
  telephoneEnCours: "Waiting for your phone…",
  // Un refus ne dit jamais si le compte existe. « Ça n'a pas marché » suffit,
  // et la suite est un geste, pas une explication.
  telephoneRate: "That did not work. Try again, or ask for a code by email below.",
  // Le navigateur peut ne pas savoir faire — un vieil Android, un mode
  // restreint. On le dit sans le reprocher à personne.
  telephoneImpossible:
    "This browser cannot use your phone's lock. Ask for a code by email below.",
  ouBien: "or",

  // — Chemin 2 : six chiffres par mail -------------------------------------
  parMailTitre: "Get a code by email",
  parMailAide:
    "For another device, a new phone, or a fingerprint that will not take.",
  adresse: "Your email address",
  demanderLeCode: "Send me six digits",
  demandeEnCours: "Sending…",
  codeParti: (adresse: string) =>
    `If ${adresse} has an account, six digits have just been sent to it.`,

  // — Chemin 3 : le papier de dix codes ------------------------------------
  papierTitre: "Use the paper with ten codes",
  papierAide:
    "The paper you keep away from the shop. For the day the phone and the "
    + "mailbox are both out of reach. Each code works once.",
  papierCode: "One code from the paper",
  papierEntrer: "Enter with this code",
  papierEnCours: "Checking…",
  papierRate: "That did not work. Check the code, or use another one.",

  // — Le compte fondateur, en attendant les comptes nominatifs -------------
  fondateurTitre: "I am the founding owner",
  fondateurAide:
    "The single password of the terminal, until your own named account "
    + "exists. Nobody else has any use for it.",
  motDePasse: "Owner's password",
  verification: "Checking…",
  seConnecter: "Sign in",
  motDePasseIncorrect: "That did not work.",

  // — Le bas de l'écran ----------------------------------------------------
  plusEntrer: "I can no longer get in",
  connexionImpossible: "No connection right now. Try again.",
  notePin:
    "The Mobile Money PIN is never asked for here. It is only entered "
    + "during an operation, and is never stored anywhere.",

  // — L'écran des six chiffres (/entrer) -----------------------------------
  saisieTitre: "The six digits",
  saisieCode: "The six digits from the email",
  saisieAide: "Paste them as they are — the space does not matter.",
  saisieEntrer: "Enter",
  saisieEnCours: "Checking…",
  codeRate: "That did not work. Check the digits, or ask for a new code.",
  renvoyer: "Send another code",
  autreAdresse: "Not the right address?",
  autresChemins: "Go back to the other ways in",
};

const fr: typeof en = {
  titre: "Entrer",
  sousTitre: "Trois chemins. Prenez celui qui marche aujourd’hui.",
  langue: "Langue",

  avecLeTelephone: "Entrer avec mon téléphone",
  avecLeTelephoneAide: "Votre empreinte ou votre visage. Rien à taper.",
  telephoneEnCours: "En attente de votre téléphone…",
  telephoneRate:
    "Ça n’a pas marché. Réessayez, ou demandez un code par mail ci-dessous.",
  telephoneImpossible:
    "Ce navigateur ne sait pas se servir du verrouillage du téléphone. "
    + "Demandez un code par mail ci-dessous.",
  ouBien: "ou",

  parMailTitre: "Recevoir un code par mail",
  parMailAide:
    "Pour un autre appareil, un téléphone neuf, ou un doigt qui ne prend pas.",
  adresse: "Votre adresse mail",
  demanderLeCode: "M’envoyer six chiffres",
  demandeEnCours: "Envoi…",
  codeParti: (adresse: string) =>
    `Si ${adresse} a un compte, six chiffres viennent d’y partir.`,

  papierTitre: "Utiliser le papier de dix codes",
  papierAide:
    "Le papier que vous gardez ailleurs que dans la boutique. Pour le jour "
    + "où le téléphone et la boîte mail sont hors de portée en même temps. "
    + "Chaque code sert une fois.",
  papierCode: "Un code du papier",
  papierEntrer: "Entrer avec ce code",
  papierEnCours: "Vérification…",
  papierRate: "Ça n’a pas marché. Revoyez le code, ou prenez-en un autre.",

  fondateurTitre: "Je suis le propriétaire fondateur",
  fondateurAide:
    "Le mot de passe unique du terminal, en attendant que votre compte à "
    + "votre nom existe. Il ne sert à personne d’autre.",
  motDePasse: "Mot de passe du propriétaire",
  verification: "Vérification…",
  seConnecter: "Se connecter",
  motDePasseIncorrect: "Ça n’a pas marché.",

  plusEntrer: "Je n’arrive plus à entrer",
  connexionImpossible: "Pas de connexion pour l’instant. Réessayez.",
  notePin:
    "Le code PIN Mobile Money n’est jamais demandé ici. Il ne se saisit "
    + "qu’au moment d’une opération, et n’est enregistré nulle part.",

  saisieTitre: "Les six chiffres",
  saisieCode: "Les six chiffres reçus par mail",
  saisieAide: "Collez-les tels quels — l’espace ne gêne pas.",
  saisieEntrer: "Entrer",
  saisieEnCours: "Vérification…",
  codeRate:
    "Ça n’a pas marché. Revoyez les chiffres, ou demandez un nouveau code.",
  renvoyer: "Envoyer un autre code",
  autreAdresse: "Ce n’est pas la bonne adresse ?",
  autresChemins: "Revenir aux autres chemins",
};

export const textesConnexion = { en, fr } as const;
