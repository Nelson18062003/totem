import { creerCommande, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";

export const dynamic = "force-dynamic";

// Les seules demandes que le guichet accepte — tout le reste est refusé.
const GENRES = new Set([
  "solde", "ussd", "ussd_reponse", "ussd_fin", "recu", "identite",
]);

/**
 * Dépose une demande pour le terminal. Le corps n'est JAMAIS journalisé :
 * une réponse peut porter le code secret, qui ne doit laisser aucune trace
 * ici — le robot le masque en base sitôt lu.
 */
export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = await req.json().catch(() => null);
  const genre = typeof corps?.type === "string" ? corps.type : "";
  if (!GENRES.has(genre)) {
    return Response.json({ erreur: erreurApi(langue, "demandeInconnue") }, { status: 400 });
  }

  const brut = corps?.parametres ?? {};
  // On ne laisse passer que les champs attendus, bornés et nettoyés.
  const parametres: Record<string, unknown> = {};
  if (typeof brut.code === "string") {
    const code = brut.code.replace(/[^0-9#*]/g, "").slice(0, 32);
    if (!code) return Response.json({ erreur: erreurApi(langue, "codeVide") }, { status: 400 });
    parametres.code = code;
  }
  if (typeof brut.texte === "string") {
    // On retire guillemets, retours à la ligne et caractères de contrôle : en
    // mode GSM, un « " » ou un « \r » dans une réponse USSD refermerait la
    // chaîne de la commande AT et injecterait des ordres au modem (ex. effacer
    // les SMS). Le terminal ré-échappe de son côté ; ici on nettoie à l'entrée.
    // eslint-disable-next-line no-control-regex
    parametres.texte = brut.texte.replace(/["\r\n\x00-\x1f]/g, "").slice(0, 120);
  }
  if (brut.secret === true) parametres.secret = true;
  if (typeof brut.compte === "string") parametres.compte = brut.compte.slice(0, 40);
  if (Number.isInteger(brut.source_id) && brut.source_id > 0) {
    parametres.source_id = brut.source_id;
  }
  // Réglage de l'identité d'une carte : l'ICCID vise la puce, le numéro et le
  // nom sont nettoyés ici puis revérifiés par le terminal, qui reste juge.
  if (typeof brut.iccid === "string") {
    parametres.iccid = brut.iccid.replace(/\D/g, "").slice(0, 22);
  }
  if (typeof brut.numero === "string") {
    const num = brut.numero.replace(/\D/g, "").slice(0, 15);
    if (num) parametres.numero = num;
  }
  if (typeof brut.nom === "string") {
    const nom = brut.nom.trim().slice(0, 40);
    if (nom) parametres.nom = nom;
  }

  // Un réglage d'identité doit viser une carte et porter au moins une valeur.
  if (genre === "identite" &&
      (!parametres.iccid || (!parametres.numero && !parametres.nom))) {
    return Response.json(
      { erreur: erreurApi(langue, "carteOuValeurManquante") }, { status: 400 });
  }

  // La langue voyage avec la demande : le terminal répond dans la langue de
  // l'écran qui l'a déposée (les réponses du réseau, elles, restent intactes).
  parametres.langue = langue;

  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  const id = await creerCommande(genre, parametres);
  if (id == null) {
    return Response.json({ erreur: erreurApi(langue, "depotImpossible") }, { status: 502 });
  }
  return Response.json({ id });
}
