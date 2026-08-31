import { lireCommande } from "@/lib/serveur";
import { estProprietaire } from "@/lib/qui";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/** Où en est une demande : en attente, en cours, faite, échouée. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const langue = await langueServeur();
  // AU PROPRIÉTAIRE SEUL. Le POST qui DÉPOSE une commande est réservé au
  // propriétaire ; sa lecture ne l'était pas — un invité pouvait énumérer
  // les identifiants et lire le champ « resultat » d'une demande, qui porte
  // FUGITIVEMENT le code secret avant que le robot ne le masque en base
  // (voir le POST). On ferme la porte du même verrou.
  if (process.env.SESSION_SECRET && !(await estProprietaire(req))) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  const { id } = await params;
  const numero = Number.parseInt(id, 10);
  if (!Number.isInteger(numero) || numero <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const commande = await lireCommande(numero);
  if (!commande) {
    return Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
  }
  return Response.json(commande);
}
