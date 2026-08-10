// Fermer une session de la console, ou toutes.
//
// FERMER N'EXIGE AUCUNE PREUVE DE PLUS QUE D'ÊTRE ENTRÉ, et ce n'est pas un
// oubli : fermer une porte n'a jamais nui à personne. Demander un code de plus
// pour « tout fermer » reviendrait à refuser le seul geste utile à quelqu'un
// qui vient de voir dans sa boîte mail une entrée qu'il n'a pas faite — et il
// a, à ce moment-là, exactement une minute et zéro patience.
//
// ON FERME SES PROPRES SESSIONS, JAMAIS CELLES D'UN AUTRE. Le filtre porte le
// numéro de la personne, et « tout fermer » ferme tout CHEZ ELLE. Reprendre le
// droit de quelqu'un d'autre est un geste distinct, écrit ailleurs
// (`/api/admin/application`) : les fondre rendrait impossible de retirer un
// droit sans jeter dehors quelqu'un au milieu de son travail.
//
// LA SESSION COURANTE PEUT SE FERMER ELLE-MÊME. C'est ce que fait « tout
// fermer », et l'écran le sait : il renvoie à la porte juste après.

import { garder, estRefus } from "@/lib/garde";
import { fermerSession, fermerToutesLesSessions, sessionsOuvertes } from "@/lib/sessions";
import { langueServeur } from "@/lib/langue-serveur";
import { textesAdminPorte } from "@/lib/textes/admin-porte";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await garder("administrer");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const corps = (await req.json().catch(() => null)) as
    { session?: unknown; tout?: unknown } | null;

  if (corps?.tout === true) {
    await fermerToutesLesSessions(g.personne, "tout_fermer");
    return Response.json({ ok: true, tout: true });
  }

  const id = typeof corps?.session === "string" ? corps.session : "";
  if (!id) return Response.json({ erreur: t.refus.indisponible }, { status: 400 });

  // La session doit être une des SIENNES. Sans ce contrôle, un identifiant
  // deviné fermerait la session de quelqu'un d'autre — et « fermer sans
  // preuve » n'était acceptable que parce qu'on ne ferme que chez soi.
  const siennes = await sessionsOuvertes(g.personne);
  if (!siennes.some((s) => s.id === id)) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 404 });
  }

  if (!await fermerSession(id, "tout_fermer")) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 409 });
  }
  return Response.json({ ok: true, ici: id === g.session.id });
}
