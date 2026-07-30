import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const base = "http://localhost:3111";
const routes = [
  ["/", "accueil"],
  ["/console", "console"],
  ["/paiements", "paiements"],
  ["/rapports", "rapports"],
  ["/reglages", "reglages"],
];
const mode = process.argv[2] ?? "mobile";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

const viewport = mode === "desktop"
  ? { width: 1440, height: 900 }
  : { width: 390, height: 844 };

for (const [route, nom] of routes) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 2,
    isMobile: mode !== "desktop",
    hasTouch: mode !== "desktop",
  });
  await page.goto(base + route, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal, [data-nextjs-dev-tools-button]").forEach((el) => el.remove());
    const bottomNav = document.querySelector("nav.fixed");
    if (bottomNav) bottomNav.style.position = "static";
  });
  await page.screenshot({ path: `/tmp/totem-${mode}-${nom}.png`, fullPage: mode !== "desktop" });
  await page.close();
  console.log("saved:", `/tmp/totem-${mode}-${nom}.png`);
}
await browser.close();
