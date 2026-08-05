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
      // Jamais de cache : un reçu peut être REFABRIQUÉ sous le même numéro
      // (nature rechoisie sur la fiche) — un navigateur qui garderait
      // l'ancien document une heure montrerait un reçu périmé.
      "cache-control": "private, no-store",
    },
  });
}
