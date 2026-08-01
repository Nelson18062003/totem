// Captures d'écran de la maquette, avec le Chromium préinstallé.
//
//   npm run build && npx next start -p 3112
//   node scripts/shot.mjs            → mobile (390×844)
//   node scripts/shot.mjs tablette   → tablette (834×1112)
//   node scripts/shot.mjs desktop    → bureau (1440×900)
//
// Les images atterrissent dans /tmp/totem-<mode>-<nom>.png.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const base = process.env.TOTEM_URL ?? "http://localhost:3112";
const mode = process.argv[2] ?? "mobile";
const tailles = {
  mobile: { width: 390, height: 844 },
  tablette: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};
const mobile = mode === "mobile";

const routes = [
  ["/", "accueil"],
  ["/cartes", "cartes"],
  ["/encaissements", "encaissements"],
  ["/analyse", "analyse"],
  ["/actions", "actions"],
  ["/sms", "sms"],
  ["/ussd", "ussd"],
  ["/connexion", "connexion"],
  ["/reglages", "reglages"],
];

// Le proxy sortant de l'environnement ne doit pas intercepter localhost.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

for (const [route, nom] of routes) {
  const page = await browser.newPage({
    viewport: tailles[mode] ?? tailles.mobile,
    deviceScaleFactor: 2,
    isMobile: mode !== "desktop",
    hasTouch: mode !== "desktop",
  });
  await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document
      .querySelectorAll("nextjs-portal,[data-nextjs-dev-tools-button]")
      .forEach((e) => e.remove());
  });
  // En pleine hauteur, la barre flottante suivrait le défilement : on la fige.
  const pleine = !mobile ? false : ["reglages", "analyse", "cartes"].includes(nom);
  if (pleine) {
    await page.evaluate(() => {
      const n = document.querySelector("nav.fixed");
      if (n) n.style.position = "static";
    });
  }
  await page.screenshot({ path: `/tmp/totem-${mode}-${nom}.png`, fullPage: pleine });
  await page.close();
  console.log("capture", `${mode}-${nom}`);
}

await browser.close();
