// Un lien de reçu SIGNÉ, à durée courte — pour la main qui n'a pas de cookie.
//
// LE PROBLÈME QU'IL RÈGLE. Sur le téléphone, ouvrir un PDF passe par le
// navigateur du système — et ce navigateur n'a ni le cookie de session, ni
// l'en-tête « Authorization » de l'application. Le reçu lui était donc
// interdit : l'application pouvait le faire FABRIQUER, jamais le MONTRER,
// encore moins l'envoyer sur WhatsApp — ce pour quoi un reçu existe.
//
// LA RÉPONSE. L'application, elle, est authentifiée : elle demande un lien.
// La plateforme le signe (HMAC, le même secret que les sessions) avec une
// échéance de dix minutes, et le verrou laisse passer CE reçu-là, jusqu'à
// CETTE heure-là, rien d'autre. Le lien ne contient aucun secret : une
// signature se vérifie, elle ne se remonte pas.
//
// Dix minutes : le temps d'ouvrir et de partager, pas celui de traîner dans
// un historique de navigateur ou un presse-papiers oublié. Un lien périmé se
// redemande d'un geste — l'application est toujours là.

import { egaliteConstante } from "@/lib/session";

const DUREE_MS = 10 * 60 * 1000;

const enc = new TextEncoder();

function cle(secret: string) {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function b64url(o: ArrayBuffer): string {
  let s = "";
  for (const octet of new Uint8Array(o)) s += String.fromCharCode(octet);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Ce qu'un lien peut ouvrir. Le GENRE fait partie de ce qui est signé :
 *  un lien de reçu ne peut pas ouvrir des coordonnées, ni l'inverse —
 *  chaque porte a sa propre signature. */
export type GenreLien = "recu" | "coordonnees";

/** Ce que la signature couvre : le genre, l'identifiant ET l'échéance.
 *  Signer l'identifiant seul ferait un laissez-passer éternel ; l'échéance
 *  seule, un passe pour tous les documents. L'identifiant est validé
 *  (`[\w.-]`) avant signature comme avant vérification : aucun « : » ne
 *  peut s'y glisser et déplacer les frontières du corps signé. */
const corps = (genre: GenreLien, id: string, expiration: number) =>
  `${genre}:${id}:${expiration}`;

export async function signerLien(
  secret: string, genre: GenreLien, id: string,
): Promise<{ expiration: number; signature: string }> {
  const expiration = Date.now() + DUREE_MS;
  const sig = await crypto.subtle.sign(
    "HMAC", await cle(secret),
    enc.encode(corps(genre, id, expiration)) as unknown as BufferSource);
  return { expiration, signature: b64url(sig) };
}

export async function verifierLien(
  secret: string, genre: GenreLien, id: string,
  expiration: string | null, signature: string | null,
): Promise<boolean> {
  if (!expiration || !signature) return false;
  const exp = Number(expiration);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const attendue = b64url(await crypto.subtle.sign(
    "HMAC", await cle(secret),
    enc.encode(corps(genre, id, exp)) as unknown as BufferSource));
  return egaliteConstante(attendue, signature);
}

export const signerLienRecu = (secret: string, numero: string) =>
  signerLien(secret, "recu", numero);

export const verifierLienRecu = (
  secret: string, numero: string, expiration: string | null, signature: string | null,
) => verifierLien(secret, "recu", numero, expiration, signature);
