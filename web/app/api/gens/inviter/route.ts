// Donner une clé : fabriquer l'invitation, et rendre le lien UNE fois.
//
// Le jeton n'existe en clair que dans la réponse de cette route. La base n'en
// garde que l'empreinte, et rien — ni un écran, ni un journal, ni une
// sauvegarde qui traîne — ne pourra le relire ensuite. C'est pour cela que la
// page l'affiche en grand et prévient qu'il ne reviendra pas.
//
// CE QUE CETTE ROUTE REFUSE, ET POURQUOI
// Le rôle « la plateforme » ne se donne pas d'ici. Une propriétaire distribue
// les clés de SON commerce ; fabriquer un administrateur de la plateforme
// depuis un formulaire de boutique serait une porte dérobée dans l'autre sens.
// Le refus est écrit, pas silencieux.

import { estRefus, garder } from "@/lib/garde";
import { creerInvitation } from "@/lib/invitations";
import { langueServeur } from "@/lib/langue-serveur";
import { textesGens } from "@/lib/textes/gens";
import type { Role } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Les rôles qu'une propriétaire distribue. « admin » n'en fait pas partie. */
const DONNABLES: readonly Role[] = ["proprietaire", "operateur", "lecteur"];

export async function POST(req: Request) {
  const g = await garder("gerer_les_gens");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesGens[langue];

  if (!g.commerce) {
    return Response.json({ erreur: t.sansCommerceDit }, { status: 409 });
  }

  const corps = await req.json().catch(() => null);
  const nom = typeof corps?.nom === "string" ? corps.nom.trim().slice(0, 80) : "";
  const courriel = typeof corps?.courriel === "string" ? corps.courriel.trim().slice(0, 200) : "";
  const role = corps?.role as Role;

  if (!nom || !courriel) {
    return Response.json({ erreur: t.champsManquants }, { status: 400 });
  }
  // Le contrôle le plus grossier qui serve à quelque chose : une arobase, un
  // point après, aucune espace. Vérifier davantage refuserait des adresses
  // parfaitement valables, et ne prouverait toujours pas que la boîte existe —
  // seuls les six chiffres le prouveront.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) {
    return Response.json({ erreur: t.adresseDouteuse }, { status: 400 });
  }
  if (!DONNABLES.includes(role)) {
    return Response.json({ erreur: t.rate }, { status: 400 });
  }

  const fait = await creerInvitation({
    commerce: g.commerce,
    role,
    nom,
    courriel,
    // La langue du lien est celle où la propriétaire travaille : c'est la
    // seule qu'on connaisse avant que la personne n'arrive.
    langue,
    creeePar: g.personne,
  });
  if (!fait) return Response.json({ erreur: t.rate }, { status: 503 });

  // Le jeton part ici, et nulle part ailleurs. Rien ne le journalise.
  return Response.json({
    ok: true,
    nom,
    role,
    chemin: `/invitation/${fait.jeton}`,
    invitation: fait.ligne.id,
  });
}
