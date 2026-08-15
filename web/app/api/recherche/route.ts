import { rechercherPaiements, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";

export const dynamic = "force-dynamic";

/**
 * La recherche sur tout l'historique. La boîte n'a que les mille derniers
 * SMS sous la main ; dès qu'on cherche, c'est la base entière qui répond.
 */
export async function GET(req: Request) {
  const langue = await langueServeur();
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const paiements = await rechercherPaiements(q, langue);
  return Response.json(
    { paiements },
    // Jamais de cache : un reçu peut s'établir entre deux recherches.
    { headers: { "cache-control": "private, no-store" } },
  );
}
