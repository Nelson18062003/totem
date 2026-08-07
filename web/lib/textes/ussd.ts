// Les textes de la console USSD. Les codes eux-mêmes (#148#…) et les réponses
// du réseau ne se traduisent jamais : seuls l'habillage de l'écran et les
// libellés des raccourcis (indexés par la clé du catalogue lib/codes.ts)
// changent de langue.

const en = {
  // --- La page (serveur) --------------------------------------------------------
  titre: "USSD code",
  sansCarteSousTitre:
    "Dialling a code needs a SIM in place — the terminal sees none at the moment.",
  aucuneCarte: "No SIM in the terminal",
  aucuneCarteDetail:
    "Slide a SIM into the terminal: you will then dial its codes here, just like on a phone.",

  // --- La console ---------------------------------------------------------------
  sousTitre: (libelle: string) =>
    `Dial as you would on the phone: the terminal in Douala types the code ` +
    `on the ${libelle} SIM, and the network's reply comes back here.`,
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
    "The exchange goes through the terminal in Douala: every reply shown " +
    "here is the operator's, word for word. The secret code is dialled on " +
    "its own keypad and never stored anywhere.",
  noteSessionCourte:
    "The exchange goes through the terminal in Douala: every reply shown " +
    "here is the operator's, word for word.",
  aucuneSession:
    "No exchange under way. Dial a code and the network's reply will appear here.",
  sessionEnCours: "Exchange in progress",
  sessionTerminee: "Exchange ended",
  raccrocher: "Hang up",
  terminalCompose: "the terminal is dialling…",
  reponseVide: "(empty reply)",
  echec: "Failed.",
  demandePasPartie: "the request could not be sent — try again",
  terminalMuet: "the terminal did not answer — is it switched on, and up to date?",
  accroc: "small hitch — please try again",
  votreReponseDetail: "Your reply (menu digit, amount, number…)",
  envoyer: "Send",
  annulerSession: "Hang up",
};

const fr: typeof en = {
  titre: "Code USSD",
  sansCarteSousTitre:
    "Composer un code exige une puce en place : le terminal n’en voit aucune pour l’instant.",
  aucuneCarte: "Aucune puce dans le terminal",
  aucuneCarteDetail:
    "Glissez une puce dans le terminal : vous composerez ensuite ses codes ici, comme sur un téléphone.",

  sousTitre: (libelle) =>
    `Composez comme sur le téléphone : le terminal de Douala tape le code ` +
    `sur la puce ${libelle}, et la réponse du réseau revient ici.`,
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
    "L’échange traverse le terminal de Douala : chaque réponse affichée " +
    "ici est celle de l’opérateur, mot pour mot. Le code secret, lui, se " +
    "compose sur son pavé et n’est enregistré nulle part.",
  noteSessionCourte:
    "L’échange traverse le terminal de Douala : chaque réponse affichée ici " +
    "est celle de l’opérateur, mot pour mot.",
  aucuneSession:
    "Aucun échange en cours. Composez un code, la réponse du réseau s’affichera ici.",
  sessionEnCours: "Échange en cours",
  sessionTerminee: "Échange terminé",
  raccrocher: "Raccrocher",
  terminalCompose: "le terminal compose…",
  reponseVide: "(réponse vide)",
  echec: "Échec.",
  demandePasPartie: "la demande n’a pas pu partir — réessayez",
  terminalMuet: "le terminal n’a pas répondu — est-il allumé, et à jour ?",
  accroc: "petit accroc — réessayez",
  votreReponseDetail: "Votre réponse (chiffre du menu, montant, numéro…)",
  envoyer: "Envoyer",
  annulerSession: "Raccrocher",
};

export const textesUssd = { en, fr } as const;
