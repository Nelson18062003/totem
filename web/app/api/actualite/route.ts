import { chargerActualite } from "@/lib/serveur";
import { estRefus, garder } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Le pouls de la plateforme, interrogé régulièrement par le navigateur :
 * `dernier` — l'identifiant du dernier SMS en base (s'il monte, l'écran se
 * rafraîchit tout seul) — et `nonLus` — la pastille du menu.
 */
export async function GET() {
  const g = await garder("lire");
  if (estRefus(g)) return g.refus;
  return Response.json(await chargerActualite());
}
