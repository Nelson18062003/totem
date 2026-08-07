// Les messages d'erreur des routes API. Le navigateur les affiche tels quels
// dans les écrans : ils parlent donc la langue de la personne connectée.

import type { Langue } from "../langue";

const en = {
  connexionNonConfiguree: "sign-in is not set up on this deployment",
  motDePasseIncorrect: "wrong password",
  demandeInconnue: "unknown request",
  codeVide: "empty code",
  carteOuValeurManquante: "missing SIM or value",
  nonReliee: "platform not connected",
  nonRelieeBase: "platform not connected to the database",
  depotImpossible: "the request could not be submitted",
  identifiantInvalide: "invalid identifier",
  demandeIntrouvable: "request not found",
  natureInconnue: "unknown type",
  natureNonEnregistree: "the type could not be saved",
  nonEnregistre: "not saved",
  recuIntrouvable: "Receipt not found",
};

const fr: typeof en = {
  connexionNonConfiguree: "connexion non configurée sur ce déploiement",
  motDePasseIncorrect: "mot de passe incorrect",
  demandeInconnue: "demande inconnue",
  codeVide: "code vide",
  carteOuValeurManquante: "puce ou valeur manquante",
  nonReliee: "plateforme non reliée",
  nonRelieeBase: "plateforme non reliée à la base",
  depotImpossible: "la demande n’a pas pu être déposée",
  identifiantInvalide: "identifiant invalide",
  demandeIntrouvable: "demande introuvable",
  natureInconnue: "nature inconnue",
  natureNonEnregistree: "la nature n’a pas pu être enregistrée",
  nonEnregistre: "non enregistré",
  recuIntrouvable: "Reçu introuvable",
};

export const textesApi = { en, fr } as const;

export function erreurApi(langue: Langue, cle: keyof typeof en): string {
  return textesApi[langue][cle];
}
