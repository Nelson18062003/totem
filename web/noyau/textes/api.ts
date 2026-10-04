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
  // 429. On ne dit pas combien de temps il reste : ce serait un chronomètre
  // offert à qui mesure. On ne dit pas non plus si le compte existe.
  tropDEssais: "too many attempts. Wait a few minutes and try again.",
  // Un compte que le propriétaire a FERMÉ. Les inscriptions publiques
  // entrent tout de suite ; celui-ci a été refermé à la main.
  compteEnAttente:
    "This account has been closed by TOTEM. Contact support to reopen it.",
  courrielInvalide: "that does not look like an email address",
  motDePasseTropCourt: "the password must be at least 12 characters long",
  courrielDejaPris: "an account already exists with this email",
  inscriptionImpossible: "the account could not be created",
  // L'INSCRIPTION PUBLIQUE. Un courriel déjà pris reçoit CETTE phrase, et
  // aucune autre : « ce courriel a déjà un compte » dirait à un inconnu qui
  // est inscrit ici. Elle invite à se connecter, ce qui suffit à celui qui
  // a vraiment un compte.
  inscriptionRefusee:
    "This account could not be created. If you already have one, sign in.",
  adresseManquante: "the address is needed: street, city, country",
  telephoneInvalide:
    "this phone number does not look right: 8 to 15 digits, with the country code if you like",
  champTropLong: "a field is too long",
  // LA SUPPRESSION DE SON COMPTE.
  proprietaireNeSeSupprimePas:
    "The TOTEM platform owner's account cannot be deleted from the app: it is "
    + "the one that assigns cards to everyone else.",
  vitrineNeSeSupprimePas:
    "The demo account cannot be deleted: it belongs to no one.",
  // La vitrine n'a pas de boîtier : un reçu se fabrique dans le boîtier, à
  // partir d'un vrai SMS d'opérateur. On le DIT à l'examinateur, au lieu du
  // « seul le propriétaire peut faire cela » d'avant, qui ne voulait rien
  // dire pour lui.
  recuPasEnDemonstration:
    "In the demo account, no receipt is made: a receipt is produced by the "
    + "TOTEM box from a real operator SMS, and the demo has no box.",
  aucunCompteASupprimer: "this session is not tied to any account: there is nothing to delete",
  suppressionImpossible: "the account could not be deleted. Try again in a moment.",
  reserveAuProprietaire: "only the owner can do this",
  carteNonConfiee: "this card has not been entrusted to you",
  beneficiaireIncomplet: "a beneficiary needs a card, a number of 8 to 15 digits and a name",
  pasSoiMeme: "you cannot do this to your own account",
  // Le compte du propriétaire ne se ferme ni ne se supprime — par personne,
  // pas même avec la clé de secours. Une plateforme sans propriétaire
  // ROUVRAIT ses inscriptions au monde entier : le premier passant venu
  // devenait propriétaire, et lisait tous les SMS.
  pasLeProprietaire:
    "the owner's account cannot be closed or deleted — the platform would be "
    + "left without an owner.",
  // Un « refus » qui n'en est pas un : le compte EST créé. La porte
  // rend toujours une décision, et celle-ci se lit « c'est fait ».
  compteCree: "account created",
  nomManquant: "the first name and the last name are both needed",
  proprietaireVoitTout: "the owner already sees every card",
  carteInconnue: "this card is not known to the platform",
  // Une puce s'attribue d'après le CODE DE COMPTE que la personne a joint à
  // sa puce — jamais d'après une adresse e-mail, que n'importe qui peut
  // avoir prise avant elle (voir lib/code-de-compte.ts).
  codeDeCompteFaux:
    "This account code does not match this account. Assign the SIM using the "
    + "account code sent with it, never using an email address.",
  // Une demande vise une CARTE, et part au terminal qui la porte. Aucun ne
  // l'a vue depuis dix minutes : on le dit tout de suite, plutôt que
  // d'envoyer la demande au hasard ou de faire attendre l'écran.
  carteDansAucunTerminal:
    "this card is not in any terminal right now — removed, or its terminal "
    + "is off. Nothing was dialled.",
  // Le boîtier qui porte la carte s'est tu. Déposée quand même, la demande
  // attendrait son retour — des heures peut-être — et il la composerait
  // alors pour un écran qui a abandonné depuis longtemps. On dit l'OBJET
  // (le boîtier), pas une cause qu'on ignore : courant ou Internet, la
  // plateforme ne sait pas les distinguer.
  boitierMuet: "The TOTEM box that holds your card has stopped checking in: nothing was sent.",
  // Écrit dans la demande elle-même quand l'écran l'abandonne avant que le
  // boîtier ne la prenne. C'est aussi à ces mots qu'on la reconnaît annulée.
  demandeAnnulee: "Cancelled from the app before the TOTEM box that holds your card picked it up: nothing was sent.",
  // La base n'a pas répondu à l'annulation : on ne sait pas si elle a pris.
  // Surtout ne pas dire « rien n'est parti ».
  annulationIncertaine:
    "the cancellation could not be confirmed: the request may still go out "
    + "when the TOTEM box that holds your card picks it up.",
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
  demandeIntrouvable: "demande introuvable",
  natureInconnue: "nature inconnue",
  natureNonEnregistree: "la nature n’a pas pu être enregistrée",
  nonEnregistre: "non enregistré",
  recuIntrouvable: "Reçu introuvable",
  raccourciIncomplet: "raccourci incomplet : il faut l’opérateur, le bouton et le code",
  variableInconnue: "variable inconnue dans le code : seuls {numero}, {montant} et {point} existent",
  variableMalFormee: "une variable est mal écrite : écrivez-la en entier, accolades comprises — {numero}",

  identifiantsIncorrects: "courriel ou mot de passe incorrect",
  tropDEssais: "trop d’essais. Attendez quelques minutes et recommencez.",
  compteEnAttente:
    "Ce compte a été fermé par TOTEM. Contactez l’assistance pour le rouvrir.",
  courrielInvalide: "cela ne ressemble pas à une adresse de courriel",
  motDePasseTropCourt: "le mot de passe doit faire au moins 12 caractères",
  courrielDejaPris: "un compte existe déjà avec ce courriel",
  inscriptionImpossible: "le compte n’a pas pu être créé",
  inscriptionRefusee:
    "Impossible de créer ce compte. Si vous en avez déjà un, connectez-vous.",
  adresseManquante: "il faut l’adresse : rue, ville, pays",
  telephoneInvalide:
    "ce numéro de téléphone ne semble pas juste : 8 à 15 chiffres, avec l’indicatif si vous voulez",
  champTropLong: "un champ est trop long",
  proprietaireNeSeSupprimePas:
    "Le compte du propriétaire de la plateforme TOTEM ne se supprime pas depuis "
    + "l’application : c’est lui qui attribue les cartes à tous les autres.",
  vitrineNeSeSupprimePas:
    "Le compte de démonstration ne se supprime pas : il n’appartient à personne.",
  recuPasEnDemonstration:
    "Le compte de démonstration n’établit pas de reçu : un reçu est fabriqué "
    + "par le boîtier TOTEM à partir d’un vrai SMS d’opérateur, et la "
    + "démonstration n’a pas de boîtier.",
  aucunCompteASupprimer:
    "cette session ne correspond à aucun compte : il n’y a rien à supprimer",
  suppressionImpossible: "le compte n’a pas pu être supprimé. Réessayez dans un instant.",
  reserveAuProprietaire: "seul le propriétaire peut faire cela",
  carteNonConfiee: "cette carte ne vous a pas été confiée",
  beneficiaireIncomplet: "un bénéficiaire demande une carte, un numéro de 8 à 15 chiffres et un nom",
  pasSoiMeme: "vous ne pouvez pas faire cela à votre propre compte",
  pasLeProprietaire:
    "le compte du propriétaire ne se ferme ni ne se supprime — la plateforme "
    + "resterait sans propriétaire.",
  compteCree: "compte créé",
  nomManquant: "il faut le prénom et le nom",
  proprietaireVoitTout: "le propriétaire voit déjà toutes les cartes",
  carteInconnue: "cette carte n’est pas connue de la plateforme",
  codeDeCompteFaux:
    "Ce code de compte ne correspond pas à ce compte. Attribuez la puce d’après "
    + "le code joint à la puce, jamais d’après une adresse e-mail.",
  carteDansAucunTerminal:
    "cette carte n’est dans aucun terminal en ce moment — retirée, ou son "
    + "terminal est éteint. Rien n’a été composé.",
  boitierMuet: "Le boîtier TOTEM qui porte votre carte ne donne plus de nouvelles : rien n’est parti.",
  demandeAnnulee:
    "Annulée depuis l’application avant que le boîtier TOTEM qui porte votre carte ne la prenne : "
    + "rien n’est parti.",
  annulationIncertaine:
    "l’annulation n’a pas pu être confirmée : la demande peut encore partir quand "
    + "le boîtier TOTEM qui porte votre carte la prendra.",
};

export const textesApi = { en, fr } as const;

export function erreurApi(langue: Langue, cle: keyof typeof en): string {
  return textesApi[langue][cle];
}
