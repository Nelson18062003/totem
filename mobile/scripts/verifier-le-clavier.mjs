// Le clavier ne cache jamais ce qu'on tape — vérifié sur TOUT le code.
//
//     node scripts/verifier-le-clavier.mjs
//
// POURQUOI CE CONTRÔLE EXISTE. L'application vit bord à bord
// (edgeToEdgeEnabled) : quand le clavier monte, Android ne redimensionne
// RIEN tout seul. Chaque écran doit donc pousser lui-même son contenu —
// et cette règle a été oubliée écran après écran : l'écran de connexion
// d'abord (le mot de passe se tapait à l'aveugle), puis CHAQUE feuille et
// CHAQUE formulaire ajoutés ensuite, le champ et son bouton exactement là
// où le clavier se pose. Le propriétaire tapait sans voir, « au toucher ».
//
// LE CONTRAT, appliqué à tout fichier de src/ :
//
//   1. feuille.tsx porte KeyboardAvoidingView avec behavior="padding" —
//      c'est la garantie de TOUTES les feuilles (fiches, opérations, pavé).
//   2. Tout fichier qui pose un <TextInput> doit, ou bien envelopper dans
//      un KeyboardAvoidingView à lui, ou bien vivre dans une <Feuille>
//      (qui l'enveloppe pour lui).
//   3. Tout fichier qui a un <TextInput> ET un <ScrollView> doit poser
//      keyboardShouldPersistTaps : sans lui, le premier appui sur un
//      bouton, clavier levé, ne fait que RANGER le clavier — il faut
//      appuyer deux fois, et on croit que le bouton est cassé.
//   4. behavior={Platform.OS === "ios" ? "padding" : undefined} est
//      INTERDIT : « undefined » sur Android ne fait rien du tout — c'est
//      la faute d'origine de l'écran de connexion, on ne la réécrit pas.
//
// CE QUE CE CONTRÔLE NE VOIT PAS, et qu'il faut dire : il lit le code, pas
// l'écran — un vrai clavier Android ne se lève que sur un vrai téléphone.
// Il garantit que la protection est LÀ, pas qu'elle suffit visuellement ;
// l'œil sur l'appareil reste le juge final. Mais chaque bogue de clavier
// rencontré jusqu'ici serait tombé sur l'une de ces quatre règles.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(fileURLToPath(import.meta.url), "..", "..", "src");

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if (/\.tsx?$/.test(nom)) yield chemin;
  }
}

let rate = 0;
const faute = (fichier, regle) => {
  rate++;
  console.error(`  ✗ ${fichier.replace(RACINE + "/", "")} — ${regle}`);
};
const bon = (fichier, quoi) =>
  console.log(`  ✓ ${fichier.replace(RACINE + "/", "")} — ${quoi}`);

// Règle 1 : la feuille elle-même.
const feuille = readFileSync(join(RACINE, "feuille.tsx"), "utf8");
if (!/KeyboardAvoidingView/.test(feuille) || !/behavior="padding"/.test(feuille)) {
  faute(join(RACINE, "feuille.tsx"),
    "la feuille doit porter KeyboardAvoidingView behavior=\"padding\" — " +
    "c'est elle qui protège toutes les fiches");
} else {
  bon(join(RACINE, "feuille.tsx"), "la garantie des feuilles est en place");
}

// Les commentaires ne comptent pas : un commentaire qui RACONTE l'ancienne
// faute (« behavior: undefined ») n'est pas la faute.
const sansCommentaires = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

for (const chemin of fichiers(RACINE)) {
  const brut = readFileSync(chemin, "utf8");
  const code = sansCommentaires(brut);

  // Règle 4 : la faute d'origine, interdite partout.
  if (/behavior=\{?\s*Platform/.test(code) || /behavior:\s*undefined/.test(code)) {
    faute(chemin,
      "behavior conditionné à la plateforme : « undefined » sur Android " +
      "ne pousse rien — écrire behavior=\"padding\" tout court");
  }

  if (!/<TextInput/.test(code)) continue;

  // Règle 2 : qui pousse le contenu quand le clavier monte ? Trois réponses
  // recevables : le fichier s'enveloppe lui-même ; il vit dans une Feuille
  // (qui l'enveloppe pour lui) ; ou il DÉCLARE son hôte — « clavier :
  // protégé par app/reglages.tsx » — et l'hôte nommé doit vraiment porter
  // l'enveloppe : une déclaration ne se croit pas sur parole.
  let protege = /KeyboardAvoidingView/.test(code) || /<Feuille/.test(code);
  const hote = brut.match(/clavier : protégé par ([\w/().-]+\.tsx)/);
  if (!protege && hote) {
    const codeHote = sansCommentaires(
      readFileSync(join(RACINE, hote[1]), "utf8"));
    protege = /KeyboardAvoidingView/.test(codeHote);
    if (!protege) {
      faute(chemin,
        `déclare « protégé par ${hote[1]} », mais l'hôte ne porte pas de ` +
        "KeyboardAvoidingView — la déclaration ment");
      continue;
    }
  }
  if (!protege) {
    faute(chemin,
      "un <TextInput> sans KeyboardAvoidingView ni <Feuille> : le clavier " +
      "couvrira le champ — on tapera à l'aveugle");
  } else {
    bon(chemin, "champ protégé du clavier");
  }

  // Règle 3 : le premier appui compte, clavier levé.
  if (/<ScrollView/.test(code) && !/keyboardShouldPersistTaps/.test(code)) {
    faute(chemin,
      "un <TextInput> et un <ScrollView> sans keyboardShouldPersistTaps : " +
      "le premier appui sur un bouton ne fera que ranger le clavier");
  }
}

if (rate) {
  console.error(`\n✗ ${rate} règle(s) du clavier en défaut.`);
  process.exit(1);
}
console.log("\n✓ Le clavier ne cache rien : toutes les règles tiennent.");
