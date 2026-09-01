// Atelier TOTEM ADMIN : assemble, mesure, capture — en une commande.
//   node forger.mjs 1-fleet            (desktop 1500×940, dsf 2)
//   node forger.mjs 8-mobile --mobile  (390×844, dsf 3)
//
// Contrat : on écrit « NOM.src.html » avec deux marqueurs dans le <head>/<body> :
//   <!--SYSTEME-->  → remplacé par systeme.css (feuille commune, obligatoire)
//   <!--SPRITE-->   → remplacé par le jeu d'icônes commun
// Le fichier « NOM.html » produit est autonome (aucune ressource réseau).
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ici = dirname(fileURLToPath(import.meta.url));
const nom = process.argv[2];
const mobile = process.argv.includes("--mobile");
if (!nom) { console.error("Usage : node forger.mjs <nom-sans-extension> [--mobile]"); process.exit(2); }

// 1. Assemblage
const src = readFileSync(join(ici, `${nom}.src.html`), "utf8");
const css = readFileSync(join(ici, "systeme.css"), "utf8");
const sprite = readFileSync(join(ici, "sprite.html"), "utf8");
const rail = readFileSync(join(ici, "chrome.html"), "utf8");
const barre = readFileSync(join(ici, "barre-droite.html"), "utf8");
if (!src.includes("<!--SYSTEME-->")) { console.error("✘ marqueur <!--SYSTEME--> absent — la feuille commune est obligatoire."); process.exit(2); }
if (!src.includes("<!--SPRITE-->")) { console.error("✘ marqueur <!--SPRITE--> absent — le jeu d'icônes commun est obligatoire."); process.exit(2); }
// La langue de la page est déclarée ici, une fois, pour les quinze écrans :
// une voix de synthèse qui ne sait pas dans quelle langue elle lit prononce
// « Français » à l'anglaise et « Douala » à la française (WCAG 2.2 §3.1.1).
// Les passages de l'autre langue portent leur propre lang= dans la planche.
const html = src
  .replace("<!--SYSTEME-->", `<style>\n${css}\n</style>`)
  .replace("<!--SPRITE-->", sprite)
  .replace("<!--RAIL-->", rail)
  .replace("<!--BARRE-DROITE-->", barre)
  .replace(/<body(?![^>]*\blang=)/, '<body lang="en"');
if (!/<body[^>]*lang=/.test(html)) { console.error("✘ la planche n'a pas de <body> — la langue ne peut pas être déclarée."); process.exit(2); }
const sortie = join(ici, `${nom}.html`);
writeFileSync(sortie, html);
console.log(`· assemblé  → ${nom}.html (${(html.length / 1024).toFixed(0)} ko)`);

// 2. Mesure
let mesureOk = true;
try {
  const out = execFileSync("node", [join(ici, "mesure.mjs"), sortie, ...(mobile ? ["--mobile"] : [])], { encoding: "utf8" });
  console.log(out.trim());
} catch (e) {
  mesureOk = false;
  console.log((e.stdout || "").trim());
}

// 3. Capture
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
});
const p = await b.newPage({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 940 },
  deviceScaleFactor: mobile ? 3 : 2,
});
await p.goto("file://" + sortie, { waitUntil: "load" });
await p.waitForTimeout(300);
const taille = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, l: document.documentElement.scrollWidth }));
await p.screenshot({ path: join(ici, `${nom}.png`), fullPage: true });
await b.close();
console.log(`· capturé   → ${nom}.png (page ${taille.l}×${taille.h})`);
if (!mobile && taille.h > 1500) console.log(`  ⚠ page haute (${taille.h}px) — viser 940 à 1400px.`);
if (!mesureOk) { console.log("\n✘ des violations restent : corrige AVANT de regarder l'image."); process.exit(1); }
