// Un jeton de session signé, vérifiable partout — y compris dans le middleware
// (runtime « edge »), d'où l'usage de Web Crypto plutôt que du module `crypto`
// de Node. Le jeton ne contient aucun secret : « sujet.expiration.signature ».
// Sans la clé `SESSION_SECRET`, personne ne peut le forger ni le prolonger.

const enc = new TextEncoder();

async function cleHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

function versB64url(octets: ArrayBuffer): string {
  let s = "";
  for (const o of new Uint8Array(octets)) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const DUREE_MS = 30 * 24 * 3600 * 1000; // un mois

// Web Crypto attend un BufferSource ; on force le type pour éviter les
// frictions entre les lib.d.ts (Uint8Array<ArrayBufferLike> vs BufferSource).
const src = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export async function signerSession(
  secret: string, sujet = "proprietaire", dureeMs = DUREE_MS,
): Promise<string> {
  const corps = `${sujet}.${Date.now() + dureeMs}`;
  const sig = await crypto.subtle.sign("HMAC", await cleHmac(secret), src(enc.encode(corps)));
  return `${corps}.${versB64url(sig)}`;
}

export async function verifierSession(secret: string, jeton?: string): Promise<boolean> {
  if (!secret || !jeton) return false;
  const points = jeton.split(".");
  if (points.length !== 3) return false;
  const [sujet, exp, sig] = points;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  try {
    return await crypto.subtle.verify(
      "HMAC", await cleHmac(secret), src(deB64url(sig)),
      src(enc.encode(`${sujet}.${exp}`)),
    );
  } catch {
    return false;
  }
}

// Comparaison à temps constant : un mot de passe ne se devine pas à la durée.
export function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const COOKIE_SESSION = "totem_session";
