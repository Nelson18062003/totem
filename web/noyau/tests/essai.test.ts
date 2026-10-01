// « Envoyer un essai » : un téléphone qui sonne ne cache plus celui qui se tait.

import { test } from "node:test";
import assert from "node:assert/strict";
import { messageDEssai } from "../essai";
import { textesReglages } from "../textes/reglages";

const t = textesReglages.fr;

test("un Android qui sonne ne cache plus un iPhone muet", () => {
  const r = messageDEssai(t, {
    servis: 1, oublies: 0,
    appareils: [
      { nom: "Pixel 7", plateforme: "android", etat: "remis" },
      { nom: "", plateforme: "ios", etat: "refuse", cause: t.causeSansCle },
    ],
  });
  assert.equal(r.rate, true);
  assert.match(r.texte, /iPhone : n’a pas sonné/);
  assert.match(r.texte, /clé/);
  assert.match(r.texte, /Pixel 7 : a sonné/);
  assert.doesNotMatch(r.texte, /^Remis/);
});

test("tous ont sonné : « Remis »", () => {
  const r = messageDEssai(t, {
    servis: 2, oublies: 0,
    appareils: [
      { nom: "Pixel 7", plateforme: "android", etat: "remis" },
      { nom: "iPhone de Nelson", plateforme: "ios", etat: "remis" },
    ],
  });
  assert.deepEqual(r, { rate: false, texte: t.essaiRemis });
});

test("une plateforme d'avant la règle (sans détail) garde l'ancien sens", () => {
  assert.deepEqual(messageDEssai(t, { servis: 1, oublies: 0 }),
    { rate: false, texte: t.essaiRemis });
  const rien = messageDEssai(t, { servis: 0, oublies: 0, soucis: ["x"] });
  assert.equal(rien.rate, true);
});

test("aucun téléphone inscrit : on le dit", () => {
  assert.deepEqual(messageDEssai(t, { servis: 0, oublies: 0, aucun: true }),
    { rate: true, texte: t.essaiAucunAppareil });
});
