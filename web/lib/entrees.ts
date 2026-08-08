// Le journal de la porte : ce qui se passe même quand rien ne s'ouvre.
//
// Un refus qui ne laisse aucune trace ne permet de rien dire. Or c'est
// exactement ce qu'une propriétaire doit apprendre : « cinq codes ont été
// essayés sur la clé de J. Eyenga hier soir. Rien ne s'est ouvert. » Cette
// phrase-là ne se fabrique qu'à partir d'un journal des entrées — et elle
// vaut plus qu'une ligne dans un fichier technique que personne ne lit.
//
// Ce journal ne porte aucun secret : pas de code, pas de mot de passe, pas de
// jeton. Il dit qui, où, comment, et si ça s'est ouvert.

import { inserer } from "./base";

export type Issue =
  | "ouverte"      // la porte s'est ouverte
  | "refusee"      // mauvais code, mauvais mot de passe
  | "expiree"      // le code était bon, mais trop tard
  | "ralentie"     // trop d'essais : on ralentit, on n'enferme jamais
  | "invitation";  // une invitation vient d'être acceptée

export type Moyen = "papier" | "appareil" | "sms" | "invitation" | "mot_de_passe";

export type Entree = {
  personne?: number | null;
  commerce?: string | null;
  issue: Issue;
  moyen?: Moyen | null;
  appareil?: string | null;
  lieu?: string | null;
};

/**
 * Noter un passage à la porte.
 *
 * Volontairement silencieuse en cas d'échec : un journal qui empêche
 * quelqu'un d'entrer parce qu'il n'a pas pu s'écrire serait pire que pas de
 * journal du tout. On note ce qu'on peut, on n'entrave rien.
 */
export async function noterEntree(e: Entree): Promise<void> {
  await inserer("entrees", {
    personne: e.personne ?? null,
    commerce: e.commerce ?? null,
    issue: e.issue,
    moyen: e.moyen ?? null,
    appareil: e.appareil ?? null,
    lieu: e.lieu ?? null,
  });
}
