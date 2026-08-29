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

console.log("\nAUCUN SECRET N'A FUI");
[
  "SUPABASE_CLE", "SUPABASE_URL", "service_role", "supabase.co",
  "eyJhbGciOi", "SESSION_SECRET", "TOTEM_MOT_DE_PASSE",
].forEach((s) => doitEtre(false, s));

console.log(echecs === 0
  ? "\n✓ Le paquet est propre.\n"
  : `\n✗ ${echecs} problème(s). Ne pas compiler pour le magasin en l'état.\n`);
process.exit(echecs === 0 ? 0 : 1);
