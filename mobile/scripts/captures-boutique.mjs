// Les captures d'écran des fiches Google Play ET App Store.
//
//     node scripts/captures-boutique.mjs /tmp/apercu
//     node scripts/captures-boutique.mjs /tmp/apercu <sortie> iphone fr
//
// Le troisième argument choisit le format (android, par défaut, iphone ou
// ipad),
// le quatrième la langue de l'écran (en, par défaut, ou fr).
//
// Prérequis : les mêmes que le harnais des formats — le faux nuage, la
// plateforme d'essai sur 3180, et un export web portant EXPO_PUBLIC_APERCU=1.
//
// AVEC LE FAUX NUAGE, JAMAIS AVEC DE VRAIES DONNÉES. Une capture part sur
// une fiche publique, visible de la terre entière et archivée par des gens
// qu'on ne connaît pas. Un montant réel, un nom de client, un numéro de
// téléphone n'ont rien à y faire — et une fois publiés, ils ne se reprennent
// pas. Le faux nuage sert des noms inventés qui le disent (« Faux MTN »).
//
// LA TAILLE. Google demande entre 320 et 3840 px de côté, deux images au
// moins, huit au plus. On rend en 1080 × 1920 — le format d'un téléphone
// courant, assez net pour ne pas paraître flou sur un grand écran.
//
// Apple, lui, n'accepte QUE des tailles exactes. La seule série obligatoire
// est celle des plus grands iPhone ; 1290 × 2796 y est admis — 430 × 932
// points à trois fois la densité, la géométrie d'un iPhone « Pro Max ».
// Une image d'un pixel trop large est refusée au dépôt, sans plus.
//
// L'IPAD AUSSI, dès que l'application s'y installe (« supportsTablet ») :
// Apple a refusé la soumission tant qu'il manquait la série du 13 pouces.
// 2048 × 2732 y est admis — 1024 × 1366 points à deux fois la densité,
// la géométrie d'un iPad Pro 12,9.

import { createRequire } from "module";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const RACINE = process.argv[2] || "dist";
const SORTIE = process.argv[3] || "../boutique/captures";
const FORMAT = process.argv[4] || "android";
const LANGUE = process.argv[5] || "en";
if (!["android", "iphone", "ipad"].includes(FORMAT) || !["en", "fr"].includes(LANGUE)) {
  // Un format inconnu ne retombe pas sur Android : une faute de frappe
  // fabriquerait des images qu'Apple refuserait, sans que rien ne le dise.
  console.error(`\n✗ Format « ${FORMAT} » ou langue « ${LANGUE} » inconnus.`);
  process.exit(1);
}
const TAILLE = {
  iphone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },    // 1290 × 2796
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2 },    // 2048 × 2732
  android: { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 },   // 1080 × 1920
}[FORMAT];
if (!existsSync(join(RACINE, "index.html"))) {
  console.error(`\n✗ Aucun aperçu web dans « ${RACINE} ».`);
  process.exit(1);
}
mkdirSync(SORTIE, { recursive: true });

