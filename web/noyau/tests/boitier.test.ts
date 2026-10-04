// LE BOÎTIER QUI SE TAIT — ce qu'on a le droit de dire de lui et de ses
// cartes.
//
// Une coupure de courant de dix minutes à la boutique déclarait toutes les
// cartes « retirées » : l'accueil faisait disparaître les gestes, l'onglet
// Comptes rangeait chaque carte sous « Cartes retirées ». Le boîtier n'avait
// fait que se taire. Et au RETOUR, la même panne attendait : le signe de vie
// revient avant les cartes, et toutes paraissaient retirées une minute.
//
// LES TÉMOINS : les règles d'avant, réécrites ici en une ligne chacune. Les
// mêmes exigences doivent ÉCHOUER sur elles — sinon ces scénarios ne
// mettraient rien à l'épreuve.
//
// Chaque boîtier est construit COMME LA PLATEFORME LE CONSTRUIT : son âge
// passe par `ageDuSigneDeVie`, depuis l'heure où la base l'a entendu, ou à
// défaut depuis la date qu'il a écrite. Un test qui fournirait l'âge à la
// main affirmerait une propriété que la plateforme n'a peut-être pas.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ABSENCE_S, RELECTURE_S, SANS_NOUVELLES_S, ageDuSigneDeVie, ageEnSecondes,
  boitierSansNouvelles, enPlaceSelon, presenceDeLaCarte, signalLu, type Boitier,
} from "../boitier";

const MIN = 60_000;
const T = Date.parse("2026-10-04T14:05:00+01:00");
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Le boîtier tel que la plateforme le voit à `maintenant`.
 *   vuLe        : son dernier signe de vie, daté par LUI ;
 *   entenduLe   : l'heure où la BASE l'a reçu (absente d'une base d'avant) ;
 *   plusRecente : la plus fraîche des dernières vues de ses cartes ;
 *   revenu      : depuis quand il parle sans interruption (heure de la base).
 */
function boitier(o: {
  vuLe: number; entenduLe?: number; plusRecente: number | null;
  revenu?: number; retireLe?: number; maintenant?: number;
}): Boitier {
  const maintenant = o.maintenant ?? T;
  const entendu = o.entenduLe == null ? undefined : iso(o.entenduLe);
  return {
    vuLe: iso(o.vuLe),
    vuIlYa: ageDuSigneDeVie(entendu, iso(o.vuLe), maintenant),
    carteLaPlusRecente: o.plusRecente == null ? null : iso(o.plusRecente),
    revenuIlYa: o.revenu == null ? undefined : ageEnSecondes(iso(o.revenu), maintenant),
    retireLe: o.retireLe == null ? undefined : iso(o.retireLe),
  };
}

/** L'ANCIENNE RÈGLE — « vue il y a moins de dix minutes », sans regarder si
 *  le boîtier parle encore. */
const ancienneRegle = (derniereVue: number, maintenant: number) =>
  maintenant - derniereVue < 10 * MIN;

/** LA RÈGLE DU PREMIER JET — « il parle, et il ne la voit plus depuis trois
 *  minutes », sans se demander s'il a relu ses cartes depuis son retour. */
const regleSansRelecture = (b: Boitier, derniereVue: string) =>
  boitierSansNouvelles(b.vuIlYa) ? "inconnue"
    : (Date.parse(b.vuLe!) - Date.parse(derniereVue)) / 1000 > ABSENCE_S ? "retiree"
      : "en_place";

test("le seuil « sans nouvelles » est de cinq minutes, et il est écrit une fois", () => {
  assert.equal(SANS_NOUVELLES_S, 300);
  assert.equal(boitierSansNouvelles(299), false);
  assert.equal(boitierSansNouvelles(300), false);
  assert.equal(boitierSansNouvelles(301), true);
  // Jamais vu : on ne prétend pas qu'il parle.
  assert.equal(boitierSansNouvelles(null), true);
  assert.equal(boitierSansNouvelles(undefined), true);
  // Un battement retardé par un SMS et un tour raté (≈ 186 s) n'allume plus
  // rien : c'était l'alerte fantôme d'un boîtier bien vivant.
  assert.equal(boitierSansNouvelles(186), false);
});

test("boîtier muet onze minutes : aucune carte n'est déclarée retirée", () => {
  const tu = T - 11 * MIN;               // son dernier signe de vie
  const vue = tu - 30_000;               // il a vu la carte juste avant
  const b = boitier({ vuLe: tu, entenduLe: tu, plusRecente: vue, revenu: T - 60 * MIN });
  const p = presenceDeLaCarte(b, iso(vue));
  assert.equal(p, "inconnue");
  assert.equal(enPlaceSelon(p), true, "les applications d'avant la gardent en place");
  // LE TÉMOIN : l'ancienne règle la déclarait retirée.
  assert.equal(ancienneRegle(vue, T), false,
    "le témoin devait échouer : sans cela, ce scénario ne prouve rien");
});

