// Annuler une invitation qui attend encore.
//
// Deux raisons de le faire, et la seconde est la vraie : l'adresse était
// fausse, ou le lien a circulé — « ce lien a été ouvert avant que votre
// personne ne le reçoive ». Dans ce second cas, annuler est le geste sûr, et
// il doit tenir en un appui.
//
// Le filtre porte le commerce : personne n'annule l'invitation d'une autre
// boutique, même en devinant un numéro de ligne.

import { estRefus, garder } from "@/lib/garde";
import { annulerInvitation } from "@/lib/invitations";
import { langueServeur } from "@/lib/langue-serveur";
import { textesGens } from "@/lib/textes/gens";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await garder("gerer_les_gens");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesGens[langue];
  if (!g.commerce) return Response.json({ erreur: t.sansCommerceDit }, { status: 409 });

  const corps = await req.json().catch(() => null);
  const id = Number(corps?.invitation);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: t.rate }, { status: 400 });
  }

  const fait = await annulerInvitation(id, g.commerce);
  if (!fait) return Response.json({ erreur: t.rate }, { status: 404 });
  return Response.json({ ok: true });
}
