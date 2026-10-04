// Les textes de la console USSD. Les codes eux-mêmes (#148#…) et les réponses
// du réseau ne se traduisent jamais : seuls l'habillage de l'écran et les
// libellés des raccourcis (indexés par la clé du catalogue lib/codes.ts)
// changent de langue.

// Les trous d'un raccourci, dits avec des mots : « {numero} » n'apprend rien
// à qui n'a pas écrit le code.
const TROUS = {
  en: { numero: "number", point: "agent", montant: "amount" },
  fr: { numero: "numéro", point: "agent", montant: "montant" },
} as const;

/** « *126# › 1 › [numéro] » : chaque étape, les trous nommés entre crochets.
 *  Un trou inconnu garde son nom, mais jamais ses accolades. */
export function trajetLisible(
  etapes: string[], mots: Record<string, string>,
): string {
  return etapes
    .map((e) => e.replace(/\{([A-Za-z_]+)\}/g, (_, nom: string) => `[${mots[nom] ?? nom}]`))
    .join(" › ");
}

/** Ce qu'un raccourci à trous va demander avant de composer. */
function demande(vars: string[], langue: "fr" | "en"): string {
  const numero = vars.some((v) => v === "numero" || v === "point");
  const montant = vars.includes("montant");
  if (langue === "en") {
    return numero && montant ? "asks for a number and an amount"
      : montant ? "asks for an amount" : "asks for a number";
  }
  return numero && montant ? "demande un numéro et un montant"
    : montant ? "demande un montant" : "demande un numéro";
}

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
    `Dial as you would on the phone: the terminal types the code ` +
    `on the ${libelle} card, and the network's reply comes back here.`,
  composer: "Dial",
  // La ligne d'entrée du cadran, depuis l'écran Opérations du téléphone.
  composerSous: "Dial any code",
  // Le libellé d'un raccourci du catalogue : par sa clé, sinon tel quel.
  libelleCode: (cle: string, defaut: string) =>
    (
      {
        menu: "Menu",
        depot: "Deposit",
        retrait: "Withdraw",
        transfert: "Transfer",
        solde: "Check balance",
        mon_numero: "My number",
      } as Record<string, string | undefined>
    )[cle] ?? defaut,
  carteDuCadran: "Card the dialler uses",
  // --- Le cadran du téléphone, rangé -------------------------------------------
  // UNE phrase, la seule de l'écran : ce qu'est un code USSD, pour qui n'en
  // a jamais tapé — et que la réponse revient ICI.
  explication:
    "Codes that start with * or #, just like on your phone. The TOTEM box dials " +
    "them on the chosen card, and the operator's reply appears here.",
  // DANS le champ, le code seul : la phrase entière (« Type a code, e.g.
  // *126# ») était coupée à 320 et à 360 points — et c'était justement le
  // code d'exemple, la seule chose utile, qui disparaissait. La phrase
  // reste pour l'aide vocale (`exempleCode`).
  exempleCode: (c: string) => `Type a code, e.g. ${c}`,
  exempleCodeCourt: (c: string) => `e.g. ${c}`,
  raccourcis: "Shortcuts",
  ouvrirMenu: (service: string) => `Open the ${service} menu`,
  // Le TRAJET entier d'un raccourci, lisible : « *126# › 1 › [number] ».
  // Le premier code seul (« *126# » sur chaque ligne) ne disait pas ce que
  // chaque bouton faisait — ils commencent tous par le même menu.
  trajet: (etapes: string[]) => trajetLisible(etapes, TROUS.en),
  demandeUneValeur: (vars: string[]) => demande(vars, "en"),
  noteCodeSecret: "Your secret code is typed on its own keypad and never kept.",
  reglerCodes: "Set up the button codes",
  titreCode: (c: string) => `Code ${c}`,
  boutonsAppris: "Your buttons",
  boutonAVariables:
    "asks for a number or an amount — run it from Operations",
  noteSession:
    "The session goes through the terminal: every reply shown " +
    "here is the operator's, word for word. The secret code is dialled on " +
    "its own keypad and never stored anywhere.",
  noteSessionCourte:
    "The session goes through the terminal: every reply shown " +
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
  // Quand l'écran ABANDONNE une demande restée sans réponse, il l'annule —
  // et ne dit « rien n'est parti » que si l'annulation a PRIS. Sinon le
  // boîtier l'a déjà en main : elle peut encore aboutir, et le dire autrement
  // ferait recommencer un transfert qui part peut-être.
  sansReponseRienParti:
    "The TOTEM box that holds your card did not answer: the request has been cancelled, nothing was sent.",
  sansReponseEnCours:
    "The TOTEM box that holds your card has taken the request but has not answered yet: it may "
    + "still go through. Check your SMS before trying again.",
  sansReponseIncertaine:
    "The TOTEM box that holds your card did not answer, and the cancellation could not be "
    + "confirmed: the request may still go out. Check your SMS before trying again.",
  // Le boîtier a FINI la demande pendant que l'écran renonçait — mais sa
  // réponse n'a pas pu être relue. On ne dit ni « rien n'est parti », ni
  // « elle peut encore aboutir » : elle est finie, et on ne sait pas comment.
  sansReponseFinie:
    "The TOTEM box that holds your card finished the request just now, but its answer could not be "
    + "read back. Check your SMS before trying again.",
  accroc: "small hitch — please try again",
  votreReponseDetail: "Your reply (menu digit, amount, number…)",
  envoyer: "Send",
  annulerSession: "Cancel the session",
  fermerEcran: "Close",
  raccrocherQuestion: "Hang up the session?",
  raccrocherCourt: "Hang up",
  garderSession: "Keep it open",
};

