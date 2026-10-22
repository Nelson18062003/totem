import { relie } from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { estDemonstration } from "@/lib/demonstration";
import { demandeDe, volumesMontres } from "@/lib/volumes";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * LES VOLUMES, pour le téléphone — la même lecture et le même calcul que la
 * page du site (`lib/volumes.ts`, `noyau/volumes.ts`).
 *
 *     /api/volumes?periode=mois&jour=2026-10-21&carte=tout
 *     /api/volumes?periode=dates&de=2026-10-01&a=2026-10-15&carte=<iccid>
 *     /api/volumes?periode=mois&qui=677803122          (la fiche d'un correspondant)
 *
 * Le verrou est passé avant d'arriver ici (middleware) ; la portée de la
 * personne décide des cartes, et une carte qui n'est pas la sienne répond
 * comme une carte qui n'existe pas.
 */
export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  if (!(await estDemonstration(req)) && !relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  const reponse = await volumesMontres(langue, demandeDe(new URL(req.url).searchParams), req);
  if (!reponse) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 404 });
  }
  return Response.json(reponse, { headers: { "cache-control": "private, no-store" } });
}
