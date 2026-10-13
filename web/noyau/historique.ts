// LA SUITE DE L'HISTORIQUE — la règle partagée par le téléphone et le site.
//
// TOTEM tourne déjà : des boutiques ont des milliers de SMS en base, des
// mois de caisse. L'onglet Paiements ne montrait que les deux cents derniers
// (le site, les mille derniers), et « toutes les dates » s'arrêtait là, sans
// un mot — un paiement de mars n'existait pas, ni à l'écran ni dans la
// recherche. Le jour où l'application s'ouvre sur une caisse ancienne, c'est
// la première chose qu'on cherche.
//
// La plateforme rend avec chaque lecture sa SUITE (`Donnees.suite`) : un
// instant de relève sous lequel se trouve tout ce qu'elle n'a pas rapporté.
// L'écran redemande `avant=` cet instant, et recolle la page sous ce qu'il
// a. La borne est incluse : deux SMS relevés au même instant, coupés par la
// limite, reviennent tous les deux — on écarte celui qu'on a déjà.
//
// TROIS ÉTATS, ET UN SEUL SE DIT :
//   — une chaîne : il y a plus ancien, on peut le demander ;
//   — `null` : la base n'a rien avant — « début de l'historique », et cette
//     phrase-là est vraie ;
//   — `undefined` : on ne sait pas (une plateforme pas encore à jour, une
//     page qui n'a rien apporté). L'écran se tait : il ne prétend ni qu'il
//     y a une suite, ni qu'il n'y en a pas.

import type { Paiement } from "./types";

/** Où reprendre : un instant (il y a plus ancien), `null` (le début de
 *  l'historique), `undefined` (on ne sait pas — on ne dit rien). */
export type Suite = string | null | undefined;

/** Ce que l'écran tient de l'historique : les lignes déjà recollées, et où
 *  reprendre. */
export type Historique = { lignes: Paiement[]; suite: Suite };

/**
 * Les lignes plus anciennes, recollées SOUS les récentes. Sans doublon, et
 * la version récente gagne : c'est elle que la dernière relecture (un reçu
 * établi, une nature choisie) a mise à jour.
 */
export function recoller(recentes: Paiement[], anciennes: readonly Paiement[]): Paiement[] {
  if (!anciennes.length) return recentes;
  const deja = new Set(recentes.map((p) => p.id));
  const reste = anciennes.filter((p) => !deja.has(p.id));
  return reste.length ? [...recentes, ...reste] : recentes;
}

/**
 * Une page arrivée, demandée `avant=curseur`. Elle s'ajoute à ce qu'on a ;
 * la suite devient la sienne.
 *
 * UNE PAGE QUI N'APPORTE RIEN ET NE FAIT PAS AVANCER LA SUITE ARRÊTE TOUT.
 * Une plateforme qui ne connaît pas encore `avant` rend les plus récents,
 * qu'on a déjà — et redemander le même curseur tournerait sans fin. On
 * s'arrête, et on ne prétend rien (`undefined`, pas `null`).
 */
export function apresUnePage(
  deja: Historique,
  page: { paiements: readonly Paiement[]; suite?: string | null },
  curseur: string,
): Historique {
  const lignes = recoller(deja.lignes, page.paiements);
  const neuves = lignes.length - deja.lignes.length;
  const suite: Suite = page.suite;
  if (neuves === 0 && (suite === undefined || suite === curseur)) {
    return { lignes, suite: undefined };
  }
  return { lignes, suite };
}

/** Jusqu'où l'écran remonte : le jour de la plus ancienne ligne qu'il tient
 *  (clé « AAAA-MM-JJ »), ou `null` s'il ne tient rien. */
export function jusquAu(lignes: readonly Paiement[]): string | null {
  let plusAncien: string | null = null;
  for (const p of lignes) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.jour ?? "") && (plusAncien == null || p.jour < plusAncien)) {
      plusAncien = p.jour;
    }
  }
  return plusAncien;
}
