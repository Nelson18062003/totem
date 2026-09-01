// Les textes de la seconde moitié de la console : les versions, le journal,
// les alertes.
//
// L'anglais s'écrit pour lui-même, le français aussi : aucun des deux n'est une
// traduction mot à mot de l'autre.
//
// CE QUE CES PHRASES ONT DE PARTICULIER
// Deux d'entre elles portent l'écran entier, et il faut résister à l'envie de
// les raccourcir.
//
// 1. « personne n'écrit ici » n'est pas « tout va bien ». Rien ne remplit
//    encore la table des alertes : le robot calcule ce qui ne va pas et n'en
//    fait qu'un message Telegram. Un écran vide se lirait comme une flotte en
//    bonne santé. Les phrases de vide de cet écran disent donc POURQUOI il est
//    vide, et l'écran pose à côté ce que la flotte, elle, raconte.
//
// 2. « muet » n'est pas « en retard ». Un boîtier qui ne parle plus continue
//    d'annoncer la version qu'il portait la dernière fois — la valeur vieillit
//    sans changer d'apparence. Les deux états ont donc des mots distincts, et
//    aucun ne peut se substituer à l'autre.
//
// Le vocabulaire des gestes du journal est FERMÉ : chaque clé de « geste »
// correspond à une valeur calculée dans « lib/journal.ts », jamais à un texte
// venu de la base. C'est ce qui garantit qu'un code, un jeton ou un message
// d'opérateur ne peut pas atterrir dans le titre d'une ligne.

