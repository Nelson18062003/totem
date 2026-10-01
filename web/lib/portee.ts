// Ce qu'une personne a le droit de VOIR — les cartes SIM, et ce qu'elles
// reçoivent.
//
// LA RÈGLE, EN UNE PHRASE : le propriétaire voit tout ; un invité ne voit
// que les cartes que le propriétaire lui a confiées (table « attributions »).
// Un invité à qui l'on n'a rien confié ne voit RIEN — et non pas tout,
// comme c'était le cas avant : un compte créé voyait chaque carte, chaque
// SMS, chaque montant de la maison.
//
// POURQUOI UN MODULE À PART. La règle doit s'appliquer à TOUTES les lectures
// — les pages, l'application du téléphone, le bilan, les reçus, les
// coordonnées, la pastille des non-lus. Écrite route par route, elle finirait
// oubliée dans l'une d'elles. Ici, elle est écrite une fois ; et
// `chargerDonnees` EXIGE une portée, si bien qu'un appelant qui l'oublierait
// ne compilerait pas.
//
// DANS LE DOUTE, ON NE MONTRE PAS. Un compte introuvable, fermé, ou une base
// qui ne sait pas dire ses cartes : la portée est vide. Le propriétaire, lui,
// ne dépend pas de cette lecture — et la clé de secours voit tout, elle qui
// existe pour le jour où la base ne répond plus.

import { cookies } from "next/headers";
import { COOKIE_SESSION, compteDuSujet, sujetDeSession } from "@/lib/session";
import { cartesDe, utilisateurParId } from "@/lib/serveur";
import { verifierLien } from "@/lib/lien-signe";

export type Portee =
  | { tout: true }
  | { tout: false; cartes: string[] };

export const TOUT: Portee = { tout: true };
export const RIEN: Portee = { tout: false, cartes: [] };

/** La portée d'un compte, relue en base À CHAQUE FOIS : une carte retirée
 *  ce matin ne doit plus se voir cet après-midi, même avec un jeton d'hier. */
export async function porteeDuCompte(id: number): Promise<Portee> {
  const compte = await utilisateurParId(id);
  if (!compte || !compte.approuve) return RIEN;
  if (compte.role === "proprietaire") return TOUT;
  return { tout: false, cartes: await cartesDe(id) };
}

/** Le jeton présenté : le cookie du navigateur, ou l'en-tête du téléphone. */
async function jetonPresente(req?: Request): Promise<string | undefined> {
  const boite = await cookies();
  const porte = req?.headers.get("authorization");
  const [schema, valeur] = porte?.split(" ") ?? [];
  return boite.get(COOKIE_SESSION)?.value ??
    (schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined);
}

/**
 * La portée de celui qui demande — ou `null` s'il n'a PAS de session.
 *
 * `null` n'arrive qu'à une main qui a passé le verrou SANS session : celle
 * d'un lien signé (le navigateur du téléphone, qui n'a ni cookie ni jeton).
 * Chaque route qui accepte un lien signé décide alors elle-même, à partir de
 * ce que le lien porte — voir `porteeDuLienDeBilan` et les routes de reçu.
 */
export async function porteeDe(req?: Request): Promise<Portee | null> {
  const secret = process.env.SESSION_SECRET || "";
  // Sans secret, il n'y a pas de verrou du tout (le développement local) :
  // tout est ouvert, comme le reste de la plateforme.
  if (!secret) return TOUT;
  const sujet = await sujetDeSession(secret, await jetonPresente(req));
  if (sujet === null) return null;
  const id = compteDuSujet(sujet);
  // La clé de secours, et les jetons d'avant les comptes, ne désignent
  // personne : ils sont ceux du propriétaire, et voient ce qu'il voit.
  if (id === null) return TOUT;
  return porteeDuCompte(id);
}

/** Ce qu'une portée devient dans un lien signé : « tout », ou le numéro du
 *  compte (« c12 »). Jamais la liste des cartes : elle est relue au moment où
 *  le lien sert, pas figée au moment où il a été fait. */
export async function quiPourLien(req?: Request): Promise<string | null> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return "tout";
  const sujet = await sujetDeSession(secret, await jetonPresente(req));
  if (sujet === null) return null;
  const id = compteDuSujet(sujet);
  return id === null ? "tout" : `c${id}`;
}

/**
 * La portée portée par un lien de bilan signé.
 *
 * Le bilan dépend de QUI le demande : un lien signé sans ce « qui » rendrait
 * la caisse entière à n'importe quel invité. La signature couvre donc les
 * jours ET le demandeur ; elle est revérifiée ici, même si le verrou l'a
 * déjà fait — une route ne se fie pas à ce qu'un autre a vérifié pour elle.
 */
export async function porteeDuLienDeBilan(
  jours: string | null, qui: string | null,
  expiration: string | null, signature: string | null,
): Promise<Portee> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret || !jours || !qui || !/^(?:tout|c\d{1,12})$/.test(qui)) return RIEN;
  const bon = await verifierLien(secret, "bilan", `${jours}.${qui}`, expiration, signature);
  if (!bon) return RIEN;
  if (qui === "tout") return TOUT;
  return porteeDuCompte(Number(qui.slice(1)));
}

/** Cette carte est-elle visible ? */
export function voitLaCarte(p: Portee, iccid: string): boolean {
  return p.tout || p.cartes.includes(iccid);
}
