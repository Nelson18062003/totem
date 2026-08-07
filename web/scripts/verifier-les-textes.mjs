/**
 * LES DEUX DICTIONNAIRES DISENT LA MÊME CHOSE — ou rien ne part.
 *
 * L'application est bilingue : chaque phrase existe en anglais (la langue par
 * défaut) ET en français (la langue du dépôt). Une clé écrite d'un seul côté
 * ne se voit pas : elle s'affiche vide, ou en anglais au milieu d'un écran
 * français, chez quelqu'un qui n'a pas demandé.
 *
 * TypeScript pose déjà `const fr: typeof en` : il refuse une clé manquante à
 * la compilation. Ce contrôle-ci refait le compte à l'exécution, sur les
 * fichiers tels qu'ils sont, et l'écrit noir sur blanc — y compris pour les
 * clés imbriquées (`reseau.faible`, `cat.encaissement`, `libellesCodes.menu`).
 *
 *   node scripts/verifier-les-textes.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = join(RACINE, "lib", "textes");

/** Les feuilles d'un dictionnaire, en chemins pointés et triés. */
function feuilles(objet, prefixe = "") {
  const sorties = [];
  for (const [cle, valeur] of Object.entries(objet)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    if (valeur && typeof valeur === "object" && !Array.isArray(valeur)) {
      sorties.push(...feuilles(valeur, chemin));
    } else {
      sorties.push(chemin);
    }
  }
  return sorties.sort();
}

// Les dictionnaires sont du TypeScript : on les lit avec le compilateur du
// projet, en les transpilant à la volée vers un module que Node sait charger.
const ts = await import("typescript");
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".ts")).sort();

let total = 0;
let bancals = 0;
const lignes = [];

for (const fichier of fichiers) {
  const source = readFileSync(join(DOSSIER, fichier), "utf8")
    // `api.ts` importe le type `Langue`, `sms.ts` le type `Categorie` : des
    // types, effacés à la compilation, mais dont l'import ferait échouer le
    // chargement du module isolé. On les retire, ainsi que les `satisfies`.
    .replace(/^import type .*$/gm, "")
    .replace(/ satisfies Record<[^>]*>/g, "")
    .replace(/: Categorie \| null/g, "");
  const js = ts.default.transpileModule(source, {
    compilerOptions: { module: ts.default.ModuleKind.ESNext, target: ts.default.ScriptTarget.ES2022 },
  }).outputText;
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
  const dictionnaire = Object.values(module).find((v) => v && v.en && v.fr);
  const en = feuilles(dictionnaire.en);
  const fr = feuilles(dictionnaire.fr);
  const manquantesFr = en.filter((c) => !fr.includes(c));
  const manquantesEn = fr.filter((c) => !en.includes(c));
  const bancal = manquantesFr.length || manquantesEn.length;
  if (bancal) bancals++;
  total += en.length;
  lignes.push(
    `  ${fichier.padEnd(16)} en ${String(en.length).padStart(3)}   fr ${String(fr.length).padStart(3)}   ` +
      (bancal
        ? `✗ manquant en fr : ${manquantesFr.join(", ") || "—"} · en en : ${manquantesEn.join(", ") || "—"}`
        : "✓"),
  );
}

console.log("\nLes clés des dictionnaires, dans les deux langues\n");
console.log(lignes.join("\n"));
console.log(`\n  ${"TOTAL".padEnd(16)} ${total} clés par langue, ${total * 2} en tout\n`);

if (bancals) {
  console.error(`✗ ${bancals} dictionnaire(s) bancal(s).`);
  process.exit(1);
}
console.log("✓ Les deux langues ont exactement les mêmes clés.\n");
