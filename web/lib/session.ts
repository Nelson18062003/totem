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
//
// On empreinte d'abord les deux chaînes en SHA-256 (32 octets, TOUJOURS la
// même longueur) puis on compare les empreintes octet par octet. Ainsi la
// durée ne dépend NI du contenu NI de la longueur : le retour anticipé
// « a.length !== b.length » d'avant révélait à lui seul la longueur du vrai
// mot de passe, ce qui réduisait l'espace à deviner.
export async function egaliteConstante(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", src(enc.encode(a))),
    crypto.subtle.digest("SHA-256", src(enc.encode(b))),
  ]);
  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export const COOKIE_SESSION = "totem_session";
