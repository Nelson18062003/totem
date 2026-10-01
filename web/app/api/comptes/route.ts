import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { compteConnecte, estProprietaire } from "@/lib/qui";
import {
  attribuerCarte, chargerDonnees, definirApprobation, listerAttributions,
  listerUtilisateurs, relie, retirerCarte, supprimerUtilisateur, utilisateurParId,
} from "@/lib/serveur";
import { creerParLeProprietaire } from "@/lib/porte";
import { TOUT } from "@/lib/portee";

export const dynamic = "force-dynamic";

/**
 * Les comptes de la plateforme, et les cartes de chacun — réservé au
 * propriétaire.
 *
 * C'est ici qu'il ouvre la porte à quelqu'un, la referme, supprime un compte,
 * et CONFIE ses cartes : un invité ne voit que les cartes qu'on lui a
 * confiées, et rien du tout tant qu'on ne lui en a confié aucune.
 *
 * Le navigateur (Réglages, console) et le téléphone parlent à la MÊME route :
 * une seule règle, deux écrans.
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
  // Les comptes, chacun avec ses cartes ; et TOUTES les cartes de la maison,
  // pour qu'on puisse en confier une — présentes ou retirées, puisqu'une
  // carte retirée garde ses SMS passés.
  const [comptes, attributions, { sims }] = await Promise.all([
    listerUtilisateurs(),
    listerAttributions(),
    chargerDonnees(langue, TOUT, { sms: 0, recus: 0 }),
  ]);
  return Response.json({
    comptes: comptes.map((c) => ({
      ...c,
      // Le propriétaire n'a pas de liste : il voit tout, toujours.
      cartes: c.role === "proprietaire" ? null : attributions.get(c.id) ?? [],
    })),
    cartes: sims.map((s) => ({
      iccid: s.iccid, libelle: s.libelle, operateur: s.operateur,
      numero: s.numero, nom: s.nom, enPlace: s.enPlace,
    })),
  });
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
    // Le propriétaire pose la personne en entier : prénom, nom, courriel, et
    // le mot de passe qu'il lui transmettra lui-même.
    const r = await creerParLeProprietaire(
      { prenom: corps?.prenom, nom: corps?.nom, courriel: corps?.courriel },
      corps?.motdepasse, langue);
    return r.ok
      ? Response.json({ ok: true, id: r.id }, { status: 201 })
      : Response.json({ erreur: r.erreur }, { status: r.statut });
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

  // CONFIER UNE CARTE, OU LA REPRENDRE. Seulement à un invité : le
  // propriétaire voit tout, une liste ne lui ajouterait rien — et une carte
  // seulement si la maison la connaît, pour qu'une faute de frappe ne
  // fabrique pas une attribution vers une carte qui n'existe pas.
  if (geste === "attribuer" || geste === "retirer") {
    const iccid = typeof corps?.iccid === "string" ? corps.iccid : "";
    if (!/^[A-Za-z0-9]{1,32}$/.test(iccid)) {
      return Response.json(
        { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
    }
    if (!vise) {
      return Response.json(
        { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 404 });
    }
    if (vise.role === "proprietaire") {
      return Response.json(
        { erreur: erreurApi(langue, "proprietaireVoitTout") }, { status: 400 });
    }
    if (geste === "attribuer") {
      const { sims } = await chargerDonnees(langue, TOUT, { sms: 0, recus: 0 });
      if (!sims.some((s) => s.iccid === iccid)) {
        return Response.json(
          { erreur: erreurApi(langue, "carteInconnue") }, { status: 404 });
      }
    }
    const fait = geste === "attribuer"
      ? await attribuerCarte(id, iccid) : await retirerCarte(id, iccid);
    return fait
      ? Response.json({ ok: true })
      : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
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
