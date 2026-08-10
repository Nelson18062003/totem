// Les textes de la console de la plateforme — les quatre premiers écrans.
//
// L'anglais s'écrit pour lui-même, le français aussi : aucun des deux n'est
// une traduction mot à mot de l'autre.
//
// LE TON DE CES ÉCRANS N'EST PAS CELUI DE L'APPLICATION DU COMMERÇANT
// Ici, celui qui lit est en France et regarde des machines posées chez
// quelqu'un d'autre. Chaque phrase doit donc dire trois choses : ce qui se
// passe, CHEZ QUI, et ce qu'il faut faire. « Silent » tout seul ne vaut rien —
// « Silent for 6 h · Marché · Bafoussam · someone has to go and look » se
// suffit.
//
// TROIS ÉTATS QUI NE DOIVENT JAMAIS SE RESSEMBLER
// « tout va bien », « ça va mal », « on ne sait pas ». Le troisième a ses
// propres phrases dans ce fichier, et elles ne disent jamais un chiffre : un
// zéro se lit comme une mesure, et une machine muette ne mesure rien.

const en = {
  // --- Le cadre commun ------------------------------------------------------
  console: "Platform console",
  nav: {
    flotte: "Fleet",
    cartes: "SIM registry",
    clients: "Clients",
    versions: "Releases",
    journal: "Commands & audit",
    alertes: "Alerts",
  },
  connecteComme: (nom: string) => `Signed in as ${nom}`,
  cePouvoir: "Sees every shop · moves no money, by any route",
  retourApplication: "Back to the shop app",
  // Le bandeau qui remplace les écrans quand la base n'est pas branchée. Ce
  // n'est pas la même chose qu'une base vide, et l'écran ne les confond pas.
  pasDeBaseTitre: "This console is not connected to the database",
  pasDeBaseDetail:
    "Nothing can be shown until SUPABASE_URL and SUPABASE_CLE are set on the server. No figure on this page would mean anything before that.",

  // --- Le vocabulaire partagé ----------------------------------------------
  etat: {
    actif: "Reporting",
    en_retard: "Late",
    muet: "Silent",
    jamais: "Never reported",
    retire: "Out of service",
  },
  etatDetail: {
    actif: "spoke within the last three minutes",
    en_retard: "has missed a few heartbeats",
    muet: "nothing for more than half an hour — someone has to go and look",
    jamais: "enrolled, but it has never spoken once",
    retire: "taken out of service — its record stays whole",
  },
  sansCommerce: "No shop attached",
  sansCommerceDetail:
    "Nothing in the database says whose this is. Until it does, no screen can name an owner for it.",
  inconnu: "Not known",
  entendu: (quand: string) => `heard from ${quand}`,
  gravite: { information: "For information", attention: "Needs an eye", grave: "Serious" },
  chez: (nom: string) => `at ${nom}`,
  voir: "Open",

  // --- Écran 1 · la flotte --------------------------------------------------
  flotte: {
    titre: "Fleet",
    ariane: (n: number, villes: number) =>
      `${n} ${n === 1 ? "terminal" : "terminals"} · ${villes} ${villes === 1 ? "shop" : "shops"}`,
    videTitre: "No terminal on record",
    videDetail:
      "The database holds no box at all. A terminal appears here on its own, the first time it speaks — nothing has to be created by hand.",
    // Les mesures. Chacune dit ce qu'elle compte, jamais un chiffre nu.
    mesureEnService: "Terminals in service",
    mesureMuets: "Silent or never heard",
    mesureMuetsCalme: "every box has spoken",
    mesureAlertes: "Alerts still open",
    mesureAlertesCalme: "no alert on record",
    mesureCartes: "SIM cards in place",
    mesureVersions: "Software carried",
    versionUnique: (v: string) => `all on ${v}`,
    versionMelange: (n: number) => `${n} different versions in the field`,
    versionAucune: "no box has said which software it carries",
    colonneTerminal: "Terminal",
    colonneCommerce: "Whose it is",
    colonneEtat: "State",
    colonneCartes: "SIM cards",
    colonneVersion: "Software",
    colonneNouvelle: "Last heard from",
    cartesInconnues: "not known — the box is silent",
    cartesPosees: (enPlace: number, connues: number) =>
      `${enPlace} of ${connues} in place`,
    aucuneCarte: "no SIM ever seen",
    versionMuette: "never said",
    santeTitre: "What the boxes report about themselves",
    santeMuette: "This terminal has never reported its own health.",
    enAttente: (n: number) => `${n} messages taken but not yet sent to the cloud`,
    triExplique:
      "Sorted by what is wrong, never by name: a box that has stopped talking comes first.",
    retiresTitre: "Out of service",
    retiresDetail:
      "These boxes were taken out on purpose. They stay here with their whole record — nothing is ever deleted.",
  },

  // --- Écran 2 · un terminal ------------------------------------------------
  terminal: {
    introuvableTitre: "No such terminal",
    introuvableDetail:
      "Nothing in the database carries this name. It may have been renamed, or the link may be old.",
    ariane: "Fleet",
    misEnService: (d: string) => `in service since ${d}`,
    machineTitre: "The machine",
    machineNote: "as the box describes itself",
    santeAbsente:
      "This terminal has never sent a word about its own health. Nothing here is a measurement — there is simply nothing to show yet.",
    version: "Software carried",
    enAttenteTitre: "Waiting to reach the cloud",
    enAttenteAucun: "nothing left waiting",
    enAttenteInconnu: "the box does not say",
    cartesTitre: "The SIM cards in this box",
    cartesVide:
      "This terminal has never seen a SIM card. Slide one in and it shows up here on its own.",
    journalTitre: "What this terminal wrote",
    journalNote: "written by the box itself, newest first",
    journalVide:
      "This terminal has written nothing to the cloud yet.",
    commandesTitre: "What was asked of it",
    commandesVide: "Nobody has ever asked this terminal for anything.",
    commandeEtat: {
      en_attente: "waiting",
      en_cours: "under way",
      faite: "done",
      echouee: "failed",
    },
    demandeePar: (nom: string) => `asked by ${nom}`,
    demandeeParInconnu: "asked before the journal recorded who",
    gestesTitre: "What an administrator cannot do here",
    gestesDetail:
      "These are shown so that nobody looks for them elsewhere. They belong to the shop, at the counter, with the SIM's own PIN.",
    gesteSolde: "Check a balance",
    gesteSoldeQui: "the counter asks for it — from the shop app or the robot",
    gesteSortie: "Move money",
    gesteSortieQui: "the owner of the shop, and nobody else, ever",
    gesteRecu: "Issue a receipt",
    gesteRecuQui: "the counter, on a message it has read",
  },

  // --- Écran 3 · les cartes SIM ---------------------------------------------
  cartes: {
    titre: "SIM registry",
    ariane: (n: number) => `${n} ${n === 1 ? "chip" : "chips"} on record`,
    videTitre: "No SIM card on record",
    videDetail:
      "No terminal has ever reported a chip. A card appears here on its own the first time a box sees it, and it never leaves this list again.",
    mesureEnPlace: "In place",
    mesureRetirees: "Taken out",
    mesureInconnues: "Whereabouts unknown",
    mesureItinerantes: "Roaming",
    mesureSansCommerce: "Attached to no shop",
    colonneCarte: "SIM",
    colonneCommerce: "Whose money",
    colonneTerminal: "In which box",
    colonneEtat: "State",
    colonneSolde: "Last known balance",
    colonneVue: "Last seen",
    etatEnPlace: "In place",
    etatRetiree: "Taken out",
    etatInconnu: "Not known",
    etatInconnuDetail: (terminal: string) =>
      `${terminal} is silent — nobody can say where this chip is`,
    itinerance: (reseau: string) => `roaming on ${reseau}`,
    soldeLe: (h: string) => `checked ${h}`,
    soldeJamais: "never checked",
    numeroAbsent: "no number on record",
    nomAbsent: "no account name declared",
    note:
      "A chip is known by the number engraved on it, never by the box it sits in. Move it to another shop and its whole record follows it.",
    orphelinesTitre: "Chips no shop claims",
    orphelinesDetail:
      "Money runs through these and the database says whose it is nowhere. Until a shop is attached, no screen can tell one owner's takings from another's.",
  },

  // --- Écran 4 · les clients ------------------------------------------------
  clients: {
    titre: "Clients",
    ariane: (commerces: number, gens: number) =>
      `${commerces} ${commerces === 1 ? "shop" : "shops"} · ${gens} ${gens === 1 ? "person" : "people"}`,
    videTitre: "No shop on record",
    videDetail:
      "The database holds no business yet. A shop is created with its owner, and everything else — terminals, chips, receipts — hangs from it.",
    mesureCommerces: "Shops",
    mesureGeles: "Frozen",
    mesureGelesCalme: "none frozen",
    mesureSansProprietaire: "Without a live owner",
    mesureGens: "People with a key",
    etatCommerce: {
      ouvert: "Open",
      succession: "Succession",
      litige: "Disputed",
      ferme: "Closed",
    },
    etatDetail: {
      ouvert: "money comes in and goes out normally",
      succession: "money still comes in and is still recorded — it cannot go out",
      litige: "read-only for everyone, including whoever seems to be right",
      ferme: "no access, no movement — the record stays readable",
    },
    depuis: (d: string) => `since ${d}`,
    role: {
      proprietaire: "owner",
      operateur: "counter",
      lecteur: "bookkeeper",
      admin: "platform",
    },
    colonnePersonne: "Person",
    colonneRole: "Role in this shop",
    colonneEtat: "Account",
    colonneEntree: "Last sign-in",
    etatPersonne: { actif: "Active", suspendu: "Suspended", parti: "Gone" },
    accesRetire: (d: string) => `key taken back ${d}`,
    jamaisEntre: "has never signed in",
    sansProprietaireTitre: "Nobody holds this shop",
    sansProprietaireDetail:
      "No live owner has a key here. Nothing can be sent out, and no key can be handed to anyone — this is fixed by a person, not by a screen.",
    contactSecours: (qui: string) => `if unreachable, call ${qui}`,
    contactSecoursAbsent:
      "Nobody was named to call if the owner goes quiet. Thirty seconds of a question, the day a shop hangs on it.",
    terminaux: "Terminals",
    aucunTerminal: "no box yet",
    cartes: "SIM cards",
    aucuneCarte: "no chip yet",
    personneVide: "Nobody has a key to this shop.",
    sansAccesTitre: "People with no key anywhere",
    sansAccesDetail:
      "They exist in the database and open nothing. Usually someone whose key was taken back — their record stays, on purpose.",
  },
};

