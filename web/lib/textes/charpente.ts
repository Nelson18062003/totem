// La charpente de l'application : le menu, l'état du terminal au pied du
// rail, le bandeau « Non relié » et les derniers SMS de l'accueil. Chaque
// écran a par ailleurs son propre dictionnaire.

const en = {
  // Le menu
  accueil: "Home",
  // « SIM » et non « account », « card » ou « chip » : un seul mot pour un
  // seul objet, celui qu'on tient dans la main et qu'on glisse dans le
  // boîtier. Voir le commentaire en tête de `textes/cartes.ts`.
  comptes: "SIMs",
  smsRecus: "Incoming SMS",
  analyse: "Analysis",
  operations: "Operations",
  codeUssd: "USSD code",
  reglages: "Settings",
  replier: "Collapse",
  replierMenu: "Collapse the menu",
  deplierMenu: "Expand the menu",

  // L'état du terminal, au pied du menu
  terminalActif: "Terminal active",
  terminalMuet: "Terminal silent",
  aucunTerminal: "No terminal connected",

  // La force du réseau, en mots. Le chiffre brut de `AT+CSQ` — « 4/31 » — ne
  // se lit pas ; les trois crans viennent de `forceReseau()` (lib/types.ts),
  // qui porte l'échelle et sa source. Ces mots servent trois écrans : la carte
  // du solde, la liste des puces et les réglages. Ils vivent donc ici, avec le
  // reste de ce qui dit l'état du terminal.
  reseau: {
    faible: "Weak signal",
    moyen: "Fair signal",
    bon: "Good signal",
  },

  // Le bandeau « Non relié » — le texte encadre les deux noms de variables,
  // qui restent tels quels dans les deux langues.
  nonRelie: "Not connected",
  nonRelieAvant: "The app is not connected to the database yet. On the server, set ",
  nonRelieEt: " and ",
  nonRelieApres:
    " (see docs/CLOUD.md), then reload: the terminal’s real data will appear.",

  // Les SMS
  nonLu: "unread",
  nonLus: (n: number) => (n === 1 ? "1 unread message" : `${n} unread messages`),
  telechargerRecu: "Download the PDF receipt",
};

const fr: typeof en = {
  accueil: "Accueil",
  comptes: "Puces",
  smsRecus: "SMS reçus",
  analyse: "Analyse",
  operations: "Opérations",
  codeUssd: "Code USSD",
  reglages: "Réglages",
  replier: "Replier",
  replierMenu: "Replier le menu",
  deplierMenu: "Déplier le menu",

  terminalActif: "Terminal actif",
  terminalMuet: "Terminal muet",
  aucunTerminal: "Aucun terminal relié",

  reseau: {
    faible: "Réseau faible",
    moyen: "Réseau moyen",
    bon: "Bon réseau",
  },

  nonRelie: "Non relié",
  nonRelieAvant:
    "L’application n’est pas encore reliée à la base de données. Sur le serveur, renseignez ",
  nonRelieEt: " et ",
  nonRelieApres:
    " (voir docs/CLOUD.md), puis rechargez : les vraies données du terminal apparaîtront.",

  nonLu: "non lu",
  nonLus: (n) => (n === 1 ? "1 message non lu" : `${n} messages non lus`),
  telechargerRecu: "Télécharger le reçu PDF",
};

export const textesCharpente = { en, fr } as const;
