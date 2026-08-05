// Les textes de l'écran des réglages — la page serveur et ses composants
// interactifs. L'anglais s'écrit pour lui-même, le français aussi : aucun des
// deux n'est une traduction mot à mot de l'autre.
//
// Ne changent jamais de langue : les codes USSD (#148#…), les valeurs saisies,
// « ICCID », les noms d'opérateurs, la commande Telegram /reglages. Les
// erreurs venues des routes API ou du robot arrivent déjà localisées et
// s'affichent telles quelles.

const en = {
  titre: "Settings",
  sousTitre: "The terminal, the accounts, security.",
  proprietaire: "Terminal owner",

  // --- Le terminal
  terminal: "Terminal",
  enLigne: "Online",
  muet: "Silent",
  misAJour: (d: string) => `updated ${d}`,
  nom: "Name",
  version: "Version",
  aucunTerminal:
    "No terminal has made itself known yet. As soon as the robot gets network, its status will appear here.",
  redemarrer: "Restart the terminal",

  // --- Les comptes
  comptes: "Accounts",
  voirSoldes: "See the balances",
  aucuneCarte: "No card has been seen by the terminal yet.",
  carte: (fin: string) => `card ${fin}`,
  retireeJournal: (d: string) => `removed ${d} · record kept`,
  noteIccid:
    "A card is known by its ICCID, never by the network it picks up: an MTN chip stays “MTN” even abroad, roaming. Changing cards opens a separate account — balances never mix, and the old card finds its record again if it comes back.",
  // La note sur le numéro se compose en trois morceaux, autour du mot mis en
  // valeur et de la commande Telegram (qui ne se traduit pas).
  noteNumeroAvant: "The ",
  noteNumeroMot: "number",
  noteNumeroMilieu:
    " cannot be read from the chip or the network: most prepaid SIMs never declare it. Tap it above to set it from here — or from Telegram, ",
  noteNumeroFin:
    ". Without it, a deposit or a transfer shows up with no way to tell whether the money came in or went out: the receipt says “Net amount” instead of “Amount received” or “Amount sent”.",

  // --- Le numéro d'une puce (réglage interactif)
  neufChiffres: "Nine digits, for example 696103864.",
  pasRepondu: "The terminal didn’t answer. Is it online?",
  majRequise:
    "Your terminal needs an update before the number can be set from here. Until then, do it on Telegram with /reglages.",
  aRefuse: "The terminal said no.",
  pasPartie: "The request could not be sent. Try again.",
  reglerNumero: (libelle: string) => `Set the number of ${libelle}`,
  numeroARenseigner: "no number yet",
  enregistrement: "The terminal is saving…",
  annuler: "Cancel",

  // --- Les notifications
  notifications: "Notifications",
  notifPaiement: "Every payment received",
  notifRapport: "Daily report (9 pm)",
  notifCourant: "Power cuts and low voltage",
  notifTelegram: "Alerts on Telegram too",

  // --- Les codes USSD
  codesUssd: "USSD codes",
  carteEnPlace: (op: string) => `${op} · current card`,
  aucunCode: (op: string) =>
    `No ${op} code has been taken down in the field yet — and a digit that moves money is not something to guess. Enter the ones from the real phone below.`,
  // Les libellés du catalogue de départ (lib/codes.ts), par clé. Un raccourci
  // ajouté à la main garde le nom que son auteur lui a donné.
  libellesCodes: {
    menu: "Menu",
    depot: "Deposit",
    retrait: "Withdrawal",
    transfert: "Transfer",
    solde: "Balance",
    mon_numero: "My number",
  } as Record<string, string | undefined>,
  modifierCode: "Edit this code",
  nomExemple: "Name (“Bills”)",
  ajouter: "Add",
  annulerAjout: "Cancel adding",
  ajouterRaccourci: "Add a shortcut",
  noteCodes:
    "Each operator has its own codes: they belong to the network, and work with any card from that operator. A code only opens the menu — the secret code is typed on its keypad when the moment comes, and is never stored.",

  // --- La sécurité
  securite: "Security",
  motDePasse: "Change the password",
  doubleAuth: "Two-step sign-in",
  activee: "On",
  notePin:
    "The Mobile Money PIN is stored nowhere: it is typed for each operation, then forgotten.",

  // --- La langue
  langue: "Language",
  langueActive: "Current language",
  noteLangue:
    "Every screen follows — dates, amounts, alerts. What the operator sends is never translated: it stays word for word, as the SIM received it.",

  // --- La sortie
  seDeconnecter: "Sign out",
  deconnexion: "Signing out…",
};

