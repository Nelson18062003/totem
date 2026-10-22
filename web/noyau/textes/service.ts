// LE SERVICE D'UNE CARTE — ce que l'écran en dit (téléphone et site).
// L'anglais d'abord, écrit pour lui-même ; le français en regard.
//
// Un objet, un nom : la carte dit « Aucun service » (comme la barre d'état
// d'un téléphone) ; « Pas de réseau » reste au TÉLÉPHONE qui n'a pas Internet.

import type { EtatService } from "../service";

/** « 47 s », « 15 min », « 1 h 05 ». */
function dureeLisible(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

type Textes = {
  /** Sur la carte, à la place des barres — court : une pastille. */
  etiquette: Record<EtatService, string>;
  /** Le titre de la fiche. */
  titre: Record<EtatService, string>;
  /** Ce que ça veut dire, en une phrase, propre à l'état. */
  explication: Record<EtatService, string>;
  /** Ce que ça change pour l'argent, et ce que TOTEM fait. */
  argent: (operateur: string) => string;
  reconnexion: string;
  surPlace: string;
  /** Pour qui n'a pas le boîtier sous la main (grand public). */
  chezTotem: string;
  depuis: (quand: string) => string;
  coupures: (n: number, duree: string) => string;
  /** Une carte revenue, mais qui se coupe souvent. */
  instable: string;
  instableDetail: (n: number, duree: string) => string;
  fige: string;
  reverifier: string;
  fermer: string;
  duree: (secondes: number) => string;
};

const en: Textes = {
  etiquette: {
    aucun: "No service", recherche: "Searching for network", refusee: "Network refused",
    limitee: "Limited service", sms_seulement: "SMS only", inscrite: "", itinerance: "",
  },
  titre: {
    aucun: "This card has no service", recherche: "This card is looking for its network",
    refusee: "The network refuses this card", limitee: "This card has limited service",
    sms_seulement: "This card receives SMS only", inscrite: "This card keeps losing its network",
    itinerance: "This card keeps losing its network",
  },
  explication: {
    aucun: "The card is not registered on any network: it is not the box, nor the bars — the card is reached by nobody.",
    recherche: "The card is looking for its network and has not found it yet.",
    refusee: "The network refuses the card. It is not a fault of the box: the card may be suspended by the operator, or, abroad, the visited network does not accept it.",
    limitee: "The card is only registered for mobile data: operations (balance, deposit, withdrawal) cannot go through, and SMS may be late.",
    sms_seulement: "The card receives its SMS — payments do arrive — but operations (balance, deposit, withdrawal) may not go through.",
    inscrite: "", itinerance: "",
  },
  argent: (operateur) =>
    `Nothing can be sent from this card, and its payment SMS do not reach the box. The money itself does arrive on the ${operateur} account: TOTEM will see it when the network is back.`,
  reconnexion: "TOTEM tries to reconnect the card by itself, and warns you if it lasts.",
  surPlace: "On site: check that the antenna of this card's module is screwed in properly.",
  chezTotem: "The card is in TOTEM's box: TOTEM is notified and takes care of it.",
  depuis: (quand) => `Since ${quand}`,
  coupures: (n, duree) => `${n} outage${n > 1 ? "s" : ""} in 24 h (${duree} without service)`,
  instable: "Unstable network",
  instableDetail: (n, duree) =>
    `The card has its network right now, but lost it ${n} times in 24 hours (${duree} in all). The antenna of its module is the first thing to check.`,
  fige: "Last known state: the box is not giving news.",
  reverifier: "Check again",
  fermer: "Close",
  duree: (s) => dureeLisible(s),
};

const fr: Textes = {
  etiquette: {
    aucun: "Aucun service", recherche: "Recherche du réseau", refusee: "Réseau refusé",
    limitee: "Réseau limité", sms_seulement: "SMS seulement", inscrite: "", itinerance: "",
  },
  titre: {
    aucun: "Cette carte n'a aucun service", recherche: "Cette carte cherche son réseau",
    refusee: "Le réseau refuse cette carte", limitee: "Cette carte a un réseau limité",
    sms_seulement: "Cette carte ne reçoit que les SMS", inscrite: "Cette carte perd souvent son réseau",
    itinerance: "Cette carte perd souvent son réseau",
  },
  explication: {
    aucun: "La carte n'est inscrite sur aucun réseau : ce n'est ni le boîtier, ni les barres — personne ne joint la carte.",
    recherche: "La carte cherche son réseau et ne l'a pas encore trouvé.",
    refusee: "Le réseau refuse la carte. Ce n'est pas une panne du boîtier : la carte est peut-être suspendue chez l'opérateur, ou, à l'étranger, le réseau visité ne l'accepte pas.",
    limitee: "La carte n'est inscrite que pour l'Internet mobile : les opérations (solde, dépôt, retrait) ne passent pas, et les SMS peuvent tarder.",
    sms_seulement: "La carte reçoit ses SMS — les encaissements arrivent —, mais les opérations (solde, dépôt, retrait) peuvent ne pas passer.",
    inscrite: "", itinerance: "",
  },
  argent: (operateur) =>
    `Rien ne peut partir de cette carte, et ses SMS d'encaissement n'arrivent pas au boîtier. L'argent, lui, arrive bien sur le compte chez ${operateur} : TOTEM le verra au retour du réseau.`,
  reconnexion: "TOTEM essaie de reconnecter la carte tout seul, et vous prévient si ça dure.",
  surPlace: "Sur place : vérifiez que l'antenne du module de cette carte est bien vissée.",
  chezTotem: "La carte est dans le boîtier de TOTEM : TOTEM est prévenu et s'en occupe.",
  depuis: (quand) => `Depuis ${quand}`,
  coupures: (n, duree) => `${n} coupure${n > 1 ? "s" : ""} en 24 h (${duree} sans service)`,
  instable: "Réseau instable",
  instableDetail: (n, duree) =>
    `La carte a son réseau en ce moment, mais l'a perdu ${n} fois en 24 heures (${duree} en tout). L'antenne de son module est la première chose à vérifier.`,
  fige: "Dernier état connu : le boîtier ne donne plus de nouvelles.",
  reverifier: "Revérifier",
  fermer: "Fermer",
  duree: (s) => dureeLisible(s),
};

export const textesService = { en, fr };
