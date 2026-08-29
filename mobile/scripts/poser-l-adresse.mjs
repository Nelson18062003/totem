// Poser l'adresse de la plateforme dans app.json, au moment de compiler.
//
//     node scripts/poser-l-adresse.mjs https://mon-totem.vercel.app
//
// POURQUOI CE SCRIPT EXISTE. Le propriétaire ne devrait JAMAIS avoir à taper
// l'adresse de son serveur dans l'application. Une application sait où est
// son serveur : on ouvre, on met son courriel et son mot de passe, on entre.
//
// Elle ne le savait plus pour une raison précise : l'adresse écrite en dur
// était un exemple repris d'une documentation, et ce sous-domaine
// appartenait à quelqu'un d'autre. On l'a donc retirée plutôt que d'en
// deviner une seconde — mais laisser le champ vide reporte le travail sur
// la personne, à chaque installation. C'est exactement ce qu'il fallait
// éviter.
//
// La bonne place est ICI : l'adresse entre dans le paquet à la compilation,
// depuis un réglage de GitHub que le propriétaire pose UNE fois. Elle ne
// traverse aucune conversation, elle n'est écrite dans aucun commit, et
// personne n'a à la retaper sur un téléphone.
//
// CE N'EST PAS UN SECRET. Une adresse web est publique par nature — elle est
// dans la barre du navigateur de quiconque ouvre la plateforme. Elle vit
// donc dans une « variable » GitHub, pas dans un « secret » : la ranger
// comme un secret laisserait croire qu'elle en est un.
//
// SANS ARGUMENT, le script ne fait rien et le dit. Une compilation ne doit
// pas échouer parce que le réglage n'est pas encore posé : l'application
// demandera l'adresse à l'écran, comme avant. C'est moins bien, ce n'est
// pas cassé.

import { readFileSync, writeFileSync } from "node:fs";

const brute = (process.argv[2] || "").trim();

if (!brute) {
  console.log("Aucune adresse fournie : app.json reste tel quel.");
  console.log("L'application demandera l'adresse à l'écran de connexion.");
  console.log("");
  console.log("Pour ne plus jamais la taper : GitHub → le dépôt → Settings →");
  console.log("Secrets and variables → Actions → onglet « Variables » →");
  console.log("New repository variable → nom : ADRESSE_PLATEFORME,");
  console.log("valeur : l'adresse que Vercel vous a donnée.");
  process.exit(0);
}

// Le « / » final s'enlève : les chemins qu'on colle derrière commencent tous
// par « / », et « https://x.app//api » ne mène nulle part.
const adresse = brute.replace(/\/+$/, "");

// On EXIGE https. Le mot de passe du propriétaire passe par cette adresse ;
// en clair, il voyagerait à la vue de tout le réseau traversé. Mieux vaut
// refuser une compilation que livrer une application qui fuit.
let hote;
try {
  const u = new URL(adresse);
  if (u.protocol !== "https:") throw new Error("protocole");
  hote = u.hostname;
  if (!hote) throw new Error("hôte");
} catch {
  console.error(`✗ « ${brute} » n'est pas une adresse utilisable.`);
  console.error("  Elle doit commencer par https:// et porter un nom de");
  console.error("  domaine — par exemple https://mon-totem.vercel.app");
  process.exit(1);
}

const chemin = new URL("../app.json", import.meta.url);
const avant = readFileSync(chemin, "utf8");

// ON REMPLACE LA LIGNE, PAS LE FICHIER.
//
// Relire le JSON puis le réécrire aurait été plus court — et aurait touché
// tout le fichier au passage : `JSON.stringify` rend les accents et les
// tirets cadratins en clair là où le dépôt les écrit en `\u2014`. Cinq lignes
// changées au lieu d'une, pour un seul réglage posé. Un diff illisible finit
// par n'être plus lu du tout.
//
// On vise donc la valeur, et elle seule.
const RE = /("adressePlateforme"\s*:\s*)"[^"]*"/;
if (!RE.test(avant)) {
  console.error("✗ La clé « adressePlateforme » est introuvable dans app.json.");
  console.error("  Elle vit sous `expo.extra`. Si elle a été renommée, ce");
  console.error("  script doit l'être aussi — plutôt que d'écrire à côté.");
  process.exit(1);
}
const apres = avant.replace(RE, `$1${JSON.stringify(adresse)}`);
writeFileSync(chemin, apres);

// Le fichier doit rester du JSON valide : une compilation qui échoue plus
// tard sur un app.json cassé se diagnostique très mal.
try {
  const relu = JSON.parse(apres);
  if (relu.expo.extra.adressePlateforme !== adresse) throw new Error("valeur");
} catch (e) {
  writeFileSync(chemin, avant);   // on repose le fichier d'origine
  console.error(`✗ app.json serait devenu invalide (${e.message}). Rien n'a changé.`);
  process.exit(1);
}

console.log(`✓ Adresse posée dans le paquet : ${adresse}`);
console.log("  L'écran de connexion ne la demandera plus.");
