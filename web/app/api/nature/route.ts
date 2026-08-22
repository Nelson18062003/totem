import { estNature } from "@/lib/natures";
import { definirNature, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";

export const dynamic = "force-dynamic";

/** Classe un SMS : le propriétaire décide sa nature, pour l'affichage et le reçu. */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = await req.json().catch(() => null);
  const id = Number(corps?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const brut = corps?.nature;
  // « null » remet à « non classé » ; sinon une nature connue est exigée.
  if (brut !== null && !estNature(brut)) {
    return Response.json({ erreur: erreurApi(langue, "natureInconnue") }, { status: 400 });
  }
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonReliee") }, { status: 503 });
  }
  const ok = await definirNature(id, brut as string | null);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: erreurApi(langue, "natureNonEnregistree") }, { status: 502 });
}
