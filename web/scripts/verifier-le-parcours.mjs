// LE PARCOURS D'UNE OPÉRATION, JOUÉ EN ENTIER.
//
//     node scripts/verifier-le-parcours.mjs
//
// Les autres harnais éprouvent des pièces : le verrou, les comptes, les
// formats. Celui-ci déroule ce que le propriétaire FAIT vraiment, du premier
// écran jusqu'au code secret, dans un vrai navigateur, contre un vrai serveur
// et le faux nuage qui joue l'opérateur.
//
// CE QU'IL GARDE, et c'est ce qui touche à l'argent :
//
//   1. le pavé du code secret S'OUVRE quand le réseau le demande ;
//   2. le code tapé ne s'affiche JAMAIS en clair (des points, rien d'autre) ;
//   3. il part avec le drapeau « secret », sans quoi le robot ne l'efface pas
//      de la base et il y reste en clair, pour toujours ;
//   4. l'ouverture porte une CLÉ d'intention — sans elle, un geste rejoué
//      composerait le transfert une seconde fois ;
//   5. quitter l'écran RACCROCHE la session, faute de quoi la SIM reste en
//      ligne et l'opération suivante peut échouer.
//
// Un harnais qui ne regarde que l'écran ne prouve rien de tout cela : on
// écoute donc AUSSI ce qui part sur le réseau.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const PORT = 3141;
const B = `http://127.0.0.1:${PORT}`;
const SECRET = "secret-d-essai-du-parcours";
const MDP = "un-mot-de-passe-assez-long";
const CODE_SECRET = "4321";

let echecs = 0;
const verifier = (quoi, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(52)} ${JSON.stringify(obtenu)}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}

// Un serveur resté ouvert ferait passer tout le parcours contre du vieux code.
for (const port of [PORT, 4999]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

// UNE COMPILATION PÉRIMÉE FAIT PASSER LE PARCOURS CONTRE DU VIEUX CODE.
//
// `next start` sert ce qui est dans « .next », pas les fichiers du disque. En
// écrivant ce harnais je m'y suis laissé prendre : une vérification a échoué
// alors que le correctif était écrit — il n'était simplement pas compilé.
// L'inverse est bien pire : tout passerait en vert sur du code d'hier. On
// compile donc ici, à chaque fois.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const build = spawn("npx", ["next", "build"], { stdio: "ignore" });
  build.on("exit", (code) => (code === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — le parcours ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], { stdio: "ignore" });
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: "http://127.0.0.1:4999", SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: "cle-de-secours-du-parcours",
  },
  stdio: "ignore",
});

let nav;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }
  await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "parcours@totem.test", motdepasse: MDP }),
  });

  nav = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
  });
  const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });

  // CE QUI PART SUR LE RÉSEAU : c'est là que vivent les preuves.
  const demandes = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/commande") && r.method() === "POST") {
      try { demandes.push(JSON.parse(r.postData() || "{}")); } catch { /* ignore */ }
    }
  });

  console.log("\nLe propriétaire entre");
  await page.goto(B, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]:not([readonly])').fill("parcours@totem.test");
  await page.locator('input[type="password"]').fill(MDP);
  await page.getByText(/^(Sign in|Se connecter)$/).last().click();
  await page.waitForTimeout(2500);
  verifier("il est sur la plateforme", !page.url().includes("/connexion"), true);

  console.log("\nIl compose un code depuis le cadran");
  await page.goto(`${B}/ussd`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // Un code COMPLET : le faux opérateur demande alors le code secret.
  const champ = page.locator('input[type="text"], input:not([type])').first();
  await champ.fill("*126*1*677998877*5000#");
  await champ.press("Enter");
  await page.waitForTimeout(4000);

  const texte1 = await page.evaluate(() => document.body.innerText);
  verifier("le réseau réclame le code secret",
           /code secret|Confirmer le transfert/i.test(texte1), true);

  // LE PAVÉ. S'il ne s'ouvre pas, le code se taperait dans une zone ordinaire.
  const pave = await page.getByRole("button", { name: /^[0-9]$/ }).count();
  verifier("le pavé du code secret s'est ouvert", pave >= 9, true);

  console.log("\nIl tape son code secret");
  for (const c of CODE_SECRET) {
    await page.getByRole("button", { name: new RegExp(`^${c}$`) }).first().click();
  }
  const avantEnvoi = await page.evaluate(() => document.body.innerText);
  verifier("le code ne s'affiche PAS en clair", avantEnvoi.includes(CODE_SECRET), false);

  await page.getByRole("button", { name: /^(Valider|Confirm)$/i }).first().click();
  await page.waitForTimeout(4000);

  console.log("\nCe qui est VRAIMENT parti sur le réseau");
  const ouverture = demandes.find((d) => d.type === "ussd");
  const envoiSecret = demandes.find((d) => d.parametres?.secret === true);
  verifier("l'ouverture porte une clé d'intention",
           Boolean(ouverture && ouverture.cle), true);
  verifier("le code secret part avec son drapeau", Boolean(envoiSecret), true);
  verifier("le code n'a JAMAIS voyagé sans le drapeau",
           demandes.some((d) => !d.parametres?.secret
                             && String(d.parametres?.texte ?? "").includes(CODE_SECRET)),
           false);

  console.log("\nIl quitte l'écran sans raccrocher lui-même");
  const avant = demandes.filter((d) => d.type === "ussd_fin").length;
  await page.getByRole("link", { name: /r[ée]glages|settings/i }).first().click();
  await page.waitForTimeout(2000);
  const apres = demandes.filter((d) => d.type === "ussd_fin").length;
  verifier("la session est raccrochée en partant", apres > avant, true);

  console.log(echecs === 0
    ? "\n✓ Le parcours tient : l'opération se déroule et le code reste secret.\n"
    : `\n✗ ${echecs} vérification(s) en échec.\n`);
} finally {
  if (nav) await nav.close().catch(() => {});
  serveur.kill();
  nuage.kill();
}
process.exit(echecs === 0 ? 0 : 1);