const fr: typeof en = {
  console: "Console de la plateforme",
  nav: {
    flotte: "La flotte",
    cartes: "Les cartes SIM",
    clients: "Les clients",
    versions: "Les versions",
    journal: "Commandes et journal",
    alertes: "Les alertes",
  },
  connecteComme: (nom) => `Connecté en tant que ${nom}`,
  cePouvoir: "Voit tous les commerces · ne déplace aucun argent, par aucun chemin",
  retourApplication: "Revenir à l'application du commerce",
  pasDeBaseTitre: "Cette console n'est pas reliée à la base",
  pasDeBaseDetail:
    "Rien ne peut être montré tant que SUPABASE_URL et SUPABASE_CLE ne sont pas posées sur le serveur. Aucun chiffre de cette page ne voudrait dire quoi que ce soit avant.",

  etat: {
    actif: "Parle",
    en_retard: "En retard",
    muet: "Muet",
    jamais: "N'a jamais parlé",
    retire: "Hors service",
  },
  etatDetail: {
    actif: "a donné signe de vie il y a moins de trois minutes",
    en_retard: "a manqué quelques battements",
    muet: "plus rien depuis plus d'une demi-heure — il faut aller voir",
    jamais: "inscrit, mais il n'a jamais parlé une seule fois",
    retire: "sorti du service — son journal reste entier",
  },
  sansCommerce: "Rattaché à aucun commerce",
  sansCommerceDetail:
    "Rien dans la base ne dit à qui ceci appartient. Tant que ce n'est pas écrit, aucun écran ne peut lui donner un propriétaire.",
  inconnu: "On ne sait pas",
  entendu: (quand) => `entendu ${quand}`,
  gravite: { information: "Pour information", attention: "À surveiller", grave: "Grave" },
  chez: (nom) => `chez ${nom}`,
  voir: "Ouvrir",

  flotte: {
    titre: "La flotte",
    ariane: (n, villes) =>
      `${n} terminal${n > 1 ? "x" : ""} · ${villes} commerce${villes > 1 ? "s" : ""}`,
    videTitre: "Aucun terminal au registre",
    videDetail:
      "La base ne contient aucun boîtier. Un terminal apparaît ici tout seul, la première fois qu'il parle — il n'y a rien à créer à la main.",
    mesureEnService: "Terminaux en service",
    mesureMuets: "Muets ou jamais entendus",
    mesureMuetsCalme: "tous les boîtiers ont parlé",
    mesureAlertes: "Alertes encore ouvertes",
    mesureAlertesCalme: "aucune alerte au registre",
    mesureCartes: "Cartes SIM en place",
    mesureVersions: "Logiciel porté",
    versionUnique: (v) => `tous en ${v}`,
    versionMelange: (n) => `${n} versions différentes sur le terrain`,
    versionAucune: "aucun boîtier n'a dit quel logiciel il porte",
    colonneTerminal: "Terminal",
    colonneCommerce: "À qui il est",
    colonneEtat: "État",
    colonneCartes: "Cartes SIM",
    colonneVersion: "Logiciel",
    colonneNouvelle: "Dernière nouvelle",
    cartesInconnues: "on ne sait pas — le boîtier est muet",
    cartesPosees: (enPlace, connues) => `${enPlace} sur ${connues} en place`,
    aucuneCarte: "aucune SIM jamais vue",
    versionMuette: "jamais dit",
    santeTitre: "Ce que les boîtiers disent d'eux-mêmes",
    santeMuette: "Ce terminal n'a jamais parlé de sa propre santé.",
    enAttente: (n) => `${n} messages relevés, pas encore transmis au cloud`,
    triExplique:
      "Trié par ce qui va mal, jamais par le nom : un boîtier qui a cessé de parler passe devant.",
    retiresTitre: "Hors service",
    retiresDetail:
      "Ces boîtiers ont été retirés exprès. Ils restent ici avec tout leur journal — rien ne s'efface jamais.",
  },

  terminal: {
    introuvableTitre: "Ce terminal n'existe pas",
    introuvableDetail:
      "Rien dans la base ne porte ce nom. Il a peut-être été renommé, ou le lien date d'avant.",
    ariane: "La flotte",
    misEnService: (d) => `en service depuis le ${d}`,
    machineTitre: "La machine",
    machineNote: "tel que le boîtier se décrit",
    santeAbsente:
      "Ce terminal n'a jamais envoyé un mot sur sa propre santé. Rien ici n'est une mesure — il n'y a simplement rien à montrer pour l'instant.",
    version: "Logiciel porté",
    enAttenteTitre: "En attente d'atteindre le cloud",
    enAttenteAucun: "plus rien en attente",
    enAttenteInconnu: "le boîtier ne le dit pas",
    cartesTitre: "Les cartes SIM de ce boîtier",
    cartesVide:
      "Ce terminal n'a jamais vu de carte SIM. Glissez-en une et elle apparaîtra ici toute seule.",
    journalTitre: "Ce que ce terminal a écrit",
    journalNote: "écrit par le boîtier lui-même, le plus récent d'abord",
    journalVide: "Ce terminal n'a encore rien écrit dans le cloud.",
    commandesTitre: "Ce qu'on lui a demandé",
    commandesVide: "Personne n'a jamais rien demandé à ce terminal.",
    commandeEtat: {
      en_attente: "en attente",
      en_cours: "en cours",
      faite: "faite",
      echouee: "échouée",
    },
    demandeePar: (nom) => `demandé par ${nom}`,
    demandeeParInconnu: "demandé avant que le journal ne note par qui",
    gestesTitre: "Ce qu'un administrateur ne peut pas faire ici",
    gestesDetail:
      "On les montre pour que personne ne les cherche ailleurs. Ils appartiennent au commerce, au comptoir, avec le code de la puce.",
    gesteSolde: "Consulter un solde",
    gesteSoldeQui: "le comptoir le demande — depuis l'application ou le robot",
    gesteSortie: "Faire sortir de l'argent",
    gesteSortieQui: "le propriétaire du commerce, et personne d'autre, jamais",
    gesteRecu: "Établir un reçu",
    gesteRecuQui: "le comptoir, sur un message qu'il a lu",
  },

  cartes: {
    titre: "Les cartes SIM",
    ariane: (n) => `${n} puce${n > 1 ? "s" : ""} au registre`,
    videTitre: "Aucune carte SIM au registre",
    videDetail:
      "Aucun terminal n'a jamais signalé de puce. Une carte apparaît ici toute seule la première fois qu'un boîtier la voit, et elle ne quitte plus jamais cette liste.",
    mesureEnPlace: "En place",
    mesureRetirees: "Retirées",
    mesureInconnues: "On ne sait pas où",
    mesureItinerantes: "En itinérance",
    mesureSansCommerce: "Rattachées à aucun commerce",
    colonneCarte: "Puce",
    colonneCommerce: "L'argent de qui",
    colonneTerminal: "Dans quel boîtier",
    colonneEtat: "État",
    colonneSolde: "Dernier solde connu",
    colonneVue: "Vue pour la dernière fois",
    etatEnPlace: "En place",
    etatRetiree: "Retirée",
    etatInconnu: "On ne sait pas",
    etatInconnuDetail: (terminal) =>
      `${terminal} est muet — personne ne peut dire où est cette puce`,
    itinerance: (reseau) => `en itinérance sur ${reseau}`,
    soldeLe: (h) => `consulté ${h}`,
    soldeJamais: "jamais consulté",
    numeroAbsent: "numéro non provisionné",
    nomAbsent: "aucun nom de compte déclaré",
    note:
      "Une puce se reconnaît au numéro gravé dessus, jamais au boîtier où elle est posée. Déplacez-la dans un autre commerce et tout son journal la suit.",
    orphelinesTitre: "Les puces qu'aucun commerce ne réclame",
    orphelinesDetail:
      "De l'argent passe par elles et la base ne dit nulle part à qui il est. Tant qu'un commerce n'y est pas rattaché, aucun écran ne peut séparer la recette de l'un de celle de l'autre.",
  },

  clients: {
    titre: "Les clients",
    ariane: (commerces, gens) =>
      `${commerces} commerce${commerces > 1 ? "s" : ""} · ${gens} personne${gens > 1 ? "s" : ""}`,
    videTitre: "Aucun commerce au registre",
    videDetail:
      "La base ne contient encore aucune boutique. Un commerce se crée avec son propriétaire, et tout le reste — terminaux, puces, reçus — s'y accroche.",
    mesureCommerces: "Commerces",
    mesureGeles: "Gelés",
    mesureGelesCalme: "aucun gel en cours",
    mesureSansProprietaire: "Sans propriétaire vivant",
    mesureGens: "Personnes qui ont une clé",
    etatCommerce: {
      ouvert: "Ouvert",
      succession: "Succession",
      litige: "Litige",
      ferme: "Fermé",
    },
    etatDetail: {
      ouvert: "l'argent entre et sort normalement",
      succession: "l'argent entre toujours et reste enregistré — il ne peut plus sortir",
      litige: "lecture seule pour tout le monde, y compris celui qui a l'air d'avoir raison",
      ferme: "aucun accès, aucun mouvement — le journal reste lisible",
    },
    depuis: (d) => `depuis le ${d}`,
    role: {
      proprietaire: "propriétaire",
      operateur: "comptoir",
      lecteur: "comptable",
      admin: "plateforme",
    },
    colonnePersonne: "Personne",
    colonneRole: "Rôle dans ce commerce",
    colonneEtat: "Compte",
    colonneEntree: "Dernière entrée",
    etatPersonne: { actif: "Actif", suspendu: "Suspendu", parti: "Parti" },
    accesRetire: (d) => `clé reprise ${d}`,
    jamaisEntre: "n'est jamais entré",
    sansProprietaireTitre: "Personne ne tient ce commerce",
    sansProprietaireDetail:
      "Aucun propriétaire vivant n'y a de clé. Rien ne peut sortir, et aucune clé ne peut être remise à qui que ce soit — cela se répare par une personne, pas par un écran.",
    contactSecours: (qui) => `s'il n'est plus joignable, appeler ${qui}`,
    contactSecoursAbsent:
      "Personne n'a été nommé à appeler si le propriétaire ne répond plus. Trente secondes de question, le jour où une boutique en dépend.",
    terminaux: "Terminaux",
    aucunTerminal: "aucun boîtier pour l'instant",
    cartes: "Cartes SIM",
    aucuneCarte: "aucune puce pour l'instant",
    personneVide: "Personne n'a de clé de ce commerce.",
    sansAccesTitre: "Les personnes qui n'ont de clé nulle part",
    sansAccesDetail:
      "Elles existent dans la base et n'ouvrent rien. C'est en général quelqu'un à qui on a repris sa clé — son journal reste, exprès.",
  },
};

export const textesConsole = { en, fr } as const;
