// Exécuter la fermeture, avec le jeton du lien.
//
// OUVERTE, COMME LA DEMANDE, ET POUR LA MÊME RAISON : celui dont le compte
// doit se fermer n'a par construction aucune session à présenter. Ce qui garde
// cette route n'est pas une présence mais le JETON — 160 bits qu'on ne devine
// pas, arrivés sur l'adresse mail du compte, valables une heure et une seule
// fois. Et ce qu'elle fait ne peut nuire à personne : elle ferme. Au pire,
// quelqu'un qui aurait volé le lien coûte une reconnexion à son propriétaire.
//
// EN POST, ET PAS EN GET. Un lien de courriel est ouvert par les antivirus de
// messagerie avant d'être ouvert par la personne. Un GET qui consomme le jeton
// serait donc brûlé en chemin, et la personne trouverait « ce lien ne marche
// plus » sans que rien n'ait été fermé.

import { fermerAvecLeJeton } from "@/lib/retour";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ jeton: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { jeton } = await params;
  const resultat = await fermerAvecLeJeton(jeton);

  // Un seul « non », pour les trois raisons possibles : déjà servi, périmé,
  // jamais émis. Les distinguer apprendrait à qui essaie des jetons au hasard
  // lesquels ont existé — et les trois appellent de toute façon le même geste,
  // en redemander un.
  if (!resultat.ok) return Response.json({ ok: false }, { status: 410 });
  return Response.json({ ok: true });
}
