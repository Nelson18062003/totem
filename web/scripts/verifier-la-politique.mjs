// LA POLITIQUE DE CONTENU, ÉPROUVÉE DANS UN VRAI NAVIGATEUR.
//
//     node scripts/verifier-la-politique.mjs
//
// Une politique de contenu se lit très bien et ne prouve rien : elle peut
// être PARFAITE et la page ne plus s'afficher, ou avoir l'air stricte et ne
// rien bloquer du tout. Les deux erreurs sont silencieuses. La première se
// voit tout de suite en production — plus rien ne marche ; la seconde ne se
// voit jamais, jusqu'au jour où elle aurait servi.
//
// On ouvre donc un vrai Chromium et on regarde quatre choses :
//
//   1. l'en-tête porte un NONCE, et plus « unsafe-inline » dans script-src.
//      Tant qu'il y était, la protection principale contre le XSS était
//      éteinte — sur une plateforme qui affiche du texte écrit par des
//      inconnus : le nom d'un expéditeur de SMS, le libellé d'un menu
//      d'opérateur, le nom d'un client. Quiconque connaît le numéro de la SIM
//      écrit ce qu'il veut dedans ;
//   2. le nonce CHANGE à chaque page. Un nonce constant est un mot de passe
//      public : il suffit de le lire une fois pour signer ses propres
//      scripts ;
//   3. un script injecté NE S'EXÉCUTE PAS. C'est la seule vraie preuve —
//      celle qu'aucune lecture d'en-tête ne remplace ;
//   4. LA PAGE MARCHE ENCORE. Une politique qui casse l'hydratation rend
//      tous les boutons muets : ils s'affichent, ils ne font rien. Sur une
//      caisse, un bouton muet, c'est un encaissement qu'on ne voit pas.

import { spawn } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const PORT = 3188;
const NUAGE = 4995;
const B = `http://127.0.0.1:${PORT}`;
const SECRET = "secret-de-la-politique";
const MDP = "un-mot-de-passe-assez-long";

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(54)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

// `next start` sert « .next », pas le disque : sans cette compilation, la
// politique mesurée serait celle d'hier.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const b = spawn("npx", ["next", "build"], { stdio: "ignore" });
  b.on("exit", (c) => (c === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — la politique ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"],
  { env: { ...process.env, PORT: String(NUAGE) }, stdio: "ignore" });
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: "cle-de-secours-politique",
    NODE_ENV: "production",
  },
  stdio: "ignore",
});

