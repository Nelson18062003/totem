import { relie } from "@/lib/serveur";
import { donneesMontrees } from "@/lib/ce-qu-on-montre";
import { COURRIEL_DEMONSTRATION, estDemonstration } from "@/lib/demonstration";
import { compteConnecte, estProprietaire } from "@/lib/qui";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { codeDuCompte } from "@/lib/code-de-compte";

export const dynamic = "force-dynamic";

// Ce qu'un écran peut demander au maximum. Les bornes ne protègent pas un
// secret — la session est déjà vérifiée avant d'arriver ici — elles évitent
// qu'un écran distrait réclame cent mille lignes et fasse ramer la base pour
// tout le monde. Les mêmes ordres de grandeur que les pages de la plateforme.
const MAX_SMS = 1000;
const MAX_RECUS = 1000;

function borne(valeur: string | null, defaut: number, plafond: number): number {
  // Un paramètre ABSENT vaut le défaut. Le piège : Number(null) fait 0, pas
  // NaN — sans cette garde, un écran qui ne précisait pas « sms » recevait
  // ZÉRO ligne au lieu de deux cents, et se croyait devant une caisse vide.
  if (valeur == null) return defaut;
  const n = Number(valeur);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(Math.max(0, Math.trunc(n)), plafond);
}

function instant(valeur: string | null): string | undefined {
  if (!valeur) return undefined;
  const t = Date.parse(valeur);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/**
 * Les données de la plateforme, en JSON, pour l'application du téléphone.
 *
 * Les écrans du navigateur n'en ont pas besoin : ils calculent leurs données
 * côté serveur, pendant le rendu de la page. Le téléphone, lui, dessine ses
 * propres écrans — il lui faut donc les chiffres nus, sans habillage.
 *
 * C'est EXACTEMENT la même lecture que les pages web (`chargerDonnees`) :
 * même fonction, mêmes règles, même mise en forme des dates. Une seule
 * vérité, deux façons de la montrer.
 *
 * La clé de service ne bouge pas d'ici : l'application ne parle jamais à la
 * base, elle parle à cette route, qui parle à la base.
 */
export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  // Chaque écran dit ce dont il a besoin : l'accueil se contente de 30 SMS,
  // la boîte de réception les veut tous. Charger 1000 lignes pour afficher
  // les six dernières se paierait sur la facture de données du téléphone.
  const params = new URL(req.url).searchParams;
  const bornes = {
    sms: borne(params.get("sms"), 200, MAX_SMS),
    recus: borne(params.get("recus"), 200, MAX_RECUS),
    // « compte loin, rapporte peu » : l'écran des cartes veut des compteurs
    // justes, pas mille textes de SMS sur une connexion mobile. Un nombre et
    // non un drapeau — voir `chargerDonnees`.
    //
    // L'ANCIEN DRAPEAU RESTE COMPRIS, et ce n'est pas de la coquetterie : une
    // application déjà installée continue de l'envoyer tant qu'elle n'a pas
    // reçu la mise à jour. Sans cette ligne, elle recevrait mille lignes de
    // SMS à chaque ouverture des Comptes, sur le forfait de quelqu'un.
    lignes: params.get("sansLignes") === "1"
      ? 0
      : params.get("lignes") != null
        ? borne(params.get("lignes"), 0, MAX_SMS)
        : undefined,
    // Le filtre par date de l'écran des SMS : seulement ce qui a été relevé
    // depuis cet instant. Un instant illisible est ignoré plutôt que transmis
    // à la base — il ne rapporterait rien, et l'écran croirait la période vide.
    depuis: instant(params.get("depuis")),
  };

  // LA DÉMONSTRATION : les mêmes écrans, sur un jeu inventé. Elle passe
  // AVANT le test de la base — elle n'en a pas besoin, et ne la lit jamais.
  if (await estDemonstration(req)) {
    const donnees = await donneesMontrees(langue, bornes, req);
    return Response.json({
      ...donnees, courriel: COURRIEL_DEMONSTRATION, prenom: null, codeCompte: null,
      proprietaire: false,
    });
  }

  if (!relie) {
    return Response.json(
      { erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }

  // CE QUE CETTE PERSONNE A LE DROIT DE VOIR. Le téléphone d'un vendeur ne
  // reçoit que les cartes qu'on lui a confiées — jamais la caisse entière.
  const donnees = await donneesMontrees(langue, bornes, req);

  // Qui regarde ? Uniquement pour le saluer par son prénom. Le courriel ne
  // sort pas d'ici autrement : il ne part ni chez Expo, ni dans une
  // notification, ni dans un journal.
  const moi = await compteConnecte(req);
  const proprietaire = !process.env.SESSION_SECRET || await estProprietaire(req);

  return Response.json({
    ...donnees,
    courriel: moi?.courriel ?? null,
    prenom: moi?.prenom || null,
    // Le code de compte n'est montré QU'À SON TITULAIRE : c'est lui qui le
    // joint à sa puce (voir lib/code-de-compte.ts).
    codeCompte: moi && moi.role !== "proprietaire" ? await codeDuCompte(moi.id) : null,
    proprietaire,
  });
}