test("boîtier muet une heure, une journée : toujours « inconnue », jamais « retirée »", () => {
  for (const minutes of [6, 60, 24 * 60]) {
    const tu = T - minutes * MIN;
    const b = boitier({ vuLe: tu, entenduLe: tu, plusRecente: tu - 20_000 });
    assert.equal(presenceDeLaCarte(b, iso(tu - 20_000)), "inconnue", `muet depuis ${minutes} min`);
  }
});

test("boîtier qui parle, dont une autre carte est fraîche, et qui ne voit plus celle-ci : retirée", () => {
  const vuLe = T - 30_000;
  const b = boitier({ vuLe, entenduLe: vuLe, plusRecente: vuLe - 40_000, revenu: T - 2 * MIN });
  assert.equal(presenceDeLaCarte(b, iso(T - 90 * MIN)), "retiree");
  assert.equal(enPlaceSelon("retiree"), false);
  // Juste au-delà du seuil, et juste en deçà.
  assert.equal(presenceDeLaCarte(b, iso(vuLe - (ABSENCE_S + 1) * 1000)), "retiree");
  assert.equal(presenceDeLaCarte(b, iso(vuLe - (ABSENCE_S - 1) * 1000)), "en_place");
});

test("boîtier qui parle et voit la carte : en place", () => {
  const b = boitier({ vuLe: T - 40_000, entenduLe: T - 40_000, plusRecente: T - 70_000 });
  assert.equal(presenceDeLaCarte(b, iso(T - 70_000)), "en_place");
});

test("AU RETOUR, avant que ses cartes ne soient republiées : aucune n'est dite retirée", () => {
  // Vingt minutes de coupure. Le signe de vie est reparti il y a 5 s (son
  // propre fil) ; les cartes, elles, partent jusqu'à une minute plus tard.
  // La base porte donc un signe de vie neuf et des cartes vues AVANT.
  const vuLe = T - 5_000;
  const avant = T - 20 * MIN;
  const b = boitier({ vuLe, entenduLe: vuLe, plusRecente: avant, revenu: vuLe });
  for (const derniere of [avant, avant - 10_000, avant - 90 * MIN]) {
    assert.equal(presenceDeLaCarte(b, iso(derniere)), "inconnue");
  }
  // LE TÉMOIN : la règle du premier jet les disait TOUTES retirées.
  assert.equal(regleSansRelecture(b, iso(avant)), "retiree",
    "le témoin devait tomber dans le piège du retour");

  // Les cartes sont republiées : celles qui sont là redeviennent en place,
  // et l'absence de celle qu'on a retirée PENDANT la coupure se conclut
  // aussitôt — une seule carte fraîche prouve qu'il a relu.
  const relu = boitier({ vuLe: T, entenduLe: T, plusRecente: T - 2_000, revenu: vuLe });
  assert.equal(presenceDeLaCarte(relu, iso(T - 2_000)), "en_place");
  assert.equal(presenceDeLaCarte(relu, iso(avant)), "retiree");
});

test("un boîtier qui ne voit PLUS AUCUNE carte : retirées une fois le délai de relecture passé", () => {
  // On a ôté la seule puce d'un boîtier qui parle. Aucune carte fraîche ne
  // peut dire qu'il a relu ; c'est la durée de son retour qui le dit.
  const derniere = T - 30 * MIN;
  const tot = boitier({ vuLe: T, entenduLe: T, plusRecente: derniere,
                        revenu: T - (RELECTURE_S - 10) * 1000 });
  assert.equal(presenceDeLaCarte(tot, iso(derniere)), "inconnue", "il vient de revenir");
  const tard = boitier({ vuLe: T, entenduLe: T, plusRecente: derniere,
                         revenu: T - (RELECTURE_S + 10) * 1000 });
  assert.equal(presenceDeLaCarte(tard, iso(derniere)), "retiree", "il parle depuis longtemps");
  // CE QUE FAIT UNE BASE D'AVANT : sans l'heure de son retour, on ne peut
  // pas distinguer « il n'en voit aucune » de « il ne les a pas encore
  // republiées ». On dit qu'on ne sait pas — c'est écrit, pas caché.
  const sansRetour = boitier({ vuLe: T, plusRecente: derniere });
  assert.equal(presenceDeLaCarte(sansRetour, iso(derniere)), "inconnue");
});

test("l'horloge du boîtier remise à l'heure : ses cartes datées d'avant ne sont pas dites retirées", () => {
  // Le Pi redémarre une heure en retard, puis se remet à l'heure : son
  // signe de vie fait un bond, les dernières vues de ses cartes non. La base
  // compte ce bond comme un retour.
  const b = boitier({ vuLe: T, entenduLe: T, plusRecente: T - 61 * MIN, revenu: T - 20_000 });
  assert.equal(presenceDeLaCarte(b, iso(T - 61 * MIN)), "inconnue");
  assert.equal(regleSansRelecture(b, iso(T - 61 * MIN)), "retiree", "le témoin");
});