const en = {
  // --- Écran 5 · les versions ------------------------------------------------
  versions: {
    titre: "Releases",
    ariane: (boitiers: number, portees: number) =>
      `${boitiers} ${boitiers === 1 ? "terminal" : "terminals"} · ${portees} ${portees === 1 ? "release" : "releases"} in the field`,
    videTitre: "No terminal on record",
    videDetail:
      "There is no box to compare against a release. A terminal appears here on its own, the first time it speaks.",

    registreVideTitre: "No release has been declared",
    registreVideDetail:
      "This screen can group the boxes by what they carry, and that is all it can honestly do. Nothing in the database says which release the fleet is supposed to run, so nothing here can be called late — and a box missing a security fix would look exactly like the others. Releases are declared in the « versions » table.",
    registreVideNote: "grouped by what each box carries, not by what it should carry",

    attendueTitre: "What the fleet should be running",
    attendueDepuis: (d: string) => `sent to the fleet on ${d}`,
    attendueAucune: "nothing has been sent to the fleet yet",
    essaiTitre: "Published, not sent to the fleet",
    essaiDetail:
      "These run on the test box and nowhere else. They do not make anyone late — the seven terminals carry exactly what was sent to them.",
    essaiPubliee: (d: string) => `published ${d}`,
    correctifPastille: "security fix",

    mesureExposes: "Missing a security fix",
    mesureExposesCalme: "no box is behind a security fix",
    mesureMuets: "Nothing known right now",
    mesureMuetsCalme: "every box has spoken",
    mesureRetard: "Behind, without risk",
    mesureRetardCalme: "nobody is behind",
    mesureAJour: "Up to date",

    colonneTerminal: "Terminal",
    colonneCommerce: "Whose it is",
    colonneLogiciel: "Software carried",
    colonneEtat: "Where it stands",
    colonneNouvelle: "Last heard from",

    etat: {
      expose_et_muet: "Exposed, and out of reach",
      muet: "Not known — the box is silent",
      expose: "Missing a security fix",
      hors_registre: "Carries something unknown",
      jamais_dit: "Never said what it carries",
      en_retard: "Behind",
      a_jour: "Up to date",
      retire: "Out of service",
    },
    etatDetail: {
      expose_et_muet:
        "It is behind a security fix and it has stopped speaking: the fix will not reach it on its own, and nobody will notice from here.",
      muet:
        "The release below is the one it announced the last time it spoke. It has not changed since, and it means nothing about today.",
      expose:
        "A hole was closed elsewhere and not here. This is not a matter of comfort.",
      hors_registre:
        "It carries a release the register does not know. Neither up to date nor late — unverifiable.",
      jamais_dit:
        "It speaks and has never said which software it runs. Nothing here is a measurement.",
      en_retard: "It runs an older release. No security fix is missing.",
      a_jour: "It runs exactly what was sent to the fleet.",
      retire: "Taken out of service on purpose. Its record stays whole.",
    },
    manque: (versions: string) => `missing: ${versions}`,
    versionMuette: "never said",
    triExplique:
      "Sorted by how far behind, never by name — and a box we cannot reach comes before a box we know is late.",

    portees: "What is out there",
    porteesDetail:
      "Counted on the boxes in service, from what each one last announced.",
    porteesCombien: (n: number) =>
      `${n} ${n === 1 ? "terminal" : "terminals"}`,

    gestesTitre: "What is not done from this screen",
    gestesDetail:
      "Sending software to seven counters has no second chance. It is done from a keyboard, deliberately, by someone who is watching — never by one tap on a web page.",
    gesteEnvoyer: "Send a release to the fleet",
    gesteEnvoyerQui:
      "the platform's own pipeline, from Nelson's desk — this console only reports what happened",
    gesteRevenir: "Roll a terminal back",
    gesteRevenirQui:
      "the terminal itself, from its own menu; the previous release stays on its card",
  },

  // --- Écran 6 · le journal --------------------------------------------------
  journal: {
    titre: "Commands & audit",
    ariane: (n: number) => `${n} ${n === 1 ? "entry" : "entries"} shown`,
    videTitre: "Nothing has been written to the journal",
    videDetail:
      "No command, no alert, no box has written a line yet. This register only ever grows — nothing is rewritten and nothing is deleted.",
    filtreVideTitre: "Nothing for this question",
    filtreVideDetail:
      "The register is not empty; it simply holds nothing matching what you asked. Widen the day, or drop one of the filters.",

    terminalTitre: "Which box",
    terminalTous: "Every box",
    jourTitre: "Which day",
    jourTous: "Every day",
    effacerFiltres: "Show everything again",
    filtreExplique:
      "Two filters, and they add up: one box, one day. That is the question this screen is for — what happened at that till, on that day.",

    colonneQuand: "When",
    colonneQui: "Who asked",
    colonneQuoi: "What was done",
    colonneCommerce: "Whose it is",
    colonneIssue: "Outcome",

    geste: {
      entree_ouverte: "Signed in",
      entree_refusee: "Turned away at the door",
      entree_ralentie: "Made to wait at the door",
      entree_expiree: "Arrived with an expired code",
      entree_invitation: "Opened an invitation",
      session_ouverte: "Opened a session",
      session_fermee: "Session closed",
      demande_solde: "Asked for a balance",
      demande_recu: "Asked for a receipt",
      demande_ussd: "Asked the terminal to dial",
      demande_identite: "Declared a SIM's number",
      demande_autre: "Asked the terminal for something",
      alerte_ouverte: "An alert was opened",
      alerte_vue: "Acknowledged an alert",
      alerte_close: "Closed an alert",
      boitier_ecrit: "The box wrote",
    },
    issue: {
      faite: "Done",
      refusee: "Refused",
      attente: "Still waiting",
      neutre: "—",
    },
    source: {
      porte: "the door",
      session: "a session",
      demande: "a command",
      alerte: "an alert",
      boitier: "a terminal",
    },
    sansPersonne: "no person on this line",
    sansPersonneDetail:
      "Written before the database recorded who, or done by a machine.",
    plafond: (n: number) =>
      `The ${n} most recent entries are shown. Narrow by day to see further back.`,
    sansSecret:
      "No line here can carry a code. What a box writes is scrubbed before it is shown — runs of four digits and anything that looks like a dialled code are replaced by dots — and what was actually sent to a terminal is never read by this screen at all.",
  },

  // --- Écran 7 · les alertes -------------------------------------------------
  alertes: {
    titre: "Alerts",
    ariane: (ouvertes: number) =>
      ouvertes === 0
        ? "nothing open"
        : `${ouvertes} still open`,

    // La distinction qui porte tout l'écran.
    jamaisEcritTitre: "Nobody writes to this register yet",
    jamaisEcritDetail:
      "This is not the same as « all is well ». The robot works out what is wrong on each terminal and sends it to Telegram, where it scrolls past. Nothing writes it down here, so nothing here can be closed, counted, or missed. Until that changes, judge the fleet from the fleet screen, not from this emptiness.",
    jamaisEcritContredit: (n: number) =>
      `And here is the proof: ${n} ${n === 1 ? "terminal is" : "terminals are"} in trouble right now and not one alert was opened.`,
    jamaisEcritCalme: (n: number) =>
      `Right now ${n} ${n === 1 ? "terminal is" : "terminals are"} in service and every one of them is speaking — but that comes from the fleet screen, not from this register.`,

    videTitre: "Nothing open",
    videDetail:
      "Every alert ever opened has been closed. That is a real statement, made from real lines — unlike an empty register, which says nothing at all.",

    mesureOuvertes: "Open right now",
    mesureOuvertesCalme: "nothing open",
    mesureAVoir: "Nobody has looked yet",
    mesureAVoirCalme: "every open alert has been seen",
    mesureCloses: "Closed, on record",
    mesureClosesCalme: "nothing has ever been closed",
    mesureFlotte: "Terminals in trouble now",
    mesureFlotteCalme: "every box is speaking",

    ouvertesTitre: "Open",
    closesTitre: "Closed",
    closesDetail:
      "They stay here with the hour they were opened, the hour they were seen, and the hour they were lifted. Nothing is deleted.",

    contradictionTitre: "What the fleet says, right now",
    contradictionDetail:
      "Read straight from the terminals, not from the register. When these boxes appear here and no alert is open, the register is the thing that is wrong.",

    ouverteDepuis: (d: string) => `open for ${d}`,
    vuePar: (qui: string, quand: string) => `seen by ${qui} · ${quand}`,
    vueParPersonne: (quand: string) => `seen ${quand}, no name recorded`,
    pasVue: "nobody has looked at this yet",
    closePar: (qui: string, quand: string) => `closed by ${qui} · ${quand}`,
    closeParPersonne: (quand: string) => `closed ${quand}, no name recorded`,

    gesteVue: "I have seen it",
    gesteVueFait: "Seen",
    gesteClore: "It is fixed",
    gesteCloreConfirmer: "Close this alert",
    gesteCloreAnnuler: "Not yet",
    gesteCloreMotif: "What was done (a few words, for whoever reads this later)",
    gesteCloreMotifExemple: "the internet box was replaced",
    gesteExplique:
      "Two gestures, and they are not the same one. « I have seen it » says somebody is on it; « it is fixed » takes the line off this screen. Merging them would hide things nobody repaired.",
    gesteRate: "That did not go through. Reload the page and try again.",
    gesteDejaFait: "Somebody got there first — the line already carries an hour.",

    gestesTitre: "What this console cannot do about an alert",
    gestesDetail:
      "An alert names a shop's money. Reading it is the platform's job; touching it is not.",
    gesteRedemarrer: "Restart the terminal",
    gesteRedemarrerQui:
      "the counter, by unplugging it — it comes back on its own and reads what it missed",
    gesteSolde: "Check the balance to see if it is fine",
    gesteSoldeQui: "the counter asks for it, from the shop app or the robot",
    gesteSortie: "Move the money out of harm's way",
    gesteSortieQui: "the owner of the shop, and nobody else, ever",
  },
};

