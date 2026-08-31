// Les textes de la vitrine « /decouvrir » — la seule page qui présente TOTEM
// à un visiteur qui n'a pas de compte.
//
// Le ton s'inspire des grandes vitrines de produits : des verbes, des phrases
// courtes, le bénéfice avant la technique. Mais jamais un chiffre inventé,
// jamais un témoignage fabriqué — la page ne promet que ce que le produit
// fait, avec les mots de docs/IDENTITE.md et du README.

const en = {
  // L'en-tête de la vitrine
  navFonctionnement: "How it works",
  navSecurite: "Security",
  navEntrer: "Open the platform",

  // Le grand écran d'ouverture
  heroSur: "Mobile Money, run from afar",
  heroTitre1: "The totem stays home.",
  heroTitre2: "Through it, you act.",
  heroSousTitre:
    "Your MTN MoMo and Orange Money SIM cards live on a small terminal " +
    "that never leaves the office. From Telegram, the web or the phone " +
    "app, you run them — every menu, every SMS, every receipt — from " +
    "anywhere in the world.",
  heroEntrer: "Open the platform",
  heroVoir: "See how it works",
  heroNote: "Nothing exposed to the internet. The terminal only ever calls out.",

  // Le bandeau qui défile — ce qui passe par le totem, en un souffle
  bandeau: [
    "*126#", "Balance", "Send", "#150#", "Withdraw", "Receipt",
    "Daily report", "MTN MoMo", "Orange Money", "Airtime",
  ],

  // Les trois traits qui fondent tout le reste (docs/IDENTITE.md)
  traitsTitre: "Planted. Woven through. Twofold.",
  traitsSousTitre:
    "Three traits carry everything else — the product, and the braid " +
    "that signs it.",
  traits: [
    {
      titre: "Planted",
      texte:
        "The terminal does not move — that is its whole point. A small " +
        "box and its modems keep your SIM cards in the country, at the " +
        "office, plugged in and listening.",
    },
    {
      titre: "Woven through",
      texte:
        "You never touch it. Telegram, the web platform and the phone " +
        "app all act through it: you speak from anywhere, the totem " +
        "speaks to the operators.",
    },
    {
      titre: "Twofold",
      texte:
        "Two strands, never merged. One modem per operator — MTN and " +
        "Orange — both listening at all times, each on its own line.",
    },
  ],

  // Les gestes — ce qu'on fait, concrètement
  gestesTitre: "Every gesture fits in a button",
  gestesSousTitre:
    "Everything you used to dial blind on a phone at the counter, laid " +
    "out as buttons — readable, repeatable, from anywhere.",
  gestes: [
    {
      titre: "USSD menus become buttons",
      texte:
        "No more dialing *126# and pressing 5, then 1, blind. The " +
        "operator's menus arrive as tappable choices, and the whole " +
        "session holds on one card that updates in place.",
    },
    {
      titre: "Payment SMS, the second they land",
      texte:
        "Every SMS the operators send reaches you in real time, read " +
        "into an amount, a sender, a balance — and never guessed: in " +
        "doubt, a message is shown as it came rather than misread.",
    },
    {
      titre: "The PIN is never a message",
      texte:
        "Amounts, numbers and the secret code are composed on button " +
        "pads. A tap is not a message — it leaves no trace in any " +
        "history, and the log keeps nothing of the PIN but ****.",
    },
    {
      titre: "Receipts ready to hand over",
      texte:
        "Any payment becomes a PDF receipt, numbered and signed with " +
        "the braid, sent from wherever you are.",
    },
    {
      titre: "Frequent operations, one button",
      texte:
        "TOTEM learns the operations you make every day and folds each " +
        "one into a single shortcut.",
    },
    {
      titre: "The link does not break",
      texte:
        "Offline queue, watchdog, automatic recovery, a daily report. " +
        "If the terminal goes quiet, you are told — before your " +
        "customers notice.",
    },
  ],

  // Le verrou — dessiné avant le reste
  securiteTitre: "Nothing gets in. Only you get through.",
  securiteSousTitre:
    "TOTEM was drawn from the lock outward. The rest came after.",
  securite: [
    {
      titre: "No open ports",
      texte:
        "The terminal only makes outbound connections. There is nothing " +
        "on it to knock on — it works even behind Starlink.",
    },
    {
      titre: "Accounts wait at the door",
      texte:
        "The first account is the owner's. Every next one opens nothing " +
        "until the owner has approved it.",
    },
    {
      titre: "**** and nothing more",
      texte:
        "The Mobile Money PIN is never stored, never written into a " +
        "message, never logged beyond four stars. It exists the time of " +
        "an operation, then nowhere.",
    },
    {
      titre: "Only declared conversations",
      texte:
        "The robot answers the conversations it was given, and no " +
        "other. Any other sender is ignored — in silence.",
    },
  ],

  // Les trois portes d'entrée
  surfacesTitre: "Three ways in, one totem",
  surfacesSousTitre: "Wherever you are, one of them is already in your hand.",
  surfaces: [
    {
      titre: "Telegram",
      texte:
        "The counter in a conversation: clickable menus, secure " +
        "keypads, shortcuts — and a team group with roles: who acts, " +
        "who watches.",
    },
    {
      titre: "The web platform",
      texte:
        "The overview: balances by card, incoming payments, receipts, " +
        "statements to download. What a back office should be — no more.",
    },
    {
      titre: "The phone app",
      texte:
        "The counter in your pocket. It finds the platform, shows the " +
        "same figures, and hands over receipts as PDFs.",
    },
  ],

  // La fin — l'invitation
  finTitre: "The totem is planted.",
  finSousTitre: "Take your place at the counter — wherever you are.",
  finEntrer: "Open the platform",

  // Le pied de page
  piedDevise: "The totem stays home; through it, you act from afar.",
  piedConnexion: "Sign in",
  piedConfidentialite: "Privacy",
  piedSuppression: "Delete an account",
  piedLangue: "Language",
};

