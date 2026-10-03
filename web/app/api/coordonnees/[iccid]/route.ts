import { chargerDonnees } from "@/lib/serveur";
import { TOUT, porteeDe } from "@/lib/portee";
import { langueDemandee } from "@/lib/langue-serveur";
import { pdfCoordonnees } from "@/lib/pdf-rib";
import { textesAccueil } from "@noyau/textes/accueil";
import { erreurApi } from "@noyau/textes/api";
import { serviceMobileMoney } from "@noyau/coordonnees";

export const dynamic = "force-dynamic";

/**
 * La fiche des coordonnées d'une carte, en PDF — le « RIB » de la SIM.
 *
 * Sur le web, ce document s'assemble dans le navigateur (même générateur,
 * `lib/pdf-rib`) ; le téléphone, lui, le TÉLÉCHARGE pour le partager comme un
 * fichier (`mobile/src/partage.ts`), sans cookie ni jeton — d'où cette route,
 * atteignable par un lien signé de dix minutes (voir lib/lien-signe.ts,
 * genre « coordonnees »). UN générateur, UN document : le PDF du téléphone
 * est celui du web — numéro mis en forme compris, depuis que c'est le
 * générateur qui s'en charge.
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
  // Avec une session : la carte doit être dans SA portée. Sans session, la
  // main tient un lien signé — et un lien ne se signe que pour une carte que
  // le demandeur voit (voir …/lien) : la signature EST la vérification.
  const portee = (await porteeDe(req)) ?? TOUT;
  const { sims } = await chargerDonnees(langue, portee, { sms: 0, recus: 0 });
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
    service: serviceMobileMoney(carte.operateur),
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
