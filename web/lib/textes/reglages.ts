// Les textes de l'écran des réglages — la page serveur et ses composants
// interactifs. L'anglais s'écrit pour lui-même, le français aussi : aucun des
// deux n'est une traduction mot à mot de l'autre.
//
// Ne changent jamais de langue : les codes USSD (#148#…), les valeurs saisies,
// les noms d'opérateurs, la commande Telegram /reglages. Les erreurs venues
// des routes API ou du robot arrivent déjà localisées et s'affichent telles
// quelles.
//
// Le mot de l'objet est « puce » en français, « SIM » en anglais — un seul,
// partout. Voir l'en-tête de `textes/cartes.ts`.

const en = {
  titre: "Settings",
  sousTitre: "The terminal, the SIMs, security.",
  proprietaire: "Terminal owner",

  // --- Le terminal
  terminal: "Terminal",
  enLigne: "Online",
  muet: "Silent",
  misAJour: (d: string) => `updated ${d}`,
  nom: "Name",
  // Le nombre seul — « 1.8.2 » — ne dit pas de quoi il est le nombre. Il ne
  // sert qu'une fois : quand on demande au propriétaire si son boîtier est à
  // jour. L'étiquette le dit donc.
  version: "Software version",
  aucunTerminal:
    "No terminal has made itself known yet. As soon as the robot gets network, its status will appear here.",
  redemarrer: "Restart the terminal",

  // --- Les comptes
  comptes: "SIMs",
  voirSoldes: "See the balances",
  // Un état vide dit d'abord quoi faire. « No SIM has been seen by the
  // terminal yet » expliquait le pourquoi et laissait la personne devant un
  // blanc : il lui manquait le geste.
  aucuneCarte: "No SIM in the terminal",
  aucuneCarteDetail:
    "Slide a SIM into the terminal and it will show up here, with its balance and its number.",
  carte: (fin: string) => `SIM ${fin}`,
  retireeJournal: (d: string) => `removed ${d} · record kept`,
  // La note sur le numéro se compose en trois morceaux, autour du mot mis en
  // valeur et de la commande Telegram (qui ne se traduit pas).
  noteNumeroAvant: "The ",
  noteNumeroMot: "number",
  noteNumeroMilieu:
    " cannot be read from the SIM or the network: most prepaid SIMs never declare it. Tap it above to set it from here — or from Telegram, ",
  noteNumeroFin:
    ". Without it, a deposit or a transfer shows up with no way to tell whether the money came in or went out: the receipt says “Net amount” instead of “Amount received” or “Amount sent”.",

  // --- Le numéro d'une puce (réglage interactif)
  neufChiffres: "Nine digits, for example 696103864.",
  pasRepondu: "The terminal didn’t answer. Is it online?",
  majRequise:
    "Your terminal needs an update before the number can be set from here. Until then, do it on Telegram with /reglages.",
  aRefuse:
    "The terminal did not save the number, and did not say why. Try again in a moment; if it still refuses, set it on Telegram with /reglages.",
  pasPartie:
    "The setting never left this screen: the platform is out of reach. Check your connection, then try again.",
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
  carteEnPlace: (op: string) => `${op} · SIM in place`,
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
    "Each operator has its own codes: they belong to the network, and work with any SIM from that operator. A code only opens the menu — the secret code is typed on its keypad when the moment comes, and is never stored.",

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
  sousTitre: "Le terminal, les puces, la sécurité.",
  proprietaire: "Propriétaire du terminal",

  terminal: "Terminal",
  enLigne: "En ligne",
  muet: "Muet",
  misAJour: (d) => `mis à jour ${d}`,
  nom: "Nom",
  version: "Version du logiciel",
  aucunTerminal:
    "Aucun terminal ne s’est encore annoncé dans la base. Dès que le robot aura du réseau, son état apparaîtra ici.",
  redemarrer: "Redémarrer le terminal",

  comptes: "Puces",
  voirSoldes: "Voir les soldes",
  aucuneCarte: "Aucune puce dans le terminal",
  aucuneCarteDetail:
    "Glissez une puce dans le terminal : elle apparaîtra ici, avec son solde et son numéro.",
  carte: (fin) => `puce ${fin}`,
  retireeJournal: (d) => `retirée le ${d} · journal conservé`,
  noteNumeroAvant: "Le ",
  noteNumeroMot: "numéro",
  noteNumeroMilieu:
    " ne se lit ni sur la puce ni sur le réseau : la plupart des puces prépayées ne le déclarent pas. Touchez-le ci-dessus pour l’inscrire d’ici — ou depuis Telegram, ",
  noteNumeroFin:
    ". Sans lui, un dépôt ou un transfert s’affiche sans qu’on sache s’il sort ou entre : le reçu écrit « Montant net » au lieu de « Montant reçu » ou « Montant envoyé ».",

  neufChiffres: "Neuf chiffres, par exemple 696103864.",
  pasRepondu: "Le terminal n’a pas répondu. Est-il en ligne ?",
  majRequise:
    "Votre terminal doit être mis à jour pour régler le numéro d’ici. En attendant, faites-le sur Telegram avec /reglages.",
  aRefuse:
    "Le terminal n’a pas enregistré le numéro, et n’a pas dit pourquoi. Réessayez dans un instant ; s’il refuse encore, réglez-le sur Telegram avec /reglages.",
  pasPartie:
    "Le réglage n’est pas parti d’ici : la plateforme est hors de portée. Vérifiez votre connexion, puis réessayez.",
  reglerNumero: (libelle) => `Régler le numéro de ${libelle}`,
  numeroARenseigner: "numéro non inscrit",
  enregistrement: "Le terminal enregistre…",
  annuler: "Annuler",

  notifications: "Notifications",
  notifPaiement: "Chaque paiement reçu",
  notifRapport: "Rapport quotidien (21 h)",
  notifCourant: "Coupure de courant et sous-tension",
  notifTelegram: "Doubler les alertes sur Telegram",

  codesUssd: "Codes USSD",
  carteEnPlace: (op) => `${op} · puce en place`,
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
    "Chaque opérateur a ses propres codes ; ceux-ci appartiennent au réseau et suivront toute puce du même opérateur. Un code n’ouvre que le guichet ; le code secret se compose sur son pavé au moment voulu, et n’est jamais enregistré.",

  securite: "Sécurité",
  motDePasse: "Changer le mot de passe",
  doubleAuth: "Double authentification",
  activee: "Activée",
  notePin:
    "Le code PIN Mobile Money n’est enregistré nulle part : il se saisit à chaque opération, puis disparaît.",

  langue: "Langue",
  langueActive: "Langue actuelle",
  noteLangue:
    "Tout l’écran suit — dates, montants, alertes. Ce que l’opérateur envoie n’est jamais traduit : mot pour mot, tel que la puce l’a reçu.",

  seDeconnecter: "Se déconnecter",
  deconnexion: "Déconnexion…",
};

export const textesReglages = { en, fr } as const;
