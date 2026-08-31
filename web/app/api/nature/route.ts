import { estNature } from "@noyau/natures";
import { definirNature, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { exigerProprietaire, refusApi } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Classe un SMS : le propriétaire décide sa nature, pour l'affichage et le
 * reçu — RÉSERVÉ AU PROPRIÉTAIRE.
 *
 * Ce n'est pas un geste d'affichage. La nature choisie DÉCLENCHE
 * l'établissement du reçu : un invité qui reclasse fait donc fabriquer, ou
 * refabriquer, un document sur une opération réelle. Le verrou de session ne
 * suffisait pas — il vérifie qu'une session est valable, pas à QUI elle
 * appartient — et cette porte-là avait été oubliée quand ses deux voisines
 * (`commande`, `essai-notification`) ont été fermées.
 *
 * Un invité voit les écrans. Il ne classe pas les paiements.
 */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const moi = await exigerProprietaire(req);
  if (!moi.ok) return refusApi(moi.statut, langue);
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
