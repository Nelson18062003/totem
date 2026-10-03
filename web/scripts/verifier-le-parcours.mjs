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
// PUIS UN DÉPÔT, PAR LE BOUTON « DÉPÔT », comme le propriétaire le fait :
//
//   6. le numéro se COLLE — « +237 6 77 99 88 77 » recopié d'un message —,
//      et c'est 677998877 qui part, jamais l'indicatif ni les espaces ;
//   7. le montant s'écrit comme on veut (« 5 000 FCFA ») et part en chiffres ;
//   8. quand le réseau réclame le code, son message ENTIER est à l'écran en
//      même temps que le pavé — ce qu'on signe : le montant, le nom, les
//      frais. L'écran d'avant n'affichait que « Votre code secret » ;
//   9. et RIEN D'AUTRE : un écran à la fois, comme sur le téléphone. Une
//      version empilait tout l'échange, message après message ; le
//      propriétaire l'a refusée. Les écrans déjà passés ne restent pas.
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
  // Son PROPRE groupe de processus : « npx » lance le vrai serveur en
  // dessous, et tuer « npx » seul le laissait vivant, port occupé — le
  // harnais suivant refusait de démarrer, ou mesurait CE serveur-là.
  detached: true,
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
  // Le presse-papiers ouvert à la page : sans cette permission, « coller »
  // n'aurait rien à coller, et l'essai ne prouverait rien.
  const contexte = await nav.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await contexte.newPage();

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

  console.log("\nUn dépôt, par le bouton « Dépôt »");
  await page.goto(`${B}/actions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /MTN/ }).first().click();
  await page.getByRole("button", { name: /^(Dépôt|Deposit)/ }).first().click();
  const fenetre = page.getByRole("dialog");
  await fenetre.waitFor({ timeout: 5000 });
  const champs = fenetre.locator("input");
  verifier("le numéro se tape dans un VRAI champ", await champs.count(), 1);

  // COLLER, pour de vrai : le presse-papiers, puis Ctrl+V dans le champ.
  await page.evaluate(() => navigator.clipboard.writeText("+237 6 77 99 88 77"));
  await champs.first().click();
  await page.keyboard.press("Control+V");
  verifier("le numéro collé est dans le champ, tel quel",
           await champs.first().inputValue(), "+237 6 77 99 88 77");
  const lu = await fenetre.innerText();
  verifier("l'écran dit ce qui partira : 677 99 88 77", lu.includes("677 99 88 77"), true);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  await fenetre.locator("input").first().pressSequentially("5 000 FCFA");
  verifier("le montant s'écrit comme on veut",
           await fenetre.locator("input").first().inputValue(), "5 000 FCFA");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await fenetre.getByRole("button", { name: /^(Confirmer|Confirm)$/ }).click();

  // Le réseau parle : on attend le PAVÉ, un état, jamais une durée.
  let paveDepot = 0;
  for (let i = 0; i < 40 && paveDepot < 9; i++) {
    await page.waitForTimeout(500);
    paveDepot = await fenetre.getByRole("button", { name: /^[0-9]$/ }).count();
  }
  verifier("le pavé du code s'ouvre au bout du dépôt", paveDepot >= 9, true);
  const avecPave = await fenetre.innerText();
  verifier("…SOUS le message qui le réclame : le nom", avecPave.includes("JEAN DUPONT"), true);
  verifier("…le montant et les frais", /5 000 FCFA[\s\S]*Frais/.test(avecPave), true);
  verifier("un écran à la fois : les écrans déjà passés ne restent pas",
           avecPave.includes("Entrez le numero du beneficiaire")
             || avecPave.includes("Entrez le montant"), false);

  const depot = demandes.slice(demandes.findLastIndex((d) => d.type === "ussd"));
  const textes = depot.map((d) => String(d.parametres?.texte ?? d.parametres?.code ?? ""));
  verifier("le numéro est parti en chiffres, sans indicatif",
           textes.includes("677998877") && !textes.some((x) => x.includes("237677")), true);
  verifier("le montant est parti en chiffres", textes.includes("5000"), true);

  for (const c of CODE_SECRET) {
    await fenetre.getByRole("button", { name: new RegExp(`^${c}$`) }).first().click();
  }
  verifier("le code ne s'affiche PAS en clair, là non plus",
           (await fenetre.innerText()).includes(CODE_SECRET), false);
  await fenetre.getByRole("button", { name: /^(Valider|Confirm)$/i }).first().click();
  await page.waitForTimeout(3000);
  const secretDepot = demandes.slice(demandes.findLastIndex((d) => d.type === "ussd"))
    .find((d) => d.parametres?.secret === true);
  verifier("le code du dépôt part avec son drapeau", Boolean(secretDepot), true);

  console.log(echecs === 0
    ? "\n✓ Le parcours tient : l'opération se déroule et le code reste secret.\n"
    : `\n✗ ${echecs} vérification(s) en échec.\n`);
} finally {
  if (nav) await nav.close().catch(() => {});
  try { process.kill(-serveur.pid, "SIGTERM"); } catch { /* déjà parti */ }
  nuage.kill();
}
process.exit(echecs === 0 ? 0 : 1);
