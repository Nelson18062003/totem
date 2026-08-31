// Un écran de données ne ment jamais sur la panne — vérifié sur tout src/.
//
//     node scripts/verifier-les-ecrans.mjs
//
// POURQUOI CE CONTRÔLE EXISTE. Hors ligne, six écrans sur sept montraient
// leur état vide — « Aucun SMS », « Aucune carte dans le terminal », « Rien
// à analyser » — au lieu de dire que la plateforme ne répondait pas. Une
// connexion en panne déguisée en commerce vide : le propriétaire aurait
// couru vérifier sa caisse à Douala pour un problème de réseau à Paris.
//
// LE CONTRAT : tout écran qui lit les données (`useDonnees(`) doit
//   1. récupérer `erreur` (le refus du guichet, déjà dans la bonne langue) ;
//   2. rendre l'ACCROC (`<Accroc`) — le message et son bouton Réessayer.
//
// Comme le harnais du clavier : il lit le code, pas l'écran. Il garantit
// que la vérité est BRANCHÉE, pas qu'elle s'affiche au bon endroit — cela
// reste l'affaire des photos et de l'œil.
//
// SECOND CONTRAT : L'ATTENTE SE MONTRE. Pendant le premier chargement, les
// écrans principaux ne rendaient RIEN — `!chargement ? (contenu) : null`. Un
// écran blanc, sans un mot : le propriétaire ne peut pas distinguer « ça
// arrive » de « c'est cassé », et la seule chose qu'il puisse faire est de
// relancer l'application. Tout écran qui LIT des données doit donc montrer
// une forme d'attente (`Squelette…`) tant qu'elles ne sont pas là.

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
for (const chemin of fichiers(RACINE)) {
  const code = readFileSync(chemin, "utf8");
  if (!/useDonnees\(/.test(code)) continue;
  // Le fournisseur lui-même définit le crochet : il ne se contrôle pas.
  if (chemin.endsWith("donnees.tsx")) continue;

  const court = chemin.replace(RACINE + "/", "");
  const manques = [];
  if (!/\berreur\b/.test(code)) manques.push("ne récupère pas « erreur »");
  if (!/<Accroc/.test(code)) manques.push("ne rend pas l'Accroc");
  // L'ATTENTE SE MONTRE. Un écran qui lit des données et n'affiche RIEN
  // pendant qu'elles arrivent est indiscernable d'un écran cassé. Les écrans
  // qui ne lisent QUE l'état du terminal (`sms: 0, recus: 0`) chargent en un
  // aller-retour minuscule et n'ont rien à faire attendre : on ne leur
  // demande pas de forme.
  const lourd = /useDonnees\(\s*\{[^}]*sms:\s*[1-9]/.test(code);
  if (lourd && !/Squelette/.test(code)) {
    manques.push("ne montre RIEN pendant le chargement (pas de Squelette)");
  }
  if (manques.length) {
    rate++;
    console.error(`  ✗ ${court} — ${manques.join(" ; ")} : hors ligne, ` +
      "son état vide mentira");
  } else {
    console.log(`  ✓ ${court} — dit la panne quand elle est là`);
  }
}

if (rate) {
  console.error(`\n✗ ${rate} écran(s) qui mentiraient hors ligne.`);
  process.exit(1);
}
console.log("\n✓ Aucun écran ne ment : la panne se dit partout.");
