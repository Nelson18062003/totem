// Les clients récents d'une carte — pour ne pas retaper un numéro qu'on a
// déjà vu passer.
//
// Un transfert se fait le plus souvent vers quelqu'un qui a déjà payé, ou à
// qui l'on a déjà envoyé : son numéro est dans les SMS de la carte. Le
// proposer d'un geste évite la faute de frappe sur le seul chiffre qui
// compte — celui vers lequel l'argent part.
//
// Rien n'est deviné : seuls les numéros que l'opérateur a écrits dans un SMS
// de CETTE carte, avec le nom qu'il a donné. Le plus récent d'abord.

import type { Paiement } from "./types";

export type ClientRecent = { numero: string; nom: string };

export function clientsRecents(
  paiements: readonly Paiement[], carte: string | undefined, max = 6,
): ClientRecent[] {
  const vus = new Set<string>();
  const rendus: ClientRecent[] = [];
  const tries = [...paiements].sort((a, b) => (a.recuLe < b.recuLe ? 1 : a.recuLe > b.recuLe ? -1 : 0));
  for (const p of tries) {
    if (carte && p.carte && p.carte !== carte) continue;
    const numero = (p.numero || "").replace(/\D/g, "");
    if (numero.length < 8 || vus.has(numero)) continue;
    vus.add(numero);
    rendus.push({ numero, nom: (p.tiers || "").trim() });
    if (rendus.length >= max) break;
  }
  return rendus;
}
