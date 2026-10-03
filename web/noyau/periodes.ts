// FILTRER LES SMS PAR DATE — « aujourd'hui », « hier », « 7 jours », « ce
// mois », ou des jours choisis au calendrier.
//
// Le propriétaire : « filtrer par la date, c'est hyper important ». La liste
// ne savait chercher que par mot, par carte et par nature ; pour retrouver
// les encaissements d'un jour, il fallait descendre la liste en lisant les
// en-têtes.
//
// TOUT SE COMPTE EN JOURS DU TERMINAL, jamais en heures. Une période est une
// paire de clés « 2026-10-03 » (bornes comprises), dans le fuseau de la
// caisse — celui que la plateforme utilise déjà pour ranger chaque SMS dans
// son jour (`Paiement.jour`, voir `jourLocal`). « Aujourd'hui » est donc le
// même jour sur l'écran, dans les en-têtes de la liste et dans le bilan.
// Compter « maintenant moins 24 h » aurait fait d'« hier » un morceau
// d'aujourd'hui dès le matin.

import { jourLocal, type Paiement } from "./types";
import type { Langue } from "./langue";

const JOUR_MS = 86_400_000;

export type Periode =
  | { genre: "tout" }
  | { genre: "aujourdhui" }
  | { genre: "hier" }
  | { genre: "semaine" }        // les 7 derniers jours, aujourd'hui compris
  | { genre: "mois" }           // depuis le 1er du mois en cours
  | { genre: "jours"; de: string; a: string };   // choisis au calendrier

export type Bornes = { de: string; a: string };

/** « 2026-10-03 » décalé de n jours — calcul sur la clé, sans fuseau. */
export function decalerJour(cle: string, n: number): string {
  const [a, m, j] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) + n * JOUR_MS).toISOString().slice(0, 10);
}

/** Les jours que couvre une période, vus du terminal. `null` : toutes. */
export function bornesDe(periode: Periode, maintenant: number, fuseau: string): Bornes | null {
  const aujourdhui = jourLocal(new Date(maintenant), fuseau);
  switch (periode.genre) {
    case "tout": return null;
    case "aujourdhui": return { de: aujourdhui, a: aujourdhui };
    case "hier": {
      const h = decalerJour(aujourdhui, -1);
      return { de: h, a: h };
    }
    case "semaine": return { de: decalerJour(aujourdhui, -6), a: aujourdhui };
    case "mois": return { de: `${aujourdhui.slice(0, 8)}01`, a: aujourdhui };
    case "jours":
      // Deux jours touchés dans le désordre font la même période.
      return periode.de <= periode.a
        ? { de: periode.de, a: periode.a }
        : { de: periode.a, a: periode.de };
  }
}

/** Ce SMS tombe-t-il dans la période ? */
export function dansBornes(p: Pick<Paiement, "jour">, bornes: Bornes | null): boolean {
  if (!bornes) return true;
  return p.jour >= bornes.de && p.jour <= bornes.a;
}

/**
 * L'instant à partir duquel demander les SMS à la plateforme.
 *
 * La base découpe une période en INSTANTS, l'écran en JOURS du terminal. On
 * demande donc large — un jour plus tôt, à minuit UTC — et l'écran retient
 * ce qui tombe dans ses jours. Demander trop peu perdrait les SMS du matin
 * à l'est de Greenwich ; demander un peu trop ne coûte que quelques lignes.
 */
export function depuisPourLaBase(bornes: Bornes): string {
  const [a, m, j] = bornes.de.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) - JOUR_MS).toISOString();
}

export type Totaux = { nombre: number; recu: number; envoye: number };

/**
 * Ce qu'une période a fait entrer et sortir — la question qu'on se pose en
 * filtrant : « combien j'ai encaissé hier ? ».
 *
 * Seul ce qui porte un montant ET un sens compte. Une publicité, un échec,
 * une consultation de solde ne sont ni des entrées ni des sorties ; et un
 * SMS dont le sens n'a pas été compris (« ? ») n'est rangé d'aucun côté
 * plutôt que d'être deviné — la même prudence que le lecteur de SMS.
 */
export function totauxDe(paiements: Pick<Paiement, "sens" | "montant">[]): Totaux {
  let recu = 0, envoye = 0;
  for (const p of paiements) {
    if (p.montant == null) continue;
    if (p.sens === "in") recu += p.montant;
    else if (p.sens === "out") envoye += p.montant;
  }
  return { nombre: paiements.length, recu, envoye };
}

/** « 3 oct. » / « 3 Oct » — le jour d'une clé, sans fuseau (c'est déjà un jour). */
export function jourCourt(cle: string, langue: Langue): string {
  const [a, m, j] = cle.split("-").map(Number);
  return new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, j)));
}

/** Le nom d'une plage choisie au calendrier : « 3 oct. », ou « 3 – 9 oct. ». */
export function nomDesJours(bornes: Bornes, langue: Langue): string {
  if (bornes.de === bornes.a) return jourCourt(bornes.de, langue);
  return `${jourCourt(bornes.de, langue)} – ${jourCourt(bornes.a, langue)}`;
}

/**
 * Les semaines d'un mois, pour le calendrier : des rangées de sept clés (ou
 * `null` pour les cases hors du mois), la semaine commençant le LUNDI —
 * comme les calendriers du Cameroun et de la France.
 */
export function semainesDuMois(annee: number, mois: number): (string | null)[][] {
  const premier = new Date(Date.UTC(annee, mois - 1, 1));
  const decalage = (premier.getUTCDay() + 6) % 7;     // lundi = 0
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const cases: (string | null)[] = Array(decalage).fill(null);
  for (let j = 1; j <= nbJours; j++) {
    cases.push(`${annee}-${String(mois).padStart(2, "0")}-${String(j).padStart(2, "0")}`);
  }
  while (cases.length % 7) cases.push(null);
  const semaines: (string | null)[][] = [];
  for (let i = 0; i < cases.length; i += 7) semaines.push(cases.slice(i, i + 7));
  return semaines;
}
