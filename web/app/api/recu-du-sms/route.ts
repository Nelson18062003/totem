import { recuDuSms } from "@/lib/serveur";
import { RIEN, porteeDe } from "@/lib/portee";

export const dynamic = "force-dynamic";

/**
 * « Le reçu de ce SMS est-il là ? » — `GET /api/recu-du-sms?id=…`.
 *
 * La fiche d'un SMS d'argent tout juste arrivé le demande quelques fois, sur
 * une minute au plus, pendant qu'elle affiche « Reçu en préparation… ». La
 * réponse ne porte que le numéro (ou rien) : c'est tout ce qu'il faut pour
 * basculer sur « Partager le reçu », et c'est mille fois plus léger que de
 * relire toute la caisse.
 *
 * Hors portée, ou dans la démonstration (qui ne voit rien de la maison) :
 * `null`, comme pour un reçu qui n'existe pas — la question ne dit rien de
 * plus que ce que la personne a le droit de savoir.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const recu = Number.isInteger(id) && id > 0
    ? await recuDuSms(id, (await porteeDe(req)) ?? RIEN)
    : null;
  return Response.json({ recu }, { headers: { "cache-control": "private, no-store" } });
}
