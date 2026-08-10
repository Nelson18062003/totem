// Demander le lien qui ferme tout.
//
// CETTE ROUTE N'A QU'UNE SEULE RÉPONSE, ET C'EST TOUT SON INTÉRÊT.
// Adresse connue, adresse inconnue, corps illisible, base injoignable : la
// même réponse, mot pour mot, avec le même code. Il n'y a pas de branche à
// écrire, donc il n'y a pas de branche qu'on puisse ajouter distraitement un
// vendredi soir. Sans cela, ce formulaire deviendrait l'outil le plus commode
// du marché pour savoir qui, dans la rue, tient un TOTEM.
//
// ELLE EST OUVERTE, ET ELLE NE PEUT PAS ÊTRE AUTRE CHOSE.
// Fermer n'exige aucune preuve — exiger un mot de passe de quelqu'un dont le
// téléphone vient d'être arraché, c'est lui refuser le seul geste utile.
// Ce qui remplace la preuve n'est pas une garde mais le CHEMIN : rien ne se
// ferme ici. Cette route ne fait qu'expédier un lien sur une adresse, et c'est
// celui qui tient la boîte qui ferme ensuite.
//
// Le raisonnement complet — pourquoi fermer par mail est acceptable là où
// entrer par mail ne le serait pas — est en tête de « lib/retour.ts ».

import { headers } from "next/headers";
import { langueServeur } from "@/lib/langue-serveur";
import { contexteAppareil } from "@/lib/garde";
import { demanderLaFermeture, origineDepuis } from "@/lib/retour";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = (await req.json().catch(() => null)) as { courriel?: unknown } | null;
  const courriel = typeof corps?.courriel === "string" ? corps.courriel : "";

  if (courriel.includes("@")) {
    const h = await headers();
    const { appareil, lieu } = await contexteAppareil();
    await demanderLaFermeture({
      courriel,
      origine: origineDepuis(
        h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")),
      langue,
      appareil,
      lieu,
    });
  }

  // Une seule réponse, une seule fois écrite. « demanderLaFermeture » ne rend
  // rien : la route n'a rien à raconter, même si elle le voulait.
  return Response.json({ ok: true });
}
