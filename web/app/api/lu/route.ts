import { marquerLu, relie } from "@/lib/serveur";

export const dynamic = "force-dynamic";

/** Le propriétaire vient d'ouvrir la fiche d'un SMS : il est lu. */
export async function POST(req: Request) {
  const corps = await req.json().catch(() => null);
  const id = Number(corps?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: "identifiant invalide" }, { status: 400 });
  }
  if (!relie) {
    return Response.json({ erreur: "plateforme non reliée" }, { status: 503 });
  }
  // Base pas encore migrée (colonne absente) : l'échec est silencieux côté
  // écran — la notion de non-lu dort simplement jusqu'à la migration.
  const ok = await marquerLu(id);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ erreur: "non enregistré" }, { status: 502 });
}