// L'aperçu est servi par nous : viser un serveur lancé à la main, c'est
// risquer de photographier une vieille version sans s'en apercevoir.
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".ttf":"font/ttf", ".woff2":"font/woff2" };
const fichiers = createServer((req, res) => {
  const d = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let c = join(RACINE, normalize(d).replace(/^(\.\.[/\\])+/, ""));
  if (!existsSync(c) || statSync(c).isDirectory()) c = join(RACINE, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(c)] || "application/octet-stream" });
  createReadStream(c).pipe(res);
});
await new Promise((r) => fichiers.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${fichiers.address().port}`;

const COURRIEL = "boutique@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
{
  const r = await fetch("http://127.0.0.1:3180/api/inscription", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prenom: "Essai", nom: "Totem", adresse: "Rue 1, Douala", telephone: "670000099", courriel: COURRIEL, motdepasse: MOTDEPASSE }),
  });
  if (!r.ok && r.status !== 409 && r.status !== 403) {
    console.error(`\n✗ compte d'essai impossible (${r.status}).`);
    process.exit(1);
  }
  // 403 dit « les inscriptions sont fermées » — pas « VOTRE compte existe » :
  // un AUTRE script a pu poser le premier compte sur ce même faux nuage. On
  // le prouve tout de suite, sinon l'échec arrive plus tard, à la connexion,
  // avec un diagnostic qui accuse le mauvais coupable.
  if (r.status === 403) {
    const c = await fetch("http://127.0.0.1:3180/api/connexion", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prenom: "Essai", nom: "Totem", adresse: "Rue 1, Douala", telephone: "670000099", courriel: COURRIEL, motdepasse: MOTDEPASSE }),
    });
    if (!c.ok) {
      console.error("\n✗ Les inscriptions sont fermées par un AUTRE compte :");
      console.error("  un autre harnais a déjà utilisé ce faux nuage.");
      console.error("  Redémarrez le faux nuage, puis relancez.");
      process.exit(1);
    }
  }
}

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server", "--disable-web-security",
         "--disable-features=IsolateOrigins,site-per-process"],
  proxy: { server: "direct://" },
});
const page = await nav.newPage({
  ...TAILLE, locale: LANGUE === "fr" ? "fr-FR" : "en-US",
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// La langue se choisit sur l'écran de connexion, comme le ferait quelqu'un.
const bascule = page.getByText(LANGUE === "fr" ? /^Français$/ : /^English$/);
if (await bascule.count()) await bascule.first().click();

const champ = page.locator('input[type="email"]:not([readonly])');
await champ.waitFor({ state: "visible", timeout: 20000 });
await champ.fill(COURRIEL);
await page.locator('input[type="password"]').fill(MOTDEPASSE);
await page.getByText(/^(Sign in|Se connecter)$/).last().click();
try {
  await page.locator('input[type="password"]').waitFor({ state: "detached", timeout: 15000 });
} catch {
  console.error("\n✗ La connexion n'aboutit pas. Ce que l'écran dit :\n");
  console.error(await page.evaluate(() => document.body.innerText));
  process.exit(1);
}
await page.waitForTimeout(2500);

// L'ordre compte : Google montre les deux premières dans la liste des
// résultats. On met devant ce qui explique le produit en un coup d'œil.
const ECRANS = [
  ["1-caisses",       "",               "les cartes, d'un coup d'œil"],
  ["2-encaissements", "/encaissements", "la boîte de réception"],
  ["3-actions",       "/actions",       "les boutons appris"],
  ["4-cartes",        "/cartes",        "le détail d'une carte"],
];

let pris = 0;
for (const [nom, chemin, quoi] of ECRANS) {
  if (chemin) {
    await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
  }
  // LE BANDEAU « PAS DE RÉSEAU » N'A RIEN À FAIRE SUR UNE FICHE. Il paraît
  // un instant pendant qu'un écran recharge, et une première série l'a
  // photographié sur une capture sur quatre — vue à l'œil, pas devinée. On
  // attend qu'il parte ; s'il reste, on s'arrête au lieu de le publier.
  for (let i = 0; i < 20; i++) {
    const t = await page.evaluate(() => document.body.innerText);
    if (!/No network|Pas de réseau|Hors ligne/.test(t)) break;
    await page.waitForTimeout(500);
  }
  const texte = await page.evaluate(() => document.body.innerText);
  if (/No network|Pas de réseau|Hors ligne/.test(texte)) {
    console.error(`\n✗ ${nom} : le bandeau « pas de réseau » reste affiché. Rien n'est pris.`);
    process.exit(1);
  }
  // Une capture de l'écran de connexion sur une fiche de magasin serait
  // ridicule — et c'est exactement ce qui arrive quand la session tombe.
  if (/Password|Mot de passe/.test(texte)) {
    console.error(`\n✗ ${nom} : on est retombé sur la connexion. Rien n'est pris.`);
    process.exit(1);
  }
  await page.screenshot({ path: join(SORTIE, `${nom}.png`) });
  console.log(`  ✓ ${nom.padEnd(18)} ${quoi}`);
  pris++;
}

const { width, height } = TAILLE.viewport;
console.log(`\n${pris} captures dans « ${SORTIE} », en `
  + `${width * TAILLE.deviceScaleFactor} × ${height * TAILLE.deviceScaleFactor}.`);
console.log("Données inventées : aucun montant ni nom réel n'y figure.");
await nav.close();
fichiers.close();