const fr: typeof en = {
  versions: {
    titre: "Les versions",
    ariane: (boitiers, portees) =>
      `${boitiers} ${boitiers > 1 ? "terminaux" : "terminal"} · ${portees} version${portees > 1 ? "s" : ""} sur le terrain`,
    videTitre: "Aucun terminal au registre",
    videDetail:
      "Il n'y a aucun boîtier à comparer à une version. Un terminal apparaît ici tout seul, la première fois qu'il parle.",

    registreVideTitre: "Aucune version n'a été déclarée",
    registreVideDetail:
      "Cet écran peut regrouper les boîtiers par ce qu'ils portent, et c'est tout ce qu'il peut honnêtement faire. Rien dans la base ne dit quelle version la flotte est censée porter : rien ici ne peut donc être appelé « en retard », et un boîtier privé d'un correctif de sécurité ressemblerait exactement aux autres. Les versions se déclarent dans la table « versions ».",
    registreVideNote: "regroupés par ce que chaque boîtier porte, pas par ce qu'il devrait porter",

    attendueTitre: "Ce que la flotte devrait porter",
    attendueDepuis: (d) => `envoyée à la flotte le ${d}`,
    attendueAucune: "rien n'a encore été envoyé à la flotte",
    essaiTitre: "Publiées, pas envoyées à la flotte",
    essaiDetail:
      "Elles tournent sur le boîtier d'essai et nulle part ailleurs. Elles ne mettent personne en retard : les terminaux portent exactement ce qu'on leur a envoyé.",
    essaiPubliee: (d) => `publiée le ${d}`,
    correctifPastille: "correctif de sécurité",

    mesureExposes: "Privés d'un correctif de sécurité",
    mesureExposesCalme: "aucun boîtier n'est en arrière d'un correctif",
    mesureMuets: "On ne sait pas en ce moment",
    mesureMuetsCalme: "tous les boîtiers ont parlé",
    mesureRetard: "En retard, sans risque",
    mesureRetardCalme: "personne n'est en retard",
    mesureAJour: "À jour",

    colonneTerminal: "Terminal",
    colonneCommerce: "À qui il est",
    colonneLogiciel: "Logiciel porté",
    colonneEtat: "Où il en est",
    colonneNouvelle: "Dernière nouvelle",

    etat: {
      expose_et_muet: "Exposé, et hors d'atteinte",
      muet: "On ne sait pas — le boîtier est muet",
      expose: "Privé d'un correctif de sécurité",
      hors_registre: "Porte un logiciel inconnu",
      jamais_dit: "N'a jamais dit ce qu'il porte",
      en_retard: "En retard",
      a_jour: "À jour",
      retire: "Hors service",
    },
    etatDetail: {
      expose_et_muet:
        "Il est en arrière d'un correctif de sécurité et il a cessé de parler : le correctif ne lui parviendra pas tout seul, et personne ne s'en apercevra d'ici.",
      muet:
        "La version ci-dessous est celle qu'il a annoncée la dernière fois qu'il a parlé. Elle n'a pas changé depuis, et elle ne dit rien d'aujourd'hui.",
      expose:
        "Un trou a été bouché ailleurs et pas ici. Ce n'est pas une affaire de confort.",
      hors_registre:
        "Il porte une version que le registre ne connaît pas. Ni à jour, ni en retard : invérifiable.",
      jamais_dit:
        "Il parle et n'a jamais dit quel logiciel il porte. Rien ici n'est une mesure.",
      en_retard: "Il porte une version plus ancienne. Aucun correctif de sécurité ne lui manque.",
      a_jour: "Il porte exactement ce qui a été envoyé à la flotte.",
      retire: "Sorti du service exprès. Son journal reste entier.",
    },
    manque: (versions) => `il lui manque : ${versions}`,
    versionMuette: "jamais dit",
    triExplique:
      "Trié par le retard, jamais par le nom — et un boîtier qu'on ne joint plus passe devant un boîtier dont on sait qu'il est en retard.",

    portees: "Ce qui tourne sur le terrain",
    porteesDetail:
      "Compté sur les boîtiers en service, d'après ce que chacun a annoncé en dernier.",
    porteesCombien: (n) => `${n} terminal${n > 1 ? "aux" : ""}`,

    gestesTitre: "Ce qui ne se fait pas depuis cet écran",
    gestesDetail:
      "Envoyer du logiciel sur sept comptoirs n'a pas de deuxième chance. Cela se fait au clavier, exprès, par quelqu'un qui regarde — jamais d'un appui sur une page web.",
    gesteEnvoyer: "Envoyer une version à la flotte",
    gesteEnvoyerQui:
      "la chaîne de publication, depuis le poste de Nelson — cette console ne fait que raconter ce qui s'est passé",
    gesteRevenir: "Faire revenir un terminal en arrière",
    gesteRevenirQui:
      "le terminal lui-même, par son propre menu ; la version précédente reste sur sa carte",
  },

  journal: {
    titre: "Commandes et journal",
    ariane: (n) => `${n} ligne${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}`,
    videTitre: "Rien n'a été écrit au journal",
    videDetail:
      "Aucune commande, aucune alerte, aucun boîtier n'a encore écrit une ligne. Ce registre ne fait que grandir — rien n'y est réécrit, rien n'y est effacé.",
    filtreVideTitre: "Rien pour cette question",
    filtreVideDetail:
      "Le registre n'est pas vide ; il ne contient simplement rien qui corresponde à ce que vous demandez. Élargissez le jour, ou retirez un filtre.",

    terminalTitre: "Quel boîtier",
    terminalTous: "Tous les boîtiers",
    jourTitre: "Quel jour",
    jourTous: "Tous les jours",
    effacerFiltres: "Tout réafficher",
    filtreExplique:
      "Deux filtres, et ils se cumulent : un boîtier, un jour. C'est exactement la question que cet écran sert à poser — que s'est-il passé sur cette caisse, ce jour-là.",

    colonneQuand: "Quand",
    colonneQui: "Qui a demandé",
    colonneQuoi: "Ce qui a été fait",
    colonneCommerce: "À qui c'est",
    colonneIssue: "Issue",

    geste: {
      entree_ouverte: "Est entré",
      entree_refusee: "Refoulé à la porte",
      entree_ralentie: "Mis à l'attente à la porte",
      entree_expiree: "Arrivé avec un code périmé",
      entree_invitation: "A ouvert une invitation",
      session_ouverte: "A ouvert une session",
      session_fermee: "Session fermée",
      demande_solde: "A demandé un solde",
      demande_recu: "A demandé un reçu",
      demande_ussd: "A demandé au terminal de composer",
      demande_identite: "A déclaré le numéro d'une puce",
      demande_autre: "A demandé quelque chose au terminal",
      alerte_ouverte: "Une alerte s'est ouverte",
      alerte_vue: "A accusé réception d'une alerte",
      alerte_close: "A levé une alerte",
      boitier_ecrit: "Le boîtier a écrit",
    },
    issue: {
      faite: "Faite",
      refusee: "Refusée",
      attente: "En attente",
      neutre: "—",
    },
    source: {
      porte: "la porte",
      session: "une session",
      demande: "une commande",
      alerte: "une alerte",
      boitier: "un terminal",
    },
    sansPersonne: "aucune personne sur cette ligne",
    sansPersonneDetail:
      "Écrite avant que la base ne note par qui, ou faite par une machine.",
    plafond: (n) =>
      `Les ${n} lignes les plus récentes sont affichées. Choisissez un jour pour remonter plus loin.`,
    sansSecret:
      "Aucune ligne d'ici ne peut porter un code. Ce qu'un boîtier écrit est lavé avant d'être montré — les suites de quatre chiffres et tout ce qui ressemble à un code composé sont remplacés par des points — et ce qui a réellement été envoyé à un terminal n'est jamais lu par cet écran.",
  },

  alertes: {
    titre: "Les alertes",
    ariane: (ouvertes) =>
      ouvertes === 0
        ? "rien d'ouvert"
        : `${ouvertes} encore ouverte${ouvertes > 1 ? "s" : ""}`,

    jamaisEcritTitre: "Personne n'écrit encore dans ce registre",
    jamaisEcritDetail:
      "Ce n'est pas la même chose que « tout va bien ». Le robot calcule ce qui ne va pas sur chaque terminal et l'envoie à Telegram, où le message défile. Rien ne l'inscrit ici : rien ici ne peut donc être clos, compté, ni manqué. Tant que cela n'a pas changé, jugez la flotte depuis l'écran de la flotte, pas depuis ce vide.",
    jamaisEcritContredit: (n) =>
      `Et voici la preuve : ${n} boîtier${n > 1 ? "s vont" : " va"} mal en ce moment et pas une alerte n'a été ouverte.`,
    jamaisEcritCalme: (n) =>
      `En ce moment ${n} terminal${n > 1 ? "aux sont" : " est"} en service et ${n > 1 ? "tous parlent" : "il parle"} — mais cela vient de l'écran de la flotte, pas de ce registre.`,

    videTitre: "Rien d'ouvert",
    videDetail:
      "Toutes les alertes jamais ouvertes ont été closes. C'est une vraie affirmation, faite sur de vraies lignes — au contraire d'un registre vide, qui ne dit rien du tout.",

    mesureOuvertes: "Ouvertes en ce moment",
    mesureOuvertesCalme: "rien d'ouvert",
    mesureAVoir: "Que personne n'a regardées",
    mesureAVoirCalme: "toutes les ouvertes ont été vues",
    mesureCloses: "Closes, au registre",
    mesureClosesCalme: "rien n'a jamais été clos",
    mesureFlotte: "Terminaux qui vont mal",
    mesureFlotteCalme: "tous les boîtiers parlent",

    ouvertesTitre: "Ouvertes",
    closesTitre: "Closes",
    closesDetail:
      "Elles restent ici avec l'heure de leur ouverture, l'heure où on les a vues et l'heure où on les a levées. Rien ne s'efface.",

    contradictionTitre: "Ce que la flotte dit, en ce moment",
    contradictionDetail:
      "Lu directement sur les terminaux, pas dans le registre. Quand ces boîtiers apparaissent ici et qu'aucune alerte n'est ouverte, c'est le registre qui a tort.",

    ouverteDepuis: (d) => `ouverte depuis ${d}`,
    vuePar: (qui, quand) => `vue par ${qui} · ${quand}`,
    vueParPersonne: (quand) => `vue ${quand}, sans nom au registre`,
    pasVue: "personne ne l'a encore regardée",
    closePar: (qui, quand) => `levée par ${qui} · ${quand}`,
    closeParPersonne: (quand) => `levée ${quand}, sans nom au registre`,

    gesteVue: "Je l'ai vue",
    gesteVueFait: "Vue",
    gesteClore: "C'est réglé",
    gesteCloreConfirmer: "Lever cette alerte",
    gesteCloreAnnuler: "Pas encore",
    gesteCloreMotif: "Ce qui a été fait (quelques mots, pour qui lira plus tard)",
    gesteCloreMotifExemple: "la box internet a été remplacée",
    gesteExplique:
      "Deux gestes, et ce n'est pas le même. « Je l'ai vue » dit que quelqu'un s'en occupe ; « c'est réglé » retire la ligne de cet écran. Les confondre ferait disparaître des choses que personne n'a réparées.",
    gesteRate: "Cela n'a pas abouti. Rechargez la page et réessayez.",
    gesteDejaFait: "Quelqu'un est passé avant : la ligne porte déjà une heure.",

    gestesTitre: "Ce que cette console ne peut pas faire d'une alerte",
    gestesDetail:
      "Une alerte nomme l'argent d'un commerce. Le lire est le métier de la plateforme ; y toucher ne l'est pas.",
    gesteRedemarrer: "Redémarrer le terminal",
    gesteRedemarrerQui:
      "le comptoir, en le débranchant — il revient tout seul et relit ce qu'il a manqué",
    gesteSolde: "Consulter le solde pour vérifier que tout va bien",
    gesteSoldeQui: "le comptoir le demande, depuis l'application ou le robot",
    gesteSortie: "Mettre l'argent à l'abri",
    gesteSortieQui: "le propriétaire du commerce, et personne d'autre, jamais",
  },
};

// « Registre » et pas « journal » : noyau/textes/journal.ts existe déjà et
// porte la page « Ce qui s'est passé » du commerçant. Deux modules du même
// nom finiraient un jour importés l'un pour l'autre.
export const textesRegistre = { en, fr } as const;
