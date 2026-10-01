import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/lib/session";
import { langueDemandee } from "@/lib/langue-serveur";
import { inscrire } from "@/lib/porte";

export const dynamic = "force-dynamic";

/**
 * Créer un compte.
 *
 * OUVERTE, forcément : on ne peut pas exiger un compte de celui qui vient
 * justement en demander un. Ce qui la rend sûre n'est pas une porte fermée,
 * c'est ce qu'un compte NEUF peut faire — c'est-à-dire rien. Il est créé, il
 * attend, et le propriétaire décide. Une inscription ouverte à tous ne donne
 * donc accès à rien du tout.
 *
 * La seule exception est le tout PREMIER compte : celui qui installe la
 * plateforme est le propriétaire, et il entre immédiatement. Il n'y a
 * personne pour l'approuver, et l'attente serait sans fin.
 *
 * Elle sert les deux mondes : le navigateur repart avec un cookie, le
 * téléphone avec le jeton dans le corps. Chacun prend ce qu'il sait ranger.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const entree = await inscrire(corps?.courriel, corps?.motdepasse, langue);
  if (!entree.ok) {
    // 202 n'est pas une erreur : le compte EST créé, il attend simplement
    // que le propriétaire ouvre. On le dit avec ses mots.
    return Response.json(
      entree.statut === 202
        ? { ok: true, enAttente: true, message: entree.erreur }
        : { erreur: entree.erreur },
      { status: entree.statut });
  }

  const boite = await cookies();
  boite.set(COOKIE_SESSION, entree.jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  const [, expiration] = entree.jeton.split(".");
  return Response.json({
    ok: true, proprietaire: true,
    jeton: entree.jeton, expire: Number(expiration),
  });
}
