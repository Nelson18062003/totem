import { estNature } from "@noyau/natures";
import { definirNature, relie } from "@/lib/serveur";
import { estProprietaire } from "@/lib/qui";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/** Classe un SMS : le propriétaire décide sa nature, pour l'affichage et le reçu. */
export async function POST(req: Request) {
  const langue = await langueServeur();
  // AU PROPRIÉTAIRE SEUL : classer un SMS, c'est écrire dans SON registre.
  // « Un invité voit les écrans, il ne touche pas aux cartes. »
  if (process.env.SESSION_SECRET && !(await estProprietaire(req))) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
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