const fr: typeof en = {
  titre: "Code USSD",
  sansCarteSousTitre:
    "Composer un code exige une carte en place : le terminal n’en voit aucune pour l’instant.",
  aucuneCarte: "Aucune carte dans le terminal",
  aucuneCarteDetail:
    "Dès qu'une SIM sera vue, vous pourrez composer ses codes ici, comme sur un téléphone.",

  sousTitre: (libelle) =>
    `Composez comme sur le téléphone : le terminal tape le code ` +
    `sur la carte ${libelle}, et la réponse du réseau revient ici.`,
  composer: "Composer",
  composerSous: "Composer n’importe quel code",
  libelleCode: (cle, defaut) =>
    (
      {
        menu: "Menu",
        depot: "Dépôt",
        retrait: "Retrait",
        transfert: "Transfert",
        solde: "Voir mon solde",
        mon_numero: "Mon numéro",
      } as Record<string, string | undefined>
    )[cle] ?? defaut,
  carteDuCadran: "Carte du cadran",
  explication:
    "Les codes qui commencent par * ou #, comme sur votre téléphone. Le boîtier " +
    "TOTEM les compose sur la carte choisie, et la réponse de l’opérateur s’affiche ici.",
  exempleCode: (c) => `Tapez un code, ex. ${c}`,
  exempleCodeCourt: (c) => `ex. ${c}`,
  raccourcis: "Raccourcis",
  ouvrirMenu: (service) => `Ouvrir le menu ${service}`,
  trajet: (etapes) => trajetLisible(etapes, TROUS.fr),
  demandeUneValeur: (vars) => demande(vars, "fr"),
  noteCodeSecret: "Le code secret se tape sur son propre pavé et n’est jamais gardé.",
  reglerCodes: "Régler les codes des boutons",
  titreCode: (c) => `Code ${c}`,
  boutonsAppris: "Vos boutons",
  boutonAVariables:
    "demande un numéro ou un montant — lancez-le depuis Opérations",
  noteSession:
    "La session traverse le terminal : chaque réponse affichée " +
    "ici est celle de l’opérateur, mot pour mot. Le code secret, lui, se " +
    "compose sur son pavé et n’est enregistré nulle part.",
  noteSessionCourte:
    "La session traverse le terminal : chaque réponse affichée ici " +
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
  sansReponseRienParti:
    "Le boîtier TOTEM qui porte votre carte n’a pas répondu : la demande est annulée, rien n’est parti.",
  sansReponseEnCours:
    "Le boîtier TOTEM qui porte votre carte a pris la demande mais n’a pas encore répondu : "
    + "elle peut encore aboutir. Regardez vos SMS avant de recommencer.",
  sansReponseIncertaine:
    "Le boîtier TOTEM qui porte votre carte n’a pas répondu, et l’annulation n’a pas pu être "
    + "confirmée : la demande peut encore partir. Regardez vos SMS avant de recommencer.",
  sansReponseFinie:
    "Le boîtier TOTEM qui porte votre carte vient de finir la demande, mais sa réponse n’a pas "
    + "pu être relue. Regardez vos SMS avant de recommencer.",
  accroc: "petit accroc — réessayez",
  votreReponseDetail: "Votre réponse (chiffre du menu, montant, numéro…)",
  envoyer: "Envoyer",
  annulerSession: "Annuler la session",
  fermerEcran: "Fermer",
  raccrocherQuestion: "Raccrocher la session ?",
  raccrocherCourt: "Raccrocher",
  garderSession: "La garder ouverte",
};

export const textesUssd = { en, fr } as const;
