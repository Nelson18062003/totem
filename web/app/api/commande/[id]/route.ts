import { lireCommande } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";

export const dynamic = "force-dynamic";

/** Où en est une demande : en attente, en cours, faite, échouée. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const langue = await langueServeur();
  const { id } = await params;
  const numero = Number.parseInt(id, 10);
  if (!Number.isInteger(numero) || numero <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const commande = await lireCommande(numero);
  if (!commande) {
    return Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
  }
  return Response.json(commande);
}
