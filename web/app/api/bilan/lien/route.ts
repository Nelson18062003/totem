import { signerLien } from "@/lib/lien-signe";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Fabrique un lien signé vers le bilan CSV — pour le navigateur du
 * téléphone, qui n'a ni cookie ni jeton et qui, lui, sait TÉLÉCHARGER un
 * fichier (l'application ne sait que l'afficher).
 *
 * DERRIÈRE le verrou, comme les autres fabriques. La signature couvre le
 * NOMBRE DE JOURS : un lien signé pour la semaine n'ouvre pas le trimestre.
 */
export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  const u = new URL(req.url);
  const jours = u.searchParams.get("jours") ?? "7";
  // Un entier de 1 à 90, comme la route du bilan elle-même.
  if (!/^\d{1,2}$/.test(jours) || Number(jours) < 1 || Number(jours) > 90) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) {
    return Response.json({ url: `${u.origin}/api/bilan?jours=${jours}` });
  }
  const { expiration, signature } = await signerLien(secret, "bilan", jours);
  return Response.json({
    url: `${u.origin}/api/bilan?jours=${jours}&e=${expiration}&s=${signature}`,
  });
}
