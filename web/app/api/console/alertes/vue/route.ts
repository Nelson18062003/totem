// « Je l'ai vue. » — l'un des deux seuls gestes de toute la console.
//
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
// Il pose une heure et un nom sur une alerte : quelqu'un a regardé, et on sait
// qui. Il ne la lève pas. La ligne reste à l'écran tant que le problème n'est
// pas réglé — c'est tout l'intérêt d'avoir deux gestes plutôt qu'un : sans
// cela, le premier regard ferait disparaître une chose que personne n'a
// réparée.
//
// POURQUOI IL NE PEUT RIEN FAIRE D'AUTRE
// L'écriture vit dans « lib/journal.ts » et n'accepte que deux colonnes,
// « vue_le » et « vue_par », sur la seule table « alertes ». Aucun chemin d'ici
// ne mène à « commandes » : un administrateur ne fait agir aucun terminal et ne
// déplace aucun argent (voir lib/roles.ts, le rôle « admin » n'a pas
// « sortir_argent »).
//
// POURQUOI UN SECOND APPUI RÉPOND 409
// L'écriture porte le filtre « vue_le is null ». Sans lui, le second appui
// écraserait l'heure du premier regard, et l'on perdrait le seul chiffre qui
// compte le lendemain : combien de temps l'alerte est restée sans que personne
// ne la voie.

import { estRefus, garder } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { accuserReception } from "@/lib/journal";
import { textesRegistre } from "@noyau/textes/console-registre";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // La garde AVANT tout le reste, et avec le pouvoir de la console.
  const g = await garder("administrer");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesRegistre[langue].alertes;

  const corps = await req.json().catch(() => null);
  const alerte = Number(corps?.alerte);
  if (!Number.isInteger(alerte) || alerte <= 0) {
    return Response.json({ erreur: t.gesteRate }, { status: 400 });
  }

  const fait = await accuserReception(alerte, g.personne);
  if (!fait) {
    return Response.json({ erreur: t.gesteDejaFait }, { status: 409 });
  }
  return Response.json({ ok: true, dit: t.gesteVueFait });
}
