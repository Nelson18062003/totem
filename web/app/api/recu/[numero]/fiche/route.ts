import { chargerFicheRecu } from "@/lib/serveur";

export const dynamic = "force-dynamic";

/**
 * La fiche d'un reçu : sa date d'établissement. Elle avance quand le terminal
 * refabrique le document — c'est ainsi que l'écran SAIT que le nouveau PDF
 * est en place, au lieu de le promettre sur un minuteur.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const { numero } = await params;
  const fiche = await chargerFicheRecu(numero);
  return Response.json(fiche ?? { etabliLe: null }, {
    headers: { "cache-control": "private, no-store" },
  });
}
