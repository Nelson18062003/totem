// LES BOUTONS RONDS SOUS LA CARTE DE L'ACCUEIL — choisis par la personne.
//
// L'accueil imposait cinq ronds : Dépôt, Retrait, Transfert, Recevoir, Code
// USSD. Le propriétaire veut y mettre le Menu de l'opérateur, un autre son
// solde : chacun ne fait pas les mêmes gestes, et l'accueil est l'écran
// qu'on ouvre le plus. On choisit donc, dans les Réglages, lesquels et dans
// quel ordre.
//
// CINQ AU PLUS, SUR UNE LIGNE. La rangée tient cinq ronds à 20 % chacun ; un
// sixième la ferait passer sur deux lignes, et l'écran sauterait par rapport
// à sa forme d'attente. Au moins UN : un accueil sans aucun geste ressemble
// à un accueil en panne.
//
// RIEN N'EST INVENTÉ À LA LECTURE. Ce qui a été rangé sur le téléphone peut
// venir d'une version d'hier, ou être abîmé : un nom inconnu s'écarte, un
// doublon aussi, et une liste vide ou illisible rend l'accueil d'origine.
// Choisir un rond n'ouvre aucun droit — les codes et les cartes restent
// décidés par la plateforme.

export const RONDS = [
  "depot", "retrait", "transfert", "menu", "solde", "mon_numero",
  "recevoir", "ussd", "beneficiaires", "releve",
] as const;
export type Rond = (typeof RONDS)[number];

export const RONDS_MAX = 5;

/** L'accueil d'origine. Le Menu y entre, à la place du cadran « Code USSD »,
 *  qui reste à un geste dans Opérations → Outils (et se remet ici d'un appui). */
export const RONDS_PAR_DEFAUT: readonly Rond[] = ["depot", "retrait", "transfert", "menu", "recevoir"];

const estUnRond = (x: unknown): x is Rond =>
  typeof x === "string" && (RONDS as readonly string[]).includes(x);

/** Le choix rangé (texte JSON, ou liste), rendu sûr : connus, sans doublon,
 *  cinq au plus, et l'accueil d'origine s'il n'en reste aucun. */
export function rondsChoisis(brut: unknown): Rond[] {
  let liste: unknown = brut;
  if (typeof brut === "string") {
    try { liste = JSON.parse(brut); } catch { liste = null; }
  }
  if (!Array.isArray(liste)) return [...RONDS_PAR_DEFAUT];
  const vus: Rond[] = [];
  for (const x of liste) {
    if (estUnRond(x) && !vus.includes(x)) vus.push(x);
    if (vus.length === RONDS_MAX) break;
  }
  return vus.length ? vus : [...RONDS_PAR_DEFAUT];
}

/** Ajouter un rond (au bout, s'il reste de la place) ou le retirer (s'il
 *  n'est pas le dernier). Rend la liste inchangée quand ce n'est pas permis. */
export function basculerRond(liste: readonly Rond[], rond: Rond): Rond[] {
  if (liste.includes(rond)) {
    return liste.length > 1 ? liste.filter((r) => r !== rond) : [...liste];
  }
  return liste.length < RONDS_MAX ? [...liste, rond] : [...liste];
}

/** Monter (−1) ou descendre (+1) un rond d'une place. */
export function deplacerRond(liste: readonly Rond[], rond: Rond, sens: -1 | 1): Rond[] {
  const i = liste.indexOf(rond);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return [...liste];
  const copie = [...liste];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
}
