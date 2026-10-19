import { chargerRecu, recuVisible } from "@/lib/serveur";
import { verifierLien } from "@/lib/lien-signe";
import { dansLaDemoVivante } from "@/lib/monde";
import { porteeDe } from "@/lib/portee";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

/**
 * Sert le reçu PDF archivé par le robot. On part du numéro de reçu : la fiche
 * en base donne le chemin de stockage — jamais un chemin venu du navigateur.
 * La clé d'accès reste côté serveur ; le navigateur ne voit que le document.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const langue = await langueServeur();
  const { numero } = await params;
  // La forme d'un numéro de reçu, rien d'autre — comme la fabrique du lien
  // signé (…/lien). `chargerRecu` nettoie déjà pour la base, et Node
  // assainit l'en-tête ; cette garde n'ajoute qu'une seconde barrière, pour
  // que le numéro qui atterrit dans « Content-Disposition » soit toujours
  // propre, quelle que soit la porte d'entrée.
  if (!/^[\w.-]{1,64}$/.test(numero)) {
    return new Response(erreurApi(langue, "recuIntrouvable"), { status: 404 });
  }
  // UN LIEN DE LA DÉMO VIVANTE (« m=demo ») : le téléphone l'ouvre SANS
  // session, donc hors de la démo. Sa signature est d'un autre genre
  // (« recu-demo ») : un lien de la maison ne s'y réécrit pas, et un lien de
  // démo n'ouvre jamais un reçu de la maison. Elle se revérifie ici, même si
  // le verrou l'a déjà fait.
  const adresse = new URL(req.url).searchParams;
  if (adresse.get("m") === "demo") {
    const secret = process.env.SESSION_SECRET || "";
    if (!secret || !(await verifierLien(secret, "recu-demo", numero, adresse.get("e"), adresse.get("s")))) {
      return new Response(erreurApi(langue, "recuIntrouvable"), { status: 404 });
    }
    return servir(numero, await dansLaDemoVivante(() => chargerRecu(numero, langue)), langue);
  }
  // Avec une session, le reçu doit appartenir à une de SES cartes : un
  // numéro de reçu se devine. Sans session, la main tient un lien signé, qui
  // ne se signe que pour un reçu visible (voir …/lien).
  const portee = await porteeDe(req);
  if (portee && !(await recuVisible(numero, portee))) {
    return new Response(erreurApi(langue, "recuIntrouvable"), { status: 404 });
  }
  return servir(numero, await chargerRecu(numero, langue), langue);
}

function servir(numero: string, pdf: ArrayBuffer | null, langue: Awaited<ReturnType<typeof langueServeur>>) {
  if (!pdf) return new Response(erreurApi(langue, "recuIntrouvable"), { status: 404 });
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${numero}.pdf"`,
      // Jamais de cache : un reçu peut être REFABRIQUÉ sous le même numéro
      // (nature rechoisie sur la fiche) — un navigateur qui garderait
      // l'ancien document une heure montrerait un reçu périmé.
      "cache-control": "private, no-store",
    },
  });
}