let nav;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  // --- 1. CE QUE L'EN-TÊTE DIT ------------------------------------------
  console.log("\nCe que l'en-tête annonce");
  const r1 = await fetch(`${B}/connexion`);
  const csp1 = r1.headers.get("content-security-policy") ?? "";
  const scriptSrc = (csp1.split(";").find((d) => d.trim().startsWith("script-src")) ?? "").trim();
  verifier("une politique est servie", csp1.length > 0);
  verifier("script-src porte un nonce", /'nonce-[A-Za-z0-9+/=]+'/.test(scriptSrc));
  verifier("script-src n'autorise plus tout script en ligne",
    !scriptSrc.includes("'unsafe-inline'"), scriptSrc.slice(0, 68));
  verifier("aucun eval en production", !scriptSrc.includes("'unsafe-eval'"));
  verifier("le cadre reste interdit", csp1.includes("frame-ancestors 'none'"));

  // --- 2. LE NONCE CHANGE ------------------------------------------------
  const r2 = await fetch(`${B}/connexion`);
  const nonce = (s) => (s.match(/'nonce-([A-Za-z0-9+/=]+)'/) ?? [])[1];
  const n1 = nonce(csp1);
  const n2 = nonce(r2.headers.get("content-security-policy") ?? "");
  verifier("le nonce change à chaque page", Boolean(n1) && Boolean(n2) && n1 !== n2);

  // --- 3. LE NAVIGATEUR, VRAIMENT ---------------------------------------
  console.log("\nCe que le navigateur fait");
  nav = await chromium.launch();
  const page = await nav.newPage();
  const plaintes = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to execute/i.test(m.text())) {
      plaintes.push(m.text());
    }
  });
  page.on("pageerror", (e) => plaintes.push(`erreur : ${e.message}`));

  await page.goto(`${B}/connexion`, { waitUntil: "networkidle" });

  // LA PAGE MARCHE-T-ELLE ENCORE ? Une politique trop stricte n'affiche pas
  // une erreur : elle laisse une page morte, jolie et muette. On tape
  // vraiment dans le formulaire et on regarde si React a repris la main.
  const champ = page.locator('input[type="email"], input[name="courriel"]').first();
  await champ.fill("essai@exemple.cm");
  verifier("la page est vivante : le champ retient ce qu'on tape",
    (await champ.inputValue()) === "essai@exemple.cm");

  const scriptsNextCharges = await page.evaluate(
    () => document.querySelectorAll("script[src]").length);
  verifier("les scripts de Next se sont chargés", scriptsNextCharges > 0,
    `${scriptsNextCharges} balises`);
  verifier("aucune plainte du navigateur sur ses propres scripts",
    plaintes.length === 0, plaintes.slice(0, 2).join(" | "));

  // --- 4. UN SCRIPT INJECTÉ NE S'EXÉCUTE PAS ----------------------------
  //
  // LA SEULE PREUVE QUI COMPTE — et elle a failli être fausse.
  //
  // Le premier essai posait le script avec `document.createElement` depuis la
  // page. Il s'est EXÉCUTÉ, et l'en-tête était pourtant parfait. Ce n'était
  // pas la politique qui cédait, c'était l'essai qui ne mesurait pas la bonne
  // chose : « strict-dynamic » autorise DÉLIBÉRÉMENT un script créé par du
  // code déjà en confiance. C'est ainsi que Next charge ses morceaux.
  //
  // Ce contre quoi une politique de contenu protège, c'est le HTML injecté :
  // un nom d'expéditeur, un libellé de menu, un nom de client qui porterait
  // « <script> ». Celui-là est posé par l'ANALYSEUR de la page, pas par du
  // code en confiance — et lui doit être refusé.
  //
  // On l'éprouve donc comme une vraie faille : on intercepte la réponse du
  // serveur, on glisse un script dans le HTML, et on laisse le navigateur
  // l'analyser sous la VRAIE politique (les en-têtes d'origine sont
  // conservés). Rien n'est injecté par l'outil de pilotage.
  console.log("\nUn script étranger, glissé dans le HTML de la page");
  const pageSale = await nav.newPage();
  await pageSale.route(`${B}/connexion`, async (route) => {
    const vraie = await route.fetch();
    const html = await vraie.text();
    route.fulfill({
      response: vraie,
      body: html.replace("</body>",
        "<script>window.totem_intrus = true;</script></body>"),
    });
  });
  const refus = [];
  pageSale.on("console", (m) => {
    if (/Refused to execute|Content Security Policy/i.test(m.text())) refus.push(m.text());
  });
  await pageSale.goto(`${B}/connexion`, { waitUntil: "domcontentloaded" });
  const aTourne = await pageSale.evaluate(() => Boolean(window.totem_intrus));
  verifier("un script glissé dans le HTML ne s'exécute pas", aTourne === false,
    aTourne ? "IL S'EST EXÉCUTÉ" : "refusé par le navigateur");
  verifier("et le navigateur dit pourquoi", refus.length > 0,
    (refus[0] ?? "").slice(0, 60));

  // CE QU'UNE POLITIQUE NE PROTÈGE PAS, et il faut le savoir : un script créé
  // par du code DÉJÀ en confiance passe — c'est le sens de « strict-dynamic »,
  // et c'est ce dont Next a besoin. La politique arrête le HTML injecté, pas
  // un script de la plateforme devenu hostile. Mesuré, pas supposé.
  const parDuCodeDeConfiance = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.totem_par_confiance = true;";
    document.body.appendChild(s);
    return Boolean(window.totem_par_confiance);
  });
  console.log(`  · pour mémoire : un script créé par du code en confiance `
    + `${parDuCodeDeConfiance ? "passe" : "ne passe pas"} — c'est « strict-dynamic »`);
  await pageSale.close();

  // Le navigateur EFFACE le nonce du DOM après l'avoir lu : un script hostile
  // déjà en place ne peut donc pas le recopier pour signer les siens. C'est
  // une garantie du navigateur, pas de la politique — on la mesure pour
  // savoir sur quoi on peut compter, et le jour où elle changerait.
  const nonceLisible = await page.evaluate(() => {
    const s = document.querySelector("script[nonce]");
    return s ? s.getAttribute("nonce") : null;
  });
  verifier("le nonce n'est pas lisible dans le DOM", !nonceLisible,
    nonceLisible ? "LISIBLE" : "effacé par le navigateur");

  // --- 5. ET DERRIÈRE LE VERROU, UNE VRAIE PAGE -------------------------
  //
  // L'écran de connexion est le plus simple de la plateforme. Une politique
  // qui le laisse passer peut très bien casser un écran chargé : on entre.
  console.log("\nUne fois entré, les écrans marchent aussi");
  await fetch(`${B}/api/inscription`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: "politique@essai.cm", motdepasse: MDP }),
  });
  await champ.fill("politique@essai.cm");
  await page.locator('input[type="password"]').first().fill(MDP);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/connexion"), { timeout: 20000 });

  plaintes.length = 0;
  await page.goto(`${B}/sms`, { waitUntil: "networkidle" });
  const texteSms = await page.locator("body").innerText();
  verifier("la boîte de réception montre un vrai SMS",
    /MTN|Orange/i.test(texteSms), texteSms.slice(0, 40).replace(/\n/g, " "));
  verifier("aucune plainte sur cet écran non plus",
    plaintes.length === 0, plaintes.slice(0, 2).join(" | "));
} finally {
  if (nav) await nav.close();
  serveur.kill("SIGKILL");
  nuage.kill("SIGKILL");
}

console.log(echecs === 0
  ? "\n✓ La politique tient : rien d'étranger ne s'exécute, tout le reste marche.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
