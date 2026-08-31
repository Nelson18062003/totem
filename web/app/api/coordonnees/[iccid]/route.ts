import { chargerDonnees } from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { pdfCoordonnees } from "@/lib/pdf-rib";
import { textesAccueil } from "@noyau/textes/accueil";
import { erreurApi } from "@noyau/textes/api";
import { exigerSessionOuLien, refusApi } from "@/lib/garde";

export const dynamic = "force-dynamic";

/** Le nom commercial du service — la ligne « réseau » de la fiche. */
function service(operateur: string): string {
  if (operateur === "MTN") return "MTN Mobile Money";
  if (operateur === "Orange") return "Orange Money";
  return operateur || "Mobile Money";
}

/**
 * La fiche des coordonnées d'une carte, en PDF — le « RIB » de la SIM.
 *
 * Sur le web, ce document s'assemble dans le navigateur (même générateur,
 * `lib/pdf-rib`) ; le téléphone, lui, l'ouvre dans le navigateur du système,
 * qui n'a ni cookie ni jeton — d'où cette route, atteignable par un lien
 * signé de dix minutes (voir lib/lien-signe.ts, genre « coordonnees »).
 * UN générateur, UN document : le PDF du téléphone est celui du web.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ iccid: string }> },
) {
  const langue = await langueDemandee(req);
  const { iccid } = await params;
  // La forme d'un ICCID, rien d'autre — pas de « / », pas de « ? ».
  if (!/^\w{1,32}$/.test(iccid)) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }

  // Une session vivante, ou le laissez-passer signé pour CETTE carte.
  const moi = await exigerSessionOuLien(req, "coordonnees", iccid);
  if (!moi.ok) return refusApi(moi.statut, langue);

  const { sims } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  const carte = sims.find((s) => s.iccid === iccid);
  if (!carte) {
    return Response.json(
      { erreur: erreurApi(langue, "identifiantInvalide") }, { status: 404 });
  }

  const t = textesAccueil[langue];
  const nom = carte.nom.trim();
  const pdf = pdfCoordonnees({
    nom,
    numero: carte.numero,
    operateur: carte.operateur,
    service: service(carte.operateur),
    libelle: carte.libelle,
    titre: t.coordonneesTitre,
    etiquetteNom: t.coordNom,
    etiquetteNumero: t.coordNumero,
    etiquetteReseau: t.coordReseau,
    pied: t.coordPied,
  });

  // Le même nom de fichier que le bouton « Télécharger » du web.
  const fichier =
    `totem-${(nom || carte.libelle).replace(/[^\w]+/g, "-").toLowerCase()}.pdf`;
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fichier}"`,
      // Le nom ou le numéro peuvent changer dans les réglages : jamais de
      // cache, le document montré est toujours celui d'aujourd'hui.
      "cache-control": "private, no-store",
    },
  });
}
