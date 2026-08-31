// Ce que l'application EMPORTE vraiment, vérifié dans le paquet compilé.
//
//     node scripts/verifier-le-paquet.mjs
//
// Deux questions, et la seconde est la seule qui compte vraiment :
//
//   1. Le noyau partagé est-il bien dedans ? (dictionnaire, icônes)
//   2. UN SECRET A-T-IL FUI ?
//
// Une application installée se démonte : tout ce qui entre dans ce fichier
// est public, pour toujours. La clé de service, l'adresse de la base, le mot
// de passe — rien de tout cela ne doit s'y trouver. L'application ne connaît
// que la plateforme et son propre jeton.
//
// Piège rencontré en écrivant ce script : Hermes range les chaînes ACCENTUÉES
// en UTF-16 et les chaînes ASCII dans une table compactée. Chercher en UTF-8
// seulement fait croire que le français a disparu. On cherche donc les deux.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sortie = mkdtempSync(join(tmpdir(), "totem-paquet-"));
console.log("Compilation du paquet Android…\n");
execFileSync("npx", ["expo", "export", "--platform", "android", "--output-dir", sortie],
  { stdio: "ignore" });

const dossier = join(sortie, "_expo/static/js/android");
const paquet = readdirSync(dossier).find((f) => f.endsWith(".hbc") || f.endsWith(".js"));
const octets = readFileSync(join(dossier, paquet));

const dedans = (s) =>
  octets.includes(Buffer.from(s, "utf8")) || octets.includes(Buffer.from(s, "utf16le"));

let echecs = 0;
const doitEtre = (present, quoi) => {
  const ok = dedans(quoi) === present;
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${present ? "présent " : "absent  "} ${quoi}`);
};

console.log(`Paquet : ${(octets.length / 1e6).toFixed(1)} Mo\n`);

console.log("Le noyau partagé voyage bien avec l'application");
[
  "The Mobile Money PIN is never asked for here",  // le dictionnaire anglais
  "Se connecter",                                   // le dictionnaire français
  "français",                                       // …accents compris
  "M3.5 10.5 12 4l8.5 6.5",                         // la géométrie des icônes
  "M4 13V6h16v7",
].forEach((s) => doitEtre(true, s));

console.log("\nL'application ne parle qu'à la plateforme");
["/api/session", "/api/donnees", "/api/appareil", "/api/inscription",
 "/api/plateforme", "totem.jeton"].forEach((s) => doitEtre(true, s));

// Les mises à jour à distance sont-elles vraiment branchées ? Sans cette
// adresse dans le paquet, l'application installée ne saura jamais où
// chercher une correction — et il faudra réinstaller à la main pour la
// moindre virgule. La compilation ne le signale pas : elle réussit,
// simplement l'application est sourde. C'est le genre de manque qu'on ne
// découvre que le jour où l'on a besoin de corriger vite.
doitEtre(true, "u.expo.dev");

console.log("\nAUCUN SECRET N'A FUI");

// Ces sept-là sont des NOMS de variables. Un secret qui fuit, lui, fuit par
// sa VALEUR : personne n'écrit « SUPABASE_CLE » à côté de la clé dans un
// paquet compilé. On garde les noms — ils attrapent un fichier .env recopié
// par mégarde — mais ils ne suffisent pas.
[
  "SUPABASE_CLE", "SUPABASE_URL", "service_role", "supabase.co",
  "eyJhbGciOi", "SESSION_SECRET", "TOTEM_MOT_DE_PASSE",
].forEach((s) => doitEtre(false, s));

// LES FORMES, maintenant. Un secret se reconnaît à sa tête, pas à son
// étiquette. Chacune de celles-ci passait le contrôle sans être vue :
const FORMES = [
  // Les clés Supabase d'aujourd'hui : « eyJhbGciOi » ne voit que les
  // anciennes, au format JWT.
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "une clé secrète Supabase (sb_secret_…)"],
  [/\bsb_publishable_[A-Za-z0-9_-]{10,}/, "une clé Supabase (sb_publishable_…)"],
  // Un domaine Supabase personnalisé : « supabase.co » ne l'attrape pas.
  [/\bdb\.[a-z0-9-]+\.[a-z]{2,}\/rest\/v1\b/, "une base joignable en direct"],
  // Le jeton qui publie les mises à jour sur TOUS les téléphones installés :
  // le secret le plus précieux de la chaîne.
  [/\bEXPO_TOKEN\b|\bexpo_[A-Za-z0-9]{24,}/, "le jeton de publication Expo"],
  // La clé de compte de service Google Play, écrite dans `mobile/` au moment
  // de la compilation du magasin.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "une clé privée"],
  [/"private_key"\s*:/, "une clé privée de compte de service"],
  [/[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/, "un compte de service Google"],
  // Firebase : `google-services.json` est recopié dans le projet à la
  // compilation.
  // Sans borne de fin : Hermes colle les chaînes bout à bout, et exiger une
  // fin de mot après les 35 caractères laissait passer une clé suivie d'un
  // voisin. Une clé Google en fait 35 après « AIza » — au moins.
  [/\bAIza[0-9A-Za-z_-]{35,}/, "une clé d'API Google (AIza…)"],
  // Le jeton du robot Telegram — la couronne du Pi, à un copier-coller près.
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/, "le jeton du robot Telegram"],
];
const texte = octets.toString("latin1") + octets.toString("utf16le");
for (const [motif, quoi] of FORMES) {
  const trouve = motif.test(texte);
  console.log(`  ${trouve ? "✗ PRÉSENT" : "✓ absent  "}   ${quoi}`);
  if (trouve) echecs++;
}

// Les variables « EXPO_PUBLIC_… » sont inlinées dans le paquet PAR NATURE :
// tout ce qui porte ce préfixe est public pour toujours. On liste donc celles
// qu'on y trouve, pour qu'une nouvelle ne s'y glisse pas sans qu'on la voie.
const publiques = [...new Set(
  (texte.match(/EXPO_PUBLIC_[A-Z0-9_]+/g) ?? []))].sort();
// Les nôtres, plus les drapeaux internes d'Expo (« USE_RN_… »), qui viennent
// du cadre et non du projet. On compare par PRÉFIXE : Hermes range les
// chaînes bout à bout, si bien qu'un nom absorbe le début du voisin
// (« …ENABLED » + « MS ») — comparer à l'identique ferait crier le contrôle
// à chaque version d'Expo.
const ATTENDUES = ["EXPO_PUBLIC_ADRESSE", "EXPO_PUBLIC_APERCU",
                   "EXPO_PUBLIC_USE_RN_"];
const inattendues = publiques.filter(
  (v) => !ATTENDUES.some((a) => v.startsWith(a)));
console.log(`\n  variables publiques embarquées : ${publiques.join(", ") || "aucune"}`);
if (inattendues.length) {
  console.log(`  ✗ NOUVELLE(S) : ${inattendues.join(", ")}`);
  console.log("    Une « EXPO_PUBLIC_… » est publique pour toujours. Si elle");
  console.log("    porte un secret, il est déjà perdu ; sinon, ajoutez-la à");
  console.log("    la liste attendue de ce script.");
  echecs++;
}

console.log(echecs === 0
  ? "\n✓ Le paquet est propre.\n"
  : `\n✗ ${echecs} problème(s). Ne pas compiler pour le magasin en l'état.\n`);
process.exit(echecs === 0 ? 0 : 1);
