import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { compteConnecte, estProprietaire } from "@/lib/qui";
import {
  definirApprobation, listerUtilisateurs, relie, supprimerUtilisateur,
} from "@/lib/serveur";

export const dynamic = "force-dynamic";

/**
 * Les comptes de la plateforme — réservé au propriétaire.
 *
 * C'est ici qu'il ouvre la porte à quelqu'un, la referme, ou supprime un
 * compte. Un compte créé n'ouvre rien tant qu'il n'est pas passé par là :
 * l'inscription est libre, l'accès ne l'est pas.
 *
 * Ce qui sort d'ici ne contient JAMAIS d'empreinte de mot de passe — la
 * fonction qui liste ne va même pas la chercher en base.
 */
export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  if (!(await estProprietaire(req))) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  return Response.json({ comptes: await listerUtilisateurs() });
}

export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  if (!(await estProprietaire(req))) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }

  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = Number(corps?.id);
  const geste = corps?.geste;
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }

  // On ne se ferme pas la porte à soi-même, et on ne se supprime pas : ce
  // serait le seul geste irréversible de cet écran, et il laisserait la
  // plateforme sans propriétaire.
  const moi = await compteConnecte(req);
  if (moi && moi.id === id) {
    return Response.json({ erreur: erreurApi(langue, "pasSoiMeme") }, { status: 400 });
  }

  const ok = geste === "approuver" ? await definirApprobation(id, true)
    : geste === "fermer" ? await definirApprobation(id, false)
      : geste === "supprimer" ? await supprimerUtilisateur(id)
        : null;

  if (ok === null) {
    return Response.json(
      { erreur: erreurApi(langue, "demandeInconnue") }, { status: 400 });
  }
  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
}
