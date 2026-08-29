// L'application sur tout ce qu'Android peut être — et il peut beaucoup.
//
//     node scripts/verifier-les-formats.mjs
//
// Prérequis, dans cet ordre :
//
//   node web/scripts/faux-nuage.mjs                        (le faux Supabase)
//   cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
//     SESSION_SECRET=essai TOTEM_MOT_DE_PASSE=essai npx next start -p 3120
//   cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120 \
//     npx expo export --platform web --output-dir /tmp/apercu
//   cd /tmp/apercu && python3 -m http.server 3210 --bind 127.0.0.1
//
// L'adresse se pose à l'export : l'écran de connexion la vérifie avant de
// laisser taper un mot de passe, et sans elle il ne s'ouvrirait pas.
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
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
const require = createRequire(import.meta.url);

// --- L'aperçu, servi par nous ---------------------------------------------
const RACINE = process.argv[2] || "dist";
if (!existsSync(join(RACINE, "index.html"))) {
  console.error(`\n✗ Aucun aperçu web dans « ${RACINE} ».`);
  console.error("  Exportez-le d'abord :");
  console.error("    EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120 \\");
  console.error("      npx expo export --platform web --output-dir /tmp/apercu");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".map": "application/json",
};

const fichiers = createServer((req, res) => {
  // `normalize` puis retrait des « .. » : un aperçu ne sert que son dossier.
  const demande = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const sur = normalize(demande).replace(/^(\.\.[/\\])+/, "");
  let chemin = join(RACINE, sur);
  if (!existsSync(chemin) || statSync(chemin).isDirectory()) {
    chemin = join(RACINE, "index.html");   // les routes de l'application
  }
  res.writeHead(200, { "content-type": TYPES[extname(chemin)] || "application/octet-stream" });
  createReadStream(chemin).pipe(res);
});
await new Promise((r) => fichiers.listen(0, "127.0.0.1", r));
const APERCU = `http://127.0.0.1:${fichiers.address().port}`;
console.log(`\n  aperçu servi depuis « ${RACINE} » sur ${APERCU}\n`);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  // « disable-web-security » : le navigateur applique le CORS, un téléphone
  // NON. L'application native appelle la plateforme sans rien demander à
  // personne ; l'aperçu web, servi depuis un autre port, se ferait refuser.
  // C'est donc l'aperçu qu'on rend fidèle au téléphone, pas l'inverse — et
  // ce drapeau ne vit que dans ce script d'essai, jamais dans l'application.
  args: ["--no-sandbox", "--no-proxy-server", "--disable-web-security",
         "--disable-features=IsolateOrigins,site-per-process"],
  proxy: { server: "direct://" },
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

// LE COMPTE. La plateforme a maintenant de vrais comptes : on en crée un,
// une fois, avant de dérouler les formats. Le PREMIER inscrit est le
// propriétaire — il entre sans rien attendre, ce qui est exactement ce qu'il
// faut ici.
//
// Deux réponses ne sont PAS des échecs, et disent la même chose — le compte
// existe déjà, d'un passage précédent sur le même faux nuage :
//   409  le courriel est pris (quand l'inscription était encore ouverte) ;
//   403  l'inscription est fermée, ce qu'elle devient dès le premier compte.
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
{
  const r = await fetch("http://127.0.0.1:3120/api/inscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
  });
  if (!r.ok && r.status !== 409 && r.status !== 403) {
    console.error(`  ⚠️  le compte d'essai n'a pas pu être créé (${r.status}).`);
    console.error("     La plateforme d'essai tourne-t-elle sur 3120, reliée");
    console.error("     au faux nuage sur 4999 ?");
    process.exit(1);
  }
}

for (const [nom, w, h] of FORMATS) {
  const page = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(String(e).slice(0, 110)));
  await page.goto(APERCU, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  // On se connecte comme le propriétaire le ferait : un courriel et un mot de
  // passe, sur un compte créé plus haut. Les champs sont visés par leur TYPE
  // et non par leur rang — l'écran porte maintenant l'encart de la plateforme
  // au-dessus, et « le premier champ » n'est plus le bon.
  // On attend que la porte soit OUVERTE, pas seulement que les champs soient
  // à l'écran : l'application interroge d'abord la plateforme, et les champs
  // restent verrouillés tant qu'elle n'a pas répondu « oui, un TOTEM ». Les
  // viser trop tôt donnerait un « element is not editable » incompréhensible.
  const courriel = page.locator('input[type="email"]:not([readonly])');
  try {
    await courriel.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    console.error("\n✗ L'écran de connexion ne s'ouvre pas. Ce qu'il affiche :\n");
    console.error(await page.evaluate(() => document.body.innerText));
    console.error("\n  La plateforme d'essai répond-elle sur 3120 ?");
    process.exit(1);
  }
  const motdepasse = page.locator('input[type="password"]');
  await courriel.fill(COURRIEL);
  await motdepasse.fill(MOTDEPASSE);
  await page.getByText("Sign in", { exact: true }).last().click();

  // LA CONNEXION A-T-ELLE VRAIMENT ABOUTI ? Sans cette vérification, le
  // harnais mesurait l'écran de connexion aux huit tailles — en vert, sans
  // jamais voir un écran de l'application. Un contrôle qui passe sans rien
  // regarder est pire que pas de contrôle : il rassure.
  try {
    await page.locator('input[type="password"]').waitFor({ state: "detached", timeout: 15000 });
  } catch {
    console.error(`\n✗ ${nom} : la connexion n'aboutit pas. Ce que l'écran dit :\n`);
    console.error(await page.evaluate(() => document.body.innerText));
    console.error("\n  L'export porte-t-il EXPO_PUBLIC_APERCU=1 ? Sans elle, le");
    console.error("  coffre refuse de ranger la session hors développement.");
    process.exit(1);
  }
  await page.waitForTimeout(3800);
  await page.screenshot({ path: `/tmp/totem-f-${nom}.png` });
  // La boîte de réception : c'est là que le SMS à code s'affiche.
  await page.goto(`${APERCU}/encaissements`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // ON EST-IL VRAIMENT DANS LA BOÎTE DE RÉCEPTION ? Le faux nuage sert des
  // SMS connus ; si aucun n'est à l'écran, c'est qu'on mesure autre chose —
  // l'écran de connexion, une page vide, un écran d'erreur. Toutes les
  // mesures qui suivent seraient alors vraies et sans objet.
  const dedans = await page.evaluate(
    () => document.body.innerText.includes("NKENGAFAC"));
  if (!dedans) {
    console.error(`\n✗ ${nom} : la boîte de réception ne montre aucun SMS.`);
    console.error("  Ce que l'écran affiche :\n");
    console.error(await page.evaluate(() => document.body.innerText));
    process.exit(1);
  }
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
fichiers.close();
