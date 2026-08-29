import { enregistrerAppareil, relie } from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Le téléphone s'inscrit pour recevoir les notifications.
 *
 * Cette route est DERRIÈRE le verrou (elle n'est pas dans la liste `OUVERT`
 * du middleware) : seul un appareil déjà connecté peut s'inscrire. Sans
 * cela, n'importe qui pourrait faire sonner le téléphone du propriétaire.
 *
 * Ce qui entre est borné et nettoyé : un jeton d'Expo a une forme connue, et
 * le nom de l'appareil n'est qu'un libellé d'affichage.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = await req.json().catch(() => null);

  const jeton = typeof corps?.jeton === "string" ? corps.jeton.trim() : "";
  // La forme d'un jeton Expo : « ExpoPushToken[…] ». On refuse tout le reste
  // plutôt que de garnir la table d'adresses qui ne servent à rien — et un
  // jeton qui n'est pas d'Expo ne pourrait de toute façon rien recevoir.
  if (!/^ExpoPushToken\[[\w.:%+-]{1,200}\]$/.test(jeton)) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }

  const plateforme = corps?.plateforme === "ios" ? "ios"
    : corps?.plateforme === "android" ? "android" : "inconnue";
  const nom = typeof corps?.nom === "string"
    ? corps.nom.replace(/[^\w .·-]/g, "").trim().slice(0, 40) : "";

  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonReliee") }, { status: 503 });
  }
  const ok = await enregistrerAppareil(jeton, plateforme, nom);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
}
