// Donner une clé : fabriquer l'invitation, et rendre le lien UNE fois.
//
// LE MESSAGE PART D'ICI, ET LE LIEN AUSSI. Les deux, pas l'un ou l'autre.
// Cette route appelait « creerInvitation », qui fabrique la ligne en base et
// rend le jeton — sans rien envoyer. La propriétaire voyait donc « c'est
// fait », et la personne invitée n'a jamais rien reçu. Le défaut passait tous
// les contrôles : la ligne existait, le jeton était bon, la réponse valide.
// Seul un essai de bout en bout pouvait le voir.
//
// « envoyerInvitation » fait les deux, et le jeton en clair ne quitte jamais
// cette fonction — c'est elle qui l'insère dans le message.
//
// ET SI LE MESSAGE NE PART PAS ? On ANNULE l'invitation, et on le dit.
// C'est le seul choix honnête : le jeton en clair ne quitte jamais
// « envoyerInvitation » — la base n'en garde que l'empreinte — donc personne,
// pas même la propriétaire, ne peut plus le transmettre. Une invitation dont
// le lien n'existe nulle part n'invite personne ; la laisser dans la liste
// ferait attendre une réponse qui ne viendra jamais.
//
// Elle recommencera, et le second essai partira si la panne était passagère.
//
// CE QUE CETTE ROUTE REFUSE, ET POURQUOI
// Le rôle « la plateforme » ne se donne pas d'ici. Une propriétaire distribue
// les clés de SON commerce ; fabriquer un administrateur de la plateforme
// depuis un formulaire de boutique serait une porte dérobée dans l'autre sens.
// Le refus est écrit, pas silencieux.

import { estRefus, garder } from "@/lib/garde";
import { envoyerInvitation } from "@/lib/envois";
import { annulerInvitation } from "@/lib/invitations";
import { lireUne } from "@/lib/base";
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

  // Le NOM du commerce, pas son identifiant : il part dans le message, et
  // quelqu'un qui reçoit une clé doit reconnaître la boutique dont on parle.
  const boutique = await lireUne<{ nom: string }>(
    `commerces?id=eq.${encodeURIComponent(g.commerce)}&select=nom&limit=1`);

  const fait = await envoyerInvitation({
    commerce: g.commerce,
    commerceNom: boutique?.nom ?? g.commerce,
    role,
    nom,
    courriel,
    // La langue du lien est celle où la propriétaire travaille : c'est la
    // seule qu'on connaisse avant que la personne n'arrive.
    langue,
    invitant: g.nom,
    creeePar: g.personne,
  });

  if (!fait.envoyee) {
    // « courrier » est le seul échec où l'invitation EXISTE quand même : la
    // ligne est en base, le lien est valable, seul le message n'est pas
    // parti. On le dit, et on rend le lien — la propriétaire le transmettra
    // elle-même plutôt que de tout recommencer.
    if (fait.raison === "courrier") {
      // La ligne existe mais son lien est perdu : on la date comme annulée
      // plutôt que de la laisser encombrer la liste d'attente.
      await annulerInvitation(fait.ligne.id, g.commerce);
      return Response.json({ erreur: fait.dit }, { status: 503 });
    }
    return Response.json({ erreur: t.rate }, { status: 503 });
  }

  return Response.json({
    ok: true,
    nom,
    role,
    messageParti: true,
    invitation: fait.ligne.id,
  });
}
