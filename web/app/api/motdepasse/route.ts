// Changer SON mot de passe — le sien, et aucun autre.
//
// LA PREUVE AVANT LE CHANGEMENT. On exige le mot de passe actuel, même d'une
// session valide : une session, c'est un téléphone resté ouvert sur une
// table. Sans cette preuve, quiconque ramasse l'appareil changerait la clé de
// la maison et mettrait le propriétaire dehors — avec elle, il ne peut que
// s'en servir, ce qui se répare en fermant le compte.
//
// LE MÊME FREIN QUE LA PORTE. Essayer des mots de passe ici doit coûter aussi
// cher que les essayer à la connexion : sinon cette route deviendrait le
// chemin le moins défendu vers la même serrure.
//
// PAS DE COURRIEL, PAS DE LIEN, PAS DE RÉINITIALISATION. Le mot de passe se
// change connecté, ou par le propriétaire (Réglages → Qui peut se connecter,
// qui sait déjà recréer un compte). Un courriel de réinitialisation est une
// porte de plus, et TOTEM n'envoie pas de courriels.

import { compteConnecte } from "@/lib/qui";
import { definirEmpreinte, utilisateurAVerifier } from "@/lib/serveur";
import {
  empreinter, motDePasseAcceptable, verifier,
} from "@/lib/motdepasse";
import { attendreLeFrein, cleDeFrein, noterEchec, oublierEchecs } from "@/lib/frein";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  const refus = (cle: Parameters<typeof erreurApi>[1], statut: number) =>
    Response.json({ erreur: erreurApi(langue, cle) }, { status: statut });

  // Qui parle ? Une session de compte, pas la clé de secours : elle ne
  // désigne personne en base, elle n'a donc pas de mot de passe à changer.
  const moi = await compteConnecte(req);
  if (!moi) return refus("reserveAuProprietaire", 403);

  const corps = (await req.json().catch(() => null)) as
    { actuel?: unknown; nouveau?: unknown } | null;
  const actuel = typeof corps?.actuel === "string" ? corps.actuel : "";
  const nouveau = typeof corps?.nouveau === "string" ? corps.nouveau : "";

  if (!motDePasseAcceptable(nouveau)) return refus("motDePasseTropCourt", 400);

  // Le frein, AVANT le calcul de l'empreinte — même mur que la connexion.
  const cle = cleDeFrein(req);
  if (!(await attendreLeFrein(cle))) return refus("tropDEssais", 429);

  const trouve = await utilisateurAVerifier(moi.courriel);
  if (!trouve || !(await verifier(actuel, trouve.empreinte))) {
    noterEchec(cle);
    return refus("identifiantsIncorrects", 401);
  }
  oublierEchecs(cle);

  const fait = await definirEmpreinte(moi.id, await empreinter(nouveau));
  if (!fait) return refus("inscriptionImpossible", 502);
  return Response.json({ ok: true });
}
