import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const base = "http://localhost:3111";
const routes = [["/","accueil"],["/cartes","cartes"],["/encaissements","encaissements"],["/analyse","analyse"],["/actions","actions"]];
const mode = process.argv[2] ?? "mobile";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox","--no-proxy-server"], proxy: { server: "direct://" } });
const vp = mode === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
for (const [route, nom] of routes) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: mode!=="desktop", hasTouch: mode!=="desktop" });
  await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelectorAll("nextjs-portal,[data-nextjs-dev-tools-button]").forEach(e=>e.remove()); const n=document.querySelector("nav.fixed"); if(n) n.style.position="static"; });
  await page.screenshot({ path: `/tmp/totem2-${mode}-${nom}.png`, fullPage: mode!=="desktop" });
  await page.close();
  console.log("saved", `${mode}-${nom}`);
}
await browser.close();
