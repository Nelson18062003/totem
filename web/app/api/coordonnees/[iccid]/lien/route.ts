import { signerLien } from "@/lib/lien-signe";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { exigerSession, refusApi } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Fabrique un lien signé vers la fiche PDF des coordonnées d'une carte —
 * pour le navigateur du téléphone, qui n'a ni cookie ni jeton.
 *
 * DERRIÈRE le verrou, comme la fabrique des liens de reçu : seule une main
 * déjà authentifiée peut demander un laissez-passer. Dix minutes, CETTE
 * carte, ce genre-là — un lien de coordonnées n'ouvre jamais un reçu.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ iccid: string }> },
) {
  const langue = await langueDemandee(req);
  const moi = await exigerSession(req);
  if (!moi.ok) return refusApi(moi.statut, langue);
  const { iccid } = await params;
  if (!/^\w{1,32}$/.test(iccid)) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const u = new URL(req.url);
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) {
    // Sans secret, rien ne peut être signé — et le verrou n'existe pas non
    // plus : la fiche s'ouvre alors directement, le lien nu suffit.
    return Response.json({ url: `${u.origin}/api/coordonnees/${iccid}` });
  }
  const { expiration, signature } = await signerLien(secret, "coordonnees", iccid);
  return Response.json({
    url: `${u.origin}/api/coordonnees/${iccid}?e=${expiration}&s=${signature}`,
  });
}
