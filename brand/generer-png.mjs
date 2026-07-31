// Fabrique les PNG de la marque a partir des SVG, avec le Chromium preinstalle.
//
//   node brand/generer-png.mjs
//
// A lancer apres `python3 brand/generer.py`. Les icones de manifeste doivent
// etre en PNG : Android ignore le SVG, et la convention `apple-icon` de Next
// ne l'accepte pas non plus.
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const brand = dirname(fileURLToPath(import.meta.url));
const racine = join(brand, "..");

const travaux = [
  ["brand/totem-icone-app.svg", "web/app/apple-icon.png", 180],
  ["brand/totem-icone-app.svg", "web/public/icone-192.png", 192],
  ["brand/totem-icone-app.svg", "web/public/icone-512.png", 512],
  ["brand/totem-logo.svg", "brand/totem-logo.png", 640],
  ["brand/totem-symbole.svg", "brand/totem-symbole.png", 512],
];

// Le proxy sortant de l'environnement ne doit pas intercepter le rendu local.
const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

for (const [source, cible, largeur] of travaux) {
  const svg = readFileSync(join(racine, source), "utf8");
  const page = await navigateur.newPage({ deviceScaleFactor: 1 });
  await page.setContent(
    `<style>*{margin:0;padding:0}body{background:transparent}` +
      `svg{display:block;width:${largeur}px;height:auto}</style>${svg}`,
  );
  // Fond transparent : l'icone porte deja son propre aplat.
  await (await page.$("svg")).screenshot({ path: join(racine, cible), omitBackground: true });
  await page.close();
  console.log("  ", cible, `${largeur}px`);
}

await navigateur.close();
