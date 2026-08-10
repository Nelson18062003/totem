// Ce que TOTEM envoie, et ce que la personne accepte de recevoir.
//
// LA RÈGLE QUI GOUVERNE CE FICHIER
// Ce qui protège ne se débraye pas. Un message qu'on peut éteindre est un
// message qui n'aurait pas prévenu le jour où il fallait : le soir où le
// compte s'ouvre depuis un téléphone que personne n'a jamais vu. Quatre genres
// n'ont donc pas d'interrupteur, et ce n'est pas une consigne écrite quelque
// part — c'est la structure ci-dessous, la route qui la relit, et une
// contrainte de la base qui refuse la ligne. Trois barrages pour une règle
// qu'on ne peut pas se permettre de perdre dans une relecture.
//
// LE DÉFAUT EST « ON REÇOIT »
// L'absence de ligne en base vaut « on reçoit ». Une personne dont on n'a
// jamais lu la préférence est prévenue. Fabriquer un silence par oubli serait
// la pire façon de se taire.
//
// CE QUE CE FICHIER NE FAIT PAS
// Il ne connaît aucun texte de message. Les phrases envoyées vivent ailleurs
// (`lib/textes/courrier.ts`) et changeront sans le toucher : ici on décrit des
// GENRES — ce que c'est, quand ça part, et si ça se débraye.

import { inserer, lire, lireUne, modifier } from "./base";

/**
 * Un genre de message.
 *
 * `debrayable: false` veut dire « ce message protège » : il part quoi qu'on
 * coche. Ce n'est pas un défaut qu'on pourrait renverser plus tard — c'est la
 * raison d'être du message.
 */
export type Description = { debrayable: boolean };

export const GENRES = {
  // Les six chiffres. C'est la porte elle-même : l'éteindre, c'est se
  // condamner à ne plus jamais entrer depuis un autre appareil.
  code: { debrayable: false },
  // « Untel vous donne une clé ». Sans elle, l'invitation n'arrive nulle part.
  invitation: { debrayable: false },
  // Le compte existe. Une seule fois, et sans conséquence : elle se débraye.
  bienvenue: { debrayable: true },
  // Une entrée depuis un appareil jamais vu. C'est CE message qui prévient
  // d'une intrusion — le seul de la liste qu'un voleur aimerait voir éteint.
  alerte_appareil: { debrayable: false },
  // Un téléphone a été retiré du compte. Le pendant du précédent : il dit que
  // quelqu'un a touché aux clés.
  cle_retiree: { debrayable: false },
  // Chaque paiement reçu. Utile, parfois trop fréquent — on peut le couper.
  encaissement: { debrayable: true },
  // Le récapitulatif du soir.
  rapport: { debrayable: true },
  // Coupure de courant, terminal muet.
  terminal: { debrayable: true },
} as const satisfies Record<string, Description>;

export type Genre = keyof typeof GENRES;

/**
 * L'ordre de l'écran : ce qui protège d'abord, ce qui informe ensuite.
 *
 * Quelqu'un qui ouvre cette page cherche à se rassurer. Il doit tomber
 * d'abord sur les messages qui le défendent, et voir qu'ils n'ont pas
 * d'interrupteur — c'est cela, la promesse de la page.
 */
export const ORDRE = [
  "code", "invitation", "alerte_appareil", "cle_retiree",
  "bienvenue", "encaissement", "rapport", "terminal",
] as const satisfies readonly Genre[];

export function estGenre(valeur: unknown): valeur is Genre {
  return typeof valeur === "string" && Object.hasOwn(GENRES, valeur);
}

/** Ce genre a-t-il un interrupteur ? La seule source de la réponse. */
export function estDebrayable(genre: Genre): boolean {
  return GENRES[genre].debrayable;
}

export type LignePreference = {
  id: number;
  personne: number;
  genre: Genre;
  recevoir: boolean;
  change_le: string;
};

/** Ce que la personne reçoit, genre par genre. Tout est vrai par défaut. */
export type Choix = Record<Genre, boolean>;

function toutRecevoir(): Choix {
  const choix = {} as Choix;
  for (const genre of ORDRE) choix[genre] = true;
  return choix;
}

/**
 * Les préférences d'une personne, complétées par le défaut.
 *
 * On ne rend jamais une liste partielle : l'appelant reçoit les huit genres,
 * et n'a donc aucune occasion d'interpréter une absence — c'est en
 * interprétant une absence qu'on finit par ne rien envoyer.
 */
export async function preferencesDe(personne: number): Promise<Choix> {
  const choix = toutRecevoir();
  const lignes = await lire<LignePreference>(
    `preferences_messages?personne=eq.${personne}`);
  for (const ligne of lignes) {
    if (estGenre(ligne.genre)) choix[ligne.genre] = ligne.recevoir;
  }
  return choix;
}

/**
 * Ce message part-il vers cette personne ?
 *
 * C'est la question que pose l'envoi, et la seule bonne façon de la poser :
 * un genre qui protège répond oui sans même lire la base. Une préférence
 * corrompue, une ligne écrite à la main dans l'éditeur SQL, une panne de
 * lecture — aucun de ces accidents ne peut éteindre une alerte.
 */
export async function recoit(personne: number, genre: Genre): Promise<boolean> {
  if (!estDebrayable(genre)) return true;
  const ligne = await lireUne<LignePreference>(
    `preferences_messages?personne=eq.${personne}&genre=eq.${genre}&limit=1`);
  return ligne ? ligne.recevoir : true;
}

export type Verdict = "fait" | "protege" | "echec";

/**
 * Changer un choix.
 *
 * Le refus d'éteindre un message qui protège est ici, avant toute écriture, et
 * il est rendu comme un verdict nommé : l'écran peut alors dire POURQUOI le
 * geste n'a pas eu lieu, au lieu d'afficher une panne.
 */
export async function definirPreference(
  personne: number, genre: Genre, recevoir: boolean,
): Promise<Verdict> {
  if (!recevoir && !estDebrayable(genre)) return "protege";

  const existante = await lireUne<LignePreference>(
    `preferences_messages?personne=eq.${personne}&genre=eq.${genre}&limit=1`);

  if (existante) {
    const ok = await modifier(
      `preferences_messages?id=eq.${existante.id}`,
      { recevoir, change_le: new Date().toISOString() });
    return ok ? "fait" : "echec";
  }
  const ligne = await inserer<LignePreference>(
    "preferences_messages", { personne, genre, recevoir });
  return ligne ? "fait" : "echec";
}
