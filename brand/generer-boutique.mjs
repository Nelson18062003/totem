// L'image de présentation du Play Store — 1024 × 500.
//
//     node brand/generer-boutique.mjs
//
// C'est la bannière que Google affiche en tête de la fiche, et parfois dans
// ses propres sélections. Elle est OBLIGATOIRE : sans elle, la fiche ne se
// publie pas.
//
// TROIS CONTRAINTES, et la deuxième surprend toujours :
//
//   1. Exactement 1024 × 500, PNG ou JPEG 24 bits, sans transparence.
//   2. ELLE SERA ROGNÉE. Google la recadre selon les écrans et les
//      emplacements — sur un téléphone en liste, on n'en voit parfois que le
//      centre. Rien d'important ne doit donc s'approcher des bords : la
//      marque et la phrase vivent dans le tiers central.
//   3. Le texte y est petit sur un téléphone. Une phrase, pas un paragraphe.
//
// Le symbole vient de brand/generer.py, comme tout le reste : il n'est
// dessiné qu'une seule fois dans ce dépôt, et tout en découle.

import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const brand = dirname(fileURLToPath(import.meta.url));
const ENCRE = "#16171a";
const SABLE = "#f4efe9";
const LATERITE = "#9a4b2e";

// Le symbole en réserve (clair), sur fond transparent : on le pose sur
// l'encre. Le tissage reste lisible même réduit.
const symbole = readFileSync(join(brand, "totem-symbole-reserve.svg"), "utf8");

const page_html = `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1024px; height: 500px; background: ${ENCRE}; overflow: hidden;
         font-family: "DM Sans", "Inter", system-ui, sans-serif; }

  /* Le motif de tissage, très en retrait : il occupe le fond sans jamais
     disputer la lisibilité au texte. */
  #fond { position: absolute; inset: 0; opacity: .06;
          display: flex; align-items: center; justify-content: flex-end;
          padding-right: -60px; }
  #fond svg { width: 620px; height: auto; transform: translateX(150px) rotate(-8deg); }

  /* TOUT EST CENTRÉ, et c'est la contrainte n°2 : Google rogne les bords.
     Ce qui compte tient dans le tiers du milieu. */
  #centre { position: relative; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 26px; }

  #marque { display: flex; align-items: center; gap: 26px; }
  #marque svg { width: 92px; height: auto; }
  #mot { font-size: 88px; font-weight: 700; color: ${SABLE};
         letter-spacing: .16em; padding-left: .16em; line-height: 1; }

  #phrase { font-size: 27px; color: ${SABLE}; opacity: .82;
            letter-spacing: .01em; text-align: center; }
  #trait { width: 74px; height: 3px; background: ${LATERITE}; border-radius: 2px; }
</style>

<div id="fond">${symbole}</div>
<div id="centre">
  <div id="marque">
    ${symbole}
    <div id="mot">TOTEM</div>
  </div>
  <div id="trait"></div>
  <div id="phrase">Manage your Mobile Money SIM cards from anywhere</div>
</div>
`;

const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});
const page = await navigateur.newPage({
  viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1,
});
// Les polices de la marque viennent de Google Fonts, comme sur la plateforme.
await page.setContent(
  `<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&family=Inter:wght@400;500&display=swap" rel="stylesheet">`
  + page_html,
  { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const cible = join(brand, "../boutique/presentation-1024x500.png");
// `omitBackground: false` : le PNG doit être OPAQUE. Une transparence
// donnerait un fond noir ou blanc imprévisible selon l'écran de Google.
await page.screenshot({ path: cible, omitBackground: false });
await navigateur.close();

console.log("  ✓ boutique/presentation-1024x500.png");
console.log("    1024 × 500, opaque, marque et phrase au centre (les bords");
console.log("    seront rognés par Google).");
