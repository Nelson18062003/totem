// Instrument d'audit — il MESURE les écrans, il ne les regarde pas de loin.
//
// Il se connecte d'abord, puis REFUSE de mesurer s'il n'est pas entré :
// un harnais qui peut mesurer l'écran de connexion à la place de
// l'application ne mesure rien du tout.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const base = "http://127.0.0.1:3112";
const MOTDEPASSE = "Controle-2026";

const formats = {
  telephone: { width: 390, height: 844, tactile: true },
  tablette: { width: 834, height: 1112, tactile: true },
  portable: { width: 1280, height: 800, tactile: false },
  bureau: { width: 1440, height: 900, tactile: false },
  large: { width: 1920, height: 1080, tactile: false },
};

const routes = [
  ["/", "accueil"], ["/cartes", "cartes"], ["/encaissements", "encaissements"],
  ["/analyse", "analyse"], ["/actions", "actions"], ["/sms", "sms"],
  ["/ussd", "ussd"], ["/reglages", "reglages"],
];

// Le laissez-passer, pris une fois.
const co = await fetch(base + "/api/connexion", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ motdepasse: MOTDEPASSE }),
});
if (co.status !== 200) { console.error("connexion refusée:", co.status); process.exit(1); }
const brut = (co.headers.get("set-cookie") || "").split(";")[0];
const [nom, valeur] = brut.split("=");

const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"],
  proxy: { server: "direct://" },
});

const constats = [];
for (const [format, taille] of Object.entries(formats)) {
  const ctx = await navigateur.newContext({
    viewport: { width: taille.width, height: taille.height },
    deviceScaleFactor: 1, isMobile: taille.tactile, hasTouch: taille.tactile,
  });
  await ctx.addCookies([{ name: nom, value: valeur, domain: "127.0.0.1", path: "/", secure: false }]);

  for (const [route, ecran] of routes) {
    const page = await ctx.newPage();
    await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(500);

    // LE GARDE-FOU : suis-je vraiment dans l'application ?
    const url = page.url();
    if (url.includes("/connexion")) {
      constats.push({ format, ecran, type: "HARNAIS", detail: `renvoyé vers la connexion (${url})` });
      await page.close();
      continue;
    }

    const m = await page.evaluate(() => {
      const r = { debord: null, petitesCibles: [], texteMinuscule: [] };
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) {
        // QUI déborde ?
        const coupables = [];
        for (const el of document.querySelectorAll("*")) {
          const b = el.getBoundingClientRect();
          if (b.right > de.clientWidth + 1 && b.width > 0) {
            coupables.push({
              balise: el.tagName.toLowerCase(),
              classe: (el.className && String(el.className).slice(0, 70)) || "",
              droite: Math.round(b.right),
            });
          }
        }
        r.debord = { page: de.scrollWidth, fenetre: de.clientWidth, coupables: coupables.slice(0, 4) };
      }
      // Cibles tactiles réelles
      for (const el of document.querySelectorAll('button,a,[role="button"],input,select')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.height < 44 || b.width < 44) {
          r.petitesCibles.push({
            balise: el.tagName.toLowerCase(),
            texte: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28),
            h: Math.round(b.height), l: Math.round(b.width),
            classe: (el.className && String(el.className).slice(0, 60)) || "",
          });
        }
      }
      // Texte sous 12px
      for (const el of document.querySelectorAll("*")) {
        if (!el.children.length && el.textContent?.trim()) {
          const t = parseFloat(getComputedStyle(el).fontSize);
          if (t < 12) r.texteMinuscule.push({ px: t, texte: el.textContent.trim().slice(0, 30) });
        }
      }
      return r;
    });

    if (m.debord) constats.push({ format, ecran, type: "DEBORD", detail: m.debord });
    if (taille.tactile && m.petitesCibles.length)
      constats.push({ format, ecran, type: "CIBLE", detail: m.petitesCibles.slice(0, 8), total: m.petitesCibles.length });
    if (m.texteMinuscule.length)
      constats.push({ format, ecran, type: "TEXTE", detail: m.texteMinuscule.slice(0, 4), total: m.texteMinuscule.length });

    await page.screenshot({ path: `/tmp/totem-audit/${format}-${ecran}.png` });
    await page.close();
  }
  await ctx.close();
}
await navigateur.close();
console.log(JSON.stringify(constats, null, 1));
