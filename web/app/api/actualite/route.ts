import { chargerActualite } from "@/lib/serveur";

export const dynamic = "force-dynamic";

/**
 * Le pouls de la plateforme, interrogé régulièrement par le navigateur :
 * `dernier` — l'identifiant du dernier SMS en base (s'il monte, l'écran se
 * rafraîchit tout seul) — et `nonLus` — la pastille du menu.
 */
export async function GET() {
  return Response.json(await chargerActualite());
}
