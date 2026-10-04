import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/lib/session";
import { langueDemandee } from "@/lib/langue-serveur";
import { inscrire } from "@/lib/porte";

export const dynamic = "force-dynamic";

/**
 * Créer son compte TOTEM — l'inscription publique.
 *
 * OUVERTE à tout le monde : TOTEM est une application grand public. Le
 * corps porte six champs — { prenom, nom, adresse, telephone, courriel,
 * motdepasse } — et la langue de la réponse se demande par « ?langue=fr|en ».
 *
 * RÉPONSES :
 *   · 200 { ok: true, jeton, expire } — le compte est créé ET ouvert : il
 *     entre tout de suite. Il ne voit rien tant qu'aucune carte ne lui est
 *     attribuée (voir lib/portee.ts) ;
 *   · 4xx / 5xx { erreur } — une phrase dans la langue demandée. Un courriel
 *     déjà pris reçoit la réponse NEUTRE (« Impossible de créer ce compte.
 *     Si vous en avez déjà un, connectez-vous. ») : jamais « ce courriel a
 *     un compte ».
 *
 * La DÉCISION est dans `lib/porte.ts`, à côté de celle de la connexion.
 * Elle sert les deux mondes : le navigateur repart avec un cookie, le
 * téléphone avec le jeton dans le corps. Chacun prend ce qu'il sait ranger.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const entree = await inscrire(req, corps ?? {}, langue);
  if (!entree.ok) {
    return Response.json({ erreur: entree.erreur }, { status: entree.statut });
  }

  const boite = await cookies();
  boite.set(COOKIE_SESSION, entree.jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  const [, expiration] = entree.jeton.split(".");
  return Response.json({
    ok: true, jeton: entree.jeton, expire: Number(expiration),
    // Le premier compte d'une plateforme neuve : l'écran du navigateur le
    // mène à l'accueil complet. Les autres arrivent sur « Ajouter ma carte ».
    proprietaire: entree.proprietaire === true,
  });
}
