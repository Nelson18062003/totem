// Rend côte à côte les fichiers officiels de la marque, en grand, pour juger.
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const M = "/home/user/totem/brand/";
const taille = (s, w, h) => s.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`);
const sym = taille(readFileSync(M + "totem-symbole.svg", "utf8"), 180, 180);
const mini = taille(readFileSync(M + "totem-symbole-mini.svg", "utf8"), 180, 180);
const logo = taille(readFileSync(M + "totem-logo.svg", "utf8"), 320, 60);

const page = `<body style="margin:0;background:#fbfaf9;font:13px system-ui;color:#16171a;
  display:flex;align-items:center;gap:56px;padding:36px">
<figure style="margin:0;text-align:center;width:180px">${sym}
  <figcaption style="margin-top:14px;color:#62605c">totem-symbole.svg<br><b>tissé — l'officiel</b></figcaption></figure>
<figure style="margin:0;text-align:center;width:180px;color:#9a4b2e">${mini}
  <figcaption style="margin-top:14px;color:#62605c">totem-symbole-mini.svg<br><b>fondu — ce que j'avais mis</b></figcaption></figure>
<figure style="margin:0;text-align:center">${logo}
  <figcaption style="margin-top:14px;color:#62605c">totem-logo.svg — le verrouillage officiel</figcaption></figure>
</body>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" } });
const p = await b.newPage({ viewport: { width: 1080, height: 300 }, deviceScaleFactor: 2 });
await p.setContent(page);
await p.waitForTimeout(300);
await p.screenshot({ path: new URL("./comparaison-marque.png", import.meta.url).pathname });
await b.close();
console.log("comparaison rendue");
