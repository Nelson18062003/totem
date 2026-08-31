// UNE DATE SE LIT DANS LA LANGUE DE L'ÉCRAN, pas dans celle de l'appareil.
//
//     npm test
//
// POURQUOI CE CONTRÔLE EXISTE. L'écran des comptes affichait « Last signed in
// 8/31/2026 » : un mois avant un jour, format américain, au milieu d'une
// application française pour le Cameroun. La cause tient en un argument
// manquant — `toLocaleDateString()` sans locale suit le réglage de
// l'APPAREIL, pas la langue choisie dans l'application. Un propriétaire dont
// le téléphone est en anglais lisait donc des dates américaines sur un écran
// en français.
//
// Ce n'est pas qu'une question de goût : « 8/31 » et « 31/8 » se confondent
// onze mois sur douze, et sur une date on ne devine pas.
//
// Le contrôle balaie les DEUX surfaces — la plateforme et le téléphone — car
// la faute était aux deux endroits, écrite deux fois de la même façon.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = join(fileURLToPath(import.meta.url), "..");
const SURFACES = [
  join(ICI, "..", "..", "app"),
  join(ICI, "..", "..", "lib"),
  join(ICI, ".."),                      // le noyau lui-même
  join(ICI, "..", "..", "..", "mobile", "src"),
];

function* fichiers(dossier: string): Generator<string> {
  let entrees: string[];
  try { entrees = readdirSync(dossier); } catch { return; }
  for (const nom of entrees) {
    if (nom === "node_modules" || nom === "tests") continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if (/\.tsx?$/.test(nom)) yield chemin;
  }
}

test("aucune date ne suit la langue de l'appareil", () => {
  const fautes: string[] = [];
  for (const racine of SURFACES) {
    for (const chemin of fichiers(racine)) {
      const source = readFileSync(chemin, "utf8");
      source.split("\n").forEach((ligne, i) => {
        // Sans argument : `toLocaleDateString()` ou `toLocaleTimeString()`.
        // Avec une locale explicite, c'est un choix — on ne dit rien.
        if (/\.toLocale(Date|Time)String\(\s*\)/.test(ligne)) {
          fautes.push(`${chemin.split("/").slice(-2).join("/")}:${i + 1}`);
        }
      });
    }
  }
  assert.deepEqual(fautes, [],
    "ces dates suivent le réglage de l'appareil au lieu de la langue de "
    + `l'écran : ${fautes.join(", ")} — passer par dateVue()`);
});

test("le contrôle regarde vraiment quelque chose", () => {
  // Un balayage qui ne trouve aucun fichier passerait au vert sans rien voir.
  const combien = SURFACES.reduce((n, r) => n + [...fichiers(r)].length, 0);
  assert.ok(combien > 100, `seulement ${combien} fichiers balayés`);
});
