// Fabrique tous les PNG de la marque a partir des SVG, avec le Chromium
// preinstalle.
//
//   node brand/generer-png.mjs
//
// A lancer apres `python3 brand/generer.py`. Deux sorties :
//
//   brand/png/   le jeu complet, a haute definition, pour l'exterieur
//   web/         les icones de l'application (Android ignore le SVG dans un
//                manifeste, et la convention `apple-icon` de Next non plus)
//
// Les variantes en reserve (marque claire) sont livrees avec leur fond encre
// incruste : un trace blanc sur fond transparent est invisible partout ou on
// le colle. Les autres ont un fond transparent.
import { createRequire } from "module";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const brand = dirname(fileURLToPath(import.meta.url));
const racine = join(brand, "..");
mkdirSync(join(brand, "png"), { recursive: true });

const ENCRE = "#16171a";
const SABLE = "#f4efe9";

// [source, cible, largeur, fond, marge en % de la largeur]
const travaux = [
  // Verrouillages
  ["totem-logo.svg", "png/totem-logo.png", 2000, null, 6],
  ["totem-logo.svg", "png/totem-logo-sur-sable.png", 2000, SABLE, 6],
  ["totem-logo-encre.svg", "png/totem-logo-encre.png", 2000, null, 6],
  ["totem-logo-reserve.svg", "png/totem-logo-reserve.png", 2000, ENCRE, 6],
  ["totem-logo-vertical.svg", "png/totem-logo-vertical.png", 1200, null, 8],
  ["totem-logo-vertical-reserve.svg", "png/totem-logo-vertical-reserve.png", 1200, ENCRE, 8],
  // Symbole
  ["totem-symbole.svg", "png/totem-symbole.png", 1024, null, 0],
  ["totem-symbole-encre.svg", "png/totem-symbole-encre.png", 1024, null, 0],
  ["totem-symbole-reserve.svg", "png/totem-symbole-reserve.png", 1024, ENCRE, 12],
  ["totem-symbole-mini.svg", "png/totem-symbole-mini.png", 1024, null, 0],
  // Icones
  ["totem-icone-app.svg", "png/totem-icone-app.png", 1024, null, 0],
  ["totem-icone-app-laterite.svg", "png/totem-icone-app-laterite.png", 1024, null, 0],
  ["totem-icone-app-ronde.svg", "png/totem-icone-app-ronde.png", 1024, null, 0],
  ["totem-favicon.svg", "png/totem-favicon.png", 512, null, 0],
  // Motif
  ["totem-motif.svg", "png/totem-motif.png", 2000, null, 0],
  ["totem-motif-tuile.svg", "png/totem-motif-tuile.png", 512, null, 0],
  // Les icones que consomme l'application web
  ["totem-icone-app.svg", "../web/app/apple-icon.png", 180, null, 0],
  ["totem-icone-app.svg", "../web/public/icone-192.png", 192, null, 0],
  ["totem-icone-app.svg", "../web/public/icone-512.png", 512, null, 0],
  // Les icones que consomme l'application du telephone.
  //
  // Elles sortent d'ici, comme celles du web : le symbole reste decrit une
  // seule fois, dans generer.py. On ne le redessine pas pour Android.
  //
  // `icone.png` : l'icone pleine, fond encre incruste (1024, ce qu'exigent
  // les deux magasins).
  //
  // `icone-android-avant.png` : l'avant-plan de l'icone adaptative
  // d'Android. Le lanceur la rogne en rond, en goutte ou en carre selon le
  // telephone, et ne garantit que les 66 % centraux. D'ou la marge de 22 % :
  // le symbole reste entier quelle que soit la decoupe. Fond transparent —
  // la couleur vient d'`app.json`.
  ["totem-icone-app.svg", "../mobile/assets/images/icone.png", 1024, null, 0],
  ["totem-symbole-reserve.svg", "../mobile/assets/images/icone-android-avant.png", 1024, null, 22],
  ["totem-symbole.svg", "../mobile/assets/images/demarrage.png", 512, null, 0],
  //
  // `notification.png` : l'icone de la barre d'etat quand une notification
  // arrive. Android n'en garde que la SILHOUETTE — il jette la couleur et
  // teinte lui-meme le trace. Un logo en couleurs y deviendrait un carre
  // blanc ; c'est donc le symbole en reserve qu'on decoupe, sur fond
  // transparent. 96 px : la taille que le systeme attend.
  ["totem-symbole-reserve.svg", "../mobile/assets/images/notification.png", 96, null, 10],
];

// Le proxy sortant de l'environnement ne doit pas intercepter le rendu local.
const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

for (const [source, cible, largeur, fond, marge] of travaux) {
  const svg = readFileSync(join(brand, source), "utf8");
  const page = await navigateur.newPage({ deviceScaleFactor: 1 });
  const pad = Math.round((largeur * (marge ?? 0)) / 100);
  await page.setContent(
    `<style>*{margin:0;padding:0}` +
      `body{background:${fond ?? "transparent"}}` +
      `#cadre{display:inline-block;padding:${pad}px;background:${fond ?? "transparent"}}` +
      `svg{display:block;width:${largeur - pad * 2}px;height:auto}</style>` +
      `<div id="cadre">${svg}</div>`,
  );
  await (await page.$("#cadre")).screenshot({
    path: join(brand, cible),
    omitBackground: !fond,
  });
  await page.close();
  console.log("  ", cible.replace("../", ""), `${largeur}px`);
}

await navigateur.close();
