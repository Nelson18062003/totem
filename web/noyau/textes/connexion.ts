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
  reserve: "For the terminal's owner only.",
  motDePasse: "Password",
  verification: "Checking…",
  seConnecter: "Sign in",
  motDePasseIncorrect: "Wrong password.",
  connexionImpossible: "Can't sign in right now. Try again.",
  notePin:
    "The Mobile Money PIN is never asked for here. It is only entered " +
    "during an operation, and is never stored anywhere.",
  langue: "Language",
  // La porte de la vitrine : celui qui arrive ici sans compte doit pouvoir
  // lire ce qu'est TOTEM ailleurs que sur un formulaire.
  decouvrir: "Discover what TOTEM does",

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
    "No TOTEM at this address. The password will not be sent there.",
  plateformeInjoignable:
    "This address does not answer. Check your connection, then the address.",
  // Sans nommer les variables d'environnement : leurs noms sont du jargon
  // pour le propriétaire, ET les écrire ici les ferait entrer dans le paquet
  // de l'application, où le contrôle des secrets les attend au tournant. La
  // marche à suivre est dans docs/CLOUD.md, à sa place.
  plateformeNonConfiguree:
    "The TOTEM is here, but sign-in has not been set up on it yet. No " +
    "password can work until the platform's settings are filled in on Vercel.",
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
    "The first account created is the owner's. The ones after it wait for " +
    "the owner to open the door.",
  premierCompte:
    "No account exists yet. The one you create now will be the owner's.",
  motDePasseConseil: "At least 12 characters. Length beats complication.",
  confirmerMotDePasse: "Repeat the password",
  motsDePasseDifferents: "The two passwords are not the same.",
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
  reserve: "Accès réservé au propriétaire du terminal.",
  motDePasse: "Mot de passe",
  verification: "Vérification…",
  seConnecter: "Se connecter",
  motDePasseIncorrect: "Mot de passe incorrect.",
  connexionImpossible: "Connexion impossible pour l’instant. Réessayez.",
  notePin:
    "Le code PIN Mobile Money n’est jamais demandé ici. Il ne se saisit " +
    "qu’au moment d’une opération, et n’est enregistré nulle part.",
  langue: "Langue",
  decouvrir: "Découvrir ce que fait TOTEM",

  plateforme: "Plateforme",
  plateformeCherche: "Recherche de la plateforme…",
  plateformeTrouvee: "TOTEM trouvé",
  plateformeAbsente:
    "Aucun TOTEM à cette adresse. Le mot de passe n’y sera pas envoyé.",
  plateformeInjoignable:
    "Cette adresse ne répond pas. Vérifiez la connexion, puis l’adresse.",
  plateformeNonConfiguree:
    "Le TOTEM est bien là, mais la connexion n’y est pas encore configurée. " +
    "Aucun mot de passe ne peut marcher tant que les réglages de la " +
    "plateforme ne sont pas remplis sur Vercel.",
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
    "Le premier compte créé est celui du propriétaire. Les suivants attendent " +
    "qu’il leur ouvre la porte.",
  premierCompte:
    "Aucun compte n’existe encore. Celui que vous créez maintenant sera celui " +
    "du propriétaire.",
  motDePasseConseil: "Au moins 12 caractères. La longueur vaut mieux que la complication.",
  confirmerMotDePasse: "Répétez le mot de passe",
  motsDePasseDifferents: "Les deux mots de passe ne sont pas les mêmes.",
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
