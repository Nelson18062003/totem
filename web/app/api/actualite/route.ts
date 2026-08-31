import { chargerActualite } from "@/lib/serveur";
import { exigerSession, refusApi } from "@/lib/garde";
import { langueDemandee } from "@/lib/langue-serveur";

export const dynamic = "force-dynamic";

/**
 * Le pouls de la plateforme, interrogé régulièrement par le navigateur :
 * `dernier` — l'identifiant du dernier SMS en base (s'il monte, l'écran se
 * rafraîchit tout seul) — et `nonLus` — la pastille du menu.
 */
export async function GET(req: Request) {
  const moi = await exigerSession(req);
  if (!moi.ok) return refusApi(moi.statut, await langueDemandee(req));
  return Response.json(await chargerActualite());
}
