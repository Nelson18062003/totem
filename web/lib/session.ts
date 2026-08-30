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
  return (await sujetDeSession(secret, jeton)) !== null;
}

/**
 * Le SUJET d'un jeton valide — c'est-à-dire QUI est connecté — ou `null` si
 * le jeton ne tient pas debout.
 *
 * Le sujet ne fait pas foi tout seul : il n'est digne de confiance QUE parce
 * que la signature vient d'être vérifiée juste avant d'être rendu. C'est
 * pourquoi il n'y a pas de fonction qui se contente de le lire — on ne veut
 * pas qu'un appelant pressé lise « proprietaire » dans un jeton forgé.
 *
 * Les sujets en usage :
 *   « c:12 »        le compte numéro 12 (voir la table `utilisateurs`) ;
 *   « secours »     la clé de secours, quand la base est injoignable ;
 *   « proprietaire » / « telephone »   les jetons d'avant les comptes, qui
 *                   restent valables jusqu'à leur expiration : une mise à
 *                   jour ne doit mettre personne dehors en pleine journée.
 */
export async function sujetDeSession(
  secret: string, jeton?: string,
): Promise<string | null> {
  if (!secret || !jeton) return null;
  const points = jeton.split(".");
  if (points.length !== 3) return null;
  const [sujet, exp, sig] = points;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  try {
    const octets = deB64url(sig);
    // LA FORME CANONIQUE, ET ELLE SEULE. Le dernier caractère d'une
    // signature en base64url ne porte que quatre bits utiles : « …W » et
    // « …X » peuvent décoder les MÊMES octets. Sans cette garde, un jeton
    // récrit passait — aucun secret n'était contourné, mais un contrôle qui
    // altérait ce caractère pouvait conclure « repoussé » à tort, et une
    // signature avait plusieurs écritures. Une seule écriture, une seule
    // porte. (C'est le harnais du verrou qui l'a montré, en échouant une
    // fois sur vingt.)
    if (versB64url(octets.buffer as ArrayBuffer) !== sig) return null;
    const bon = await crypto.subtle.verify(
      "HMAC", await cleHmac(secret), src(octets),
      src(enc.encode(`${sujet}.${exp}`)),
    );
    return bon ? sujet : null;
  } catch {
    return null;
  }
}

/** Le numéro du compte connecté, s'il s'agit d'un compte.
 *
 *  `null` pour la clé de secours et pour les jetons d'avant les comptes : ils
 *  ouvrent la plateforme, mais ne désignent personne en particulier. */
export function compteDuSujet(sujet: string | null): number | null {
  if (!sujet || !sujet.startsWith("c:")) return null;
  const n = Number(sujet.slice(2));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Le sujet d'un jeton de compte. Le « c: » évite qu'un jour un identifiant
 *  se confonde avec un mot réservé comme « secours ». */
export const sujetDuCompte = (id: number): string => `c:${id}`;

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
