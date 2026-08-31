import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { compteConnecte, estProprietaire } from "@/lib/qui";
import {
  definirApprobation, listerUtilisateurs, relie, supprimerUtilisateur,
  utilisateurParId,
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
  const moi = await compteConnecte(req);
  if (moi && moi.id === id) {
    return Response.json({ erreur: erreurApi(langue, "pasSoiMeme") }, { status: 400 });
  }

  // LE COMPTE DU PROPRIÉTAIRE NE SE FERME NI NE SE SUPPRIME. Par personne.
  //
  // La garde ci-dessus protège de soi-même, et elle suffisait tant qu'on
  // parlait d'un compte. Mais la CLÉ DE SECOURS ouvre l'administration sans
  // désigner personne : `compteConnecte` rend null, la garde ne s'applique
  // pas, et le compte du propriétaire pouvait être supprimé.
  //
  // Ce qui se passait alors, joué contre un vrai serveur : la table des
  // comptes se vidait, la plateforme lisait « aucun compte » comme « jamais
  // installée », et ROUVRAIT ses inscriptions. Le premier passant venu du
  // réseau s'inscrivait et devenait propriétaire — tous les SMS, tous les
  // soldes, et le terminal qui compose ce qu'on lui dit de composer.
  //
  // « La table est vide » et « cette plateforme n'a jamais été installée »
  // sont deux faits différents. On ne les confondra plus, parce que la table
  // ne pourra plus se vider.
  const vise = await utilisateurParId(id);
  if (vise?.role === "proprietaire" && (geste === "supprimer" || geste === "fermer")) {
    return Response.json(
      { erreur: erreurApi(langue, "pasLeProprietaire") }, { status: 400 });
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
