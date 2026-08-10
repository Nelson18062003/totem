// Le papier de dix codes — ce qui reste quand il ne reste rien.
//
// À QUOI IL SERT, ET SEULEMENT À ÇA
// Le jour où la boîte mail ET le téléphone sont hors de portée en même temps.
// Un téléphone arraché avec la session mail ouverte dedans, par exemple. Ce
// n'est ni un rattrapage honteux ni une option d'expert : c'est le seul chemin
// qui ne demande NI réseau, NI batterie, NI électricité — et sans lui, la
// seule issue serait d'appeler quelqu'un.
//
// CE QU'ON GARDE, ET CE QU'ON NE GARDE PAS
// Les dix codes sont rendus EN CLAIR une seule fois, à la fabrication. Ensuite
// il n'en reste que des empreintes, salées par la personne. TOTEM peut donc
// reconnaître un code qu'on lui présente, et ne peut PAS le dire — pas même
// au propriétaire, pas même sur demande. C'est ce qui permet d'écrire sur
// l'écran « nous ne pouvons pas vous les remontrer » sans mentir.
//
// L'ALPHABET, ET POURQUOI IL EST SI COURT
// Ces codes vivent sur un bout de papier, dans un tiroir mal éclairé, et ils
// se recopient à la main ou se dictent au téléphone. Tout caractère qui peut
// se lire pour un autre est un code perdu — c'est-à-dire une personne dehors,
// un jour où elle n'a plus que ça.
//   · on retire les couples qui se CONFONDENT À L'ŒIL — 0/O, 1/I/L, 2/Z, 5/S,
//     6/G, 8/B, U/V, et Q qui se lit O ou 2 selon la main qui l'écrit ;
//   · dans chaque couple, on garde le CHIFFRE : il s'écrit d'une seule façon
//     partout, là où un « S » manuscrit change de forme d'une main à l'autre.
//     Le couple 0/O est le seul dont on retire les deux — un zéro barré et un
//     zéro nu ne se ressemblent pas assez pour qu'on choisisse ;
//   · restent 25 caractères, et un code de huit en tire 37 bits. Assez : ces
//     codes sont à usage unique et il n'y en a que dix.
// Ce qu'on a écarté ne disparaît pas pour autant : `normaliserCodePapier`
// RATTRAPE le S écrit pour un 5 au lieu de refuser. Le doute sur la forme
// d'une lettre ne doit jamais coûter une entrée.
//
// CE QU'ON A RENONCÉ À FAIRE
// Distinguer aussi ce qui se confond À L'OREILLE (« M » et « N », « D » et
// « T »). L'alphabet serait tombé à une douzaine de caractères, et l'acte
// réel est de RECOPIER depuis un papier, pas de dicter. Les codes s'écrivent
// donc en deux groupes de quatre, ce qui rend la dictée tenable.

import { inserer, lire, lireUne, modifier } from "./base";
import { memeEmpreinte } from "./code-entree";

/** Dix. Assez pour tenir des années à raison d'un ou deux par accident ;
 *  assez peu pour tenir sur une feuille qu'on lit d'un coup d'œil. */
export const PAR_SERIE = 10;

/** Huit caractères, écrits en deux groupes de quatre. */
export const LONGUEUR = 8;

/** Les 25 caractères qui ne se confondent avec aucun autre. */
export const ALPHABET = "23456789ACDEFHJKMNPRTVWXY";

/** Ce qu'une main écrit à la place de ce qu'on imprime. On le rattrape au
 *  lieu de refuser : aucun de ces caractères ne sort jamais du tirage, donc
 *  les accepter n'élargit rien — cela corrige seulement une lecture.
 *
 *  O, I, L et Q n'y sont pas, et c'est la seule exception cohérente : leur
 *  jumeau a été retiré lui aussi (0 et 1 ne s'impriment pas), donc il n'y a
 *  rien sur quoi les rattraper. Les deviner serait inventer. */
const CONFUSIONS: Record<string, string> = {
  Z: "2", S: "5", G: "6", B: "8", U: "V",
};

export type LignePapier = {
  id: number;
  personne: number;
  empreinte: string;
  rang: number;
  serie: number;
  cree_le: string;
  utilise_le: string | null;
  appareil: string | null;
  lieu: string | null;
  annulee_le: string | null;
};

// --- Fabriquer un code ------------------------------------------------------

/**
 * Un code de huit caractères, tiré sans biais.
 *
 * Le rejet est la partie qui compte, exactement comme pour les six chiffres :
 * 256 n'est pas un multiple de 25, donc un « % 25 » posé sur un octet brut
 * rendrait les six premiers caractères de l'alphabet 10 % plus fréquents que
 * les autres. On jette les tirages qui tombent dans la queue incomplète.
 */
export function tirerCodePapier(): string {
  const limite = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const octets = new Uint8Array(1);
  let code = "";
  while (code.length < LONGUEUR) {
    crypto.getRandomValues(octets);
    if (octets[0] >= limite) continue;
    code += ALPHABET[octets[0] % ALPHABET.length];
  }
  return code;
}

/** Le code, écrit comme il s'imprime : « 7K4M 2VW9 ». Deux groupes de quatre,
 *  parce qu'on le recopie de l'œil vers le champ et que huit caractères
 *  d'affilée se perdent en route. */
