import { langueDemandee } from "@/lib/langue-serveur";
import { ouvrirLaPorte } from "@/lib/porte";

export const dynamic = "force-dynamic";

/**
 * La porte de l'APPLICATION DU TÉLÉPHONE.
 *
 * Même règle, même signature, même frein que l'écran du navigateur — seule
 * la façon de RANGER la session diffère. Le navigateur reçoit un cookie que
 * le serveur pose lui-même ; l'application, elle, n'a pas de cookie : on lui
 * rend le jeton dans le corps de la réponse, et elle le range dans le coffre
 * du système (celui qu'ouvre le doigt ou le visage).
 *
 * La décision d'ouvrir vit dans `lib/porte.ts` : une seule règle pour les
 * deux portes, sans quoi l'une finirait un jour plus permissive que l'autre.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = await req.json().catch(() => null);

  const entree = await ouvrirLaPorte(req, corps, langue);
  if (!entree.ok) {
    return Response.json({ erreur: entree.erreur }, { status: entree.statut });
  }

  // L'échéance est rendue en clair pour que l'application sache se
  // reconnecter AVANT d'être refusée, plutôt qu'après un écran vide.
  const [, expiration] = entree.jeton.split(".");
  return Response.json({ jeton: entree.jeton, expire: Number(expiration) });
}
