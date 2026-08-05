import { chargerRecu } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";

export const dynamic = "force-dynamic";

/**
 * Sert le reçu PDF archivé par le robot. On part du numéro de reçu : la fiche
 * en base donne le chemin de stockage — jamais un chemin venu du navigateur.
 * La clé d'accès reste côté serveur ; le navigateur ne voit que le document.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const langue = await langueServeur();
  const { numero } = await params;
  const pdf = await chargerRecu(numero);
  if (!pdf) return new Response(erreurApi(langue, "recuIntrouvable"), { status: 404 });
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${numero}.pdf"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
