// Les messages d'erreur des routes API. Le navigateur les affiche tels quels
// dans les écrans : ils parlent donc la langue de la personne connectée.

import type { Langue } from "../langue";

const en = {
  connexionNonConfiguree: "sign-in is not set up on this deployment",
  motDePasseIncorrect: "wrong password",
  demandeInconnue: "unknown request",
  codeVide: "empty code",
  carteOuValeurManquante: "missing card or value",
  nonReliee: "platform not connected",
  nonRelieeBase: "platform not connected to the database",
  depotImpossible: "the request could not be submitted",
  identifiantInvalide: "invalid identifier",
  // Le refus du verrou, et celui du garde qui relit la base derrière lui :
  // un seul texte, pour que les deux portes disent la même chose.
  connexionRequise: "sign-in required",
  plateformeInjoignable: "platform unreachable",
  demandeIntrouvable: "request not found",
  natureInconnue: "unknown type",
  natureNonEnregistree: "the type could not be saved",
  nonEnregistre: "not saved",
  recuIntrouvable: "Receipt not found",
  raccourciIncomplet: "incomplete shortcut: operator, button and code are needed",
  variableInconnue: "unknown variable in the code: only {numero}, {montant} and {point} exist",
  variableMalFormee: "a variable is misspelt: write it whole, braces included — {numero}",

  // --- Les comptes --------------------------------------------------------
  // Un seul et même message pour « ce courriel n'existe pas » et « ce mot de
  // passe est faux ». Les distinguer dirait à un inconnu quelles adresses
  // ont un compte ici — de quoi dresser une liste, puis s'acharner dessus.
  identifiantsIncorrects: "wrong email or password",
  compteEnAttente:
    "This account is waiting for the owner's approval. It cannot open " +
    "anything yet.",
  courrielInvalide: "that does not look like an email address",
  motDePasseTropCourt: "the password must be at least 12 characters long",
  courrielDejaPris: "an account already exists with this email",
  // Fermé, et non « réservé » : il n'y a rien à demander à personne. La
  // plateforme suit l'argent d'une seule personne ; elle n'attend pas de
  // visiteurs.
  inscriptionsFermees:
    "This platform already has its owner. No new account can be created.",
  inscriptionImpossible: "the account could not be created",
  reserveAuProprietaire: "only the owner can do this",
  pasSoiMeme: "you cannot do this to your own account",
  // Un « refus » qui n'en est pas un : le compte EST créé. La porte
  // rend toujours une décision, et celle-ci se lit « c'est fait ».
  compteCree: "account created",
};

const fr: typeof en = {
  connexionNonConfiguree: "connexion non configurée sur ce déploiement",
  motDePasseIncorrect: "mot de passe incorrect",
  demandeInconnue: "demande inconnue",
  codeVide: "code vide",
  carteOuValeurManquante: "carte ou valeur manquante",
  nonReliee: "plateforme non reliée",
  nonRelieeBase: "plateforme non reliée à la base",
  depotImpossible: "la demande n’a pas pu être déposée",
  identifiantInvalide: "identifiant invalide",
  connexionRequise: "connexion requise",
  plateformeInjoignable: "plateforme injoignable",
  demandeIntrouvable: "demande introuvable",
  natureInconnue: "nature inconnue",
  natureNonEnregistree: "la nature n’a pas pu être enregistrée",
  nonEnregistre: "non enregistré",
  recuIntrouvable: "Reçu introuvable",
  raccourciIncomplet: "raccourci incomplet : il faut l’opérateur, le bouton et le code",
  variableInconnue: "variable inconnue dans le code : seuls {numero}, {montant} et {point} existent",
  variableMalFormee: "une variable est mal écrite : écrivez-la en entier, accolades comprises — {numero}",

  identifiantsIncorrects: "courriel ou mot de passe incorrect",
  compteEnAttente:
    "Ce compte attend l’approbation du propriétaire. Il n’ouvre encore rien.",
  courrielInvalide: "cela ne ressemble pas à une adresse de courriel",
  motDePasseTropCourt: "le mot de passe doit faire au moins 12 caractères",
  courrielDejaPris: "un compte existe déjà avec ce courriel",
  inscriptionsFermees:
    "Cette plateforme a déjà son propriétaire. Aucun nouveau compte ne peut " +
    "être créé.",
  inscriptionImpossible: "le compte n’a pas pu être créé",
  reserveAuProprietaire: "seul le propriétaire peut faire cela",
  pasSoiMeme: "vous ne pouvez pas faire cela à votre propre compte",
  compteCree: "compte créé",
};

export const textesApi = { en, fr } as const;

export function erreurApi(langue: Langue, cle: keyof typeof en): string {
  return textesApi[langue][cle];
}
