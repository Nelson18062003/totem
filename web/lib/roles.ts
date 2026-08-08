// Ce que chaque rôle a le droit de faire — décrit une seule fois, ici.
//
// La règle qui commande tout le fichier : le refus est SERVEUR. L'écran ne
// fait que ne pas proposer. Un bouton absent se contourne — il suffit
// d'appeler la route à la main depuis la console du navigateur — tandis
// qu'une route qui refuse tient devant n'importe qui.
//
// Et quand l'écran choisit tout de même de montrer un geste interdit, il le
// montre DÉSARMÉ, avec la phrase qui dit à qui le demander. Un refus qui
// tombe après coup pousse à emprunter le compte du patron ; un refus expliqué
// avant enseigne à qui appartient quoi.

import type { Role } from "./session";

/**
 * Les pouvoirs, du plus étroit au plus large. Nommés par ce qu'ils font, pas
 * par un niveau numérique : « niveau >= 2 » ne se relit pas, « peutOperer »
 * si.
 */
export type Pouvoir =
  /** Lire les soldes, la liste des SMS, télécharger un reçu. */
  | "lire"
  /** Tenir le comptoir : classer un SMS, établir un reçu, consulter un solde. */
  | "operer"
  /** Faire sortir de l'argent. Le propriétaire, et lui seul. */
  | "sortir_argent"
  /** Inviter, changer un rôle, retirer une clé, fermer les sessions d'autrui. */
  | "gerer_les_gens"
  /** Administrer la plateforme : flotte, versions, journal. */
  | "administrer";

const POUVOIRS: Record<Role, readonly Pouvoir[]> = {
  // Il possède l'argent. Il est le seul à pouvoir le faire sortir, et le seul
  // à distribuer les clés de son commerce.
  proprietaire: ["lire", "operer", "sortir_argent", "gerer_les_gens"],

  // Il tient le comptoir : il lit, il classe, il remet les reçus. Déplacer de
  // l'argent se fait avec le code de la SIM, par la personne qui la possède —
  // pas depuis une page web.
  operateur: ["lire", "operer"],

  // Il lit, il télécharge, et rien d'autre. Aucun bouton d'action ne lui est
  // présenté, et aucune route d'écriture ne lui répond.
  lecteur: ["lire"],

  // Le super-administrateur. Il voit tout et administre tout — et il ne peut
  // déclencher AUCUN mouvement d'argent, par aucun chemin. La séparation est
  // structurelle, pas contractuelle : « sortir_argent » n'est pas dans sa
  // liste, et il n'existe nulle part de code qui l'y ajoute.
  admin: ["lire", "administrer"],
};

export function peut(role: Role, pouvoir: Pouvoir): boolean {
  return POUVOIRS[role].includes(pouvoir);
}

/** Les genres de commande, et le pouvoir qu'il faut pour les demander. */
export const POUVOIR_PAR_COMMANDE: Record<string, Pouvoir> = {
  // Consulter : le comptoir en a besoin toute la journée.
  solde: "operer",
  recu: "operer",
  // Composer un code ou répondre dans un menu : c'est par là que l'argent
  // sort, même quand le code composé est innocent. On exige donc le pouvoir
  // du propriétaire, pas celui de l'opérateur.
  ussd: "sortir_argent",
  ussd_reponse: "sortir_argent",
  // Raccrocher n'ouvre rien : c'est le geste qui referme, et le refuser
  // laisserait une ligne occupée pendant que le client attend au comptoir.
  ussd_fin: "operer",
  // Déclarer le numéro d'une carte : cela change ce qu'un reçu affirme.
  identite: "gerer_les_gens",
};

/**
 * Le libellé de ce qui manque, dans la langue de la personne.
 *
 * On nomme l'objet, jamais le mécanisme : « seule Mme Fotso peut faire sortir
 * de l'argent » plutôt que « permission SORTIR_ARGENT requise ». Le
 * propriétaire n'est pas informaticien, et l'opérateur encore moins.
 */
export const MANQUE: Record<Pouvoir, { en: string; fr: string }> = {
  lire: {
    en: "You do not have a key to this shop.",
    fr: "Vous n'avez pas de clé de ce commerce.",
  },
  operer: {
    en: "Only someone who works at the counter can do this.",
    fr: "Seule une personne qui tient le comptoir peut faire cela.",
  },
  sortir_argent: {
    en: "Moving money belongs to the owner of the shop, at the counter, with the SIM's own PIN.",
    fr: "Faire sortir de l'argent appartient au propriétaire du commerce, au comptoir, avec le code de la puce.",
  },
  gerer_les_gens: {
    en: "Only the owner of the shop hands out and takes back keys.",
    fr: "Seul le propriétaire du commerce distribue et reprend les clés.",
  },
  administrer: {
    en: "This is the platform's own console.",
    fr: "Ceci est la console de la plateforme.",
  },
};
