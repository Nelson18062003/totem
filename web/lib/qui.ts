// Qui est en train de parler ?
//
// Le middleware a déjà vérifié qu'une session VALABLE accompagne la requête :
// sans cela, rien n'arrive jusqu'ici. Mais « une session valable » ne dit pas
// QUI, et certaines routes en ont besoin — celles réservées au propriétaire.
//
// D'où ce module. Il refait la vérification de signature (il ne fait jamais
// confiance au sujet écrit dans un jeton sans l'avoir vérifié), puis va lire
// le compte en base.

import { cookies } from "next/headers";
import { COOKIE_SESSION, compteDuSujet, sujetDeSession } from "@/lib/session";
import { utilisateurParId, type Utilisateur } from "@/lib/serveur";

/** Le jeton porté par l'en-tête « Authorization: Bearer … », s'il y en a un. */
function jetonPorte(req: Request): string | undefined {
  const porte = req.headers.get("authorization");
  if (!porte) return undefined;
  const [schema, valeur] = porte.split(" ");
  return schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined;
}

/**
 * Le compte connecté, ou `null`.
 *
 * `null` ne veut pas dire « personne » : il veut dire « pas un compte ». Une
 * session ouverte avec la clé de secours, ou un jeton d'avant les comptes,
 * ouvre bien la plateforme mais ne désigne personne — voir `estProprietaire`.
 */
export async function compteConnecte(req: Request): Promise<Utilisateur | null> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return null;
  const boite = await cookies();
  const jeton = boite.get(COOKIE_SESSION)?.value ?? jetonPorte(req);
  const id = compteDuSujet(await sujetDeSession(secret, jeton));
  return id === null ? null : utilisateurParId(id);
}

/**
 * A-t-on le droit d'administrer ?
 *
 * Deux cas ouvrent ce droit, et le second demande à être expliqué :
 *
 *   — le compte connecté est celui du PROPRIÉTAIRE ;
 *   — la session a été ouverte avec la CLÉ DE SECOURS. Celle-là ne vit que
 *     dans les variables d'environnement de Vercel : y avoir accès, c'est
 *     déjà être le propriétaire de la plateforme. Elle doit donc pouvoir
 *     administrer — c'est même son unique raison d'être, le jour où la base
 *     des comptes est injoignable ou le mot de passe du propriétaire perdu.
 *
 * Un jeton d'AVANT les comptes n'ouvre PAS ce droit : il a été émis quand la
 * plateforme n'avait qu'un mot de passe, sans notion de rôle. Il continue de
 * donner accès aux écrans jusqu'à son expiration — on ne met personne dehors
 * en pleine journée — mais pas à l'administration des comptes.
 */
export async function estProprietaire(req: Request): Promise<boolean> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return false;
  const boite = await cookies();
  const jeton = boite.get(COOKIE_SESSION)?.value ?? jetonPorte(req);
  const sujet = await sujetDeSession(secret, jeton);
  if (sujet === "secours") return true;
  const id = compteDuSujet(sujet);
  if (id === null) return false;
  return (await utilisateurParId(id))?.role === "proprietaire";
}
