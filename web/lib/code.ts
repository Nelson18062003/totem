// Le code d'entrée — six chiffres, tirés au hasard, jamais rangés.
//
// POURQUOI UN CODE PLUTÔT QU'UN MOT DE PASSE. Un mot de passe se choisit mal,
// se réutilise d'un site à l'autre, se note sur un papier, et sa fuite
// ailleurs ouvre la porte ici. Un code envoyé au courriel ne se choisit pas,
// ne sert qu'une fois, vit dix minutes, et prouve à chaque entrée qu'on tient
// la boîte. Il n'y a plus rien à voler en base : seulement l'empreinte d'un
// code déjà mort.
//
// L'EMPREINTE. Un code de six chiffres n'a qu'un million de valeurs : un
// simple SHA-256 se retournerait en une seconde. On le signe donc avec le
// secret de la plateforme (HMAC, `SESSION_SECRET`) — sans ce secret, qui ne
// vit pas en base, l'empreinte ne dit rien. Le numéro du compte entre dans la
// signature : l'empreinte d'un code ne vaut que pour le compte qui l'a reçu.

const enc = new TextEncoder();
const src = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

/** Combien de temps un code vit, combien d'essais il supporte, et combien de
 *  temps attendre avant d'en demander un autre. */
export const DUREE_DU_CODE_S = 10 * 60;
export const ESSAIS_PAR_CODE = 5;
export const DELAI_ENTRE_DEUX_CODES_S = 60;

/** Six chiffres, tirés SANS biais : un tirage « % 1 000 000 » sur 32 bits
 *  favoriserait les petits codes. On rejette ce qui dépasse le dernier
 *  multiple entier. */
export function tirerUnCode(): string {
  const plafond = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const tirage = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(tirage);
    if (tirage[0] < plafond) return String(tirage[0] % 1_000_000).padStart(6, "0");
  }
}

/** Ce que l'on tape, ramené à six chiffres — espaces et tirets tolérés,
 *  rien d'autre. `null` si ce n'est pas un code. */
export function codeSaisi(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const chiffres = v.replace(/[\s-]/g, "");
  return /^[0-9]{6}$/.test(chiffres) ? chiffres : null;
}

export async function empreinteDuCode(
  secret: string, compte: number, code: string,
): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw", src(enc.encode(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cle, src(enc.encode(`code:${compte}:${code}`)));
  return [...new Uint8Array(sig)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** Un courriel rangé sous une forme unique : minuscules, sans espaces. */
export function normaliserCourriel(c: unknown): string {
  return typeof c === "string" ? c.trim().toLowerCase() : "";
}

/** Une vérification volontairement SIMPLE : « quelque chose@quelque.chose ».
 *
 *  On ne cherche pas à valider un courriel par sa forme — c'est un problème
 *  sans fond, et toute expression trop stricte finit par refuser une adresse
 *  légitime. On écarte seulement ce qui n'est visiblement pas une adresse. */
export function courrielAcceptable(c: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && c.length <= 254;
}
