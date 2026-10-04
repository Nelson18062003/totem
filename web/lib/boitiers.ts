// LES BOÎTIERS TELS QUE LA BASE LES PORTE — lus UNE fois, pour les écrans du
// propriétaire (lib/serveur.ts) ET pour la console (lib/console.ts).
//
// La règle elle-même — est-il là, ses cartes sont-elles là — vit dans le
// noyau (`@noyau/boitier`), partagée avec le téléphone. Ici, on ne fait que
// traduire une ligne de la base en ce que la règle demande. La console et les
// écrans du propriétaire traduisaient chacun de leur côté : l'une comptait
// encore « en retard » comme un boîtier qui parle, et déclarait retirée une
// carte que personne n'avait touchée. Une traduction recopiée deux fois finit
// par dire deux choses.

import {
  ageDuSigneDeVie, ageEnSecondes, type Boitier,
} from "@noyau/boitier";

/** Ce qu'il faut d'une ligne de `terminaux` (colonnes de sql/schema.sql). */
export type LigneBoitier = {
  id: string;
  /** Son dernier signe de vie, daté par LUI (horloge du Pi). */
  vu_le: string | null;
  /** L'oreille de la base : QUAND elle l'a entendu, et depuis quand il parle
   *  sans interruption — sur SON horloge à elle. Absentes d'une base pas
   *  encore migrée : on retombe alors sur `vu_le`. */
  entendu_le?: string | null;
  revenu_le?: string | null;
  /** Sorti de la flotte : il ne reviendra pas. */
  retire_le?: string | null;
};

/**
 * LE boîtier que l'écran montre comme « le terminal » : le dernier ENTENDU,
 * parmi ceux qui sont encore en service.
 *
 * L'ordre de la base suit `vu_le`, l'horloge de chaque Pi : un boîtier dont
 * l'horloge retarde passerait derrière un autre qui s'est tu. On reclasse
 * ici, sur l'heure de la base. Un boîtier sorti de la flotte ne passe devant
 * personne — même s'il parle encore (volé, rebranché ailleurs).
 */
export function leBoitierMontre<T extends LigneBoitier>(terminaux: T[]): T | undefined {
  const entendu = (t: T) => {
    const ms = Date.parse(t.entendu_le ?? t.vu_le ?? "");
    return Number.isFinite(ms) ? ms : -Infinity;
  };
  return [...terminaux].sort((a, b) =>
    Number(Boolean(a.retire_le)) - Number(Boolean(b.retire_le))
    || entendu(b) - entendu(a))[0];
}

/** La plus récente « dernière vue » de chaque boîtier, toutes ses cartes
 *  confondues — horloge du boîtier. Une seule carte fraîche suffit à dire
 *  qu'il a relu ses puces depuis son retour (voir `presenceDeLaCarte`). */
export function cartesLesPlusRecentes(
  lignes: { terminal?: string | null; derniere_vue: string | null }[],
): Map<string, string> {
  const parBoitier = new Map<string, string>();
  for (const l of lignes) {
    if (!l.terminal || !l.derniere_vue) continue;
    const t = Date.parse(l.derniere_vue);
    if (!Number.isFinite(t)) continue;
    const deja = parBoitier.get(l.terminal);
    if (!deja || t > Date.parse(deja)) parBoitier.set(l.terminal, l.derniere_vue);
  }
  return parBoitier;
}

/** Ce que la règle du noyau doit savoir d'un boîtier, mesuré à `maintenant`
 *  (horloge de la plateforme). Inconnu de la base : un boîtier dont on ne
 *  sait rien — il se tait. */
export function boitierVu(
  t: LigneBoitier | undefined, plusRecentes: Map<string, string>, maintenant: number,
): Boitier {
  return {
    vuLe: t?.vu_le,
    vuIlYa: ageDuSigneDeVie(t?.entendu_le, t?.vu_le, maintenant),
    carteLaPlusRecente: t ? plusRecentes.get(t.id) ?? null : null,
    revenuIlYa: ageEnSecondes(t?.revenu_le, maintenant),
    retireLe: t?.retire_le ?? null,
  };
}

/** L'instant d'où se mesure le silence d'un boîtier : l'heure où la base
 *  l'a entendu, à défaut la date qu'il a écrite. */
export function entenduLe(t: LigneBoitier | undefined): string | null {
  return t?.entendu_le ?? t?.vu_le ?? null;
}
