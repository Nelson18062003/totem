import { signerLienRecu } from "@/lib/lien-signe";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Fabrique un lien de reçu signé, pour le navigateur du téléphone.
 *
 * DERRIÈRE le verrou (la route n'est pas dans « OUVERT ») : seule une main
 * déjà authentifiée peut demander un laissez-passer. Le lien rendu vaut dix
 * minutes, pour CE reçu — voir lib/lien-signe.ts.
 *
 * L'origine vient de la requête elle-même : en production c'est l'adresse de
 * la plateforme, en essai celle du serveur d'essai. Écrire une adresse en
 * dur ici referait la faute de l'adresse d'exemple.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const langue = await langueDemandee(req);
  const { numero } = await params;
  // La forme d'un numéro de reçu, rien d'autre : pas de « / », pas de « ? »,
  // rien qui puisse voyager dans une adresse et y changer de sens. AVANT la
  // question du secret : le lien nu du mode sans verrou mérite la même
  // hygiène que le lien signé.
  if (!/^[\w.-]{1,64}$/.test(numero)) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const u = new URL(req.url);
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) {
    // Sans secret, rien ne peut être signé — et le verrou n'existe pas non
    // plus : le reçu s'ouvre alors directement, le lien nu suffit.
    return Response.json({ url: `${u.origin}/api/recu/${numero}` });
  }
  const { expiration, signature } = await signerLienRecu(secret, numero);
  return Response.json({
    url: `${u.origin}/api/recu/${numero}?e=${expiration}&s=${signature}`,
  });
}
