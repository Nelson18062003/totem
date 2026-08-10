// La demande d'accès à la plateforme : demander, accorder, refuser, reprendre.
//
// DEUX PORTES DANS UNE SEULE ROUTE, ET ELLES N'EXIGENT PAS LA MÊME CHOSE
// « demander » n'exige que d'être entré : c'est le geste de quelqu'un qui n'a
// justement pas encore le droit, et exiger le droit pour le demander serait un
// cercle. Il ne donne RIEN — il pose une ligne sur le bureau de quelqu'un.
// « accorder », « refuser » et « reprendre » exigent d'être déjà
// administrateur : ce sont eux qui distribuent la clé de toute la flotte.
//
// LE REFUS EST SERVEUR, PAS À L'ÉCRAN. Un bouton absent se contourne — il
// suffit d'appeler cette adresse à la main depuis la console du navigateur —
// tandis qu'une route qui refuse tient devant n'importe qui. C'est la règle
// d'en-tête de `lib/roles.ts`, et cette route est exactement le cas qu'elle
// décrit.
//
// PERSONNE NE S'ACCORDE LE DROIT À SOI-MÊME. Le contrôle est ici, pas dans
// l'écran : un administrateur peut tout accorder sauf sa propre demande. Le
// premier droit, celui que personne ne peut accorder, vient de la variable
// `TOTEM_ADMIN` — voir `sql/migration-plateforme.sql`.

import { garder, estRefus } from "@/lib/garde";
import { lireUne } from "@/lib/base";
import { langueServeur } from "@/lib/langue-serveur";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import {
  accorderLaPlateforme, demanderLaPlateforme, estAdministrateur,
  refuserLaPlateforme, retirerLaPlateforme,
  type LigneAccesPlateforme, type LignePersonne,
} from "@/lib/plateforme";

export const dynamic = "force-dynamic";

type Geste = "demander" | "accorder" | "refuser" | "reprendre";

const GESTES = new Set<Geste>(["demander", "accorder", "refuser", "reprendre"]);

export async function POST(req: Request) {
  // « lire » : le pouvoir que TOUS les rôles ont. C'est volontaire — demander
  // l'accès est ouvert à quiconque est entré. Les trois autres gestes relisent
  // le droit d'administrer juste en dessous, en base.
  const g = await garder("lire");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const corps = (await req.json().catch(() => null)) as
    { geste?: unknown; id?: unknown; motif?: unknown } | null;
  const geste = corps?.geste as Geste;
  const motif = typeof corps?.motif === "string" ? corps.motif : "";
  if (!GESTES.has(geste)) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 400 });
  }

  if (geste === "demander") {
    const ligne = await demanderLaPlateforme(g.personne, motif);
    if (!ligne) return Response.json({ erreur: t.refus.indisponible }, { status: 503 });
    return Response.json({ ok: true });
  }

  // --- Les trois gestes qui distribuent la clé de la flotte ----------------
  const moi = await lireUne<LignePersonne>(
    `personnes?id=eq.${g.personne}&select=id,nom,courriel,etat,langue&limit=1`);
  if (!moi || !(await estAdministrateur(moi))) {
    // 403, et journalisé : c'est en relisant ces lignes qu'on découvre que
    // quelqu'un appelle cette adresse à la main.
    console.warn(
      `refus : ${g.nom} (${g.role}) a demandé « ${geste} » sur l'accès plateforme`);
    return Response.json({ erreur: t.application.pouvoir }, { status: 403 });
  }

  const id = Number(corps?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 400 });
  }

  const dossier = await lireUne<LigneAccesPlateforme>(
    `acces_plateforme?id=eq.${id}&limit=1`);
  if (!dossier) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 404 });
  }
  if (dossier.personne === g.personne) {
    // On ne se donne pas la flotte à soi-même, et on ne se la reprend pas non
    // plus par accident au milieu d'une liste.
    return Response.json({ erreur: t.application.pouvoir }, { status: 403 });
  }

  const fait =
    geste === "accorder" ? await accorderLaPlateforme(id, g.personne)
    : geste === "refuser" ? await refuserLaPlateforme(id, g.personne)
    : await retirerLaPlateforme(id, g.personne, motif);

  if (!fait) return Response.json({ erreur: t.refus.indisponible }, { status: 409 });
  return Response.json({ ok: true });
}
