// LE FILTRE PAR DATE DIT-IL LA VÉRITÉ ?
//
//     node scripts/verifier-les-dates.mjs /tmp/apercu
//
// Prérequis : la même chaîne que `verifier-l-affichage` (le faux nuage sur
// 4999, la plateforme d'essai sur 3120, un export web portant
// EXPO_PUBLIC_APERCU=1 et EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3120). Le
// harnais sème lui-même la caisse s'il la trouve trop maigre.
//
// POURQUOI. « Filtrer par la date, c'est hyper important », a dit le
// propriétaire — et le filtre ne sert qu'à une chose : répondre juste à
// « qu'est-ce qui est arrivé hier, et combien ? ». Un filtre qui répond
// FAUX est pire que pas de filtre : on croit le chiffre.
//
// Deux pièges, et le harnais vise les deux :
//
//   1. LE JOUR. « Hier » se compte en jours de la CAISSE (Douala), pas en
//      « maintenant moins 24 heures ». Le harnais demande à la PLATEFORME
//      combien de SMS chaque jour porte — une vérité indépendante de
//      l'écran — et compare.
//   2. LES DEUX CENTS. L'écran des SMS ne garde que les deux cents derniers.
//      Une période plus ancienne doit être DEMANDÉE à la plateforme, sans
//      quoi elle s'affiche vide, ou à moitié, sans un mot. Le harnais choisit
//      donc au calendrier des jours du MOIS DERNIER, bien au-delà des deux
//      cents, et exige le compte exact.
//
// TÉMOIN : lancé sur l'application d'avant, il ne trouve pas les puces de
// date, et sort en échec — un contrôle qui passerait sur l'ancien écran ne
// garderait rien.

import { createRequire } from "module";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
const require = createRequire(import.meta.url);

const RACINE = process.argv[2] || "dist";
if (!existsSync(join(RACINE, "index.html"))) {
  console.error(`\n✗ Aucun aperçu web dans « ${RACINE} ». Voir l'en-tête.`);
  process.exit(1);
}
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon",
};
const fichiers = createServer((req, res) => {
  const demande = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let chemin = join(RACINE, normalize(demande).replace(/^(\.\.[/\\])+/, ""));
  if (!existsSync(chemin) || statSync(chemin).isDirectory()) chemin = join(RACINE, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(chemin)] || "application/octet-stream" });
  createReadStream(chemin).pipe(res);
});
await new Promise((r) => fichiers.listen(0, "127.0.0.1", r));
const APERCU = `http://127.0.0.1:${fichiers.address().port}`;
const PLATEFORME = "http://127.0.0.1:3120";
const COURRIEL = "essai@totem.test";
const MOTDEPASSE = "un-mot-de-passe-assez-long";
const FUSEAU = "Africa/Douala";

// --- La vérité, demandée à la plateforme -------------------------------------
await fetch(`${PLATEFORME}/api/inscription`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
}).catch(() => null);
const session = await fetch(`${PLATEFORME}/api/session`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ courriel: COURRIEL, motdepasse: MOTDEPASSE }),
}).then((r) => r.json()).catch(() => ({}));
if (!session.jeton) {
  console.error("\n✗ La plateforme d'essai ne répond pas sur 3120 (ou refuse le compte d'essai).");
  process.exit(1);
}
const lire = () => fetch(`${PLATEFORME}/api/donnees?sms=1000&recus=0`,
  { headers: { authorization: `Bearer ${session.jeton}` } }).then((r) => r.json());
let verite = await lire();
// Une caisse plus maigre que deux cents SMS ne met pas le second piège à
// l'épreuve : tout tiendrait dans ce que l'écran garde déjà.
if ((verite.paiements ?? []).length < 400) {
  await fetch("http://127.0.0.1:4999/essai/semer?jours=40&parJour=20", { method: "POST" });
  verite = await lire();
}
const lignes = verite.paiements ?? [];

const jourDe = (t) => new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(new Date(t));
const decaler = (cle, n) => {
  const [a, m, j] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) + n * 86400000).toISOString().slice(0, 10);
};
const aujourdhui = jourDe(Date.now());
const attendu = (de, a) => {
  const dans = lignes.filter((p) => p.jour >= de && p.jour <= a);
  return {
    nombre: dans.length,
    recu: dans.reduce((s, p) => s + (p.sens === "in" && p.montant != null ? p.montant : 0), 0),
  };
};
// Le mois dernier, du 5 au 9 : loin derrière les deux cents plus récents.
const [an, mo] = aujourdhui.split("-").map(Number);
const moisDernier = mo === 1 ? `${an - 1}-12` : `${an}-${String(mo - 1).padStart(2, "0")}`;
const choisis = { de: `${moisDernier}-05`, a: `${moisDernier}-09` };
const plusAncienDesDeuxCents = lignes[Math.min(199, lignes.length - 1)]?.jour ?? aujourdhui;

