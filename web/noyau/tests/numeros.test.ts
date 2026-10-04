// LE NUMÉRO D'UNE CARTE S'ÉCRIT EN TRANCHES, PARTOUT.
//
//     npm test
//
// POURQUOI CE CONTRÔLE EXISTE. L'accueil écrivait « 677 12 34 56 » sur la
// carte, et l'onglet Comptes, juste à côté, « 677123456 » — le même numéro,
// la même carte, deux écritures. Sur le site comme sur le téléphone, et dans
// les deux pages de la console : quatre endroits, la même ligne
// `{s.numero || …}`, écrite chaque fois sans passer par `formaterNumero`. Un
// numéro se dicte et se recopie par tranches ; collé, on saute un chiffre.
//
// Le contrôle balaie les DEUX surfaces et refuse un numéro affiché tel quel
// avec un texte de repli (« numéro absent ») : c'est la forme exacte que
// prenait la faute. Il porte son témoin : la ligne d'avant doit être prise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = join(fileURLToPath(import.meta.url), "..");
const SURFACES = [
  join(ICI, "..", "..", "app"),
  join(ICI, "..", "..", "lib"),
  join(ICI, "..", "..", "..", "mobile", "src"),
];

/** `{s.numero || t.numeroAbsent}` — un numéro de carte rendu tel quel. */
const NUMERO_BRUT = /\{\s*[\w.]+\.numero\s*(\|\||\?\?)\s*[\w.]+\s*\}/;

function* fichiers(dossier: string): Generator<string> {
  let entrees: string[];
  try { entrees = readdirSync(dossier); } catch { return; }
  for (const nom of entrees) {
    if (nom === "node_modules" || nom === "tests") continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if (/\.tsx$/.test(nom)) yield chemin;
  }
}

test("aucun numéro de carte ne s'affiche collé", () => {
  const fautes: string[] = [];
  for (const racine of SURFACES) {
    for (const chemin of fichiers(racine)) {
      readFileSync(chemin, "utf8").split("\n").forEach((ligne, i) => {
        if (NUMERO_BRUT.test(ligne)) fautes.push(`${chemin.split("/").slice(-3).join("/")}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(fautes, [],
    `ces numéros s'affichent collés : ${fautes.join(", ")} — passer par formaterNumero()`);
});

test("le contrôle regarde vraiment quelque chose", () => {
  // LE TÉMOIN : les quatre lignes d'avant doivent être prises, la nouvelle non.
  assert.ok(NUMERO_BRUT.test("          {s.numero || t.numeroAbsent}"));
  assert.ok(NUMERO_BRUT.test("{c.numero || t.cartes.numeroAbsent}"));
  assert.ok(!NUMERO_BRUT.test("{s.numero ? formaterNumero(s.numero) : t.numeroAbsent}"));
  // Un balayage qui ne trouve aucun écran passerait au vert sans rien voir.
  const combien = SURFACES.reduce((n, r) => n + [...fichiers(r)].length, 0);
  assert.ok(combien > 60, `seulement ${combien} écrans balayés`);
});
