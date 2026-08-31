// UN APPUI, UNE DEMANDE — vérifié sur tout src/.
//
//     node scripts/verifier-les-gestes.mjs
//
// POURQUOI CE CONTRÔLE EXISTE. Tous les écrans qui déposent une demande au
// terminal se gardaient de la même façon : un état React « envoi », et un
// bouton `disabled={etat === "envoi"}`. Cela ne garde RIEN contre un double
// appui — l'état React ne change pas au moment où on l'écrit, il change au
// rendu suivant. Deux appuis rapprochés lisent donc tous les deux « repos »,
// et partent tous les deux.
//
// Sur un téléphone, deux appuis rapprochés ne sont pas une acrobatie : c'est
// ce que fait n'importe qui devant un bouton qui ne réagit pas tout de suite.
// Et à Douala, un bouton ne réagit pas tout de suite.
//
// LE CONTRAT : tout appel à `deposerCommande` doit
//   1. passer par `useGesteUnique` — le verrou synchrone, fermé à l'instant
//      de l'appui et non au rendu suivant ;
//   2. joindre une CLÉ D'INTENTION — pour l'autre cas, celui où la demande
//      est bien arrivée mais où la réponse s'est perdue, et où la personne
//      recommence de bonne foi.
//
// Comme le harnais des écrans : il lit le CODE. Il garantit que la garde est
// branchée, pas qu'elle est jolie — cela reste l'affaire de l'œil.
//
// Deux envois échappent au contrat, et c'est écrit ici plutôt que deviné :
// « ussd_fin » raccroche une session. Le raccrocher deux fois ne coûte rien
// et ne transfère rien ; l'exiger obligerait à garder un verrou pendant le
// démontage de l'écran, là où justement plus rien ne doit bloquer.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(fileURLToPath(import.meta.url), "..", "..", "src");
const DISPENSES = ["ussd_fin"];

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if (/\.tsx?$/.test(nom)) yield chemin;
  }
}

let echecs = 0;
let vus = 0;

for (const chemin of fichiers(RACINE)) {
  if (chemin.endsWith("guichet.ts")) continue;      // la définition, pas un appel
  const source = readFileSync(chemin, "utf8");
  const court = chemin.slice(RACINE.length + 1);

  // Chaque appel à `deposerCommande(...)`, avec ses arguments.
  const appels = [...source.matchAll(/deposerCommande\(([\s\S]{0,320}?)\)\s*[;,\n]/g)];
  for (const appel of appels) {
    const args = appel[1];
    const genre = (args.match(/"(\w+)"/) ?? [])[1] ?? "?";
    if (DISPENSES.includes(genre)) continue;
    vus++;

    // Quatre arguments : genre, paramètres, terminal, CLÉ.
    const virgulesDeTete = args.split("").reduce((acc, c) => {
      if ("([{".includes(c)) acc.profondeur++;
      else if (")]}".includes(c)) acc.profondeur--;
      else if (c === "," && acc.profondeur === 0) acc.n++;
      return acc;
    }, { n: 0, profondeur: 0 }).n;

    const aUneCle = virgulesDeTete >= 3;
    if (!aUneCle) {
      console.log(`  ✗ ${court} — « ${genre} » part sans clé d'intention`);
      echecs++;
    } else {
      console.log(`  ✓ ${court} — « ${genre} » porte sa clé`);
    }
  }

  // LE VERROU SYNCHRONE, quel que soit son nom. Ce qui compte n'est pas
  // d'appeler `useGesteUnique` : c'est qu'un drapeau soit LU et POSÉ avant
  // le premier `await`, sans passer par un rendu. `operation.tsx` le fait à
  // la main depuis plus longtemps que le crochet n'existe — exiger le nom
  // du crochet obligerait à réécrire l'écran le plus vérifié de tous pour
  // n'y rien changer.
  const verrouALaMain = /if\s*\(\s*(\w+)\.current\s*\)\s*return;?\s*\1\.current\s*=\s*true/
    .test(source);
  if (appels.some((a) => !DISPENSES.includes((a[1].match(/"(\w+)"/) ?? [])[1]))
      && !source.includes("useGesteUnique") && !verrouALaMain) {
    console.log(`  ✗ ${court} — dépose une demande sans verrou synchrone : `
      + "un double appui part deux fois");
    echecs++;
  }
}

console.log("");
if (vus === 0) {
  console.log("✗ Aucun appel trouvé : ce contrôle ne regarde rien.");
  process.exit(1);
}
console.log(echecs === 0
  ? `✓ Les ${vus} gestes d'argent partent une fois, et une seule.\n`
  : `✗ ${echecs} geste(s) mal gardé(s).\n`);
process.exit(echecs === 0 ? 0 : 1);
