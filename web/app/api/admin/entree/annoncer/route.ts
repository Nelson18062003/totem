// « Quelqu'un vient d'entrer chez vous. » La lettre part d'ici, à chaque fois.
//
// POURQUOI UNE ROUTE, ET PAS UNE LIGNE DANS CHAQUE PORTE
// Trois chemins ouvrent cette console : le verrouillage du téléphone
// (`/api/cle/entrer`), le code de secours (`/api/admin/code/verifier`) et le
// papier (`/api/entrer/papier`). Deux d'entre eux appartiennent à d'autres
// équipes et servent aussi la porte du client, où la règle est différente —
// là-bas on ne prévient que depuis un appareil jamais vu. Écrire l'avis dans
// chacune des trois aurait demandé de les modifier toutes les trois, et la
// troisième aurait été oubliée.
//
// L'écran de la porte appelle donc cette route une fois entré, quel que soit
// le chemin. Elle est GARDÉE — il faut être dedans pour dire qu'on vient
// d'entrer — et elle ne croit pas l'écran sur parole : le chemin emprunté est
// relu dans le journal des entrées, pas reçu dans le corps de la requête.
//
// POURQUOI À CHAQUE ENTRÉE, ET PAS SEULEMENT DEPUIS UN APPAREIL INCONNU
// C'est la différence entre cette porte et celle du client. Une entrée depuis
// l'appareil habituel, à trois heures du matin, est exactement le message que
// le super-administrateur doit recevoir — et le seul moyen de la lui signaler
// est de tout lui signaler.
//
// ELLE NE REND JAMAIS D'ERREUR À L'ÉCRAN. Un avis qui n'est pas parti ne doit
// pas ressembler à une entrée qui a échoué : la personne EST entrée. Ce qui
// est parti et ce qui ne l'est pas se lit dans le journal des courriels, écran
// A7.

import { garder, estRefus } from "@/lib/garde";
import { lireUne } from "@/lib/base";
import { entreesDe, prevenirDuneEntree } from "@/lib/plateforme";
import type { Langue } from "@/lib/langue";

export const dynamic = "force-dynamic";

/** Les trois chemins qui ouvrent cette console. Tout le reste est ignoré. */
const CHEMINS = new Set(["cle", "courriel", "papier"]);

export async function POST() {
  const g = await garder("administrer");
  if (estRefus(g)) return g.refus;

  const compte = await lireUne<{ courriel: string | null; langue: Langue }>(
    `personnes?id=eq.${g.personne}&select=courriel,langue&limit=1`);

  // Le chemin, relu dans le journal plutôt que reçu de l'écran : une lettre qui
  // dirait « par le verrouillage de votre téléphone » sur une entrée par mail
  // ferait exactement le contraire de ce qu'elle promet.
  const dernieres = await entreesDe(g.personne, 1);
  const moyen = dernieres[0]?.moyen;

  if (compte?.courriel && moyen && CHEMINS.has(moyen)) {
    await prevenirDuneEntree(
      {
        personne: g.personne,
        courriel: compte.courriel,
        langue: compte.langue,
        appareil: g.session.appareil,
        lieu: g.session.lieu,
      },
      moyen as "cle" | "courriel" | "papier",
    );
  }

  return Response.json({ ok: true });
}
