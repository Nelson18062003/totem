import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { exigerProprietaire, oublierLeVerdict, refusApi } from "@/lib/garde";
import {
  definirApprobation, listerUtilisateurs, relie, supprimerUtilisateur,
} from "@/lib/serveur";
import { creerParLeProprietaire } from "@/lib/porte";

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
  const moi = await exigerProprietaire(req);
  if (!moi.ok) return refusApi(moi.statut, langue);
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  return Response.json({ comptes: await listerUtilisateurs() });
}

export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const moi = await exigerProprietaire(req);
  if (!moi.ok) return refusApi(moi.statut, langue);

  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const geste = corps?.geste;

  // CRÉER un compte ne vise aucun identifiant : il n'en existe pas encore.
  // Ce geste passe donc avant les contrôles qui en réclament un.
  if (geste === "creer") {
    const r = await creerParLeProprietaire(corps?.courriel, corps?.motdepasse, langue);
    // 201 : le compte est créé. `Entree` rend toujours une décision, et
    // celle-ci se lit « c'est fait » — voir `creerParLeProprietaire`.
    return Response.json(
      r.ok || (!r.ok && r.statut === 201)
        ? { ok: true }
        : { erreur: (r as { erreur: string }).erreur },
      { status: r.ok ? 200 : r.statut === 201 ? 201 : r.statut });
  }

  const id = Number(corps?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }

  // On ne se ferme pas la porte à soi-même, et on ne se supprime pas : ce
  // serait le seul geste irréversible de cet écran, et il laisserait la
  // plateforme sans propriétaire.
  if (moi.compte !== null && moi.compte === id) {
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
  // Le garde relit la base, mais il garde son verdict dix secondes. Approuver
  // ou fermer quelqu'un doit valoir TOUT DE SUITE : on efface son verdict
  // plutôt que de laisser une session fermée vivre un dernier quart de
  // minute. Ce sont exactement les dix secondes qu'un propriétaire inquiet
  // passerait à recharger l'écran en se demandant si son geste a pris.
  oublierLeVerdict(id);

  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
}
