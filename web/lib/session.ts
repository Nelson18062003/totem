// Le jeton de session : ce que le navigateur porte, et rien de plus.
//
// Il est vérifiable partout, y compris dans le middleware (runtime « edge »),
// d'où Web Crypto plutôt que le module `crypto` de Node. Il ne contient aucun
// secret : « identifiant.personne.role.expiration.signature ». Sans la clé
// `SESSION_SECRET`, personne ne peut le forger ni le prolonger.
//
// CE QUI A CHANGÉ, ET POURQUOI
// Le jeton portait « proprietaire » écrit en dur, et `verifierSession`
// renvoyait un booléen : l'application ne savait donc jamais QUI était devant
// elle. Il porte maintenant un identifiant de session tiré au sort, le numéro
// de la personne et son rôle.
//
// L'IDENTIFIANT DE SESSION EST LE POINT IMPORTANT. Sans lui, « retirer
// l'accès de quelqu'un » ne ferme rien : le jeton déjà signé reste valable
// jusqu'à son expiration, et le téléphone d'un employé licencié continue
// d'ouvrir la boutique pendant un mois. Avec lui, la garde peut demander à la
// base si cette session-là vit encore — et « fermer dans la seconde » cesse
// d'être une promesse en l'air.
//
// La signature seule ne suffit donc jamais à laisser entrer : elle dit que le
// jeton n'a pas été fabriqué, pas qu'il est encore valable. C'est le travail
// de `lib/garde.ts`, et lui seul ouvre la porte.

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

// Douze heures. Le NIST demande une nouvelle preuve au moins toutes les douze
// heures au niveau AAL2 (SP 800-63B-4 §5.2) ; l'ancienne durée d'un mois
// plaçait la session en dessous. Une session de comptoir, elle, se ferme le
// soir même — c'est `partage` qui le décide, à l'ouverture.
export const DUREE_MS = 12 * 3600 * 1000;
export const DUREE_PARTAGE_MS = 10 * 3600 * 1000;

// Web Crypto attend un BufferSource ; on force le type pour éviter les
// frictions entre les lib.d.ts (Uint8Array<ArrayBufferLike> vs BufferSource).
const src = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export type Role = "proprietaire" | "operateur" | "lecteur" | "admin";

export type Charge = {
  /** L'identifiant de la ligne « sessions ». C'est lui qui rend révocable. */
  session: string;
  /** Le numéro de la personne dans « personnes ». */
  personne: number;
  role: Role;
  /** Quand le jeton cesse d'être signé valablement, en millisecondes. */
  expire: number;
};

const ROLES: readonly Role[] = ["proprietaire", "operateur", "lecteur", "admin"];

/** Un identifiant de session : 128 bits tirés au sort, en base 36. */
export function nouvelIdentifiant(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
}

export async function signerSession(
  secret: string,
  charge: Omit<Charge, "expire">,
  dureeMs = DUREE_MS,
): Promise<string> {
  const expire = Date.now() + dureeMs;
  const corps = `${charge.session}.${charge.personne}.${charge.role}.${expire}`;
  const sig = await crypto.subtle.sign("HMAC", await cleHmac(secret), src(enc.encode(corps)));
  return `${corps}.${versB64url(sig)}`;
}

/**
 * Ce que dit le jeton, s'il est authentique et pas périmé — et `null` sinon.
 *
 * Attention à ce que cette fonction NE dit PAS : que la session vit encore.
 * Un jeton parfaitement signé peut appartenir à une session révoquée il y a
 * dix secondes. Seule `lib/garde.ts` le sait, parce qu'elle interroge la base.
 */
export async function lireSession(secret: string, jeton?: string): Promise<Charge | null> {
  if (!secret || !jeton) return null;
  const points = jeton.split(".");
  if (points.length !== 5) return null;
  const [session, personne, role, exp, sig] = points;
  if (!/^[0-9a-f]{32}$/.test(session)) return null;
  if (!/^\d+$/.test(personne)) return null;
  if (!(ROLES as readonly string[]).includes(role)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  try {
    const bon = await crypto.subtle.verify(
      "HMAC", await cleHmac(secret), src(deB64url(sig)),
      src(enc.encode(`${session}.${personne}.${role}.${exp}`)),
    );
    if (!bon) return null;
  } catch {
    return null;
  }
  return { session, personne: Number(personne), role: role as Role, expire: Number(exp) };
}

/**
 * Le jeton est-il authentique ? Rien de plus.
 *
 * Le middleware s'en contente parce qu'il tourne en « edge » et ne peut pas
 * interroger la base à chaque requête. C'est un portail, pas une serrure : il
 * refoule ce qui est manifestement faux, et laisse la garde décider du reste.
 */
export async function verifierSession(secret: string, jeton?: string): Promise<boolean> {
  return (await lireSession(secret, jeton)) !== null;
}

// Comparaison à temps constant. Le retour anticipé sur les longueurs livrait
// la longueur du secret au chronomètre ; on parcourt donc toujours la même
// distance, quelle que soit la paire comparée.
export function egaliteConstante(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const COOKIE_SESSION = "totem_session";
