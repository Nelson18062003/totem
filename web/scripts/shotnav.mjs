import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const base = "http://localhost:3113";
const routes = [["/","accueil"],["/cartes","comptes"],["/encaissements","recus"],["/analyse","analyse"],["/actions","operations"]];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox","--no-proxy-server"], proxy: { server: "direct://" } });
for (const [route, nom] of routes) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal,[data-nextjs-dev-tools-button]").forEach(e=>e.remove()));
  // viewport only : la barre flottante reste en place
  await page.screenshot({ path: `/tmp/nav-${nom}.png` });
  await page.close();
  console.log("saved", nom);
}
await browser.close();
