import { cookies } from "next/headers";
import { COOKIE_SESSION, lireSession } from "@/lib/session";
import { fermerSession, fermerToutesLesSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

/**
 * Ferme la session.
 *
 * CE QUI A CHANGÉ : cette route effaçait un cookie, et rien d'autre. C'était
 * un geste cosmétique — un jeton recopié ailleurs (une extension, un profil
 * de navigateur synchronisé, un ordinateur partagé) restait valable jusqu'à
 * son expiration. Quelqu'un qui prêtait sa tablette et appuyait sur « se
 * déconnecter » était rassuré à tort.
 *
 * Maintenant la session est fermée EN BASE. Et tant qu'elle ne l'était pas,
 * l'écran n'avait pas le droit d'écrire « déconnecté » : ç'aurait été mentir.
 *
 * Avec `{ partout: true }`, toutes les sessions de la personne tombent — le
 * geste de `C8`, celui qu'on fait quand le téléphone est dans d'autres mains.
 * Il ne demande aucune preuve supplémentaire, volontairement : fermer une
 * porte n'a jamais nui à personne, et exiger une preuve de quelqu'un qui
 * vient de se faire arracher son téléphone, c'est lui refuser le seul geste
 * utile.
 */
export async function POST(req: Request) {
  const corps = await req.json().catch(() => null);
  const partout = corps?.partout === true;

  const secret = process.env.SESSION_SECRET || "";
  const boite = await cookies();
  const charge = await lireSession(secret, boite.get(COOKIE_SESSION)?.value);

  if (charge) {
    if (partout) await fermerToutesLesSessions(charge.personne, "tout_fermer");
    else await fermerSession(charge.session, "sortie");
  }

  boite.delete(COOKIE_SESSION);
  return Response.json({ ok: true, partout });
}
