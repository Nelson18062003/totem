import { chargerDonnees, relie } from "@/lib/serveur";
import { compteConnecte } from "@/lib/qui";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";

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

  if (!relie) {
    return Response.json(
      { erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }

  // Chaque écran dit ce dont il a besoin : l'accueil se contente de 30 SMS,
  // la boîte de réception les veut tous. Charger 1000 lignes pour afficher
  // les six dernières se paierait sur la facture de données du téléphone.
  const params = new URL(req.url).searchParams;
  const donnees = await chargerDonnees(langue, {
    sms: borne(params.get("sms"), 200, MAX_SMS),
    recus: borne(params.get("recus"), 200, MAX_RECUS),
  });

  // Qui regarde ? Uniquement pour le saluer par son prénom. Le courriel ne
  // sort pas d'ici autrement : il ne part ni chez Expo, ni dans une
  // notification, ni dans un journal.
  const moi = await compteConnecte(req);

  return Response.json({ ...donnees, courriel: moi?.courriel ?? null });
}
