import { cookies } from "next/headers";
import { COOKIE_SESSION, egaliteConstante, signerSession } from "@/lib/session";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

// Un frein aux essais de mot de passe, en mémoire de l'instance. Ce n'est pas
// un verrou distribué — chaque instance a le sien — mais il suffit à casser
// la cadence d'une attaque par force brute : après quelques échecs, chaque
// tentative attend, et la fenêtre s'oublie d'elle-même. Le propriétaire, qui
// se trompe une fois ou deux, ne le sent pas.
const essais = new Map<string, { n: number; vu: number }>();
const FENETRE_MS = 15 * 60 * 1000;
const LIBRES = 5;               // essais sans délai
const PALIER_MS = 500;          // délai ajouté par échec au-delà

function freinPour(cle: string): number {
  const maintenant = Date.now();
  const e = essais.get(cle);
  if (!e || maintenant - e.vu > FENETRE_MS) return 0;
  return Math.min(Math.max(0, e.n - LIBRES) * PALIER_MS, 8000);
}
function noterEchec(cle: string) {
  const maintenant = Date.now();
  const e = essais.get(cle);
  essais.set(cle, e && maintenant - e.vu <= FENETRE_MS
    ? { n: e.n + 1, vu: maintenant } : { n: 1, vu: maintenant });
  // Ménage opportuniste : on ne garde pas les vieilles entrées en mémoire.
  if (essais.size > 5000) {
    for (const [k, v] of essais) if (maintenant - v.vu > FENETRE_MS) essais.delete(k);
  }
}

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
  const cle = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "global";
  const frein = freinPour(cle);
  if (frein) await new Promise((r) => setTimeout(r, frein));

  if (!propose || !(await egaliteConstante(propose, attendu))) {
    noterEchec(cle);
    return Response.json({ erreur: erreurApi(langue, "motDePasseIncorrect") }, { status: 401 });
  }
  essais.delete(cle);   // une réussite efface l'ardoise

  const jeton = await signerSession(secret);
  const boite = await cookies();
  boite.set(COOKIE_SESSION, jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return Response.json({ ok: true });
}
