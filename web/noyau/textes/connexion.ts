// Les textes de l'écran de connexion — le verrou de la plateforme.

const en = {
  titre: "Sign in",
  // Ce que fait la plateforme, dit en une phrase : la plupart des visiteurs
  // ne verront que cet écran, il doit se présenter tout seul.
  sousTitre:
    "Your Mobile Money SIMs stay in the country; from here you watch the " +
    "money come in, run the cards and keep every receipt — wherever you are.",
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
};

const fr: typeof en = {
  titre: "Connexion",
  sousTitre:
    "Vos SIM Mobile Money restent au pays ; d’ici, vous suivez l’argent qui " +
    "arrive, pilotez les cartes et gardez chaque reçu — d’où que vous soyez.",
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
};

export const textesConnexion = { en, fr } as const;
