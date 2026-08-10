// Les six chiffres, vérifiés — et le compte qui naît juste derrière.
//
// CETTE ROUTE EST OUVERTE, POUR LA MÊME RAISON QUE SA VOISINE : la personne
// n'a pas encore de compte, elle est en train d'en obtenir un. Elle n'appelle
// donc pas la garde, et l'exception doit être inscrite dans
// `tests/test_garde_partout.py`. Ce qui la garde à la place : le jeton
// d'invitation, la limite de demandes, et la courbe d'attente.
//
// L'ORDRE DES CONTRÔLES N'EST PAS INDIFFÉRENT
// On regarde si la porte est lente AVANT de comparer quoi que ce soit. Un
// code faux ne trouve aucune ligne et repart tout de suite ; un code juste
// trouve la sienne et se fait refuser par la lenteur. Les deux chemins n'ont
// donc pas la même durée, et quelqu'un qui chronomètre pendant une période de
// lenteur apprendrait lequel de ses codes était le bon — sans jamais entrer.
// Le contrôle posé en tête rend les deux réponses identiques.
//
// CE QUE LE REFUS NE DIT JAMAIS
// « Ces chiffres n'ouvrent pas » couvre deux situations que la porte ne
// distingue pas : le code est faux, ou il a déjà servi. Les séparer
// apprendrait à qui essaie que le code existait — et c'est précisément ce
// qu'un attaquant cherche à savoir.
//
// TROIS CHOSES ARRIVENT ENSEMBLE QUAND ÇA MARCHE, ET L'ORDRE COMPTE
// La personne, puis la CONSOMMATION de l'invitation, puis l'accès. La
// consommation est filtrée sur « pas encore consommée » : deux navigateurs
// qui valident au même instant ne peuvent pas ouvrir deux accès, c'est la
// base qui arbitre. Si elle échoue, on s'arrête avant de donner quoi que ce
// soit.

import { cookies } from "next/headers";
import { COOKIE_SESSION, signerSession } from "@/lib/session";
import { consommerInvitation, ouvrirInvitation } from "@/lib/invitations";
import { verifierCode } from "@/lib/code-entree";
import { ouvrirSession } from "@/lib/sessions";
import { contexteAppareil } from "@/lib/garde";
import { noterEntree } from "@/lib/entrees";
import { langueServeur } from "@/lib/langue-serveur";
import { attenteEnMots, textesCode } from "@/lib/textes/code";
import { attenteDeLaPorte } from "../lenteur";
import { donnerLAcces, personneDeLInvitation } from "../compte";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const langue = await langueServeur();
  const t = textesCode[langue];
  const secret = process.env.SESSION_SECRET || "";

  const corps = (await req.json().catch(() => null)) as
    { jeton?: unknown; code?: unknown } | null;
  const jeton = typeof corps?.jeton === "string" ? corps.jeton : "";
  const code = typeof corps?.code === "string" ? corps.code : "";

  if (!jeton || !secret) {
    return Response.json(
      { refus: "indisponible", erreur: t.refus.indisponible.titre }, { status: 503 });
  }

  const inv = await ouvrirInvitation(jeton);
  if (typeof inv === "string") {
    return Response.json({ refus: "invitation", echec: inv }, { status: 409 });
  }

  const { appareil, lieu } = await contexteAppareil();

  // --- La lenteur, AVANT la comparaison. Voir l'en-tête. --------------------
  const attente = await attenteDeLaPorte(inv.courriel);
  if (attente > 0) {
    await noterEntree({
      commerce: inv.commerce, issue: "ralentie", moyen: "courriel", appareil, lieu,
    });
    return Response.json({
      refus: "lent", attente,
      erreur: t.refus.lent.titre(attenteEnMots(attente, langue)),
    }, { status: 429 });
  }

  const verdict = await verifierCode(code, inv.courriel);

  if (!verdict.ok) {
    if (verdict.raison === "lent") {
      await noterEntree({
        commerce: inv.commerce, issue: "ralentie", moyen: "courriel", appareil, lieu,
      });
      return Response.json({
        refus: "lent", attente: verdict.attente,
        erreur: t.refus.lent.titre(attenteEnMots(verdict.attente, langue)),
      }, { status: 429 });
    }
    if (verdict.raison === "expire") {
      await noterEntree({
        commerce: inv.commerce, issue: "expiree", moyen: "courriel", appareil, lieu,
      });
      return Response.json({
        refus: "expire", erreur: t.refus.expire.titre,
      }, { status: 410 });
    }
    // « faux » et « inconnu » repartent EXACTEMENT pareil : même refus, même
    // phrase, même code de réponse, même journal. Distinguer un code faux
    // d'un code déjà servi apprendrait à qui essaie que le code existait.
    await noterEntree({
      commerce: inv.commerce, issue: "refusee", moyen: "courriel", appareil, lieu,
    });
    return Response.json({ refus: "faux", erreur: t.refus.faux.titre }, { status: 401 });
  }

  // --- L'adresse a répondu : le compte naît --------------------------------
  const personne = await personneDeLInvitation(inv);
  if (!personne) {
    return Response.json(
      { refus: "indisponible", erreur: t.refus.indisponible.titre }, { status: 503 });
  }
  if (personne.etat !== "actif") {
    await noterEntree({
      personne: personne.id, commerce: inv.commerce,
      issue: "refusee", moyen: "courriel", appareil, lieu,
    });
    return Response.json(
      { refus: "ferme", erreur: t.refus.ferme.titre }, { status: 403 });
  }

  const consommee = await consommerInvitation(inv.id, personne.id);
  if (!consommee) {
    // Quelqu'un a validé entre-temps. La page de l'invitation sait le dire :
    // « quelqu'un a ouvert cette invitation avant vous », et jamais « lien
    // invalide », qui pousse à réessayer au lieu de prévenir.
    return Response.json({ refus: "invitation", echec: "deja_ouverte" }, { status: 409 });
  }

  if (!await donnerLAcces(personne.id, inv)) {
    return Response.json(
      { refus: "indisponible", erreur: t.refus.indisponible.titre }, { status: 503 });
  }

  // L'appareil n'est pas encore déclaré partagé ou personnel : la question se
  // pose à l'écran suivant, et c'est lui qui raccourcira la session si ce
  // téléphone est celui du comptoir.
  const session = await ouvrirSession({
    personne: personne.id, commerce: inv.commerce, role: inv.role,
    appareil, lieu, partage: false,
  });
  if (!session) {
    return Response.json(
      { refus: "indisponible", erreur: t.refus.indisponible.titre }, { status: 503 });
  }

  await noterEntree({
    personne: personne.id, commerce: inv.commerce,
    issue: "invitation", moyen: "courriel", appareil, lieu,
  });

  const reste = new Date(session.expire_le).getTime() - Date.now();
  const signe = await signerSession(
    secret, { session: session.id, personne: personne.id, role: inv.role }, reste);
  (await cookies()).set(COOKIE_SESSION, signe, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: Math.floor(reste / 1000),
  });

  return Response.json({ ok: true, vers: `/invitation/${jeton}/facon` });
}
