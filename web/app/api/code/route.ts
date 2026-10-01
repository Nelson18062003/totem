import { langueDemandee } from "@/lib/langue-serveur";
import { demanderUnCode } from "@/lib/porte";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * « Envoyez-moi un code. »
 *
 * La première moitié de l'entrée, la même pour le navigateur et pour le
 * téléphone. La seconde moitié — taper le code — passe par la porte habituelle
 * de chacun (`/api/connexion` pour le navigateur, `/api/session` pour
 * l'application), qui décide avec la même règle.
 *
 * OUVERTE, forcément : on ne peut pas exiger une session de celui qui vient
 * en demander une. Ce qui la rend sûre : elle ne dit rien — la même réponse,
 * au même moment, que l'adresse ait un compte ou non — et le frein la garde
 * comme il garde la porte.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = await req.json().catch(() => null);
  const r = await demanderUnCode(req, corps, langue);
  if (!r.ok) return Response.json({ erreur: r.erreur }, { status: r.statut });
  return Response.json({ ok: true, message: erreurApi(langue, "codeEnvoye") });
}
