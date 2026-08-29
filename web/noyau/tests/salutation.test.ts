// Comment on salue quelqu'un dont on ne connaît que le courriel.
//
// Le prénom était écrit en dur (« Hello, Nelson »). Ces essais tiennent la
// règle qui l'a remplacé — et surtout ses bords : mieux vaut « Bonjour »
// tout court qu'un « Bonjour, A1b2c3 ».

import { test } from "node:test";
import assert from "node:assert/strict";
import { prenomDuCourriel, salutation } from "../salutation";

test("un courriel ordinaire donne un prénom présentable", () => {
  assert.equal(prenomDuCourriel("nelson@exemple.cm"), "Nelson");
  assert.equal(prenomDuCourriel("NELSON@exemple.cm"), "Nelson");
  assert.equal(prenomDuCourriel("nelson.mbarga@exemple.cm"), "Nelson");
  assert.equal(prenomDuCourriel("nelson-mbarga@exemple.cm"), "Nelson");
  assert.equal(prenomDuCourriel("nelson_m@exemple.cm"), "Nelson");
  assert.equal(prenomDuCourriel("nelson+boutique@exemple.cm"), "Nelson");
});

test("ce qui ne donne rien de présentable ne donne RIEN", () => {
  // Une salutation ratée est pire qu'une salutation absente : « Bonjour,
  // A1b2c3 » donne l'impression d'un logiciel qui parle à un numéro.
  assert.equal(prenomDuCourriel("a1@exemple.cm"), "");
  assert.equal(prenomDuCourriel("42@exemple.cm"), "");
  assert.equal(prenomDuCourriel(""), "");
  assert.equal(prenomDuCourriel(null), "");
  assert.equal(prenomDuCourriel(undefined), "");
});

test("sans compte, on salue sans nom", () => {
  // La clé de secours ouvre une session qui ne désigne personne.
  assert.equal(salutation("fr", null), "Bonjour");
  assert.equal(salutation("en", null), "Hello");
});

test("avec un compte, le prénom entre dans la phrase", () => {
  assert.equal(salutation("fr", "nelson@exemple.cm"), "Bonjour, Nelson");
  assert.equal(salutation("en", "nelson@exemple.cm"), "Hello, Nelson");
});

test("aucun prénom n'est écrit en dur dans les textes", () => {
  // La garde qui empêche que cela recommence : si quelqu'un remet un prénom
  // dans le fichier de textes, cet essai tombe.
  assert.ok(salutation("fr", "amina@exemple.cm").includes("Amina"));
  assert.ok(!salutation("fr", "amina@exemple.cm").includes("Nelson"));
});
