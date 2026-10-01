import { langueDemandee } from "@/lib/langue-serveur";
import { inscrire } from "@/lib/porte";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Créer le compte du propriétaire — le tout premier, sur une plateforme neuve.
 *
 * OUVERTE, forcément : on ne peut pas exiger un compte de celui qui vient
 * justement en demander un. Elle se referme d'elle-même dès qu'un compte
 * existe (voir `inscrire`).
 *
 * ELLE N'OUVRE PAS DE SESSION. Elle crée le compte et envoie un code au
 * courriel donné ; c'est ce code, tapé sur l'écran suivant, qui ouvre —
 * exactement comme pour toutes les entrées suivantes. Le navigateur et le
 * téléphone font le même chemin.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const r = await inscrire(req, corps?.courriel, langue);
  if (!r.ok) return Response.json({ erreur: r.erreur }, { status: r.statut });
  return Response.json({
    ok: true, proprietaire: true, message: erreurApi(langue, "codeEnvoye"),
  });
}
