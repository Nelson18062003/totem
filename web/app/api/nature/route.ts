import { estNature } from "@noyau/natures";
import { carteDuSms, definirNature, relie } from "@/lib/serveur";
import { maniement, TOUT, voitLaCarte } from "@/lib/portee";
import { langueServeur } from "@/lib/langue-serveur";
import { estDemonstration } from "@/lib/demonstration";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/** Classe un SMS : le propriétaire décide sa nature, pour l'affichage et le reçu. */
export async function POST(req: Request) {
  const langue = await langueServeur();
  // La démonstration peut classer un SMS inventé : l'écran l'accepte, rien
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
