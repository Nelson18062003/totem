import { cookies } from "next/headers";
import { COOKIE_SESSION, DUREE_MS, egaliteConstante, signerSession } from "@/lib/session";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";
import { contexteAppareil } from "@/lib/garde";
import { ouvrirSession } from "@/lib/sessions";
import { personneDuMotDePasse } from "@/lib/comptes";
import { noterEntree } from "@/lib/entrees";

export const dynamic = "force-dynamic";

/**
 * Ouvre une session.
 *
 * Le mot de passe reste celui du propriétaire (`TOTEM_MOT_DE_PASSE`, jamais
 * dans le code). Ce n'est PAS le code PIN Mobile Money — celui-là ne se
 * saisit qu'au moment d'une opération et n'est enregistré nulle part.
 *
 * CE QUI A CHANGÉ : la session ouverte est maintenant une LIGNE EN BASE, pas
 * seulement un jeton signé. Sans cela, « retirer l'accès de quelqu'un » ne
 * ferme rien : le jeton déjà remis reste valable jusqu'à son expiration.
 *
 * Ce chemin-ci est celui du propriétaire fondateur, le temps que les comptes
 * nominatifs et les invitations prennent le relais. Il crée donc une personne
 * réelle plutôt qu'un « proprietaire » abstrait : dès aujourd'hui, le journal
 * peut nommer qui a appuyé.
 */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = await req.json().catch(() => null);
  const propose = typeof corps?.motdepasse === "string" ? corps.motdepasse : "";
  // « Ce téléphone est-il à vous, ou à la boutique ? » Sur un combiné de
  // comptoir, la session se ferme le soir même.
  const partage = corps?.partage === true;

  const secret = process.env.SESSION_SECRET || "";
  const attendu = process.env.TOTEM_MOT_DE_PASSE || "";

  if (!secret || !attendu) {
    return Response.json(
      { erreur: erreurApi(langue, "connexionNonConfiguree") }, { status: 503 });
  }

  const { appareil, lieu } = await contexteAppareil();

  if (!propose || !egaliteConstante(propose, attendu)) {
    // Un refus se note, même — surtout — quand on ne sait pas qui a essayé :
    // c'est ce journal qui permettra de dire « cinq codes ont été essayés
    // hier soir » plutôt que de le laisser dans un fichier que nul ne lit.
    await noterEntree({ issue: "refusee", moyen: "mot_de_passe", appareil, lieu });
    return Response.json({ erreur: erreurApi(langue, "motDePasseIncorrect") }, { status: 401 });
  }

  const personne = await personneDuMotDePasse();
  if (!personne) {
    return Response.json(
      { erreur: erreurApi(langue, "connexionNonConfiguree") }, { status: 503 });
  }

  const session = await ouvrirSession({
    personne: personne.id, commerce: personne.commerce, role: personne.role,
    appareil, lieu, partage,
  });
  if (!session) {
    return Response.json(
      { erreur: erreurApi(langue, "connexionNonConfiguree") }, { status: 503 });
  }

  await noterEntree({
    personne: personne.id, commerce: personne.commerce,
    issue: "ouverte", moyen: "mot_de_passe", appareil, lieu,
  });

  const jeton = await signerSession(
    secret,
    { session: session.id, personne: personne.id, role: personne.role },
    new Date(session.expire_le).getTime() - Date.now(),
  );
  const boite = await cookies();
  boite.set(COOKIE_SESSION, jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    // Le cookie ne survit pas au jeton : un cookie plus vieux que la session
    // qu'il porte ne fait que produire des refus incompréhensibles.
    maxAge: Math.floor((new Date(session.expire_le).getTime() - Date.now()) / 1000)
      || Math.floor(DUREE_MS / 1000),
  });
  return Response.json({ ok: true });
}
