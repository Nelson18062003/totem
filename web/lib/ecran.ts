// Le garde, côté ÉCRAN.
//
// Une page sert exactement les mêmes chiffres qu'une API : l'accueil montre
// les soldes, « encaissements » montre les paiements, « reglages » montre les
// cartes. Les laisser derrière le seul verrou du bord serait fermer la porte
// de devant en laissant celle de la cuisine ouverte.
//
// Ce qui change par rapport à une API : ce qu'on fait d'un refus. Une API
// répond « connexion requise » et l'application gère ; une page, elle, doit
// renvoyer la personne vers l'écran de connexion — un JSON d'erreur affiché
// en pleine page ne veut rien dire pour qui lit.

import { redirect } from "next/navigation";
import { exigerSession, type Entrant } from "@/lib/garde";

type Ouvert = Extract<Entrant, { ok: true }>;

/**
 * Qui regarde cet écran ? Renvoie vers la connexion si la réponse est
 * « plus personne ».
 *
 * `redirect` interrompt le rendu : ce qui suit l'appel ne s'exécute que pour
 * quelqu'un qui a le droit d'être là.
 */
export async function exigerEcran(): Promise<Ouvert> {
  const entrant = await exigerSession();
  if (!entrant.ok) redirect("/connexion");
  return entrant;
}
