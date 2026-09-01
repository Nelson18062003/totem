// L'ÂGE D'UN RELEVÉ — celui qu'on lit sur le bandeau « pas de réseau ».
//
// Ce chiffre se lit quand rien d'autre ne marche, et on décide dessus : un
// solde de trois heures présenté comme celui de maintenant peut faire
// remettre de l'argent qui n'y est plus.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ageVu } from "../types";

const MIN = 60_000;
const H = 60 * MIN;
const J = 24 * H;
const T = 1_756_000_000_000;

test("ce qui vient d'arriver ne s'annonce pas en minutes", () => {
  assert.equal(ageVu(T, T, "fr"), "à l'instant");
  assert.equal(ageVu(T, T + 90_000, "fr"), "à l'instant");
  assert.equal(ageVu(T, T, "en"), "just now");
});

test("les minutes, puis les heures, puis les jours", () => {
  assert.equal(ageVu(T, T + 5 * MIN, "fr"), "il y a 5 min");
  assert.equal(ageVu(T, T + 59 * MIN, "fr"), "il y a 59 min");
  assert.equal(ageVu(T, T + 1 * H, "fr"), "il y a 1 heure");
  assert.equal(ageVu(T, T + 3 * H, "fr"), "il y a 3 heures");
  assert.equal(ageVu(T, T + 1 * J, "fr"), "hier");
  assert.equal(ageVu(T, T + 4 * J, "fr"), "il y a 4 jours");
});

test("l'anglais dit la même chose", () => {
  assert.equal(ageVu(T, T + 5 * MIN, "en"), "5 min ago");
  assert.equal(ageVu(T, T + 1 * H, "en"), "1 hour ago");
  assert.equal(ageVu(T, T + 1 * J, "en"), "yesterday");
  assert.equal(ageVu(T, T + 4 * J, "en"), "4 days ago");
});

test("le singulier n'est jamais « 1 heures »", () => {
  for (const l of ["fr", "en"] as const) {
    assert.ok(!/\b1 heures\b|\b1 hours\b|\b1 jours\b|\b1 days\b/
      .test(ageVu(T, T + 1 * H, l) + " " + ageVu(T, T + 1 * J, l)));
  }
});

test("UNE HORLOGE QUI RECULE NE DIT JAMAIS UN ÂGE NÉGATIF.", () => {
  // Le téléphone se règle sur le réseau ; il peut reculer de quelques
  // secondes en pleine session. « il y a -1 min » se lirait comme une panne.
  assert.equal(ageVu(T, T - 5 * MIN, "fr"), "à l'instant");
  assert.equal(ageVu(T, T - 5 * MIN, "en"), "just now");
});
