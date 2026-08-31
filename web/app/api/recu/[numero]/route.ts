import { chargerRecu } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { exigerSessionOuLien, refusApi } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Sert le reçu PDF archivé par le robot. On part du numéro de reçu : la fiche
 * en base donne le chemin de stockage — jamais un chemin venu du navigateur.
 * La clé d'accès reste côté serveur ; le navigateur ne voit que le document.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const langue = await langueServeur();
  const { numero } = await params;

  // LA FORME D'UN NUMÉRO DE REÇU, avant tout le reste. La route sœur qui
  // fabrique les liens validait déjà exactement ceci ; celle qui SERT le
  // document, non — et c'est pourtant elle qui recopiait le numéro brut dans
  // l'en-tête « content-disposition », où un guillemet déforme le nom du
  // fichier annoncé au navigateur. La même règle des deux côtés.
  if (!/^[\w.-]{1,64}$/.test(numero)) {
    return new Response(erreurApi(langue, "identifiantInvalide"), { status: 400 });
  }

  // Une session vivante, ou le laissez-passer signé de dix minutes pour CE
  // reçu-là — le navigateur du téléphone n'a ni cookie ni jeton.
  const moi = await exigerSessionOuLien(req, "recu", numero);
  if (!moi.ok) return refusApi(moi.statut, langue);

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
