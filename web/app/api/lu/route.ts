import { carteDuSms, marquerLu, relie } from "@/lib/serveur";
import { maniement, TOUT, voitLaCarte } from "@/lib/portee";
import { langueServeur } from "@/lib/langue-serveur";
import { estDemonstration } from "@/lib/demonstration";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/** Le propriétaire vient d'ouvrir la fiche d'un SMS : il est lu. */
export async function POST(req: Request) {
  const langue = await langueServeur();
  // La démonstration peut lire un SMS inventé : l'écran l'accepte, rien
  // ne s'écrit — ses lignes n'existent dans aucune base.
  if (await estDemonstration(req)) return Response.json({ ok: true });
  // LE TITULAIRE DE LA CARTE, ou le propriétaire : un SMS d'une carte
  // confiée appartient à celui qui la tient.
  const main = process.env.SESSION_SECRET ? await maniement(req) : TOUT;
  if (!main) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  const corps = await req.json().catch(() => null);
  const id = Number(corps?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  if (!main.tout) {
    const carte = relie ? await carteDuSms({ id }) : null;
    if (!carte || !voitLaCarte(main, carte)) {
      return Response.json(
        { erreur: erreurApi(langue, "carteNonConfiee") }, { status: 403 });
    }
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
