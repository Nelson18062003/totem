// Entrer avec le verrouillage de son téléphone.
//
// C'est le chemin de tous les jours, et la porte est OUVERTE : il faut bien
// pouvoir arriver ici sans être encore entré. Le middleware la laisse donc
// passer, comme « /api/connexion ».
//
// GET donne la phrase à signer. POST rapporte la signature, et si elle tient,
// la session s'ouvre.
//
// CE QUI EST DIT QUAND ÇA REFUSE
// « Ça n'a pas marché », et rien de plus précis. Pas « cette clé a été
// retirée », qui apprend à qui essaie que le compte existe ; pas « clé
// inconnue », qui apprend l'inverse. Le seul cas qu'on traite à part est
// invisible pour la personne : le compteur qui recule, qui part au journal
// parce qu'il veut dire qu'une clé a été copiée.

import { cookies, headers } from "next/headers";
import { COOKIE_SESSION, signerSession } from "@/lib/session";
import { entrerParCle, lieuDepuis, optionsEntree } from "@/lib/cles";
import { ouvrirSession } from "@/lib/sessions";
import { contexteAppareil } from "@/lib/garde";
import { noterEntree } from "@/lib/entrees";
import { accesDeOuPlateforme } from "@/lib/plateforme";
import { langueServeur } from "@/lib/langue-serveur";
import { lireUne } from "@/lib/base";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

const DIT = {
  fr: {
    rate: "Ça n'a pas marché. Vous pouvez réessayer, ou entrer par mail.",
    ailleurs: "L'adresse du site n'a pas pu être établie.",
    ferme: "Ce compte n'est pas ouvert. Prévenez la personne qui vous a invité.",
  },
  en: {
    rate: "That did not work. Try again, or sign in by email.",
    ailleurs: "The site address could not be established.",
    ferme: "This account is not open. Tell the person who invited you.",
  },
} as const;

async function ou() {
  const h = await headers();
  return lieuDepuis(h.get("host"), h.get("x-forwarded-proto"));
}

export async function GET() {
  const langue = await langueServeur();
  const lieu = await ou();
  if (!lieu) return Response.json({ erreur: DIT[langue].ailleurs }, { status: 503 });
  const options = await optionsEntree(lieu);
  if (!options) return Response.json({ erreur: DIT[langue].ailleurs }, { status: 503 });
  return Response.json(options);
}

export async function POST(req: Request) {
  const langue = await langueServeur();
  const dit = DIT[langue];
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return Response.json({ erreur: dit.ailleurs }, { status: 503 });

  const lieu = await ou();
  if (!lieu) return Response.json({ erreur: dit.ailleurs }, { status: 503 });

  const corps = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null;
  const { appareil, lieu: endroit } = await contexteAppareil();
  if (!corps?.id) {
    await noterEntree({ issue: "refusee", moyen: "cle", appareil, lieu: endroit });
    return Response.json({ erreur: dit.rate }, { status: 400 });
  }

  const r = await entrerParCle(corps, lieu);
  if (!r.ok) {
    await noterEntree({ issue: "refusee", moyen: "cle", appareil, lieu: endroit });
    return Response.json({ erreur: dit.rate }, { status: 401 });
  }

  // La signature prouve l'appareil. Elle ne dit RIEN du droit d'entrer : une
  // personne partie, suspendue, ou dont la clé a été reprise garde un
  // téléphone qui signe parfaitement. Le droit se relit en base, à chaque
  // fois.
  const personne = await lireUne<{ id: number; nom: string; etat: string }>(
    `personnes?id=eq.${r.personne}&select=id,nom,etat&limit=1`);
  // « accesDe » ne connaît que les commerces : un administrateur de
  // plateforme n'en a aucun, et se ferait refuser ici. Sans cette ligne, le
  // super-administrateur n'entre QUE par le courriel — l'exact inverse de la
  // règle de sa propre porte, où le doigt passe avant tout.
  const acces = await accesDeOuPlateforme(r.personne);
  if (!personne || personne.etat !== "actif" || !acces) {
    await noterEntree({
      personne: r.personne, issue: "refusee", moyen: "cle", appareil, lieu: endroit,
    });
    return Response.json({ erreur: dit.ferme }, { status: 403 });
  }

  const session = await ouvrirSession({
    personne: personne.id, commerce: acces.commerce, role: acces.role,
    appareil, lieu: endroit,
    // Jamais partagé : une clé ne vit que sur un appareil personnel, c'est la
    // condition à laquelle elle a été posée.
    partage: false,
  });
  if (!session) return Response.json({ erreur: dit.ailleurs }, { status: 503 });

  await noterEntree({
    personne: personne.id, commerce: acces.commerce,
    issue: "ouverte", moyen: "cle", appareil, lieu: endroit,
  });

  const jeton = await signerSession(
    secret,
    { session: session.id, personne: personne.id, role: acces.role },
    new Date(session.expire_le).getTime() - Date.now(),
  );
  const boite = await cookies();
  boite.set(COOKIE_SESSION, jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: Math.floor((new Date(session.expire_le).getTime() - Date.now()) / 1000),
  });
  return Response.json({ ok: true, nom: personne.nom });
}
