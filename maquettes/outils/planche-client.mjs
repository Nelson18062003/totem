// Assemble les écrans du téléphone en une seule planche, pour les regarder
// comme une suite et non comme cinq images. Les captures sont à dsf 3 : on les
// repose à leur taille réelle, côte à côte, sur le fond de la marque.
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const ici = dirname(fileURLToPath(import.meta.url));

const ECRANS = process.argv.slice(3);
const sortie = process.argv[2];
const b64 = (n) => readFileSync(join(ici, `${n}.png`)).toString("base64");
const legendes = {
  "C1-invitation": "1 · L'invitation, ouverte",
  "C2-code": "2 · Les six chiffres",
  "C3-facon": "3 · Par où on entrera",
  "C4-papier": "4 · Le papier du tiroir",
  "C5-entree": "5 · Un matin ordinaire",
  "C6-refus": "6 · Quand la porte dit non",
  "C7-comptoir": "7 · Le comptoir, vu par l'opérateur",
  "C8-retour": "8 · Je n'arrive plus à entrer",
  "C9-les-gens": "9 · Les gens du commerce",
  "C10-messages": "10 · Ce qui arrive sur le téléphone",
};
const html = `<meta charset="utf-8"><style>
  @font-face{font-family:'DM Sans';src:url('${join(ici,"polices/dmsans-400-chasse-fixe.ttf")}');font-weight:400}
  @font-face{font-family:'DM Sans';src:url('${join(ici,"polices/dmsans-700-chasse-fixe.ttf")}');font-weight:700}
  body{margin:0;background:#fbfaf9;font-family:'DM Sans',sans-serif;padding:40px}
  .rang{display:flex;gap:32px;align-items:flex-start}
  figure{margin:0;width:390px;flex:none}
  figcaption{font-size:13px;line-height:20px;font-weight:700;color:#16171a;margin-bottom:12px}
  img{width:390px;display:block;border-radius:20px;box-shadow:0 1px 2px rgba(22,23,26,.06),
    0 8px 24px rgba(22,23,26,.10);background:#fff}
</style><body><div class="rang">
${ECRANS.map((n) => `<figure><figcaption>${legendes[n] || n}</figcaption>
  <img src="data:image/png;base64,${b64(n)}"></figure>`).join("\n")}
</div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" } });
const p = await nav.newPage({ viewport: { width: 2200, height: 1000 }, deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: "load" });
await p.waitForTimeout(400);
await p.screenshot({ path: join(ici, `${sortie}.png`), fullPage: true });
await nav.close();
console.log(`· planche → ${sortie}.png (${ECRANS.length} écrans)`);