test("horloge du boîtier en retard de huit minutes : ce que la plateforme en conclut VRAIMENT", () => {
  // Il parle (la base a reçu son signe de vie il y a 20 s), mais l'a daté de
  // SON heure, huit minutes en retard. Il voit sa carte.
  const retard = 8 * MIN;
  const vuLe = T - 20_000 - retard;
  const derniereVue = T - 50_000 - retard;
  const avecLaBase = boitier({ vuLe, entenduLe: T - 20_000, plusRecente: derniereVue });
  assert.equal(avecLaBase.vuIlYa, 20, "l'âge se mesure depuis l'heure de la BASE");
  assert.equal(presenceDeLaCarte(avecLaBase, iso(derniereVue)), "en_place");
  // SUR UNE BASE D'AVANT, sans l'heure de réception : l'âge se mesure sur
  // la date du Pi — 500 s — et le boîtier paraît muet. La carte est alors
  // « inconnue », et la plateforme REFUSE ce qu'on lui demande. C'est ce qui
  // se passe, et ce test le dit au lieu de prétendre le contraire.
  const sansLaBase = boitier({ vuLe, plusRecente: derniereVue });
  assert.equal(sansLaBase.vuIlYa, 500);
  assert.equal(boitierSansNouvelles(sansLaBase.vuIlYa), true);
  assert.equal(presenceDeLaCarte(sansLaBase, iso(derniereVue)), "inconnue");
});

test("un boîtier sorti de la flotte ne reviendra pas : ses cartes sont retirées", () => {
  // Volé, grillé : le propriétaire l'a mis hors service. Muet, il laissait
  // ses cartes « inconnues » pour toujours, au milieu des cartes actives.
  const tu = T - 3 * 24 * 60 * MIN;
  const b = boitier({ vuLe: tu, entenduLe: tu, plusRecente: tu - 20_000, retireLe: T - 60 * MIN });
  assert.equal(presenceDeLaCarte(b, iso(tu - 20_000)), "retiree");
  // LE TÉMOIN : sans regarder la mise hors service, « inconnue ».
  assert.equal(presenceDeLaCarte({ ...b, retireLe: null }, iso(tu - 20_000)), "inconnue");
});

test("une dernière vue absente ou illisible n'est pas une preuve d'absence", () => {
  const vivant = boitier({ vuLe: T - 10_000, entenduLe: T - 10_000, plusRecente: T - 10_000 });
  assert.equal(presenceDeLaCarte(vivant, null), "inconnue");
  assert.equal(presenceDeLaCarte(vivant, "pas une date"), "inconnue");
  assert.equal(presenceDeLaCarte(
    { vuLe: null, vuIlYa: null, carteLaPlusRecente: null }, iso(T)), "inconnue");
});

test("l'âge ne passe jamais sous zéro, et se tait sur une date illisible", () => {
  assert.equal(ageEnSecondes(iso(T + 5_000), T), 0);
  assert.equal(ageEnSecondes(iso(T - 61_000), T), 61);
  assert.equal(ageEnSecondes(null, T), null);
  assert.equal(ageEnSecondes("hier soir", T), null);
  // L'heure de la base d'abord ; illisible ou absente, celle du boîtier.
  assert.equal(ageDuSigneDeVie(iso(T - 20_000), iso(T - 500_000), T), 20);
  assert.equal(ageDuSigneDeVie(null, iso(T - 61_000), T), 61);
  assert.equal(ageDuSigneDeVie("illisible", iso(T - 61_000), T), 61);
});

test("le signal : 0 à 31, sinon inconnu — 99 n'est pas quatre barres pleines", () => {
  assert.equal(signalLu(0), 0);
  assert.equal(signalLu(22), 22);
  assert.equal(signalLu(31), 31);
  assert.equal(signalLu(99), null);
  assert.equal(signalLu(32), null);
  assert.equal(signalLu(-1), null);
  assert.equal(signalLu(12.5), null);
  assert.equal(signalLu(null), null);
  assert.equal(signalLu(undefined), null);
  assert.equal(signalLu("18"), 18);
  assert.equal(signalLu(""), null);
  // LE TÉMOIN : l'ancienne lecture recopiait la valeur, et l'écran en tirait
  // min(4, round(99 / 31 × 4)) = 4 barres.
  const ancienne = (s: number | null) => s;
  assert.equal(Math.min(4, Math.round(((ancienne(99) ?? 0) / 31) * 4)), 4,
    "le témoin devait dessiner quatre barres");
});
