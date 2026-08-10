// Reprendre une clé — et fermer ce qu'elle tenait ouvert, dans le même geste.
//
// LES DEUX MOITIÉS NE SE SÉPARENT PAS. Poser une date dans « acces » empêche
// la PROCHAINE entrée ; elle ne ferme pas l'onglet resté ouvert sur le
// téléphone de quelqu'un qui vient de partir fâché à 18 h. C'est exactement le
// cas qui a fait construire la table des sessions, et l'écran promet « dans la
// seconde » : une route qui ne ferait que dater trahirait cette phrase sans
// que rien ne se voie.
//
// RIEN NE S'EFFACE. On date « retire_le » et on note qui a repris la clé. Les
// reçus que la personne a remis restent au journal, à son nom — c'est ce qui
// permet, six mois plus tard, de la confondre ou de la disculper.
//
// ON NE SE FERME PAS LA PORTE À SOI-MÊME : le refus est écrit, et il vaut
// mieux qu'une propriétaire enfermée dehors par un appui malheureux.

import { lireUne, modifier } from "@/lib/base";
import { estRefus, garder } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { fermerToutesLesSessions } from "@/lib/sessions";
import { textesGens } from "@/lib/textes/gens";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await garder("gerer_les_gens");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesGens[langue];
  if (!g.commerce) return Response.json({ erreur: t.sansCommerceDit }, { status: 409 });

  const corps = await req.json().catch(() => null);
  const personne = Number(corps?.personne);
  if (!Number.isInteger(personne) || personne <= 0) {
    return Response.json({ erreur: t.rate }, { status: 400 });
  }
  if (personne === g.personne) {
    return Response.json({ erreur: t.pasVous }, { status: 400 });
  }

  // On vérifie l'appartenance AVANT d'agir : un PATCH qui ne trouve aucune
  // ligne répond « d'accord » sans rien changer, et on fermerait alors les
  // sessions de quelqu'un d'un autre commerce sur un simple numéro deviné.
  const acces = await lireUne<{ id: number }>(
    `acces?personne=eq.${personne}&commerce=eq.${encodeURIComponent(g.commerce)}`
    + `&retire_le=is.null&select=id&limit=1`);
  if (!acces) return Response.json({ erreur: t.rate }, { status: 404 });

  const date = await modifier(`acces?id=eq.${acces.id}&retire_le=is.null`, {
    retire_le: new Date().toISOString(),
    retire_par: g.personne,
  });
  if (!date) return Response.json({ erreur: t.rate }, { status: 503 });

  // La seconde moitié du geste, et la seule qui se voie tout de suite.
  await fermerToutesLesSessions(personne, "retrait_acces");

  return Response.json({ ok: true, dit: t.reprise });
}
