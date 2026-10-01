// Les textes de l'écran de connexion — le verrou de la plateforme.

const en = {
  titre: "Sign in",
  // Ce que fait la plateforme, dit en une phrase : la plupart des visiteurs
  // ne verront que cet écran, il doit se présenter tout seul.
  // Ce que TOTEM fait, en une phrase. Elle dit GÉRER, pas suivre l'argent :
  // le produit est l'interface qui remplace les menus USSD, pas un service
  // qui toucherait à l'argent de quelqu'un. C'est plus juste — et cela évite
  // de faire croire à un service financier, ce que TOTEM n'est pas.
  sousTitre:
    "Your Mobile Money SIM cards stay in the country. From here you run " +
    "them — every card, every receipt — wherever you are.",
  reserve: "For the owner and the people they invited.",
  // Le champ de la clé de secours — le seul mot de passe qui reste.
  motDePasse: "Recovery key",
  verification: "Checking…",
  seConnecter: "Sign in",
  motDePasseIncorrect: "Wrong recovery key.",
  connexionImpossible: "Can't sign in right now. Try again.",
  notePin:
    "The Mobile Money PIN is never asked for here. It is only entered " +
    "during an operation, and is never stored anywhere.",
  langue: "Language",
  // L'œil du champ de mot de passe. Il n'avait AUCUN texte : son étiquette
  // était écrite en français dans le code, sur un écran qui peut être en
  // anglais — un lecteur d'écran annonçait « Masquer » au milieu de l'anglais.
  montrerMotDePasse: "Show the password",
  masquerMotDePasse: "Hide the password",

  // L'adresse de la plateforme — seulement sur le téléphone. Le navigateur
  // EST déjà sur la plateforme : il n'a rien à chercher.
  //
  // Ces textes existent parce qu'une adresse fausse est arrivée pour de vrai :
  // l'application pointait sur un sous-domaine appartenant à quelqu'un
  // d'autre. Sans un mot clair, cela ressemble à un mot de passe refusé, et
  // on cherche pendant des heures du mauvais côté.
  plateforme: "Platform",
  plateformeCherche: "Looking for the platform…",
  plateformeTrouvee: "TOTEM found",
  plateformeAbsente:
    "No TOTEM at this address. Your email will not be sent there.",
  plateformeInjoignable:
    "This address does not answer. Check your connection, then the address.",
  // La panne vue des écrans de données : sans cette phrase, c'est le
  // message BRUT du réseau qui s'affichait — « Failed to fetch », en
  // anglais quel que soit l'écran.
  reseauEnPanne:
    "The platform is not answering. Check the connection, then try again.",
  // Sans nommer les variables d'environnement : leurs noms sont du jargon
  // pour le propriétaire, ET les écrire ici les ferait entrer dans le paquet
  // de l'application, où le contrôle des secrets les attend au tournant. La
  // marche à suivre est dans docs/CLOUD.md, à sa place.
  plateformeNonConfiguree:
    "The TOTEM is here, but sign-in has not been set up on it yet. Nobody " +
    "can get in until the platform's settings are filled in on Vercel.",
  changerAdresse: "Change the address",
  adresseAide:
    "The web address of your platform, the one Vercel gave you. It starts " +
    "with https://",
  reessayer: "Try again",
  enregistrer: "Save",
  annuler: "Cancel",
  adresseInvalide: "That is not a web address. It must start with https://",

  // --- Les comptes --------------------------------------------------------
  courriel: "Email",
  creerUnCompte: "Create an account",
  jAiDejaUnCompte: "I already have an account",
  inscriptionTitre: "Create your account",
  inscriptionSousTitre:
    "The first account created is the owner's. Every account after it is " +
    "created by the owner.",
  premierCompte:
    "No account exists yet. The one you create now will be the owner's. A " +
    "code will be sent to this email to open it.",

  // --- L'entrée par code ------------------------------------------------
  // Deux temps : le courriel, puis le code reçu. Pas de mot de passe.
  recevoirCode: "Receive a code",
  envoiDuCode: "Sending…",
  codeRecu: "Code received by email",
  codeAide: (courriel: string) =>
    `If ${courriel} has access, a 6-digit code has just been sent to it. ` +
    "Look in the spam folder too. It works once, for 10 minutes.",
  renvoyer: "Send a new code",
  renvoyerDans: (s: number) => `New code possible in ${s} s`,
  autreAdresse: "Use another address",
  codesIndisponibles:
    "Sign-in codes cannot be sent from this platform yet (email sending is " +
    "not set up). The recovery key still works.",
  compteCree: "Account created.",
  compteEnAttenteTitre: "Your account is waiting",
  compteEnAttenteTexte:
    "It exists, but it opens nothing yet. The owner has to let you in. " +
    "Come back once they have.",
  cleDeSecours: "Use the recovery key",
  cleDeSecoursAide:
    "The single password set on the hosting platform. It works even when the " +
    "accounts database is unreachable — that is what it is for.",
  retourAuCompte: "Sign in with an account",
};

