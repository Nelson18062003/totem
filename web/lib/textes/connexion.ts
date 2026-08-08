// Les textes de l'écran de connexion — le verrou de la plateforme.

const en = {
  titre: "Sign in",
  sousTitre: "For the terminal's owner only.",
  motDePasse: "Password",
  verification: "Checking…",
  seConnecter: "Sign in",
  motDePasseIncorrect: "Wrong password.",
  connexionImpossible: "Can't sign in right now. Try again.",

  // Le chemin de tous les jours vient EN PREMIER, et il est nommé par le
  // geste — « votre doigt » — pas par la technique.
  avecLeTelephone: "Use your phone's lock",
  avecLeTelephoneAide: "Your fingerprint or your face. Nothing to type.",
  telephoneEnCours: "Waiting for your phone…",
  // Un refus ne dit jamais si le compte existe. « Ça n'a pas marché » suffit,
  // et la suite est un geste, pas une explication.
  telephoneRate: "That did not work. You can try again, or use the password.",
  // Le navigateur peut ne pas savoir faire — un vieil Android, un mode
  // restreint. On le dit sans le reprocher à personne.
  telephoneImpossible:
    "This browser cannot use your phone's lock. Use the password below.",
  ouBien: "or",
  notePin:
    "The Mobile Money PIN is never asked for here. It is only entered " +
    "during an operation, and is never stored anywhere.",
  langue: "Language",
};

const fr: typeof en = {
  titre: "Connexion",
  sousTitre: "Accès réservé au propriétaire du terminal.",
  motDePasse: "Mot de passe",
  verification: "Vérification…",
  seConnecter: "Se connecter",
  motDePasseIncorrect: "Mot de passe incorrect.",
  connexionImpossible: "Connexion impossible pour l’instant. Réessayez.",

  avecLeTelephone: "Entrer avec mon téléphone",
  avecLeTelephoneAide: "Votre empreinte ou votre visage. Rien à taper.",
  telephoneEnCours: "En attente de votre téléphone…",
  telephoneRate: "Ça n’a pas marché. Vous pouvez réessayer, ou passer par le mot de passe.",
  telephoneImpossible:
    "Ce navigateur ne sait pas se servir du verrouillage du téléphone. "
    + "Passez par le mot de passe ci-dessous.",
  ouBien: "ou",
  notePin:
    "Le code PIN Mobile Money n’est jamais demandé ici. Il ne se saisit " +
    "qu’au moment d’une opération, et n’est enregistré nulle part.",
  langue: "Langue",
};

export const textesConnexion = { en, fr } as const;
