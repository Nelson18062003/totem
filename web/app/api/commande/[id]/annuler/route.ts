import { annulerCommande, auteurDeLaCommande, relie } from "@/lib/serveur";
import { maniement, sujetDe, TOUT, voitLaCarte } from "@/lib/portee";
import { langueDemandee } from "@/lib/langue-serveur";
import { estDemonstration, reponseJouee } from "@/lib/demonstration";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * ANNULER une demande — ce que l'écran appelle quand il ABANDONNE.
 *
 * Le téléphone attend la réponse du boîtier une trentaine de secondes, puis
 * renonce. Il ne retirait rien : la demande restait « en attente », et un
 * boîtier revenu des heures plus tard la composait, numéro et montant
 * compris, pour un écran qui avait abandonné depuis longtemps.
 *
 * La réponse dit si l'annulation a PRIS — et c'est la seule chose qui
 * compte pour l'écran :
 *
 *   { annulee: true }                → rien n'est parti, il peut le dire ;
 *   { annulee: false, etat: "…" }    → le boîtier l'avait déjà prise (ou
 *                                      finie) : l'écran ne doit SURTOUT PAS
 *                                      dire « rien n'est parti ».
 *
 * MÊME MAIN QUE LE DÉPÔT, ET LA SIENNE SEULEMENT. On n'annule qu'une demande
 * sur une carte qu'on tient — et, quand la plateforme a noté qui l'a déposée,
 * qu'une demande à soi : un vendeur n'annule pas le geste que le propriétaire
 * vient de lancer sur la même carte. Introuvable ou pas à lui : la même
 * réponse, on ne dit pas qu'elle existe ailleurs.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const langue = await langueDemandee(req);
  const numero = Number.parseInt((await params).id, 10);

  // La démonstration ne dépose rien : ses demandes sont « faites » dès leur
  // naissance, il n'y a jamais rien à retenir.
  if (await estDemonstration(req)) {
    const reponse = Number.isInteger(numero) ? reponseJouee(numero) : null;
    return reponse
      ? Response.json({ annulee: false, etat: reponse.etat })
      : Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
  }

  const main = process.env.SESSION_SECRET ? await maniement(req) : TOUT;
  if (!main) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  if (!Number.isInteger(numero) || numero <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }

  const auteur = await auteurDeLaCommande(numero);
  const introuvable = () =>
    Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
  if (!auteur) return introuvable();
  // Sa carte : un titulaire n'annule que sur les cartes qu'il tient.
  if (!main.tout && (!auteur.carte || !voitLaCarte(main, auteur.carte))) {
    return introuvable();
  }
  // Sa demande : quand la plateforme a noté qui l'a déposée, c'est lui ou
  // personne. (Absent : une demande d'avant, ou une réponse dont le robot a
  // effacé le code secret — elle n'est plus en attente de toute façon.)
  const moi = await sujetDe(req);
  if (auteur.par && moi && auteur.par !== moi) return introuvable();

  const issue = await annulerCommande(numero, langue);
  if (!issue) {
    return Response.json(
      { erreur: erreurApi(langue, "annulationIncertaine") }, { status: 502 });
  }
  return Response.json(issue);
}
