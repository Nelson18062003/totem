import { creerCommande, relie } from "@/lib/serveur";

export const dynamic = "force-dynamic";

// Les seules demandes que le guichet accepte — tout le reste est refusé.
const GENRES = new Set(["solde", "ussd", "ussd_reponse", "ussd_fin", "recu"]);

/**
 * Dépose une demande pour le terminal. Le corps n'est JAMAIS journalisé :
 * une réponse peut porter le code secret, qui ne doit laisser aucune trace
 * ici — le robot le masque en base sitôt lu.
 */
export async function POST(req: Request) {
  const corps = await req.json().catch(() => null);
  const genre = typeof corps?.type === "string" ? corps.type : "";
  if (!GENRES.has(genre)) {
    return Response.json({ erreur: "demande inconnue" }, { status: 400 });
  }

  const brut = corps?.parametres ?? {};
  // On ne laisse passer que les champs attendus, bornés et nettoyés.
  const parametres: Record<string, unknown> = {};
  if (typeof brut.code === "string") {
    const code = brut.code.replace(/[^0-9#*]/g, "").slice(0, 32);
    if (!code) return Response.json({ erreur: "code vide" }, { status: 400 });
    parametres.code = code;
  }
  if (typeof brut.texte === "string") parametres.texte = brut.texte.slice(0, 120);
  if (brut.secret === true) parametres.secret = true;
  if (typeof brut.compte === "string") parametres.compte = brut.compte.slice(0, 40);
  if (Number.isInteger(brut.source_id) && brut.source_id > 0) {
    parametres.source_id = brut.source_id;
  }

  if (!relie) {
    return Response.json({ erreur: "plateforme non reliée à la base" }, { status: 503 });
  }
  const id = await creerCommande(genre, parametres);
  if (id == null) {
    return Response.json({ erreur: "la demande n’a pas pu être déposée" }, { status: 502 });
  }
  return Response.json({ id });
}
