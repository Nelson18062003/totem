import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { textesReglages } from "@noyau/textes/reglages";
import { listerAppareils, oublierAppareil, relie } from "@/lib/serveur";
import { pousser } from "@/lib/pousser";

export const dynamic = "force-dynamic";

/**
 * « Est-ce que mon téléphone sonnera ? »
 *
 * Derrière le verrou : faire sonner le téléphone du propriétaire n'est pas
 * un geste que l'on offre à un inconnu.
 *
 * Le message ne parle QUE de lui-même — aucun montant, aucun expéditeur,
 * aucun texte de SMS. Les trois règles qui protègent les notifications
 * restent donc entièrement chez le robot, à un seul endroit.
 *
 * Au passage, on fait le ménage : un jeton dont Expo dit qu'il n'existe plus
 * (application désinstallée) est retiré de la base. Sans cela il y resterait
 * pour toujours, et le compte des appareils servis mentirait.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const t = textesReglages[langue];

  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }

  const appareils = await listerAppareils();
  if (!appareils.length) {
    return Response.json({ servis: 0, oublies: 0, aucun: true });
  }

  const verdicts = await pousser(
    appareils.map((a) => a.jeton), "TOTEM", t.essaiTexte);

  // Le ménage. Un échec de suppression n'est pas grave : on réessaiera au
  // prochain essai, et en attendant l'envoi ne coûte rien.
  const morts = verdicts.filter((v) => v.etat === "inconnu");
  await Promise.all(morts.map((v) => oublierAppareil(v.jeton)));

  return Response.json({
    servis: verdicts.filter((v) => v.etat === "ok").length,
    oublies: morts.length,
    // De quoi comprendre un échec sans ouvrir un journal : c'est le
    // propriétaire qui lit, et il n'a personne à qui demander.
    soucis: verdicts
      .filter((v) => v.etat === "invalide" || v.etat === "refuse")
      .map((v) => v.detail ?? v.etat)
      .slice(0, 3),
  });
}
