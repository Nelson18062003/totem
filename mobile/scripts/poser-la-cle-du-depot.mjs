// Poser la clé d'Apple dans le profil de dépôt d'eas.json, au moment de déposer.
//
//     node scripts/poser-la-cle-du-depot.mjs essai ./app-store-connect.p8
//
// POURQUOI CE SCRIPT EXISTE, ET CE QU'IL CORRIGE.
//
// Le workflow donnait la clé à `eas submit` par trois variables
// d'environnement — EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID,
// EXPO_ASC_ISSUER_ID — et un commentaire affirmait que c'était « le chemin
// DOCUMENTÉ ». Ce commentaire était faux, et il l'a été pendant trois
// lancements.
//
// Ces trois variables SONT documentées, mais pour la COMPILATION : elles
// servent à réparer une signature abîmée. `eas submit` ne les lit pas. Il
// cherche la clé dans le profil de dépôt d'eas.json, ou dans ce qu'il a
// rangé sur son serveur — et quand il ne trouve ni l'un ni l'autre, il
// répond :
//
//     App Store Connect credentials are incomplete, skipping TestFlight setup
//     App Store Connect API Keys cannot be set up in --non-interactive mode.
//
// « Incomplete » alors que les trois variables étaient posées : elles
// n'étaient simplement pas lues. C'est la deuxième fois qu'une affirmation
// écrite de mémoire dans ce dépôt coûte des allers-retours ; les champs
// employés ici — `ascApiKeyPath`, `ascApiKeyId`, `ascApiKeyIssuerId` — ont
// été relus dans la documentation avant d'être écrits.
//
// POURQUOI UN SCRIPT PLUTÔT QUE DES VALEURS DANS LE FICHIER. eas.json ne
// remplace aucune variable : ce qu'on y écrit est écrit pour de bon, et
// part dans le dépôt. L'identifiant de la clé et celui de l'émetteur ne
// sont pas des secrets au sens strict — sans le fichier .p8 ils n'ouvrent
// rien — mais ils désignent une clé qui, elle, publie sur l'App Store. On
// les pose donc à la compilation, depuis les secrets de GitHub, comme
// l'adresse de la plateforme : ils ne traversent aucun commit.
//
// C'est le même geste que `poser-l-adresse`, sur un autre fichier.

import { readFileSync, writeFileSync } from "node:fs";

const profil = (process.argv[2] || "").trim();
const chemin = (process.argv[3] || "").trim();
const cle = (process.env.ASC_CLE_ID || "").trim();
const emetteur = (process.env.ASC_EMETTEUR_ID || "").trim();

if (!profil || !chemin) {
  console.error("✗ Il faut le profil et le chemin de la clé.");
  console.error("  node scripts/poser-la-cle-du-depot.mjs essai ./app-store-connect.p8");
  process.exit(1);
}

// SANS LES IDENTIFIANTS, on ne fait rien et on le DIT. Le workflow sait déjà
// se rabattre sur un dépôt à la main ; il ne doit pas échouer ici, il doit
// échouer là où le message est utile.
if (!cle || !emetteur) {
  console.log("ASC_CLE_ID ou ASC_EMETTEUR_ID est vide : eas.json reste tel quel.");
  console.log("Le paquet devra être déposé à la main.");
  process.exit(0);
}

const fichier = new URL("../eas.json", import.meta.url);
const avant = readFileSync(fichier, "utf8");

let arbre;
try {
  arbre = JSON.parse(avant);
} catch (e) {
  console.error(`✗ eas.json n'est pas du JSON lisible (${e.message}).`);
  process.exit(1);
}

// ON NE RÉÉCRIT PAS UN FICHIER QU'ON NE SAIT PAS REPRODUIRE.
//
// Réécrire tout le fichier n'est acceptable que si, SANS RIEN CHANGER, on
// le retrouve à l'octet près. Sinon on vient d'effacer une mise en forme
// que quelqu'un a voulue, pour poser trois lignes. On le vérifie avant de
// toucher à quoi que ce soit.
const rendu = (o) => JSON.stringify(o, null, 2) + "\n";
if (rendu(arbre) !== avant) {
  console.error("✗ eas.json n'est pas dans la mise en forme que ce script sait rendre.");
  console.error("  Le réécrire abîmerait le reste du fichier. Rien n'a changé.");
  process.exit(1);
}

const depot = arbre.submit?.[profil];
if (!depot) {
  console.error(`✗ Le profil de dépôt « ${profil} » n'existe pas dans eas.json.`);
  console.error(`  Profils connus : ${Object.keys(arbre.submit ?? {}).join(", ") || "aucun"}`);
  process.exit(1);
}

depot.ios = {
  ...(depot.ios ?? {}),
  ascApiKeyPath: chemin,
  ascApiKeyId: cle,
  ascApiKeyIssuerId: emetteur,
};

const apres = rendu(arbre);
writeFileSync(fichier, apres);

// Relu après écriture, pas supposé.
try {
  const relu = JSON.parse(readFileSync(fichier, "utf8")).submit[profil].ios;
  if (relu.ascApiKeyPath !== chemin) throw new Error("chemin");
  if (relu.ascApiKeyId !== cle) throw new Error("clé");
  if (relu.ascApiKeyIssuerId !== emetteur) throw new Error("émetteur");
} catch (e) {
  writeFileSync(fichier, avant);   // on repose le fichier d'origine
  console.error(`✗ eas.json n'a pas pris la clé (${e.message}). Rien n'a changé.`);
  process.exit(1);
}

// LES VALEURS NE S'AFFICHENT PAS. Ce qu'on veut savoir, c'est qu'elles sont
// là — pas ce qu'elles valent. GitHub les masquerait de toute façon, et un
// journal plein d'astérisques n'apprend rien à personne.
console.log(`✓ Clé d'Apple posée dans le profil de dépôt « ${profil} ».`);
if (depot.ios.ascAppId) {
  console.log(`  Fiche App Store visée : ${depot.ios.ascAppId}`);
} else {
  console.log("  ⚠ Aucun « ascAppId » sur ce profil : le dépôt ne saura pas");
  console.log("    dans quelle fiche déposer.");
}
