// Les textes de la console USSD. Les codes eux-mêmes (#148#…) et les réponses
// du réseau ne se traduisent jamais : seuls l'habillage de l'écran et les
// libellés des raccourcis (indexés par la clé du catalogue lib/codes.ts)
// changent de langue.

const en = {
  // --- La page (serveur) --------------------------------------------------------
  titre: "USSD code",
  sansCarteSousTitre:
    "Dialling a code needs a card in place — the terminal sees none at the moment.",
  aucuneCarte: "No card in the terminal",
  aucuneCarteDetail:
    "As soon as a SIM is seen, you will be able to dial its codes here, just like on a phone.",

  // --- La console ---------------------------------------------------------------
  sousTitre: (libelle: string) =>
    `Dial as you would on the phone: the terminal in Douala types the code ` +
    `on the ${libelle} card, and the network's reply comes back here.`,
  composer: "Dial",
  // Le libellé d'un raccourci du catalogue : par sa clé, sinon tel quel.
  libelleCode: (cle: string, defaut: string) =>
    (
      {
        menu: "Menu",
        depot: "Deposit",
        retrait: "Withdrawal",
        transfert: "Transfer",
        solde: "Balance",
        mon_numero: "My number",
      } as Record<string, string | undefined>
    )[cle] ?? defaut,
  noteSession:
    "The session goes through the terminal in Douala: every reply shown " +
    "here is the operator's, word for word. The secret code is dialled on " +
    "its own keypad and never stored anywhere.",
  noteSessionCourte:
    "The session goes through the terminal in Douala: every reply shown " +
    "here is the operator's, word for word.",
  aucuneSession:
    "No session in progress. Dial a code and the network's reply will appear here.",
  sessionEnCours: "Session in progress",
  sessionTerminee: "Session ended",
  raccrocher: "Hang up the session",
  terminalCompose: "the terminal is dialling…",
  reponseVide: "(empty reply)",
  echec: "Failed.",
  demandePasPartie: "the request could not be sent",
  terminalMuet: "the terminal did not answer — is it switched on, and up to date?",
  accroc: "small hitch — please try again",
  votreReponseDetail: "Your reply (menu digit, amount, number…)",
  envoyer: "Send",
  annulerSession: "Cancel the session",
  fermerEcran: "Close",
  arreterQuestion: "Stop this session?",
  continuer: "Keep going",
  arreter: "Stop",
};

const fr: typeof en = {
  titre: "Code USSD",
  sansCarteSousTitre:
    "Composer un code exige une carte en place : le terminal n’en voit aucune pour l’instant.",
  aucuneCarte: "Aucune carte dans le terminal",
  aucuneCarteDetail:
    "Dès qu'une SIM sera vue, vous pourrez composer ses codes ici, comme sur un téléphone.",

  sousTitre: (libelle) =>
    `Composez comme sur le téléphone : le terminal de Douala tape le code ` +
    `sur la carte ${libelle}, et la réponse du réseau revient ici.`,
  composer: "Composer",
  libelleCode: (cle, defaut) =>
    (
      {
        menu: "Menu",
        depot: "Dépôt",
        retrait: "Retrait",
        transfert: "Transfert",
        solde: "Solde",
        mon_numero: "Mon numéro",
      } as Record<string, string | undefined>
    )[cle] ?? defaut,
  noteSession:
    "La session traverse le terminal de Douala : chaque réponse affichée " +
    "ici est celle de l’opérateur, mot pour mot. Le code secret, lui, se " +
    "compose sur son pavé et n’est enregistré nulle part.",
  noteSessionCourte:
    "La session traverse le terminal de Douala : chaque réponse affichée ici " +
    "est celle de l’opérateur, mot pour mot.",
  aucuneSession:
    "Aucune session en cours. Composez un code, la réponse du réseau s’affichera ici.",
  sessionEnCours: "Session en cours",
  sessionTerminee: "Session terminée",
  raccrocher: "Raccrocher la session",
  terminalCompose: "le terminal compose…",
  reponseVide: "(réponse vide)",
  echec: "Échec.",
  demandePasPartie: "la demande n’a pas pu partir",
  terminalMuet: "le terminal n’a pas répondu — est-il allumé, et à jour ?",
  accroc: "petit accroc — réessayez",
  votreReponseDetail: "Votre réponse (chiffre du menu, montant, numéro…)",
  envoyer: "Envoyer",
  annulerSession: "Annuler la session",
  fermerEcran: "Fermer",
  arreterQuestion: "Arrêter cette session ?",
  continuer: "Continuer",
  arreter: "Arrêter",
};

export const textesUssd = { en, fr } as const;
