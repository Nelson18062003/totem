// Ranger un mot de passe sans jamais le garder.
//
// LA RÈGLE. Un mot de passe ne s'enregistre pas. Ce qu'on range, c'est une
// EMPREINTE : un calcul qui va dans un sens et pas dans l'autre. Au moment
// de se connecter, on refait le calcul sur ce qui vient d'être tapé et on
// compare les deux empreintes. La base ne contient donc jamais de quoi se
// connecter à la place de quelqu'un — même volée, même lue par nous.
//
// POURQUOI PBKDF2, ET PAS UN SIMPLE SHA-256. Un SHA-256 se calcule des
// milliards de fois par seconde : un attaquant qui vole la table essaie tout
// un dictionnaire en une soirée. PBKDF2 répète le calcul des centaines de
// milliers de fois — imperceptible pour qui se connecte une fois (un cinquième
// de seconde), ruineux pour qui essaie des millions de mots.
//
// POURQUOI PAS ARGON2 OU BCRYPT, qui sont meilleurs. Parce qu'ils demandent
// un module natif, et que cette plateforme tourne aussi bien dans le runtime
// « edge » de Vercel que dans Node. PBKDF2 est dans Web Crypto, présent
// partout, sans rien installer. C'est le meilleur des choix DISPONIBLES ici,
// et il est recommandé par l'OWASP à ce nombre de tours.
//
// LE SEL. Chaque mot de passe reçoit 16 octets tirés au hasard, rangés en
// clair à côté de l'empreinte. Deux personnes avec le même mot de passe
// obtiennent ainsi deux empreintes différentes : on ne peut plus reconnaître
// les mots de passe communs en regardant la table, ni réutiliser une table
// d'empreintes calculée d'avance.

const enc = new TextEncoder();
const src = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

// Le nombre de tours recommandé par l'OWASP pour PBKDF2-HMAC-SHA256. Il est
// ÉCRIT DANS L'EMPREINTE : le jour où on l'augmente, les anciennes se
// vérifient encore avec leur propre nombre, et se réécrivent à la connexion
// suivante. Personne n'est mis dehors par un durcissement.
const TOURS = 210_000;
const OCTETS_SEL = 16;
const OCTETS_EMPREINTE = 32;

function versB64url(o: ArrayBuffer | Uint8Array): string {
  let s = "";
  for (const x of o instanceof Uint8Array ? o : new Uint8Array(o)) {
    s += String.fromCharCode(x);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function deriver(
  motdepasse: string, sel: Uint8Array, tours: number,
): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey(
    "raw", src(enc.encode(motdepasse)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: src(sel), iterations: tours, hash: "SHA-256" },
    cle, OCTETS_EMPREINTE * 8);
  return new Uint8Array(bits);
}

/**
 * L'empreinte à ranger en base, sous la forme
 * « pbkdf2$sha256$210000$<sel>$<empreinte> ».
 *
 * Tout est dans la chaîne — la méthode, le nombre de tours, le sel — pour
 * qu'une empreinte se vérifie sans rien connaître d'autre qu'elle-même. Une
 * base restaurée d'il y a trois ans se relit telle quelle.
 */
export async function empreinter(motdepasse: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(OCTETS_SEL));
  const empreinte = await deriver(motdepasse, sel, TOURS);
  return `pbkdf2$sha256$${TOURS}$${versB64url(sel)}$${versB64url(empreinte)}`;
}

/**
 * Le mot de passe proposé correspond-il à cette empreinte ?
 *
 * La comparaison est à temps CONSTANT : elle parcourt toujours les 32 octets,
 * quoi qu'elle trouve. Une comparaison qui s'arrête au premier octet
 * different laisse deviner l'empreinte octet par octet, en mesurant le temps
 * de réponse — une attaque réelle, et lente, mais qui aboutit.
 */
export async function verifier(
  motdepasse: string, rangee: string,
): Promise<boolean> {
  const parts = (rangee || "").split("$");
  if (parts.length !== 5) return false;
  const [methode, hachage, tours, selB64, empreinteB64] = parts;
  if (methode !== "pbkdf2" || hachage !== "sha256") return false;
  const n = Number(tours);
  // Une borne haute : une empreinte trafiquée annonçant un milliard de tours
  // ferait travailler le serveur jusqu'à l'étouffement, à chaque tentative.
  if (!Number.isInteger(n) || n < 1000 || n > 2_000_000) return false;

  let attendue: Uint8Array;
  let obtenue: Uint8Array;
  try {
    attendue = deB64url(empreinteB64);
    obtenue = await deriver(motdepasse, deB64url(selB64), n);
  } catch {
    return false;
  }
  if (attendue.length !== obtenue.length) return false;
  let diff = 0;
  for (let i = 0; i < attendue.length; i++) diff |= attendue[i] ^ obtenue[i];
  return diff === 0;
}

/** Vrai si cette empreinte gagnerait à être refaite (tours augmentés depuis). */
export function aRafraichir(rangee: string): boolean {
  const parts = (rangee || "").split("$");
  return parts.length !== 5 || Number(parts[2]) < TOURS;
}

// --- Ce qu'on exige d'un mot de passe --------------------------------------
//
// Une seule règle, la LONGUEUR. Pas de « une majuscule, un chiffre, un
// symbole » : ces règles-là produisent « Password1! », qu'un dictionnaire
// trouve en une seconde, et poussent à écrire le mot de passe sur un papier.
// Douze caractères libres valent mieux — c'est aussi la recommandation
// actuelle du NIST.
export const LONGUEUR_MINIMALE = 12;

export function motDePasseAcceptable(m: string): boolean {
  return typeof m === "string" && m.length >= LONGUEUR_MINIMALE
    && m.length <= 200;   // borne haute : on ne fait pas travailler PBKDF2 pour rien
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
