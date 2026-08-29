import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/lib/session";
import { langueServeur } from "@/lib/langue-serveur";
import { ouvrirLaPorte } from "@/lib/porte";

export const dynamic = "force-dynamic";

/**
 * La porte du NAVIGATEUR. Elle repart avec un cookie `httpOnly` — celui-là
 * même qu'un script de page ne peut pas lire, ce qui est tout l'intérêt.
 *
 * La DÉCISION d'ouvrir n'est pas ici : elle est dans `lib/porte.ts`, partagée
 * avec la porte du téléphone. Deux portes, une seule règle.
 *
 * Ce n'est PAS le code PIN Mobile Money — celui-là ne se saisit qu'au moment
 * d'une opération et n'est enregistré nulle part.
 */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = await req.json().catch(() => null);

  const entree = await ouvrirLaPorte(req, corps, langue);
  if (!entree.ok) {
    return Response.json({ erreur: entree.erreur }, { status: entree.statut });
  }

  const boite = await cookies();
  boite.set(COOKIE_SESSION, entree.jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return Response.json({ ok: true });
}
