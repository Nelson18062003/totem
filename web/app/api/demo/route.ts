import { langueDemandee } from "@/lib/langue-serveur";
import { estProprietaire } from "@/lib/qui";
import { garder, estRefus } from "@/lib/garde";
import { sujetDe } from "@/lib/portee";
import { dansLaDemoVivante, dansLaMaison, demoVivanteOuverte, mondeEnCours } from "@/lib/monde";
import {
  declarerFloat, deposerChezGlisil, etatDeLaDemo, fabriquerDesFrancs, payerLesSortiesDeDemo,
} from "@/lib/demo-vivante";
import { creerUtilisateur, listerUtilisateurs, relie, utilisateurAVerifier } from "@/lib/serveur";
import { courrielAcceptable, empreinter, motDePasseAcceptable, normaliserCourriel } from "@/lib/motdepasse";
import type { Langue } from "@noyau/langue";

export const dynamic = "force-dynamic";

/**
 * LA DÉMO VIVANTE — l'écran de son administrateur, et sa naissance.
 *
 * Deux mains, deux mondes, et jamais l'une à la place de l'autre :
 *
 *   — DANS LA DÉMO, son administrateur (le « propriétaire » de la démo) voit
 *     toutes les cartes de démo, fabrique des francs, déclare les floats de
 *     test de Glisil, relance la file vers Glisil ;
 *   — DANS LA MAISON, le vrai propriétaire de TOTEM (ou la clé de secours)
 *     crée cet administrateur, une fois. Il ne voit rien d'autre de la démo :
 *     ce ne sont pas ses cartes.
 *
 * Un testeur n'a rien à faire ici : 403.
 */

const MOTS: Record<Langue, Record<string, string>> = {
  fr: {
    reserve: "Réservé à l'administrateur de la démo.",
    fermee: "La démo vivante est fermée.",
    base: "La base n'est pas reliée.",
    courriel: "Adresse invalide.",
    motdepasse: "Mot de passe trop court.",
    nom: "Prénom et nom, s'il vous plaît.",
    pris: "Cette adresse a déjà un compte (dans la maison ou dans la démo).",
    deja: "La démo a déjà son administrateur.",
    impossible: "La base n'a pas répondu.",
    action: "Demande inconnue.",
  },
  en: {
    reserve: "Reserved to the demo administrator.",
    fermee: "The live demo is closed.",
    base: "The database is not connected.",
    courriel: "Invalid address.",
    motdepasse: "Password too short.",
    nom: "First and last name, please.",
    pris: "This address already has an account (in the house or in the demo).",
    deja: "The demo already has its administrator.",
    impossible: "The database did not answer.",
    action: "Unknown request.",
  },
};

async function administrateurExiste(): Promise<boolean> {
  return dansLaDemoVivante(async () =>
    (await listerUtilisateurs()).some((u) => u.role === "proprietaire"));
}

const refus = (langue: Langue, mot: string, statut: number) =>
  Response.json({ erreur: MOTS[langue][mot] }, { status: statut });

export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  if (!demoVivanteOuverte()) return refus(langue, "fermee", 404);
  if (!relie) return refus(langue, "base", 503);
  if ((await mondeEnCours()) === "demo") {
    if (!(await estProprietaire(req))) return refus(langue, "reserve", 403);
    // Chaque visite de l'écran relance aussi la file : ce qui n'est pas
    // parti chez Glisil repart, sans attendre un geste.
    await deposerChezGlisil();
    await payerLesSortiesDeDemo();
    return Response.json({ face: "demo", ...(await etatDeLaDemo()) });
  }
  const g = await garder("administrer", req);
  if (estRefus(g)) return g.refus;
  // Le vrai propriétaire apprend seulement si la démo a son administrateur.
  return Response.json({ face: "maison", administrateur: await administrateurExiste() });
}

export async function POST(req: Request) {
  const langue = await langueDemandee(req);
  if (!demoVivanteOuverte()) return refus(langue, "fermee", 404);
  if (!relie) return refus(langue, "base", 503);
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof corps?.action === "string" ? corps.action : "";

  if ((await mondeEnCours()) === "demo") {
    if (!(await estProprietaire(req))) return refus(langue, "reserve", 403);
    const iccid = typeof corps?.iccid === "string" ? corps.iccid : "";
    if (action === "fabriquer") {
      const montant = typeof corps?.montant === "number" ? corps.montant : NaN;
      const v = await fabriquerDesFrancs(iccid, montant, (await sujetDe(req)) ?? "");
      return v.ok ? Response.json(v) : Response.json({ erreur: v.raison }, { status: 400 });
    }
    if (action === "float") {
      const ok = await declarerFloat(iccid, corps?.float === true);
      return ok ? Response.json({ ok: true }) : refus(langue, "impossible", 400);
    }
    if (action === "glisil") {
      return Response.json({ ok: true, tranchees: await deposerChezGlisil() });
    }
    return refus(langue, "action", 400);
  }

  // DANS LA MAISON : le vrai propriétaire crée l'administrateur de la démo.
  const g = await garder("administrer", req);
  if (estRefus(g)) return g.refus;
  if (action !== "administrateur") return refus(langue, "action", 400);
  const courriel = normaliserCourriel(corps?.courriel);
  if (!courrielAcceptable(courriel)) return refus(langue, "courriel", 400);
  const motdepasse = typeof corps?.motdepasse === "string" ? corps.motdepasse : "";
  if (!motDePasseAcceptable(motdepasse)) return refus(langue, "motdepasse", 400);
  const nettoyer = (v: unknown) =>
    typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const prenom = nettoyer(corps?.prenom);
  const nom = nettoyer(corps?.nom);
  if (!prenom || !nom) return refus(langue, "nom", 400);
  // Une adresse de la maison ne peut pas être celle de la démo : la porte
  // cherche d'abord dans la maison, et ce compte de démo ne s'ouvrirait jamais.
  const [maison, demo] = await Promise.all([
    dansLaMaison(() => utilisateurAVerifier(courriel)),
    dansLaDemoVivante(() => utilisateurAVerifier(courriel)),
  ]);
  if (maison || demo) return refus(langue, "pris", 409);
  const empreinte = await empreinter(motdepasse);
  // L'index du propriétaire unique, copié sur le double, refuse un second
  // administrateur : la base tranche, pas cette ligne.
  const cree = await dansLaDemoVivante(() =>
    creerUtilisateur(courriel, empreinte, "proprietaire", true, { prenom, nom }));
  if (cree === "refuse") return refus(langue, "deja", 409);
  if (!cree) return refus(langue, "impossible", 502);
  return Response.json({ ok: true, id: cree.id });
}
