import { egaliteConstante, signerSession } from "@/lib/session";
import { attendreLeFrein, cleDeFrein, noterEchec, oublierEchecs } from "@/lib/frein";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * La porte de l'application du téléphone.
 *
 * Même mot de passe, même secret, même signature que l'écran du navigateur —
 * seule la façon de RANGER le jeton diffère. Le navigateur reçoit un cookie
 * que le serveur pose lui-même ; l'application, elle, n'a pas de cookie : on
 * lui rend le jeton dans le corps de la réponse, et elle le range dans le
 * coffre du système (celui qu'ouvre le doigt ou le visage).
 *
 * Ce n'est PAS le code PIN Mobile Money. Celui-là ne se saisit qu'au moment
 * d'une opération et ne s'enregistre nulle part.
 *
 * Pourquoi une route séparée plutôt qu'un drapeau sur `/api/connexion` :
 * l'écran du navigateur fonctionne, il est le chemin de tous les jours, et
 * on ne touche pas à ce qui porte déjà le poids. Les deux routes partagent
 * ce qui doit l'être — le secret, la signature, et le frein.
 */
export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const corps = await req.json().catch(() => null);
  const propose = typeof corps?.motdepasse === "string" ? corps.motdepasse : "";

  const secret = process.env.SESSION_SECRET || "";
  const attendu = process.env.TOTEM_MOT_DE_PASSE || "";

  // Sans configuration, aucune session ne peut s'ouvrir. On répond
  // franchement plutôt que de laisser l'application deviner.
  if (!secret || !attendu) {
    return Response.json(
      { erreur: erreurApi(langue, "connexionNonConfiguree") }, { status: 503 });
  }

  // Le même seau que `/api/connexion` : alterner les deux portes ne double
  // pas la cadence des essais.
  const cle = cleDeFrein(req);
  await attendreLeFrein(cle);

  if (!propose || !(await egaliteConstante(propose, attendu))) {
    noterEchec(cle);
    return Response.json(
      { erreur: erreurApi(langue, "motDePasseIncorrect") }, { status: 401 });
  }
  oublierEchecs(cle);

  // Le sujet dit d'où vient le jeton. La vérification ne s'en sert pas — un
  // jeton reste un jeton — mais le jour où l'on voudra révoquer les seuls
  // téléphones, c'est cette marque qui les distinguera.
  const jeton = await signerSession(secret, "telephone");

  // L'échéance est rendue en clair pour que l'application sache se
  // reconnecter AVANT d'être refusée, plutôt qu'après un écran vide.
  const [, expiration] = jeton.split(".");
  return Response.json({ jeton, expire: Number(expiration) });
}
