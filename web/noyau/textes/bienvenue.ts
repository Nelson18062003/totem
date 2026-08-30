// L'accueil — les trois écrans qu'on ne voit qu'une fois.
//
// La règle vient de l'étude des accueils réussis : UNE idée par écran,
// presque pas de mots, et l'on montre la valeur avant de demander quoi que
// ce soit. Trois écrans, pas cinq : au quatrième, on ne présente plus, on
// retient. Chaque phrase tient en une ligne de téléphone — si elle plie,
// elle est trop longue.

const en = {
  passer: "Skip",
  suivant: "Next",
  commencer: "Get started",
  ecrans: [
    {
      titre: "Your Mobile Money,\non a real screen",
      texte: "Balances, messages and operations — laid out where you can see them.",
    },
    {
      titre: "It rings the moment\nmoney arrives",
      texte: "Every payment lands on your phone the second it happens.",
    },
    {
      titre: "No more codes\nto memorise",
      texte: "Deposit, withdraw, transfer — without dialling a single one.",
    },
  ],
};

const fr: typeof en = {
  passer: "Passer",
  suivant: "Suivant",
  commencer: "Commencer",
  ecrans: [
    {
      titre: "Votre Mobile Money,\nsur un vrai écran",
      texte: "Les soldes, les messages, les opérations — posés là où on les voit.",
    },
    {
      titre: "Il sonne à la seconde\noù l'argent arrive",
      texte: "Chaque paiement atteint votre téléphone au moment même.",
    },
    {
      titre: "Plus de codes\nà retenir",
      texte: "Dépôt, retrait, transfert — sans en composer un seul.",
    },
  ],
};

export const textesBienvenue = { en, fr } as const;
