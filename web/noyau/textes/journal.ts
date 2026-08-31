// Ce que TOTEM raconte quand quelque chose s'est mal passé.
//
// Le propriétaire n'est pas informaticien : on nomme L'OBJET, pas la
// technique. « Le terminal » et non « le daemon » ; « la plateforme n'a pas
// répondu » et non « erreur 503 ».

import type { Langue } from "../langue";

const en = {
  titre: "What happened",
  sousTitre: "Everything TOTEM noticed, most recent first.",
  rienTitre: "Nothing to report",
  rienDetail:
    "The terminal and the platform have had nothing to signal. That is the "
    + "state you want to see here.",
  leTerminal: "The terminal",
  laPlateforme: "The platform",
  voirLeJournal: "What happened",
  voirLeJournalSous: "Restarts, unreadable messages, interruptions",
  aujourdhui: "Today",
  hier: "Yesterday",
};

const fr: typeof en = {
  titre: "Ce qui s’est passé",
  sousTitre: "Tout ce que TOTEM a remarqué, du plus récent au plus ancien.",
  rienTitre: "Rien à signaler",
  rienDetail:
    "Ni le terminal ni la plateforme n’ont eu quoi que ce soit à signaler. "
    + "C’est l’état qu’on veut voir ici.",
  leTerminal: "Le terminal",
  laPlateforme: "La plateforme",
  voirLeJournal: "Ce qui s’est passé",
  voirLeJournalSous: "Redémarrages, messages illisibles, interruptions",
  aujourdhui: "Aujourd’hui",
  hier: "Hier",
};

export const textesJournal = { en, fr } as const;
export const journalPour = (langue: Langue) => textesJournal[langue];
