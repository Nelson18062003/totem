import { enregistrerAppareil, relie } from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { exigerSession, refusApi } from "@/lib/garde";

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
  const moi = await exigerSession(req);
  if (!moi.ok) return refusApi(moi.statut, langue);
  const corps = await req.json().catch(() => null);

  const jeton = typeof corps?.jeton === "string" ? corps.jeton.trim() : "";
  // LA FORME D'UN JETON EXPO — et la faute qui a rendu les notifications
  // muettes pendant des jours.
  //
  // Ce contrôle n'acceptait que « ExpoPushToken[…] ». Or Expo rend
  // « ExponENTPushToken[…] » : le nom historique de la société, avec « ent ».
  // Chaque téléphone réel était donc refusé — « identifiant invalide » — et
  // l'application affichait « le téléphone n'a pas pu être inscrit ». La
  // table des appareils est restée VIDE, le robot a fidèlement envoyé ses
  // notifications à une liste vide, et personne n'a rien entendu.
  //
  // Ce qui a permis à la faute de vivre : le harnais du verrou éprouvait
  // cette route avec « ExpoPushToken[intrus] » — la forme INVENTÉE ICI. Il
  // validait donc la faute contre elle-même. Un contrôle qui mesure sa
  // propre invention ne mesure rien ; il rassure, ce qui est pire. Le
  // harnais présente désormais un jeton de la VRAIE forme.
  //
  // Les deux sont acceptées : Expo a livré les deux préfixes au fil des
  // années, et une application ancienne ne doit pas devenir muette parce
  // qu'on a durci le filtre.
  if (!/^(?:Expo|Exponent)PushToken\[[\w.:%+-]{1,200}\]$/.test(jeton)) {
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
