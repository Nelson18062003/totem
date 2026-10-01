import { carteDeLaCommande, lireCommande } from "@/lib/serveur";
import { maniement, TOUT, voitLaCarte } from "@/lib/portee";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/** Où en est une demande : en attente, en cours, faite, échouée. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const langue = await langueServeur();
  // LA MÊME MAIN QUE LE DÉPÔT. Lire une demande, c'est lire la réponse de
  // l'opérateur — un solde, un nom, une référence — et, fugitivement, ce
  // qu'on y a tapé. Un titulaire lit donc les demandes de SES cartes, et
  // aucune autre : sans ce contrôle, il énumérerait les identifiants et
  // lirait les opérations des autres.
  const main = process.env.SESSION_SECRET ? await maniement(req) : TOUT;
  if (!main) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  const { id } = await params;
  const numero = Number.parseInt(id, 10);
  if (!Number.isInteger(numero) || numero <= 0) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  if (!main.tout) {
    const carte = await carteDeLaCommande(numero);
    // Introuvable ou pas à lui : la même réponse — on ne dit pas qu'elle
    // existe ailleurs.
    if (!carte || !voitLaCarte(main, carte)) {
      return Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
    }
  }
  const commande = await lireCommande(numero);
  if (!commande) {
    return Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
  }
  return Response.json(commande);
}
