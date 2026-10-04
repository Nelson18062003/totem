import { langueDemandee } from "@/lib/langue-serveur";
import { compteConnecte } from "@/lib/qui";
import { maniement, TOUT, voitLaCarte } from "@/lib/portee";
import {
  beneficiaireParId, enregistrerBeneficiaire, relie, renommerBeneficiaire,
  supprimerBeneficiaire,
} from "@/lib/serveur";
import { nomPropre, numeroPropre } from "@noyau/beneficiaires";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Le carnet des bénéficiaires d'une carte : enregistrer, renommer, retirer.
 *
 * LA MÊME MAIN QUE POUR COMPOSER. Celui qui tient la carte tient son carnet ;
 * le propriétaire tient tous les carnets. Sur la carte d'un autre, rien —
 * pas même savoir qu'un numéro y est enregistré : un identifiant qui n'est
 * pas à vous répond « introuvable », comme s'il n'existait pas.
 *
 * La lecture, elle, passe par `/api/donnees` (le carnet voyage avec le
 * reste, et tient donc aussi hors ligne sur le téléphone).
 */
export async function POST(req: Request) {
  // La langue de l'écran qui demande : le téléphone la dit dans l'adresse,
  // il n'a pas le cookie du site.
  const langue = await langueDemandee(req);
  const main = process.env.SESSION_SECRET ? await maniement(req) : TOUT;
  if (!main) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  const corps = await req.json().catch(() => null);
  const geste = corps?.geste;

  if (geste === "enregistrer") {
    const carte = typeof corps?.carte === "string" ? corps.carte.replace(/[^A-Za-z0-9]/g, "").slice(0, 32) : "";
    const numero = typeof corps?.numero === "string" ? numeroPropre(corps.numero) : "";
    const nom = typeof corps?.nom === "string" ? nomPropre(corps.nom) : "";
    if (!carte || !/^\d{8,15}$/.test(numero) || !nom) {
      return Response.json({ erreur: erreurApi(langue, "beneficiaireIncomplet") }, { status: 400 });
    }
    if (!voitLaCarte(main, carte)) {
      return Response.json({ erreur: erreurApi(langue, "carteNonConfiee") }, { status: 403 });
    }
    const par = (await compteConnecte(req))?.id ?? null;
    return (await enregistrerBeneficiaire(carte, numero, nom, par))
      ? Response.json({ ok: true })
      : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
  }

  if (geste === "renommer" || geste === "supprimer") {
    const id = Number(corps?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
    }
    const fiche = await beneficiaireParId(id);
    if (!fiche || !voitLaCarte(main, fiche.carte)) {
      return Response.json({ erreur: erreurApi(langue, "demandeIntrouvable") }, { status: 404 });
    }
    if (geste === "supprimer") {
      return (await supprimerBeneficiaire(id))
        ? Response.json({ ok: true })
        : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
    }
    const nom = typeof corps?.nom === "string" ? nomPropre(corps.nom) : "";
    if (!nom) {
      return Response.json({ erreur: erreurApi(langue, "beneficiaireIncomplet") }, { status: 400 });
    }
    return (await renommerBeneficiaire(id, nom))
      ? Response.json({ ok: true })
      : Response.json({ erreur: erreurApi(langue, "nonEnregistre") }, { status: 502 });
  }

  return Response.json({ erreur: erreurApi(langue, "demandeInconnue") }, { status: 400 });
}
