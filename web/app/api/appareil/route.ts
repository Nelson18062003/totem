import { enregistrerAppareil, relie } from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { compteConnecte, estProprietaire } from "@/lib/qui";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Le téléphone s'inscrit pour recevoir les notifications.
 *
 * TOUT COMPTE QUI TIENT DES CARTES, mais chacun pour les siennes. Le
 * téléphone est inscrit AU NOM du compte connecté ; le robot, au moment
 * d'annoncer un SMS, ne fait sonner que les téléphones du propriétaire et
 * ceux des comptes à qui la carte de ce SMS est confiée.
 *
 * Cette route a longtemps été réservée au propriétaire, et pour une vraie
 * raison : la table des appareils ne disait pas À QUI était chaque
 * téléphone, et le robot les faisait tous sonner pour chaque SMS — un
 * invité qui s'inscrivait recevait donc chaque message d'argent de la
 * maison sur son écran verrouillé. La colonne `utilisateur` lève cette
 * raison-là ; tant que la base ne l'a pas, un titulaire n'est pas inscrit
 * (voir `enregistrerAppareil`).
 *
 * Le robot ne sert que les appareils vus le plus récemment, et la clé de
 * l'inscription est le jeton : un téléphone qui change de main change de
 * compte, il ne s'ajoute pas.
 *
 * Ce qui entre est borné et nettoyé : un jeton d'Expo a une forme connue, et
 * le nom de l'appareil n'est qu'un libellé d'affichage.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  // Le propriétaire (ou la clé de secours), ou un compte approuvé. Un jeton
  // d'avant les comptes ne désigne personne : on ne sait pas à qui sonner.
  const proprietaire = await estProprietaire(req);
  const compte = await compteConnecte(req);
  if (!proprietaire && !compte?.approuve) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
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
  const ok = await enregistrerAppareil(jeton, plateforme, nom,
                                       compte?.id ?? null, proprietaire);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
}
