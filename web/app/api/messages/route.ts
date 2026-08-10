// Changer ce qu'on accepte de recevoir.
//
// LE REFUS QUI COMPTE TIENT EN UN VERDICT : « protege ». Un genre qui protège
// ne s'éteint pas, et ce n'est pas l'écran qui le décide — c'est la structure
// de `lib/preferences.ts`, revérifiée ici, et une contrainte de la base qui
// refuserait la ligne même si les deux se trompaient. Trois barrages pour une
// règle qu'on ne peut pas se permettre de perdre dans une relecture.
//
// La garde vient avant tout : on ne règle que ses propres messages, et le
// numéro de la personne vient de la SESSION, jamais du corps de la requête —
// sinon n'importe qui éteindrait les alertes de n'importe qui, ce qui est
// exactement le geste qu'un voleur ferait en premier.

import { garder, estRefus } from "@/lib/garde";
import { langueServeur } from "@/lib/langue-serveur";
import { definirPreference, estGenre } from "@/lib/preferences";

export const dynamic = "force-dynamic";

const DIT = {
  fr: {
    genre: "Ce genre de message n'existe pas.",
    protege: "Ce message vous protège : il n'a pas d'interrupteur.",
    echec: "Le changement n'est pas passé. Rien n'a bougé.",
  },
  en: {
    genre: "There is no such kind of message.",
    protege: "This message protects you: it has no switch.",
    echec: "That change did not go through. Nothing has moved.",
  },
} as const;

export async function POST(req: Request) {
  const g = await garder("lire");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const dit = DIT[langue];
  const corps = (await req.json().catch(() => null)) as
    { genre?: unknown; recevoir?: unknown } | null;
  if (!estGenre(corps?.genre)) {
    return Response.json({ ok: false, erreur: dit.genre }, { status: 400 });
  }
  const recevoir = corps?.recevoir !== false;

  const verdict = await definirPreference(g.personne, corps.genre, recevoir);
  if (verdict === "protege") {
    return Response.json(
      { ok: false, protege: true, erreur: dit.protege }, { status: 409 });
  }
  if (verdict === "echec") {
    return Response.json({ ok: false, erreur: dit.echec }, { status: 503 });
  }
  return Response.json({ ok: true, genre: corps.genre, recevoir });
}