const fr: typeof en = {
  titre: "Connexion",
  sousTitre:
    "Vos cartes SIM Mobile Money restent au pays. D’ici, vous les pilotez — " +
    "chaque carte, chaque reçu — d’où que vous soyez.",
  reserve: "Accès réservé au propriétaire et aux personnes qu’il a invitées.",
  motDePasse: "Clé de secours",
  verification: "Vérification…",
  seConnecter: "Se connecter",
  motDePasseIncorrect: "Clé de secours incorrecte.",
  connexionImpossible: "Connexion impossible pour l’instant. Réessayez.",
  notePin:
    "Le code PIN Mobile Money n’est jamais demandé ici. Il ne se saisit " +
    "qu’au moment d’une opération, et n’est enregistré nulle part.",
  langue: "Langue",
  montrerMotDePasse: "Afficher le mot de passe",
  masquerMotDePasse: "Masquer le mot de passe",

  plateforme: "Plateforme",
  plateformeCherche: "Recherche de la plateforme…",
  plateformeTrouvee: "TOTEM trouvé",
  plateformeAbsente:
    "Aucun TOTEM à cette adresse. Votre courriel n’y sera pas envoyé.",
  plateformeInjoignable:
    "Cette adresse ne répond pas. Vérifiez la connexion, puis l’adresse.",
  reseauEnPanne:
    "La plateforme ne répond pas. Vérifiez la connexion, puis réessayez.",
  plateformeNonConfiguree:
    "Le TOTEM est bien là, mais la connexion n’y est pas encore configurée. " +
    "Personne ne peut entrer tant que les réglages de la plateforme ne sont " +
    "pas remplis sur Vercel.",
  changerAdresse: "Changer l’adresse",
  adresseAide:
    "L’adresse web de votre plateforme, celle que Vercel vous a donnée. Elle " +
    "commence par https://",
  reessayer: "Réessayer",
  enregistrer: "Enregistrer",
  annuler: "Annuler",
  adresseInvalide: "Ce n’est pas une adresse web. Elle doit commencer par https://",

  courriel: "Courriel",
  creerUnCompte: "Créer un compte",
  jAiDejaUnCompte: "J’ai déjà un compte",
  inscriptionTitre: "Créez votre compte",
  inscriptionSousTitre:
    "Le premier compte créé est celui du propriétaire. Tous les suivants, " +
    "c’est lui qui les crée.",
  premierCompte:
    "Aucun compte n’existe encore. Celui que vous créez maintenant sera celui " +
    "du propriétaire. Un code partira à ce courriel pour l’ouvrir.",

  recevoirCode: "Recevoir un code",
  envoiDuCode: "Envoi…",
  codeRecu: "Code reçu par courriel",
  codeAide: (courriel: string) =>
    `Si ${courriel} a un accès, un code à 6 chiffres vient d’y être envoyé. ` +
    "Regardez aussi dans les indésirables. Il sert une fois, pendant 10 minutes.",
  renvoyer: "Envoyer un nouveau code",
  renvoyerDans: (s: number) => `Nouveau code possible dans ${s} s`,
  autreAdresse: "Utiliser une autre adresse",
  codesIndisponibles:
    "Les codes ne peuvent pas encore partir de cette plateforme (l’envoi des " +
    "courriels n’est pas réglé). La clé de secours fonctionne toujours.",
  compteCree: "Compte créé.",
  compteEnAttenteTitre: "Votre compte attend",
  compteEnAttenteTexte:
    "Il existe, mais il n’ouvre encore rien. C’est au propriétaire de vous " +
    "laisser entrer. Revenez quand ce sera fait.",
  cleDeSecours: "Utiliser la clé de secours",
  cleDeSecoursAide:
    "Le mot de passe unique posé sur l’hébergement. Il fonctionne même quand " +
    "la base des comptes est injoignable — c’est précisément à cela qu’il sert.",
  retourAuCompte: "Se connecter avec un compte",
};

export const textesConnexion = { en, fr } as const;