export function ecrireCodePapier(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/**
 * Ce que la personne a tapé, ramené à ce qu'on a imprimé.
 *
 * Les espaces, les tirets et les points sautent — on colle un code depuis un
 * carnet, pas depuis une base de données. Et les caractères qu'on n'imprime
 * jamais retombent sur leur jumeau : quelqu'un qui a lu « S » là où il y avait
 * « 5 » entre chez lui, au lieu de rester dehors avec un papier en main.
 */
export function normaliserCodePapier(saisi: string): string {
  let propre = "";
  for (const brut of saisi.toUpperCase()) {
    const c = CONFUSIONS[brut] ?? brut;
    if (ALPHABET.includes(c)) propre += c;
  }
  return propre;
}

/**
 * L'empreinte d'un code, salée par la personne à qui il appartient.
 *
 * Sans le sel, deux personnes dont les papiers portent le même code auraient
 * la même ligne en base — et qui la lit saurait qu'elles partagent un secret.
 */
export async function empreintePapier(code: string, personne: number): Promise<string> {
  const octets = new TextEncoder().encode(`totem:papier:${personne}:${code}`);
  const somme = await crypto.subtle.digest("SHA-256", octets as unknown as BufferSource);
  return Array.from(new Uint8Array(somme), (o) => o.toString(16).padStart(2, "0")).join("");
}

// --- Fabriquer une série ----------------------------------------------------

export type Serie = { serie: number; codes: string[] };

/**
 * Dix codes neufs. Ils sont rendus EN CLAIR, une seule fois, ici.
 *
 * L'ORDRE COMPTE, et il est contre-intuitif : on POSE la nouvelle série AVANT
 * d'annuler l'ancienne. L'inverse paraît plus propre et laisse quelqu'un sans
 * aucun papier valable le jour où le réseau coupe entre les deux écritures —
 * c'est-à-dire exactement le genre de journée où ce papier sert. Deux séries
 * valables pendant une seconde ne coûtent rien ; zéro série coûte une entrée.
 */
export async function fabriquerSerie(personne: number): Promise<Serie | null> {
  const derniere = await lireUne<{ serie: number }>(
    `codes_papier?personne=eq.${personne}&select=serie&order=serie.desc&limit=1`);
  const serie = (derniere?.serie ?? 0) + 1;

  const codes: string[] = [];
  const lignes: Record<string, unknown>[] = [];
  while (codes.length < PAR_SERIE) {
    const code = tirerCodePapier();
    // Deux codes identiques sur la même feuille, c'est une entrée perdue :
    // le second n'ouvrirait rien, et la personne ne saurait pas pourquoi.
    if (codes.includes(code)) continue;
    codes.push(code);
    lignes.push({
      personne,
      empreinte: await empreintePapier(code, personne),
      rang: codes.length,
      serie,
    });
  }

  // Une seule écriture pour les dix : sur un forfait où le mégaoctet coûte,
  // et sur une connexion qui coupe, dix allers-retours sont dix occasions de
  // s'arrêter au milieu.
  const pose = await inserer<LignePapier>("codes_papier", lignes);
  if (!pose) return null;

  await modifier(
    `codes_papier?personne=eq.${personne}&serie=lt.${serie}&annulee_le=is.null`,
    { annulee_le: new Date().toISOString() });

  return { serie, codes };
}

// --- Se servir d'un code ----------------------------------------------------

/**
 * Consommer un code. Il ne resservira jamais.
 *
 * C'est la BASE qui l'arbitre, par le filtre « pas encore utilisé » posé sur
 * la modification : deux requêtes qui arrivent au même instant avec le même
 * code ne peuvent pas réussir toutes les deux. Un contrôle fait ici, en
 * mémoire, laisserait passer les deux.
 *
 * On demande la personne : le code seul ne nomme personne, et c'est voulu —
 * elle dit d'abord qui elle est (son adresse), le code prouve ensuite. Un
 * papier ramassé par terre n'ouvre donc rien tant qu'on ne sait pas à qui il
 * appartient.
 */
export async function consommerCodePapier(
  code: string, personne: number, appareil?: string | null, lieu?: string | null,
): Promise<boolean> {
  const propre = normaliserCodePapier(code);
  if (propre.length !== LONGUEUR) return false;

  const attendue = await empreintePapier(propre, personne);
  const ligne = await lireUne<LignePapier>(
    `codes_papier?personne=eq.${personne}&empreinte=eq.${attendue}`
    + `&utilise_le=is.null&annulee_le=is.null&limit=1`);
  if (!ligne) return false;

  // La ligne a été trouvée PAR son empreinte : le code est donc juste. La
  // comparaison qui suit ne sert qu'à rendre le chemin identique dans les deux
  // cas, pour ne rien livrer au chronomètre.
  if (!memeEmpreinte(ligne.empreinte, attendue)) return false;

  return modifier(`codes_papier?id=eq.${ligne.id}&utilise_le=is.null`, {
    utilise_le: new Date().toISOString(),
    appareil: appareil ?? null,
    lieu: lieu ?? null,
  });
}

// --- Ce qu'il reste ---------------------------------------------------------

/** Combien de codes sont encore bons. Ni servis, ni annulés. */
export async function codesRestants(personne: number): Promise<number> {
  const lignes = await lire<{ id: number }>(
    `codes_papier?personne=eq.${personne}&utilise_le=is.null`
    + `&annulee_le=is.null&select=id`);
  return lignes.length;
}

export type Etat = { serie: number; restants: number; fabriqueLe: string };

/**
 * Ce qu'on peut dire du papier sans jamais le remontrer : quelle série, de
 * quand, et combien il en reste. C'est tout ce que l'écran a le droit de
 * savoir en revenant.
 */
export async function etatDuPapier(personne: number): Promise<Etat | null> {
  const vivant = await lireUne<LignePapier>(
    `codes_papier?personne=eq.${personne}&annulee_le=is.null`
    + `&order=serie.desc&limit=1`);
  if (!vivant) return null;
  return {
    serie: vivant.serie,
    fabriqueLe: vivant.cree_le,
    restants: await codesRestants(personne),
  };
}
