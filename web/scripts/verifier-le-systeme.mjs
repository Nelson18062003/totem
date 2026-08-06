// Le gardien du système. À lancer depuis web/ :
//
//     node scripts/verifier-le-systeme.mjs
//
// Il relit tous les écrans et refuse ce qui sort du système décrit dans
// app/globals.css. Il ne juge pas le goût : il compte, il mesure, il nomme le
// fichier et la ligne. Sortie 1 s'il reste une infraction — de quoi bloquer
// une mise en ligne.
//
// Pourquoi un outil plutôt qu'une consigne : l'interface avait déjà une charte
// (docs/IDENTITE.md), et elle était bonne. Elle n'a pas tenu, parce que rien
// ne la vérifiait. Une règle que personne ne compte n'est pas une règle.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname;
const ECRANS = join(RACINE, "app");

// ── L'échelle d'espacement, fermée. Huit crans, tous multiples de 4 px.
// 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Le pas suit l'amplitude : à 24 px, un
// écart de 4 px ne se voit plus, donc on ne le propose pas.
const CRANS = new Set(["0", "px", "1", "2", "3", "4", "6", "8", "12", "16"]);

// Les noms du système (h-controle, size-icone, h-rangee…) sont toujours admis.
const NOMS = /^(controle|controle-fort|controle-compact|rangee|rangee-2|rangee-3|icone|icone-sm|icone-lg|piste|piste-h|pastille|case|badge|puce|filet|focus|full|auto|dvh|screen|lecture|rail)$/;

// Les propriétés soumises à la grille : espacement et position.
const ESPACEMENT = "(?:p|m)[xytrbl]?|gap(?:-[xy])?|space-[xy]|inset|top|right|bottom|left|start|end";

// Les tailles d'icône autorisées : 16 / 20 / 24. Convergence des systèmes de
// référence, et la seule échelle sur laquelle le trait de 1,5 px tient.
const ICONES = new Set([16, 20, 24]);

const infractions = [];
const signaler = (fichier, ligne, element, constate, regle, attendu) =>
  infractions.push({ fichier, ligne, element, constate, regle, attendu });

function fichiers(dossier) {
  const sortie = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

for (const chemin of fichiers(ECRANS)) {
  const fichier = relative(RACINE, chemin);
  const lignes = readFileSync(chemin, "utf8").split("\n");

  lignes.forEach((texte, i) => {
    const n = i + 1;

    // ── R1 · La grille de 4. Les demi-crans de Tailwind valent 2, 6, 10, 14 px :
    // multiples de 2, jamais de 4. Ce sont eux qui désalignaient les rangées.
    for (const [, classe] of texte.matchAll(
      new RegExp(`\\b((?:${ESPACEMENT})-\\d+\\.5)\\b`, "g"),
    )) {
      const px = Number(classe.match(/(\d+\.5)$/)[1]) * 4;
      signaler(fichier, n, classe, `${px}px`, "R1 grille de 4", "un cran de l'échelle");
    }

    // ── R3 · L'échelle est fermée. Un cran hors des huit n'est pas une nuance :
    // c'est une décision que personne n'a prise.
    for (const [, classe, cran] of texte.matchAll(
      new RegExp(`\\b((?:${ESPACEMENT})-(\\d+))\\b`, "g"),
    )) {
      if (!CRANS.has(cran)) {
        signaler(fichier, n, classe, `${cran * 4}px`, "R3 échelle fermée",
          "4 · 8 · 12 · 16 · 24 · 32 · 48 · 64");
      }
    }

    // ── R3 · Aucune valeur arbitraire. Un [14px] est un jeton qui n'existe pas.
    for (const [, classe] of texte.matchAll(/\b([a-z-]+-\[[0-9.]+(?:px|rem|em)\])/g)) {
      signaler(fichier, n, classe, "valeur libre", "R3 échelle fermée",
        "un jeton du système");
    }

    // ── R4 · Une hauteur se déclare. `h-` et `size-` doivent porter un nom du
    // système ou un cran de l'échelle, jamais un nombre choisi sur place.
    for (const [, classe, valeur] of texte.matchAll(/\b((?:h|min-h|size)-([a-z0-9-]+))\b/g)) {
      if (NOMS.test(valeur) || CRANS.has(valeur)) continue;
      if (/^\d+\.5$/.test(valeur)) continue;            // déjà signalé en R1
      if (/^(\[|full|fit|min|max)/.test(valeur)) continue;
      signaler(fichier, n, classe, valeur, "R4 hauteur déclarée",
        "h-controle · h-controle-fort · h-rangee · size-icone");
    }

    // ── R9 · Les icônes ont trois tailles. Cinq circulaient : 14, 15, 16, 18, 20,
    // 22, 26 — un `size` libre est une échelle ouverte.
    for (const [, valeur] of texte.matchAll(/\bsize=\{(\d+)\}/g)) {
      if (!ICONES.has(Number(valeur))) {
        signaler(fichier, n, `size={${valeur}}`, `${valeur}px`, "R9 échelle d'icônes",
          "16 · 20 · 24");
      }
    }

    // ── R6 · On n'éteint pas un contrôle par l'opacité. `opacity-40` sur du
    // blanc donne 2,6:1, `opacity-30` donne 1,96:1 : du texte illisible.
    for (const [, classe] of texte.matchAll(/\b(disabled:opacity-\d+)/g)) {
      signaler(fichier, n, classe, "texte sous 3:1", "R6 contraste",
        "text-ink-eteint · bg-surface-eteint");
    }

    // ── R6 · Un contour de contrôle se voit. `border-line` vaut 1,26:1 : il
    // sépare, il n'affirme rien. Dès qu'une bordure DIT « ceci est un champ,
    // ceci est un bouton », WCAG 1.4.11 lui impose 3:1 — c'est `border-contour`.
    if (/\bborder-line\b/.test(texte) && /<(button|input|textarea|select|a\b|Link)/i.test(texte)) {
      signaler(fichier, n, "border-line sur un contrôle", "1,26:1", "R6 contraste",
        "border-contour (3,04:1)");
    }
  });
}

// ── Le compte rendu
const parRegle = new Map();
for (const i of infractions) parRegle.set(i.regle, (parRegle.get(i.regle) ?? 0) + 1);

for (const i of infractions) {
  console.log(`${i.fichier}:${i.ligne} / ${i.element} / ${i.constate} / ${i.regle} / ${i.attendu}`);
}

console.log("");
if (infractions.length === 0) {
  console.log("Le système est respecté : aucune dimension hors échelle.");
  process.exit(0);
}
for (const [regle, n] of [...parRegle].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${regle}`);
}
console.log(`${String(infractions.length).padStart(4)}  AU TOTAL`);
process.exit(1);
