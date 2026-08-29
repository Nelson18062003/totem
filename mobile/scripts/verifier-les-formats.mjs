// L'application sur tout ce qu'Android peut être — et il peut beaucoup.
//
//     node scripts/verifier-les-formats.mjs
//
// Prérequis : l'application exportée pour le web et servie sur 3210, la
// plateforme sur 3120 (voir web/scripts/faux-nuage.mjs).
//
// Depuis Android 16, le système IGNORE le verrouillage d'orientation au-delà
// de 600 dp, et sous l'API 37 il n'y aura plus d'échappatoire. Une
// application n'a donc plus « une » taille : elle en a autant que le
// propriétaire peut lui en donner — en tournant l'appareil, en dépliant, en
// partageant l'écran.
//
// Trois mesures, et la troisième est celle qu'on oublie :
//
//   débord      la page glisse-t-elle latéralement ?
//   hors-cadre  un élément sort-il de la fenêtre sans être rogné ?
//   coupé       du TEXTE est-il perdu ? Un « Withdra… » ne fait pas glisser
//               la page et ne sort d'aucun cadre : rien ne le signale, et
//               pourtant le mot est amputé. C'est ainsi qu'un solde s'est
//               affiché « 412,5… » — un montant tronqué est un montant faux.
//
// On distingue le voulu du subi : une ellipse posée exprès sur un nom de
// liste, ou le nom replié d'un onglet inactif, ne comptent pas.

// L'application sur tout ce qu'Android peut être aujourd'hui.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
});

// Les classes de Google : compacte (<600), moyenne (600-840), étendue (840+).
const FORMATS = [
  ["tres-petit",   320, 640],   // Android d'entrée de gamme
  ["petit",        360, 800],
  ["courant",      412, 915],   // Pixel
  ["pliable-ferme",344, 882],   // Fold, écran extérieur
  ["paysage",      915, 412],   // téléphone tourné
  ["pliable-ouvert",673, 841],  // Fold, écran intérieur
  ["tablette",     800, 1280],
  ["tablette-pays",1280, 800],
];

for (const [nom, w, h] of FORMATS) {
  const page = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(String(e).slice(0, 110)));
  await page.goto("http://127.0.0.1:3210", { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  await page.locator("input").first().fill("essai");
  await page.getByText("Sign in", { exact: true }).last().click();
  await page.waitForTimeout(3800);
  await page.screenshot({ path: `/tmp/totem-f-${nom}.png` });
  // La boîte de réception : c'est là que le SMS à code s'affiche.
  await page.goto("http://127.0.0.1:3210/encaissements", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({
    debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    coupe: [...document.querySelectorAll("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && (r.right > innerWidth + 1 || r.left < -1))) return false;
      // Un parent qui rogne (overflow hidden) rend le debordement invisible :
      // c'est le cas du filigrane, voulu. On ne le compte pas.
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflow === "hidden") {
          const pr = p.getBoundingClientRect();
          if (pr.right <= innerWidth + 1 && pr.left >= -1) return false;
        }
      }
      return true;
    }).length,
    // Du texte COUPÉ : « Withdra… » au lieu de « Withdrawal ». Invisible
    // dans une mesure de débordement, et pourtant c'est un défaut.
    tronque: [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      // On sépare le VOULU du SUBI :
      //   — « … » posé exprès (numberOfLines) sur un nom de liste : voulu ;
      //   — un parent replié à zéro (le nom d'un onglet inactif) : voulu ;
      //   — tout le reste : du texte perdu, donc un défaut.
      .filter((e) => {
        if (getComputedStyle(e).textOverflow === "ellipsis") return false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (p.getBoundingClientRect().width < 2) return false;
        }
        return true;
      })
      .map((e) => (e.textContent || "").trim().slice(0, 22)),
    // Le texte entier de l'écran, pour la garde ci-dessous.
    texte: document.body.innerText,
  }));
  const cls = w >= 840 ? "étendue" : w >= 600 ? "moyenne" : "compacte";
  // LA GARDE. Le faux nuage sert un SMS portant « 483921 » en clair —
  // une ligne écrite avant que le robot n'apprenne à masquer. Aucun écran ne
  // doit le montrer : ni la fiche, ni la LISTE. Le masque a déjà manqué une
  // fois à la liste ; ce contrôle est là pour que ça ne repasse pas.
  const codeNu = m.texte.includes("483921");
  const ok = !m.debord && !m.coupe && !m.tronque.length && !codeNu;
  console.log(`  ${nom.padEnd(16)} ${String(w).padStart(4)}×${String(h).padEnd(4)} ${cls.padEnd(9)}` +
    ` débord ${m.debord}  hors-cadre ${m.coupe}  coupé ${m.tronque.length}` +
    `  code nu ${codeNu ? "⚠️ OUI" : "non"}  ${ok ? "✓" : "⚠️"}` +
    (m.tronque.length ? ` → ${m.tronque.slice(0, 3).join(" | ")}` : "") +
    (soucis.length ? ` ERREUR ${soucis[0]}` : ""));
  await page.close();
}
await nav.close();
