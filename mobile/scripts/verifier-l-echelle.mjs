// RIEN NE GROSSIT SANS LIMITE.
//
//     node scripts/verifier-l-echelle.mjs
//
// POURQUOI CE HARNAIS EXISTE. Sur un iPhone 16 Pro Max, l'application
// paraissait « trop grosse » — sur le PLUS GRAND écran de la gamme, où tout
// aurait dû paraître plus petit. La cause n'était pas la mise en page : le
// harnais des formats mesure douze tailles, iPhone compris, et aucune ne
// déborde.
//
// La cause était le réglage « taille du texte » du téléphone, appliqué SANS
// AUCUNE LIMITE. `ecran.ts` portait pourtant `ECHELLE_MAX = 1,35` depuis
// longtemps, avec sa raison écrite : au-delà, les chiffres d'un solde ne
// tiennent plus sur la carte. Elle vivait dans une fonction que personne
// n'appelait.
//
// CE QUE CE HARNAIS GARDE, ET POURQUOI IL EST STATIQUE. La borne ne se
// mesure pas sur l'export web : `maxFontSizeMultiplier` est un réglage
// natif, et react-native-web l'ignore. Un harnais de navigateur sortirait
// donc vert sans rien avoir vérifié — exactement le contrôle qui rassure
// sans regarder.
//
// Ce qui se vérifie, en revanche, c'est que la borne est POSÉE : que tout
// texte et tout champ de saisie de l'application passent par les deux pièces
// d'`ui.tsx` qui la portent. Un `<Text>` écrit en direct, demain, sur un
// écran neuf, échapperait à la règle sans que rien ne le dise — et le défaut
// reviendrait par un seul écran.
//
// TROIS PIÈCES, TROIS RÈGLES DIFFÉRENTES :
//
//   Texte        porte la borne du grossissement
//   ChampTexte   la même, sur ce qu'on tape — un champ déborde plus vite
//                qu'un texte, et on y relit un numéro vers lequel de
//                l'argent va partir
//   Defilement   porte les réglages de défilement, dont
//                « keyboardShouldPersistTaps » : sans lui, clavier ouvert,
//                le premier appui sur un bouton ne fait que fermer le
//                clavier
//
// LE HARNAIS PORTE SON PROPRE TÉMOIN. Une règle qui ne trouve jamais rien
// est indiscernable d'une règle cassée : on lui donne donc un faux écran qui
// contient les trois fautes, et on exige qu'elle les voie toutes les trois.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = new URL("../src/", import.meta.url).pathname;
const PORTEUSE = "ui.tsx";   // la seule qui a le droit d'employer le brut

const REGLES = [
  ["<Text",       "Texte",       "le grossissement n'y serait pas borné"],
  ["<TextInput",  "ChampTexte",  "le champ grossirait sans limite"],
  ["<ScrollView", "Defilement",  "le clavier volerait le premier appui"],
];

function fichiers(dossier) {
  const trouves = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (nom.endsWith(".tsx")) trouves.push(chemin);
  }
  return trouves;
}

/** Les fautes d'un contenu — la même lecture pour l'application et le témoin. */
function fautes(contenu, nomDuFichier) {
  const vues = [];
  const lignes = contenu.split("\n");
  for (const [brut, piece, pourquoi] of REGLES) {
    lignes.forEach((ligne, i) => {
      // LES COMMENTAIRES NE SONT PAS DU CODE. Ce dépôt écrit ses raisons en
      // toutes lettres, et une raison qui parle de « <Text » est exactement
      // ce qu'on veut lire ici. Un premier essai les comptait : la règle
      // aurait puni le fait de l'expliquer.
      const nu = ligne.trim();
      if (nu.startsWith("//") || nu.startsWith("*") || nu.startsWith("/*")) return;
      // « <Text » attrape aussi « <TextInput » : on exige donc que le
      // caractère suivant ferme la balise ou ouvre un attribut.
      const suite = ligne.slice(ligne.indexOf(brut) + brut.length, ligne.indexOf(brut) + brut.length + 1);
      if (!ligne.includes(brut)) return;
      if (brut === "<Text" && !(suite === " " || suite === ">" || suite === "\n" || suite === "")) return;
      vues.push({ fichier: nomDuFichier, ligne: i + 1, brut, piece, pourquoi });
    });
  }
  return vues;
}

// ── LE TÉMOIN ───────────────────────────────────────────────────────────────
const TEMOIN = `
  <Text style={{ fontSize: 16 }}>un texte écrit en direct</Text>
  <TextInput value={x} onChangeText={setX} />
  <ScrollView><View /></ScrollView>
`;
const vuesTemoin = fautes(TEMOIN, "(témoin)");
if (vuesTemoin.length !== 3) {
  console.error("✗ Le témoin n'a pas été vu en entier : la règle ne voit pas");
  console.error(`  ce qu'elle devrait voir (${vuesTemoin.length} faute(s) sur 3).`);
  console.error("  Une règle qui ne trouve jamais rien est indiscernable");
  console.error("  d'une règle cassée. Rien d'autre n'a été vérifié.");
  process.exit(1);
}
console.log("  témoin : les 3 fautes du faux écran sont vues ✓\n");

// ── L'APPLICATION ───────────────────────────────────────────────────────────
const trouvees = [];
for (const chemin of fichiers(RACINE)) {
  if (chemin.endsWith(PORTEUSE)) continue;
  const court = chemin.slice(RACINE.length);
  trouvees.push(...fautes(readFileSync(chemin, "utf8"), court));
}

if (trouvees.length) {
  console.error("✗ Du brut échappe aux pièces qui portent les règles :\n");
  for (const f of trouvees) {
    console.error(`  ${f.fichier}:${f.ligne}`);
    console.error(`    « ${f.brut} » → employer « ${f.piece} » de @/ui`);
    console.error(`    sans quoi ${f.pourquoi}.`);
  }
  process.exit(1);
}

for (const [brut, piece] of REGLES) {
  console.log(`  ✓ aucun « ${brut} » en direct — tout passe par « ${piece} »`);
}
console.log("\n✓ Rien ne grossit sans limite, et rien ne défile sans réglage.");
