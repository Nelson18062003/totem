import { cookies } from "next/headers";
import { COOKIE_SESSION, egaliteConstante, signerSession } from "@/lib/session";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { attendreLeFrein, cleDeFrein, noterEchec, oublierEchecs } from "@/lib/frein";

export const dynamic = "force-dynamic";

/**
 * Ouvre une session si le mot de passe correspond à celui du propriétaire
 * (variable d'environnement `TOTEM_MOT_DE_PASSE`, jamais dans le code). Ce
 * n'est PAS le code PIN Mobile Money — celui-là ne se saisit qu'au moment
 * d'une opération et n'est enregistré nulle part.
 */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = await req.json().catch(() => null);
  const propose = typeof corps?.motdepasse === "string" ? corps.motdepasse : "";

  const secret = process.env.SESSION_SECRET || "";
  const attendu = process.env.TOTEM_MOT_DE_PASSE || "";

  // Sans configuration, la connexion ne peut pas s'ouvrir (et le verrou n'est
  // de toute façon pas actif). On répond franchement.
  if (!secret || !attendu) {
    return Response.json(
      { erreur: erreurApi(langue, "connexionNonConfiguree") }, { status: 503 });
  }
  // Le frein s'applique par adresse vue par le serveur (à défaut, un seau
  // commun) : plusieurs échecs récents ralentissent la tentative suivante.
  // Le seau est PARTAGÉ avec `/api/session`, la porte de l'application :
  // alterner les deux portes ne double pas la cadence des essais.
  const cle = cleDeFrein(req);
  await attendreLeFrein(cle);

  if (!propose || !(await egaliteConstante(propose, attendu))) {
    noterEchec(cle);
    return Response.json({ erreur: erreurApi(langue, "motDePasseIncorrect") }, { status: 401 });
  }
  oublierEchecs(cle);   // une réussite efface l'ardoise

  const jeton = await signerSession(secret);
  const boite = await cookies();
  boite.set(COOKIE_SESSION, jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return Response.json({ ok: true });
}
