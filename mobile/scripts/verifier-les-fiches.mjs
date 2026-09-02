// UNE FICHE NE CACHE RIEN — vérifié sur tout src/.
//
//     node scripts/verifier-les-fiches.mjs
//
// POURQUOI CE CONTRÔLE EXISTE. Le titre de la fiche d'un SMS portait
// « numberOfLines={1} » : un nom un peu long s'affichait « NKENGAFAC
// MBOUNGOU J… ». Or on OUVRE une fiche pour savoir qui a payé — c'est
// exactement la question à laquelle les trois points refusaient de répondre.
// Le web faisait la même chose, avec « truncate ».
//
// LA RÈGLE, et elle tient en une phrase :
//
//     ON TRONQUE DANS UNE LISTE, JAMAIS DANS UNE FICHE.
//
// Dans une liste, les lignes doivent s'aligner : un nom trop long se coupe,
// et c'est juste — l'œil parcourt une colonne, il ne lit pas. Dans une fiche,
// on a demandé à voir : couper y est un contresens.
//
// TROIS CHOSES SONT GARDÉES :
//
//   1. le SUJET d'une fiche — ce que porte « entete={…} » d'une Feuille ;
//   2. la VALEUR d'une rangée « libellé · valeur » : la référence de
//      l'opérateur (« PP240829.1042.A31245 ») est ce qu'on recopie pour
//      réclamer auprès de MTN quand une opération est contestée. Coupée, elle
//      ne sert à rien — et donne l'illusion de l'avoir ;
//   3. un COURRIEL, où qu'il soit. C'est sur lui qu'on décide d'ouvrir la
//      caisse à quelqu'un, et « jean@exemp… » ressemble beaucoup à
//      « jean@exemple-piege.cm ».
//
// Une liste DANS une feuille reste une liste : les cartes de `reglages-cartes`
// et les raccourcis de `reglages-codes` se coupent, et c'est bien.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(fileURLToPath(import.meta.url), "..", "..", "src");

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if (/\.tsx$/.test(nom)) yield chemin;
  }
}

/** Le bloc « entete={ … } », accolades équilibrées. */
function enteteDe(source) {
  const debut = source.indexOf("entete={");
  if (debut === -1) return null;
  let profondeur = 0;
  for (let i = debut + "entete=".length; i < source.length; i++) {
    if (source[i] === "{") profondeur++;
    else if (source[i] === "}") {
      profondeur--;
      if (profondeur === 0) return source.slice(debut, i + 1);
    }
  }
  return null;
}

let echecs = 0;
let fiches = 0;

for (const chemin of fichiers(RACINE)) {
  const source = readFileSync(chemin, "utf8");
  const court = chemin.slice(RACINE.length + 1);

  // --- 1. Le sujet d'une fiche -------------------------------------------
  const entete = enteteDe(source);
  if (entete) {
    fiches++;
    if (/numberOfLines=\{1\}/.test(entete)) {
      console.log(`  ✗ ${court} — le SUJET de la fiche est coupé à une ligne`);
      echecs++;
    } else {
      console.log(`  ✓ ${court} — le sujet de la fiche se lit en entier`);
    }
  }

  // --- 2. La valeur d'une rangée « libellé · valeur » --------------------
  const rangee = source.match(/function Rangee\([\s\S]{0,900}?\n\}/);
  if (rangee && /numberOfLines=\{1\}/.test(rangee[0])) {
    console.log(`  ✗ ${court} — la VALEUR d'une rangée est coupée `
      + "(une référence d'opérateur coupée ne sert à rien)");
    echecs++;
  }

  // --- 3. Un courriel, où qu'il soit -------------------------------------
  //
  // On regarde la BALISE qui l'entoure, pas sa ligne : « numberOfLines » et
  // « {c.courriel} » sont presque toujours sur deux lignes différentes, et un
  // contrôle ligne à ligne les manque tous les deux. Premier essai écrit
  // ainsi — il ne voyait rien, et passait au vert.
  for (const trouve of source.matchAll(/\.courriel\s*\}/g)) {
    const avant = source.slice(Math.max(0, trouve.index - 400), trouve.index);
    const ouverture = avant.lastIndexOf("<Texte");
    if (ouverture === -1) continue;
    const balise = avant.slice(ouverture);
    if (/numberOfLines=\{1\}/.test(balise)) {
      const ligne = source.slice(0, trouve.index).split("\n").length;
      console.log(`  ✗ ${court}:${ligne} — un COURRIEL est coupé `
        + "(c'est sur lui qu'on décide d'ouvrir la caisse)");
      echecs++;
    }
  }
}

console.log("");
if (fiches === 0) {
  console.log("✗ Aucune fiche trouvée : ce contrôle ne regarde rien.");
  process.exit(1);
}
console.log(echecs === 0
  ? `✓ Les ${fiches} fiches ne cachent rien : on les a ouvertes pour tout voir.\n`
  : `✗ ${echecs} endroit(s) où une fiche cache ce qu'on est venu y chercher.\n`);
process.exit(echecs === 0 ? 0 : 1);
