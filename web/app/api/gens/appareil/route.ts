// Fermer UN appareil, sans reprendre la clé.
//
// Le cas est banal et n'a rien d'un licenciement : l'opérateur a laissé la
// boutique ouverte sur l'ordinateur du comptoir, ou sur un téléphone qu'il a
// prêté. Reprendre sa clé pour cela serait disproportionné — il travaille
// demain matin.
//
// La session doit appartenir au commerce de qui la ferme. Un identifiant de
// session ne se devine pas (128 bits), mais on ne fait pas reposer un contrôle
// d'accès sur la difficulté de deviner.

import { lireUne } from "@/lib/base";
import { estRefus, garder } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { fermerSession } from "@/lib/sessions";
import { textesGens } from "@/lib/textes/gens";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await garder("gerer_les_gens");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesGens[langue];
  if (!g.commerce) return Response.json({ erreur: t.sansCommerceDit }, { status: 409 });

  const corps = await req.json().catch(() => null);
  const id = typeof corps?.session === "string" ? corps.session : "";
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return Response.json({ erreur: t.rate }, { status: 400 });
  }

  const session = await lireUne<{ commerce: string | null }>(
    `sessions?id=eq.${id}&revoquee_le=is.null&select=commerce&limit=1`);
  if (!session || session.commerce !== g.commerce) {
    return Response.json({ erreur: t.rate }, { status: 404 });
  }

  // « retrait_acces » : c'est bien le propriétaire qui reprend quelque chose,
  // même s'il ne reprend ici qu'un appareil. Voir la note du rapport : un
  // motif « appareil_ferme » dirait la nuance, et il manque à `lib/sessions.ts`.
  const fait = await fermerSession(id, "retrait_acces");
  if (!fait) return Response.json({ erreur: t.rate }, { status: 503 });
  return Response.json({ ok: true });
}
