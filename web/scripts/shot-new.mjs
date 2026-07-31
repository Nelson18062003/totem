import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const base = "http://localhost:3117";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox","--no-proxy-server"], proxy: { server: "direct://" } });
async function shot(nom, route, actions) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal,[data-nextjs-dev-tools-button]").forEach(e=>e.remove()));
  if (actions) await actions(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/n-${nom}.png`, fullPage: nom === "reglages" });
  await page.close(); console.log("saved", nom);
}
await shot("connexion", "/connexion");
await shot("connexion-code", "/connexion", async (p) => {
  await p.locator('input[type=email]').fill("nelson@vogtravel.com");
  await p.locator('input[type=password]').fill("motdepasse");
  await p.getByRole("button", { name: "Continuer" }).click();
  await p.waitForTimeout(300);
});
await shot("reglages", "/reglages");
await shot("vide", "/encaissements", async (p) => {
  await p.locator('input').first().fill("zzzz");
  await p.waitForTimeout(400);
});
await browser.close();
