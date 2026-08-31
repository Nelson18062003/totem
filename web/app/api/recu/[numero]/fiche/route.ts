import { chargerFicheRecu } from "@/lib/serveur";
import { exigerSession, refusApi } from "@/lib/garde";
import { langueDemandee } from "@/lib/langue-serveur";

export const dynamic = "force-dynamic";

/**
 * La fiche d'un reçu : sa date d'établissement. Elle avance quand le terminal
 * refabrique le document — c'est ainsi que l'écran SAIT que le nouveau PDF
 * est en place, au lieu de le promettre sur un minuteur.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const moi = await exigerSession(req);
  if (!moi.ok) return refusApi(moi.statut, await langueDemandee(req));
  const { numero } = await params;
  const fiche = await chargerFicheRecu(numero);
  return Response.json(fiche ?? { etabliLe: null }, {
    headers: { "cache-control": "private, no-store" },
  });
}
