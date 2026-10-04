import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/lib/session";
import { langueDemandee } from "@/lib/langue-serveur";
import { supprimerSonCompte } from "@/lib/porte";

export const dynamic = "force-dynamic";

/**
 * Supprimer SON compte, depuis l'application ou la page web.
 *
 * Apple l'exige de toute application où l'on crée un compte : la suppression
 * se fait là où le compte s'est créé, sans écrire à personne.
 *
 * Corps : { motdepasse }. La session est celle du compte — l'en-tête
 * « authorization: Bearer … » du téléphone, ou le cookie du navigateur. Le
 * middleware a déjà refusé une requête sans session valable.
 *
 * RÉPONSES :
 *   · 200 { ok: true } — le compte n'existe plus, ses cartes attribuées et
 *     ses téléphones sont partis avec lui, et la session est close : son
 *     jeton ne rouvre plus rien (le middleware relit le compte à chaque
 *     requête) ;
 *   · 401 — mauvais mot de passe ; 429 — trop d'essais ;
 *   · 403 — le propriétaire de la plateforme, la vitrine ou la clé de
 *     secours : ceux-là ne se suppriment pas par ici, et la phrase dit
 *     pourquoi.
 *
 * La décision est dans `lib/porte.ts`.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = (await req.json().catch(() => null)) as { motdepasse?: unknown } | null;

  const r = await supprimerSonCompte(req, corps?.motdepasse, langue);
  if (!r.ok) return Response.json({ erreur: r.erreur }, { status: r.statut });

  // LA SESSION SE CLÔT ICI AUSSI, côté navigateur : le cookie part. Le
  // téléphone efface son jeton de son côté — et même gardé, il ne vaudrait
  // plus rien : le compte qu'il désigne n'existe plus.
  const boite = await cookies();
  boite.delete(COOKIE_SESSION);
  return Response.json({ ok: true });
}
