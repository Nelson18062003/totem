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
import { basename, join } from "node:path";
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

// Les commentaires ne comptent pas : un commentaire qui RACONTE l'ancienne
// faute (« behavior: undefined ») n'est pas la faute.
const sansCommentaires = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// LA PIÈCE COMMUNE, LUE UNE FOIS. `Defilement` porte pour tout le monde le
// réglage qui rend le premier appui utile clavier levé. On le VÉRIFIE ici
// plutôt que de le supposer : neuf écrans en dépendent.
//
// ET ON LE CHERCHE DANS LE CODE, PAS DANS LA PROSE. Un premier jet lisait le
// fichier brut : le commentaire qui EXPLIQUE le réglage — vingt lignes
// au-dessus de lui — suffisait alors à satisfaire la règle. Retirer
// vraiment `keyboardShouldPersistTaps` de `Defilement` laissait le harnais
// vert. C'est la faute que ce fichier évite déjà pour la règle 4, et que
// `verifier-le-journal` a payée avant lui : **un contrôle qui lit ce qu'on
// dit au lieu de ce qu'on fait ne contrôle rien.**
const PIECES = sansCommentaires(readFileSync(join(RACINE, "ui.tsx"), "utf8"));
const DEFILEMENT_PROTEGE = /keyboardShouldPersistTaps/.test(PIECES);
if (!/KeyboardAvoidingView/.test(feuille) || !/behavior="padding"/.test(feuille)) {
  faute(join(RACINE, "feuille.tsx"),
    "la feuille doit porter KeyboardAvoidingView behavior=\"padding\" — " +
    "c'est elle qui protège toutes les fiches");
} else {
  bon(join(RACINE, "feuille.tsx"), "la garantie des feuilles est en place");
}

for (const chemin of fichiers(RACINE)) {
  const brut = readFileSync(chemin, "utf8");
  const code = sansCommentaires(brut);

  // `ui.tsx` DÉFINIT les pièces, il n'en montre aucune. Le `<TextInput>`
  // qu'il contient est celui de `ChampTexte` : lui demander un
  // KeyboardAvoidingView n'aurait pas de sens — il n'y a pas d'écran ici,
  // donc pas de clavier à éviter.
  //
  // Ce n'est pas une exemption de complaisance, et la nuance compte :
  // « exempter un harnais, c'est le rendre aveugle ». Ce qui se passe DANS
  // ces pièces est gardé ailleurs — `verifier-l-echelle` exige qu'elles
  // soient les seules à employer le brut, et la règle 3 ci-dessous va lire
  // `ui.tsx` pour vérifier que `Defilement` porte vraiment son réglage.
  //
  // ON COMPARE LE NOM ENTIER, PAS UNE FIN DE CHAÎNE. Écrite
  // `chemin.endsWith("ui.tsx")`, cette ligne écartait AUSSI
  // « reglages-qui.tsx » — « qui.tsx » finit par « ui.tsx ». Un vrai écran,
  // avec un vrai champ de saisie, disparaissait de la liste sans un mot :
  // ni ✓ ni ✗, juste absent. Le harnais sortait vert en gardant un écran de
  // moins.
  //
  // C'est la démonstration de ce que ce dépôt répète : **exempter un
  // harnais, c'est le rendre aveugle** — et une exemption trop large est
  // pire qu'une exemption, parce qu'elle ne se voit nulle part.
  if (basename(chemin) === "ui.tsx") continue;

  // Règle 4 : la faute d'origine, interdite partout.
  if (/behavior=\{?\s*Platform/.test(code) || /behavior:\s*undefined/.test(code)) {
    faute(chemin,
      "behavior conditionné à la plateforme : « undefined » sur Android " +
      "ne pousse rien — écrire behavior=\"padding\" tout court");
  }

  // UN CHAMP, C'EST « <TextInput> » OU « <ChampTexte> ».
  //
  // Les écrans ne posent plus de `<TextInput>` en direct : ils passent tous
  // par `ChampTexte` (`ui.tsx`), qui borne le grossissement — un champ suit
  // le réglage « taille du texte » du téléphone exactement comme un texte,
  // et sans limite il déborde de sa boîte.
  //
  // Si ce harnais n'avait appris que le premier nom, il aurait continué à
  // sortir VERT en ne trouvant plus un seul champ à garder. **Une règle qui
  // ne trouve plus rien ressemble à une règle satisfaite.** C'est la panne
  // la plus discrète qu'un harnais puisse avoir, et elle arrive précisément
  // quand on renomme quelque chose.
  if (!/<(TextInput|ChampTexte)\b/.test(code)) continue;

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
  //
  // Ce réglage se posait écran par écran. Il vit maintenant dans
  // `Defilement` (`ui.tsx`), par où tout ce qui défile passe — donc un écran
  // qui l'emploie est couvert sans rien écrire.
  //
  // MAIS ON NE LE CROIT PAS SUR PAROLE, exactement comme pour l'hôte déclaré
  // plus haut : on va LIRE `ui.tsx`. Le jour où quelqu'un retire ce réglage
  // de la pièce commune, neuf écrans le perdent d'un coup et aucun ne le
  // dira.
  const defile = /<Defilement\b/.test(code);
  const brutQuiDefile = /<ScrollView\b/.test(code);
  if (defile && !DEFILEMENT_PROTEGE) {
    faute(chemin,
      "emploie <Defilement>, mais ui.tsx ne pose plus " +
      "keyboardShouldPersistTaps : le premier appui sur un bouton ne fera " +
      "que ranger le clavier, sur tous les écrans à la fois");
  }
  if (brutQuiDefile && !/keyboardShouldPersistTaps/.test(code)) {
    faute(chemin,
      "un champ et un <ScrollView> sans keyboardShouldPersistTaps : " +
      "le premier appui sur un bouton ne fera que ranger le clavier");
  }
}

if (rate) {
  console.error(`\n✗ ${rate} règle(s) du clavier en défaut.`);
  process.exit(1);
}
console.log("\n✓ Le clavier ne cache rien : toutes les règles tiennent.");