const PERIODES = [
  ["Today", aujourdhui, aujourdhui],
  ["Yesterday", decaler(aujourdhui, -1), decaler(aujourdhui, -1)],
  ["Last 7 days", decaler(aujourdhui, -6), aujourdhui],
  ["This month", `${aujourdhui.slice(0, 8)}01`, aujourdhui],
];

// --- L'écran -----------------------------------------------------------------
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server", "--disable-web-security"],
  proxy: { server: "direct://" },
});
const page = await nav.newPage({ viewport: { width: 393, height: 852 } });
const voir = (re, ms = 20000) => page.waitForFunction(
  (s) => new RegExp(s, "i").test(document.body.innerText), re.source, { timeout: ms });

/** Ce que la carte du total affiche : « · 12 SMS », « Received +245,000 FCFA ». */
const lireTotal = () => page.evaluate(() => {
  const t = document.body.innerText;
  const n = /·\s*(\d+)\s*SMS/.exec(t);
  const r = /Received\s*\n\s*\+?([\d,]+)\s*FCFA/.exec(t);
  return { nombre: n ? Number(n[1]) : null, recu: r ? Number(r[1].replace(/,/g, "")) : null };
});

let echecs = 0;
const noter = (ok, quoi, detail) => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(34)} ${detail}`);
};

console.log(`\nLa plateforme porte ${lignes.length} SMS ; les deux cents plus récents `
  + `remontent au ${plusAncienDesDeuxCents}.\n`);
try {
  await page.goto(APERCU, { waitUntil: "networkidle" });
  const champ = page.locator('input[type="email"]:not([readonly])');
  for (let i = 0; i < 6 && !(await champ.count()); i++) {
    const passer = page.getByText(/^(Skip|Passer|Next|Suivant|Start|Commencer|Get started)$/i);
    if (await passer.count()) await passer.last().click();
    await page.waitForTimeout(600);
  }
  await champ.fill(COURRIEL);
  await page.locator('input[type="password"]').fill(MOTDEPASSE);
  await page.getByText(/^(Sign in|Se connecter)$/).last().click();
  await voir(/FCFA/);
  await page.goto(`${APERCU}/encaissements`, { waitUntil: "networkidle" });
  await voir(/NKENGAFAC|SEMEUR/);

  // Le filtre s'ouvre par le bouton « Date », puis on choisit dans la liste.
  const ouvrirDate = async () => {
    const b = page.getByRole("button", { name: /^(Filter by date|Filtrer par date) : / });
    if (!(await b.count())) return false;
    await b.first().click();
    await page.waitForTimeout(400);
    return true;
  };
  for (const [puce, de, a] of PERIODES) {
    const ouvert = await ouvrirDate();
    const bouton = page.getByRole("button", { name: puce, exact: true });
    if (!ouvert || !(await bouton.count())) { noter(false, puce, "filtre absent"); continue; }
    await bouton.first().click();
    const e = attendu(de, a);
    if (e.nombre === 0) {
      await page.waitForTimeout(800);
      const vide = await page.evaluate(() => /No result|Aucun résultat/i.test(document.body.innerText));
      noter(vide, puce, `aucun SMS ce jour-là, l'écran le dit${vide ? "" : " — PAS"}`);
      continue;
    }
    await voir(new RegExp(`·\\s*${e.nombre}\\s*SMS`), 15000).catch(() => {});
    const vu = await lireTotal();
    noter(vu.nombre === e.nombre && vu.recu === e.recu, puce,
      `${vu.nombre} SMS, +${vu.recu} reçus (la plateforme : ${e.nombre}, +${e.recu})`);
    // LE TOTAL NE SUFFIT PAS : il faut les LIGNES dessous. La première
    // version annonçait « 21 SMS » au-dessus d'une liste vide — la liste
    // gardait les places de la liste d'avant, et croyait « hier » loin en
    // bas. Un total juste sur un écran vide reste un écran faux.
    await page.waitForTimeout(600);
    const montees = await page.evaluate(() => document.querySelectorAll("[data-ligne]").length);
    noter(montees > 0, `${puce} : les lignes`, `${montees} ligne(s) à l'écran`);
  }

  // Le calendrier : du 5 au 9 du mois dernier — hors des deux cents.
  const ouvert = await ouvrirDate();
  const choisir = page.getByRole("button", { name: /^(Pick dates|Choisir les jours)/ });
  if (!ouvert || !(await choisir.count())) {
    noter(false, "le calendrier", "filtre absent");
  } else {
    await choisir.first().click();
    await page.getByRole("button", { name: /^(Previous month|Mois précédent)$/ }).first().click();
    const nom = (cle) => new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", timeZone: "UTC",
    }).format(new Date(`${cle}T00:00:00Z`));
    await page.getByRole("button", { name: nom(choisis.de), exact: true }).first().click();
    await page.getByRole("button", { name: nom(choisis.a), exact: true }).first().click();
    await page.getByText(/^Show these SMS/).last().click();
    const e = attendu(choisis.de, choisis.a);
    await voir(new RegExp(`·\\s*${e.nombre}\\s*SMS`), 20000).catch(() => {});
    const vu = await lireTotal();
    const horsDesDeuxCents = choisis.a < plusAncienDesDeuxCents;
    noter(horsDesDeuxCents, "les jours choisis sont anciens",
      `${choisis.de} → ${choisis.a}, avant le ${plusAncienDesDeuxCents}`);
    noter(vu.nombre === e.nombre && vu.recu === e.recu && e.nombre > 0,
      "calendrier, mois dernier",
      `${vu.nombre} SMS, +${vu.recu} reçus (la plateforme : ${e.nombre}, +${e.recu})`);
  }

  // ── CHANGER D'AVIS AVANT LA RÉPONSE NE COINCE RIEN ──────────────────────
  //
  // Choisir des jours anciens (demandés à la plateforme), puis « Hier »
  // avant que la réponse n'arrive : l'écran d'avant restait « en recherche »
  // pour toujours. Le drapeau était posé à la main, et seul le `finally` de
  // la PREMIÈRE demande le baissait — or changer de période l'avait
  // annulée. Le total « Hier · N SMS » n'apparaissait jamais ; un jour sans
  // SMS montrait des formes grises sans fin au lieu de « aucun résultat ».
  //
  // Le harnais RETIENT trois secondes la réponse d'une période demandée à
  // part (`depuis=`) : sans cela, la plateforme locale répond avant qu'un
  // doigt — ou un harnais — ait le temps de changer d'avis, et le contrôle
  // passerait sans avoir rien joué.
  //
  // TÉMOIN : l'écran d'avant (chercheP posé à la main) n'affiche jamais le
  // total d'« Hier » ici.
  {
    const retenue = /\/api\/donnees\?[^#]*depuis=/;
    let retenues = 0;
    await page.route(retenue, async (route) => {
      retenues++;
      await page.waitForTimeout(3000).catch(() => {});
      await route.continue().catch(() => {});
    });
    // D'abord une période que l'écran tient déjà : le calendrier s'ouvre
    // alors sur le mois en cours, et « Mois précédent » mène au mois dernier.
    if (await ouvrirDate()) {
      await page.getByRole("button", { name: "Today", exact: true }).first().click();
      await page.waitForTimeout(600);
    }
    const ouvertCal = await ouvrirDate();
    const choisirCal = page.getByRole("button", { name: /^(Pick dates|Choisir les jours)/ });
    if (!ouvertCal || !(await choisirCal.count())) {
      noter(false, "changer d'avis", "filtre absent");
    } else {
      await choisirCal.first().click();
      await page.getByRole("button", { name: /^(Previous month|Mois précédent)$/ }).first().click();
      const nomCourt = (cle) => new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", timeZone: "UTC",
      }).format(new Date(`${cle}T00:00:00Z`));
      await page.getByRole("button", { name: nomCourt(`${moisDernier}-10`), exact: true }).first().click();
      await page.getByRole("button", { name: nomCourt(`${moisDernier}-14`), exact: true }).first().click();
      await page.getByText(/^Show these SMS/).last().click();
      // Et tout de suite, avant la réponse : « Hier ».
      await ouvrirDate();
      await page.getByRole("button", { name: "Yesterday", exact: true }).first().click();
      const hier = decaler(aujourdhui, -1);
      const e = attendu(hier, hier);
      if (e.nombre === 0) {
        await voir(/No result|Aucun résultat/, 10000).catch(() => {});
        const vide = await page.evaluate(() => /No result|Aucun résultat/i.test(document.body.innerText));
        noter(vide && retenues > 0, "changer d'avis",
          `« Hier » sans SMS, l'écran le dit${vide ? "" : " — PAS (coincé en recherche)"}`
          + (retenues ? "" : " — aucune demande retenue : rien n'a été joué"));
      } else {
        await voir(new RegExp(`·\\s*${e.nombre}\\s*SMS`), 10000).catch(() => {});
        const vu = await lireTotal();
        noter(vu.nombre === e.nombre && retenues > 0, "changer d'avis",
          (vu.nombre === e.nombre
            ? `« Hier · ${vu.nombre} SMS » s'affiche`
            : `le total d'« Hier » n'apparaît pas (coincé en recherche ?) — attendu ${e.nombre}`)
          + (retenues ? "" : " — aucune demande retenue : rien n'a été joué"));
      }
    }
    await page.unroute(retenue);
  }
} finally {
  await nav.close();
  fichiers.close();
}

console.log(echecs === 0
  ? "\n✓ Le filtre par date dit ce que la caisse porte, jour pour jour.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
