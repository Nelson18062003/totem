// Les trous d'un code USSD, mis à l'épreuve.
//
//     node --test noyau/tests/
//
// Un code à trous se compose sur une VRAIE carte SIM : une fente mal remplie
// envoie l'argent au mauvais endroit, et personne ne s'en aperçoit avant le
// relevé. Ces tests gardent la règle qui l'empêche — chaque trou reçoit SA
// valeur, et un trou sans réponse arrête le parcours au lieu de composer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { remplirVariables } from "../codes.ts";

test("deux trous distincts ne partagent jamais une valeur", () => {
  // « {numero} » et « {point} » se secourent l'un l'autre quand le parcours
  // n'en porte qu'un. Quand il porte LES DEUX, ce secours envoyait le numéro
  // de l'AGENT dans la case du BÉNÉFICIAIRE, sans que rien ne s'arrête.
  const parcours = ["*126*1*{numero}*{point}*{montant}#"];
  const r = remplirVariables(parcours, { point: "650000001", montant: "20000" });
  assert.deepEqual(r.manquantes, ["numero"]);
  assert.equal(r.etapes[0], "*126*1*{numero}*650000001*20000#");

  const r2 = remplirVariables(parcours, { numero: "677123456", montant: "20000" });
  assert.deepEqual(r2.manquantes, ["point"]);

  // Les deux fournis : chacun sa fente, et rien ne manque.
  const r3 = remplirVariables(parcours,
    { numero: "677123456", point: "650000001", montant: "20000" });
  assert.deepEqual(r3.manquantes, []);
  assert.equal(r3.etapes[0], "*126*1*677123456*650000001*20000#");
});

test("le secours entre numero et point tient quand le trou est seul", () => {
  // Le confort d'origine ne doit pas disparaître avec le correctif.
  assert.equal(
    remplirVariables(["*126*1*{numero}*{montant}#"],
                     { point: "650000001", montant: "20000" }).etapes[0],
    "*126*1*650000001*20000#");
  assert.equal(
    remplirVariables(["*805*{point}#"], { numero: "677123456" }).etapes[0],
    "*805*677123456#");
});
