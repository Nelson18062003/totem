import { marquerLu, relie } from "@/lib/serveur";
import { estProprietaire } from "@/lib/qui";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/** Le propriétaire vient d'ouvrir la fiche d'un SMS : il est lu. */
export async function POST(req: Request) {
  const langue = await langueServeur();
  // AU PROPRIÉTAIRE SEUL : l'état lu/non-lu est celui de SA boîte.
  if (process.env.SESSION_SECRET && !(await estProprietaire(req))) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  const corps = await req.json().catch(() => null);
  const id = Number(corps?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonReliee") }, { status: 503 });
  }
  // Base pas encore migrée (colonne absente) : l'échec est silencieux côté
  // écran — la notion de non-lu dort simplement jusqu'à la migration.
  const ok = await marquerLu(id);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
}
