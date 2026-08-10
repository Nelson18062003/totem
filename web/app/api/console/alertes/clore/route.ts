// « C'est réglé. » — l'autre des deux seuls gestes de toute la console.
//
// CE QU'IL FAIT
// Il date la levée, note qui l'a levée, et garde la phrase de celui qui l'a
// fait. La ligne descend de l'écran des alertes ouvertes et rejoint les closes.
// Rien ne s'efface : l'alerte reste, avec ses trois heures — ouverte, vue,
// levée.
//
// CE QU'IL NE FAIT PAS, EXPRÈS
// Il n'accuse pas réception au passage. Une alerte close sans avoir jamais été
// vue est une information : quelqu'un a réparé la chose sans que ce registre
// serve à quoi que ce soit. La déduire rendrait cet écran flatteur, donc
// inutile.
//
// LA PHRASE EST LAVÉE AVANT D'ÊTRE ÉCRITE
// Elle est tapée à la main, en vitesse, par quelqu'un qui vient parfois de
// coller ce qu'il avait sous le curseur. « sansSecret » passe dessus avant la
// base : un journal qui garde tout ne doit pas garder un code.

import { estRefus, garder } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { clore } from "@/lib/journal";
import { textesJournal } from "@/lib/textes/journal";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // La garde AVANT tout le reste, et avec le pouvoir de la console.
  const g = await garder("administrer");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesJournal[langue].alertes;

  const corps = await req.json().catch(() => null);
  const alerte = Number(corps?.alerte);
  if (!Number.isInteger(alerte) || alerte <= 0) {
    return Response.json({ erreur: t.gesteRate }, { status: 400 });
  }
  const motif = typeof corps?.motif === "string" ? corps.motif.trim() : "";

  const fait = await clore(alerte, g.personne, motif);
  if (!fait) {
    return Response.json({ erreur: t.gesteDejaFait }, { status: 409 });
  }
  return Response.json({ ok: true, dit: t.gesteCloreConfirmer });
}
