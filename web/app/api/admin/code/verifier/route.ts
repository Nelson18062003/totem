// Les six chiffres du secours, vérifiés — et la session de la console ouverte.
//
// CETTE ROUTE EST OUVERTE, POUR LA MÊME RAISON QUE SA VOISINE : la personne
// n'est pas entrée, elle est en train d'entrer. L'exception est à inscrire
// dans `tests/test_garde_partout.py`.
//
// L'ORDRE DES CONTRÔLES N'EST PAS INDIFFÉRENT, ET C'EST TOUT LE FICHIER
//
// 1. LA LENTEUR D'ABORD, AVANT DE COMPARER QUOI QUE CE SOIT. `verifierCode`
//    cherche la ligne PAR l'empreinte du code : un code faux ne trouve rien et
//    repart tout de suite, un code juste trouve sa ligne et se fait refuser
//    par la lenteur. Les deux chemins n'ont donc pas la même durée, et qui
//    chronomètre pendant une pause apprendrait lequel de ses codes était bon
//    sans jamais entrer. Le contrôle posé en tête rend les deux réponses
//    identiques.
//
// 2. L'ATTENTE DU SECOURS ENSUITE, et elle ne regarde jamais le code présenté :
//    elle demande seulement si un code vient d'être émis pour cette adresse.
//    La réponse est donc la même pour un code juste et pour un code faux.
//
// 3. LE DROIT D'ÊTRE ADMINISTRATEUR EN DERNIER, après que le code a été
//    consommé. Un code juste sur une adresse qui n'administre pas repart avec
//    EXACTEMENT le refus d'un code faux — sinon la porte dirait « bonne
//    adresse, mauvais compte », c'est-à-dire tout.
//
// CE QUE LE REFUS DISTINGUE, ET POURQUOI C'EST PERMIS (arbitrage 3)
// Faux et périmé ne sont pas confondus. Savoir qu'un code a expiré n'apprend
// rien à un inconnu — il n'a pas de code — et évite à la personne de
// recommencer dix fois avec une vieille lettre. Ce que la porte tait, c'est
// l'existence du compte, et cela elle le tait dans les quatre cas.

import { cookies } from "next/headers";
import { COOKIE_SESSION, signerSession } from "@/lib/session";
import { verifierCode } from "@/lib/code-entree";
import { ouvrirSession } from "@/lib/sessions";
import { contexteAppareil } from "@/lib/garde";
import { noterEntree } from "@/lib/entrees";
import { langueServeur } from "@/lib/langue-serveur";
import { textesAdminPorte } from "@/lib/textes/admin-porte";
import {
  attenteDuSecours, estAdministrateur, personneParAdresse,
} from "@/lib/plateforme";
import { attenteDeLaPorte } from "../../../code/lenteur";

export const dynamic = "force-dynamic";

/** « 3 minutes », « 40 secondes » — jamais « 180000 ms ». */
function enMots(ms: number, langue: "en" | "fr"): string {
  const secondes = Math.max(1, Math.round(ms / 1000));
  if (secondes < 90) {
    return langue === "en" ? `${secondes} seconds` : `${secondes} secondes`;
  }
  const minutes = Math.round(secondes / 60);
  return langue === "en" ? `${minutes} minutes` : `${minutes} minutes`;
}

export async function POST(req: Request) {
  const langue = await langueServeur();
  const t = textesAdminPorte[langue];
  const secret = process.env.SESSION_SECRET || "";

  const corps = (await req.json().catch(() => null)) as
    { courriel?: unknown; code?: unknown } | null;
  const courriel = typeof corps?.courriel === "string" ? corps.courriel : "";
  const code = typeof corps?.code === "string" ? corps.code : "";

  if (!courriel || !code || !secret) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 503 });
  }

  const { appareil, lieu } = await contexteAppareil();

  // --- 1. La lenteur, avant toute comparaison. Voir l'en-tête. -------------
  const lenteur = await attenteDeLaPorte(courriel);
  if (lenteur > 0) {
    await noterEntree({ issue: "ralentie", moyen: "courriel", appareil, lieu });
    return Response.json(
      { erreur: t.refus.lent(enMots(lenteur, langue)) }, { status: 429 });
  }

  // --- 2. L'attente du secours : la lettre doit avoir le temps d'arriver ---
  const attente = await attenteDuSecours(courriel);
  if (attente > 0) {
    return Response.json(
      { erreur: t.code.attente(Math.ceil(attente / 1000)) }, { status: 425 });
  }

  const verdict = await verifierCode(code, courriel);

  if (!verdict.ok) {
    if (verdict.raison === "lent") {
      await noterEntree({ issue: "ralentie", moyen: "courriel", appareil, lieu });
      return Response.json(
        { erreur: t.refus.lent(enMots(verdict.attente, langue)) }, { status: 429 });
    }
    if (verdict.raison === "expire") {
      await noterEntree({ issue: "expiree", moyen: "courriel", appareil, lieu });
      return Response.json({ erreur: t.refus.expire }, { status: 410 });
    }
    // « faux » et « inconnu » repartent à l'identique : distinguer un code faux
    // d'un code déjà servi apprendrait à qui essaie que le code existait.
    await noterEntree({ issue: "refusee", moyen: "courriel", appareil, lieu });
    return Response.json({ erreur: t.refus.faux }, { status: 401 });
  }

  // --- 3. Le droit d'entrer, relu EN BASE ----------------------------------
  // Le code juste ne prouve que la boîte aux lettres. Il ne dit rien du droit
  // d'administrer, et ce droit a pu être repris ce matin.
  const personne = await personneParAdresse(courriel);
  if (!personne || !(await estAdministrateur(personne))) {
    await noterEntree({
      personne: personne?.id ?? null, issue: "refusee", moyen: "courriel", appareil, lieu,
    });
    // Le MÊME refus qu'un code faux. Voir l'en-tête, point 3.
    return Response.json({ erreur: t.refus.faux }, { status: 401 });
  }

  // Un administrateur de plateforme n'a pas de commerce : il les regarde tous
  // et n'en possède aucun. `commerce: null` est donc la vérité, pas un trou.
  const session = await ouvrirSession({
    personne: personne.id,
    commerce: null,
    role: "admin",
    appareil, lieu,
    // Jamais partagé : la console ne s'ouvre pas sur un combiné de comptoir.
    partage: false,
  });
  if (!session) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 503 });
  }

  await noterEntree({
    personne: personne.id, issue: "ouverte", moyen: "courriel", appareil, lieu,
  });

  const reste = new Date(session.expire_le).getTime() - Date.now();
  const jeton = await signerSession(
    secret, { session: session.id, personne: personne.id, role: "admin" }, reste);
  (await cookies()).set(COOKIE_SESSION, jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: Math.floor(reste / 1000),
  });

  return Response.json({ ok: true });
}
