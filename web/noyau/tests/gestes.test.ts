// Un geste, un nom — sur chaque écran qui le nomme.
//
//     node --test noyau/tests/
//
// Le propriétaire : « il y a trop d'incohérence ». Le même retrait
// s'appelait « Withdraw » sur la tuile, « Withdrawal » sur le rond de
// l'accueil web et dans les Réglages → Codes (où mène le cadran), et
// « Money withdrawal » en tête du parcours sur le site ; le même solde
// « Consulter le solde » ou « Mon solde » selon l'écran d'où l'on partait.
// On compare ici, langue par langue, ce que disent le guichet (tuiles et
// parcours), l'accueil (ronds et parcours), les Réglages des codes et le
// cadran (raccourcis) pour chaque geste.
//
// Ce qui n'est PAS comparé : la nature d'un SMS (`textesSms`). Un SMS reçu
// est un RELEVÉ, pas un geste : l'anglais y dit « Withdrawal », le nom de
// l'opération faite, comme un relevé de banque — à côté d'un bouton qui dit
// « Withdraw », le verbe de ce qu'on va faire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { textesGuichet } from "../textes/guichet.ts";
import { textesAccueil } from "../textes/accueil.ts";
import { textesReglages } from "../textes/reglages.ts";
import { textesUssd } from "../textes/ussd.ts";

const GESTES = [
  ["depot", "depot"],
  ["retrait", "retrait"],
  ["transfert", "transfert"],
  ["solde", "monSolde"],
  ["mon_numero", "monNumero"],
  ["menu", "menu"],
] as const;

type Textes = Record<string, unknown>;
function ecarts(g: Textes, a: Textes, r: Record<string, string | undefined>,
                u: (cle: string, defaut: string) => string): string[] {
  const fautes: string[] = [];
  for (const [cle, champ] of GESTES) {
    const nom = g[champ];
    if (!nom) { fautes.push(`le guichet ne nomme pas « ${cle} »`); continue; }
    if (a[champ] !== nom) fautes.push(`accueil · ${cle} : « ${a[champ]} » au lieu de « ${nom} »`);
    if (r[cle] !== nom) fautes.push(`Réglages → Codes · ${cle} : « ${r[cle]} » au lieu de « ${nom} »`);
    if (u(cle, "?") !== nom) fautes.push(`cadran · ${cle} : « ${u(cle, "?")} » au lieu de « ${nom} »`);
  }
  return fautes;
}

for (const langue of ["fr", "en"] as const) {
  test(`chaque geste porte un seul nom, partout (${langue})`, () => {
    assert.deepEqual(ecarts(textesGuichet[langue], textesAccueil[langue],
                            textesReglages[langue].libellesCodes, textesUssd[langue].libelleCode), []);
  });
}

test("le témoin : l'état d'avant (« Withdrawal », « Check the balance ») est pris", () => {
  const accueil = { ...textesAccueil.en, retrait: "Withdrawal", monSolde: "Check the balance" };
  const reglages = { ...textesReglages.en.libellesCodes, retrait: "Withdrawal", solde: "Balance" };
  const fautes = ecarts(textesGuichet.en, accueil, reglages, textesUssd.en.libelleCode);
  assert.equal(fautes.length, 4, fautes.join("\n"));
});

test("aucun titre de parcours à part : le parcours porte le nom du geste", () => {
  for (const langue of ["fr", "en"] as const) {
    for (const t of [textesGuichet[langue], textesAccueil[langue]]) {
      const cles = Object.keys(t).filter((k) => /^(depot|retrait|transfert)Titre$|^consulterSolde$/.test(k));
      assert.deepEqual(cles, [], `${langue} : ${cles.join(", ")}`);
    }
  }
});
