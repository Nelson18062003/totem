"use server";

// Fabriquer les dix codes — le seul geste de cet écran qui écrit en base.
//
// POURQUOI CE N'EST PAS UN SIMPLE CHARGEMENT DE PAGE
// Ouvrir /papier ne fabrique rien. Si la fabrication tenait au rendu de la
// page, un rafraîchissement — le doigt qui glisse, le retour arrière du
// navigateur — brûlerait le papier qui est déjà dans le tiroir et le
// remplacerait par dix codes que personne n'a lus. On fabrique sur un geste
// explicite, et rien d'autre.

import { exigerPresence } from "@/lib/garde";
import { ecrireCodePapier, fabriquerSerie } from "@/lib/papier";

export type Fabrication =
  | { ok: true; serie: number; codes: string[] }
  | { ok: false };

/**
 * Dix codes neufs pour la personne qui est devant nous — et pour elle seule :
 * l'identité vient de la session, jamais d'un paramètre. Les codes en clair
 * ne traversent qu'une fois, vers l'écran qui les affiche, et ne sont écrits
 * nulle part ailleurs — ni en base, ni dans un journal.
 *
 * Ils repartent DÉJÀ ÉCRITS, « 7K4M 2VW9 » : c'est sous cette forme qu'ils
 * s'impriment, se recopient et se dictent. L'écran n'a donc rien à emprunter
 * à « lib/papier.ts », qui parle à la base et n'a rien à faire dans le
 * navigateur.
 */
export async function fabriquerMesCodes(): Promise<Fabrication> {
  const moi = await exigerPresence();
  const serie = await fabriquerSerie(moi.personne);
  if (!serie) return { ok: false };
  return { ok: true, serie: serie.serie, codes: serie.codes.map(ecrireCodePapier) };
}
