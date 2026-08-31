// Les textes de la vitrine « /decouvrir » — la seule page qui présente TOTEM
// à un visiteur qui n'a pas de compte.
//
// La règle d'écriture : des phrases courtes, une idée par carte, et de l'air.
// Le titre porte le sens, la ligne dessous précise, rien de plus. Jamais un
// chiffre inventé, jamais un témoignage fabriqué.

const en = {
  // L'en-tête de la vitrine
  navFonctionnement: "How it works",
  navSecurite: "Security",
  navEntrer: "Open the platform",

  // Le grand écran d'ouverture
  heroPuce: "MTN MoMo · Orange Money",
  heroTitre1: "The totem stays home.",
  heroTitre2: "You act from anywhere.",
  heroSousTitre:
    "Your Mobile Money SIM cards stay at the office. Every menu, " +
    "SMS and receipt reaches you, wherever you are.",
  heroEntrer: "Open the platform",
  heroVoir: "See how it works",
  heroAvec: "Works with",

  // La grande grille sous le héros. Chaque carte MONTRE son idée : les mots
  // se comptent, la vignette fait le reste.
  mosaiqueLegende: "One terminal at the office. Every operation in your hand.",
  cartePortesTitre: "Three ways in",
  portes: ["Telegram", "Web", "Phone"],
  carteUssdTitre: "Menus become buttons",
  ussdChoix: ["Balance", "Send", "Withdraw"],
  carteSmsTitre: "Every SMS, live",

  // Les écrans du produit, tels que publiés sur le magasin
  ecransSur: "The phone app",
  ecransTitre: "The counter, in your pocket",
  ecransTexte: "The same figures as the web, receipts included.",

  // Les gestes du guichet
  gestesTitre: "Made for the counter",
  gestes: [
    {
      titre: "The PIN is never a message",
      texte: "Typed on a keypad, kept nowhere, logged as ****.",
    },
    {
      titre: "Receipts ready to hand over",
      texte: "Every payment becomes a numbered PDF.",
    },
    {
      titre: "Daily operations, one button",
      texte: "Your habits become shortcuts.",
    },
    {
      titre: "The link does not break",
      texte: "Watchdog, offline queue, daily report.",
    },
  ],

  // Le verrou
  securiteTitre: "Nothing gets in.",
  securiteSousTitre: "Only you get through.",
  securite: [
    "No open ports. The terminal only calls out.",
    "A new account opens nothing until the owner approves it.",
    "Only declared conversations get an answer.",
    "The secret code lives the time of an operation, then nowhere.",
  ],

  // L'invitation finale
  finTitre: "The totem is planted.",
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

  heroPuce: "MTN MoMo · Orange Money",
  heroTitre1: "Le totem reste au pays.",
  heroTitre2: "Vous agissez de partout.",
  heroSousTitre:
    "Vos cartes SIM Mobile Money restent au bureau. Chaque menu, " +
    "chaque SMS, chaque reçu vous parvient, où que vous soyez.",
  heroEntrer: "Ouvrir la plateforme",
  heroVoir: "Voir comment ça marche",
  heroAvec: "Fonctionne avec",

  mosaiqueLegende: "Un terminal au bureau. Chaque opération dans votre main.",
  cartePortesTitre: "Trois portes",
  portes: ["Telegram", "Web", "Téléphone"],
  carteUssdTitre: "Les menus deviennent des boutons",
  ussdChoix: ["Solde", "Envoyer", "Retrait"],
  carteSmsTitre: "Chaque SMS, en direct",

  ecransSur: "L'application du téléphone",
  ecransTitre: "Le guichet, dans la poche",
  ecransTexte: "Les mêmes chiffres que le web, reçus compris.",

  gestesTitre: "Pensé pour le guichet",
  gestes: [
    {
      titre: "Le code secret n'est jamais un message",
      texte: "Composé sur un pavé, gardé nulle part, journalisé ****.",
    },
    {
      titre: "Des reçus prêts à tendre",
      texte: "Chaque paiement devient un PDF numéroté.",
    },
    {
      titre: "L'opération courante, en un bouton",
      texte: "Vos habitudes deviennent des raccourcis.",
    },
    {
      titre: "Le lien ne se rompt pas",
      texte: "Chien de garde, file d'attente, rapport quotidien.",
    },
  ],

  securiteTitre: "Rien n'entre.",
  securiteSousTitre: "Vous seul passez.",
  securite: [
    "Aucun port ouvert. Le terminal ne fait qu'appeler dehors.",
    "Un compte neuf n'ouvre rien tant que le propriétaire ne l'a pas approuvé.",
    "Seules les conversations déclarées obtiennent une réponse.",
    "Le code secret vit le temps d'une opération, puis nulle part.",
  ],

  finTitre: "Le totem est planté.",
  finEntrer: "Ouvrir la plateforme",

  piedDevise: "Le totem reste au pays ; à travers lui, vous agissez à distance.",
  piedConnexion: "Se connecter",
  piedConfidentialite: "Confidentialité",
  piedSuppression: "Supprimer un compte",
  piedLangue: "Langue",
};

export const textesDecouvrir = { en, fr } as const;