const fr: typeof en = {
  navFonctionnement: "Comment ça marche",
  navSecurite: "Sécurité",
  navEntrer: "Ouvrir la plateforme",

  heroSur: "Le Mobile Money, piloté de loin",
  heroTitre1: "Le totem reste au pays.",
  heroTitre2: "À travers lui, vous agissez.",
  heroSousTitre:
    "Vos cartes SIM MTN MoMo et Orange Money vivent sur un petit " +
    "terminal qui ne quitte jamais le bureau. Depuis Telegram, le web ou " +
    "l'application du téléphone, vous les pilotez — chaque menu, chaque " +
    "SMS, chaque reçu — de n'importe où dans le monde.",
  heroEntrer: "Ouvrir la plateforme",
  heroVoir: "Voir comment ça marche",
  heroNote:
    "Rien d'exposé sur Internet. Le terminal ne fait qu'appeler dehors.",

  bandeau: [
    "*126#", "Solde", "Envoi", "#150#", "Retrait", "Reçu",
    "Rapport du jour", "MTN MoMo", "Orange Money", "Crédit d'appel",
  ],

  traitsTitre: "Planté. Traversé. Double.",
  traitsSousTitre:
    "Trois traits portent tout le reste — le produit, et la tresse qui " +
    "le signe.",
  traits: [
    {
      titre: "Planté",
      texte:
        "Le terminal ne bouge pas — c'est sa raison d'être. Une petite " +
        "boîte et ses modems gardent vos cartes SIM au pays, au bureau, " +
        "branchées et à l'écoute.",
    },
    {
      titre: "Traversé",
      texte:
        "Vous ne le manipulez jamais. Telegram, la plateforme web et " +
        "l'application du téléphone agissent tous à travers lui : vous " +
        "parlez d'où vous êtes, le totem parle aux opérateurs.",
    },
    {
      titre: "Double",
      texte:
        "Deux brins, jamais confondus. Un modem par opérateur — MTN et " +
        "Orange — tous deux à l'écoute en permanence, chacun sur sa " +
        "ligne.",
    },
  ],

  gestesTitre: "Chaque geste tient dans un bouton",
  gestesSousTitre:
    "Tout ce qui se composait à l'aveugle sur un téléphone de guichet, " +
    "posé en boutons — lisible, rejouable, d'où que vous soyez.",
  gestes: [
    {
      titre: "Les menus USSD deviennent des boutons",
      texte:
        "Fini le *126#, puis le « 5 », puis le « 1 », à l'aveugle. Les " +
        "menus de l'opérateur arrivent en choix cliquables, et la " +
        "session entière tient sur une carte qui se met à jour en place.",
    },
    {
      titre: "Les SMS de paiement, à la seconde",
      texte:
        "Chaque SMS envoyé par les opérateurs vous parvient en temps " +
        "réel, lu en un montant, un expéditeur, un solde — et jamais " +
        "deviné : dans le doute, un message se montre tel quel plutôt " +
        "que mal interprété.",
    },
    {
      titre: "Le code secret n'est jamais un message",
      texte:
        "Les montants, les numéros et le code secret se composent sur " +
        "des pavés de boutons. Un appui n'est pas un message — il ne " +
        "laisse aucune trace dans aucun historique, et le journal ne " +
        "garde du code que ****.",
    },
    {
      titre: "Des reçus prêts à tendre",
      texte:
        "Chaque paiement devient un reçu PDF, numéroté et signé de la " +
        "tresse, envoyé d'où que vous soyez.",
    },
    {
      titre: "L'opération courante, en un bouton",
      texte:
        "TOTEM apprend les opérations que vous faites chaque jour et " +
        "replie chacune en un seul raccourci.",
    },
    {
      titre: "Le lien ne se rompt pas",
      texte:
        "File d'attente hors ligne, chien de garde, reprise " +
        "automatique, rapport quotidien. Si le terminal se tait, vous " +
        "le savez — avant vos clients.",
    },
  ],

  securiteTitre: "Rien n'entre. Vous seul passez.",
  securiteSousTitre:
    "TOTEM s'est dessiné à partir du verrou. Le reste est venu après.",
  securite: [
    {
      titre: "Aucun port ouvert",
      texte:
        "Le terminal ne fait que des connexions sortantes. Il n'y a " +
        "rien chez lui où frapper — il fonctionne même derrière " +
        "Starlink.",
    },
    {
      titre: "Les comptes attendent à la porte",
      texte:
        "Le premier compte est celui du propriétaire. Chaque suivant " +
        "n'ouvre rien tant que le propriétaire ne l'a pas approuvé.",
    },
    {
      titre: "**** et rien de plus",
      texte:
        "Le code PIN Mobile Money n'est jamais enregistré, jamais écrit " +
        "dans un message, jamais journalisé au-delà de quatre étoiles. " +
        "Il existe le temps d'une opération, puis nulle part.",
    },
    {
      titre: "Seules les conversations déclarées",
      texte:
        "Le robot répond aux conversations qu'on lui a confiées, et à " +
        "aucune autre. Tout autre expéditeur est ignoré — en silence.",
    },
  ],

  surfacesTitre: "Trois portes, un seul totem",
  surfacesSousTitre: "Où que vous soyez, l'une d'elles est déjà dans votre main.",
  surfaces: [
    {
      titre: "Telegram",
      texte:
        "Le guichet dans une conversation : menus cliquables, pavés " +
        "sécurisés, raccourcis — et un groupe d'équipe avec des rôles : " +
        "qui pilote, qui observe.",
    },
    {
      titre: "La plateforme web",
      texte:
        "La vue d'ensemble : soldes par carte, encaissements, reçus, " +
        "bilans à télécharger. Ce qu'un bureau doit être — rien de plus.",
    },
    {
      titre: "L'application du téléphone",
      texte:
        "Le guichet dans la poche. Elle trouve la plateforme, montre " +
        "les mêmes chiffres, et tend les reçus en PDF.",
    },
  ],

  finTitre: "Le totem est planté.",
  finSousTitre: "Prenez place au guichet — d'où que vous soyez.",
  finEntrer: "Ouvrir la plateforme",

  piedDevise: "Le totem reste au pays ; à travers lui, vous agissez à distance.",
  piedConnexion: "Se connecter",
  piedConfidentialite: "Confidentialité",
  piedSuppression: "Supprimer un compte",
  piedLangue: "Langue",
};

export const textesDecouvrir = { en, fr } as const;
