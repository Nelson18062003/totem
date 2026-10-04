// La page « Créer votre compte » du SITE (web/app/inscription).
//
// L'application du téléphone a ses propres textes (connexion.ts) ; ceux-ci
// servent la même inscription depuis un navigateur. Mêmes six champs, même
// route (`POST /api/inscription`), mêmes règles — la plateforme refait
// tous les contrôles, l'écran ne fait qu'aider à remplir juste.

const en = {
  titre: "Create your TOTEM account",
  sousTitre:
    "Your account opens right away. You then add your SIM card, and reach " +
    "your Mobile Money accounts from wherever you are in the world.",
  prenom: "First name",
  nom: "Last name",
  adresse: "Address",
  adresseExemple: "Street, city, country",
  telephone: "Phone number",
  telephoneExemple: "+237 6 77 12 34 56",
  courriel: "Email",
  motDePasse: "Password",
  motDePasseConseil: "At least 12 characters. Length beats complication.",
  confirmer: "Repeat the password",
  differents: "The two passwords are not the same.",
  creer: "Create my account",
  creation: "Creating your account…",
  impossible: "This account could not be created right now. Try again.",
  dejaUnCompte: "I already have an account",
  notePin:
    "Choose a password of your own. Never use your Mobile Money PIN: TOTEM " +
    "never asks for it here.",
  conditionsAvant: "By creating an account, you accept the ",
  conditionsLien: "privacy policy",
  conditionsApres: ".",
};

const fr: typeof en = {
  titre: "Créer votre compte TOTEM",
  sousTitre:
    "Votre compte s’ouvre tout de suite. Vous ajoutez ensuite votre carte " +
    "SIM, et vous atteignez vos comptes Mobile Money où que vous soyez dans " +
    "le monde.",
  prenom: "Prénom",
  nom: "Nom",
  adresse: "Adresse",
  adresseExemple: "Rue, ville, pays",
  telephone: "Numéro de téléphone",
  telephoneExemple: "+237 6 77 12 34 56",
  courriel: "Courriel",
  motDePasse: "Mot de passe",
  motDePasseConseil: "Au moins 12 caractères. La longueur compte plus que la complication.",
  confirmer: "Répétez le mot de passe",
  differents: "Les deux mots de passe ne sont pas identiques.",
  creer: "Créer mon compte",
  creation: "Création de votre compte…",
  impossible: "Ce compte n’a pas pu être créé pour l’instant. Réessayez.",
  dejaUnCompte: "J’ai déjà un compte",
  notePin:
    "Choisissez un mot de passe à vous. N’utilisez jamais votre code secret " +
    "Mobile Money : TOTEM ne le demande jamais ici.",
  conditionsAvant: "En créant un compte, vous acceptez la ",
  conditionsLien: "politique de confidentialité",
  conditionsApres: ".",
};

export const textesInscription = { en, fr } as const;