const fr: typeof en = {
  titre: "Réglages",
  sousTitre: "Le terminal, les comptes, la sécurité.",
  proprietaire: "Propriétaire du terminal",

  terminal: "Terminal",
  enLigne: "En ligne",
  muet: "Muet",
  misAJour: (d) => `mis à jour ${d}`,
  nom: "Nom",
  version: "Version",
  aucunTerminal:
    "Aucun terminal ne s’est encore annoncé dans la base. Dès que le robot aura du réseau, son état apparaîtra ici.",
  redemarrer: "Redémarrer le terminal",

  comptes: "Comptes",
  voirSoldes: "Voir les soldes",
  aucuneCarte: "Aucune carte encore vue par le terminal.",
  carte: (fin) => `carte ${fin}`,
  retireeJournal: (d) => `retirée le ${d} · journal conservé`,
  noteIccid:
    "Une carte est identifiée par son ICCID, jamais par le réseau capté : une puce MTN reste « MTN » même à l’étranger, en itinérance. Changer de carte ouvre un compte distinct — les soldes ne se mélangent pas, et l’ancienne retrouve son journal si on la remet.",
  noteNumeroAvant: "Le ",
  noteNumeroMot: "numéro",
  noteNumeroMilieu:
    " ne se lit ni sur la puce ni sur le réseau : la plupart des SIM prépayées ne le déclarent pas. Touchez-le ci-dessus pour l’inscrire d’ici — ou depuis Telegram, ",
  noteNumeroFin:
    ". Sans lui, un dépôt ou un transfert s’affiche sans qu’on sache s’il sort ou entre : le reçu écrit « Montant net » au lieu de « Montant reçu » ou « Montant envoyé ».",

  neufChiffres: "Neuf chiffres, par exemple 696103864.",
  pasRepondu: "Le terminal n’a pas répondu. Est-il en ligne ?",
  majRequise:
    "Ton terminal doit être mis à jour pour régler le numéro d’ici. En attendant, fais-le sur Telegram avec /reglages.",
  aRefuse: "Le terminal a refusé.",
  pasPartie: "La demande n’a pas pu partir. Réessayez.",
  reglerNumero: (libelle) => `Régler le numéro de ${libelle}`,
  numeroARenseigner: "numéro à renseigner",
  enregistrement: "Le terminal enregistre…",
  annuler: "Annuler",

  notifications: "Notifications",
  notifPaiement: "Chaque paiement reçu",
  notifRapport: "Rapport quotidien (21 h)",
  notifCourant: "Coupure de courant et sous-tension",
  notifTelegram: "Doubler les alertes sur Telegram",

  codesUssd: "Codes USSD",
  carteEnPlace: (op) => `${op} · carte en place`,
  aucunCode: (op) =>
    `Aucun code ${op} n’a encore été relevé sur le terrain — et on ne devine pas un chiffre qui déplace de l’argent. Saisissez ceux du vrai téléphone ci-dessous.`,
  libellesCodes: {
    menu: "Menu",
    depot: "Dépôt",
    retrait: "Retrait",
    transfert: "Transfert",
    solde: "Solde",
    mon_numero: "Mon numéro",
  } as Record<string, string | undefined>,
  modifierCode: "Modifier ce code",
  nomExemple: "Nom (« Factures »)",
  ajouter: "Ajouter",
  annulerAjout: "Annuler l’ajout",
  ajouterRaccourci: "Ajouter un raccourci",
  noteCodes:
    "Chaque opérateur a ses propres codes ; ceux-ci appartiennent au réseau et suivront toute carte du même opérateur. Un code n’ouvre que le guichet ; le code secret se compose sur son pavé au moment voulu, et n’est jamais enregistré.",

  securite: "Sécurité",
  motDePasse: "Changer le mot de passe",
  doubleAuth: "Double authentification",
  activee: "Activée",
  notePin:
    "Le code PIN Mobile Money n’est enregistré nulle part : il se saisit à chaque opération, puis disparaît.",

  langue: "Langue",
  langueActive: "Langue actuelle",
  noteLangue:
    "Tout l’écran suit — dates, montants, alertes. Ce que l’opérateur envoie n’est jamais traduit : mot pour mot, tel que la carte l’a reçu.",

  seDeconnecter: "Se déconnecter",
  deconnexion: "Déconnexion…",
};

export const textesReglages = { en, fr } as const;
