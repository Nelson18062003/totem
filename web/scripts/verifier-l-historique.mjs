// L'HISTORIQUE ENTIER, DÈS LE PREMIER JOUR — mis à l'épreuve sur six mois de caisse.
//
//     node scripts/verifier-l-historique.mjs
//
// TOTEM tourne déjà : des boutiques ont des milliers de SMS en base. L'onglet
// Paiements ne montrait que les deux cents derniers (le site, les mille
// derniers), et « toutes les dates » s'arrêtait là, sans un mot — un
// paiement de mars n'existait ni à l'écran ni dans la recherche. Le jour où
// l'application s'ouvre sur une caisse ancienne, c'est la première chose
// qu'on cherche.
//
// La plateforme rend avec chaque lecture sa SUITE (`Donnees.suite`) ; l'écran
// redemande `avant=` cette suite et recolle (noyau/historique.ts).
//
// CE QU'IL EXIGE, contre le faux nuage interrogé DIRECTEMENT (la vérité
// indépendante) :
//
//   1. Partant de ce que le téléphone reçoit (les deux cents derniers), page
//      après page, on atteint CHAQUE SMS de la caisse — pas un de moins — et
//      la dernière page dit `suite: null`, le début de l'historique.
//   2. UN LOT RELU À LA MÊME SECONDE (le robot relève d'un coup ce que le
//      modem a gardé pendant une coupure), coupé par une page, arrive EN
//      ENTIER. LE TÉMOIN : la même marche avec une borne exclue (« lt »)
//      en perd une partie.
//   3. Partant d'une lecture COUPÉE (`lignes` : l'écran des cartes et les
//      Paiements montés ensemble — mille lus, deux cents rapportés), la
//      suite ne saute rien. LE TÉMOIN : reprendre sous les mille LUS — une
//      suite calculée sur ce qu'on a lu, pas sur ce qu'on a rendu — en perd
//      des centaines.
//   4. Une période (`depuis`) se prolonge jusqu'à son premier jour, et pas
//      au-delà.
//   5. Un vendeur à qui l'on a confié UNE carte : sa suite ne rend que la
//      sienne, jusqu'au bout.
//   6. Une suite forgée ou illisible est ignorée, jamais transmise à la base.
//   7. Un reçu établi il y a cinq mois, sur une ligne arrivée SANS son numéro
//      (la page plus ancienne ne porte pas les reçus), se retrouve par la
//      fiche (`/api/recu-du-sms`).
//   8. LE SITE : « Ce mois », plus long que ce que la page reçoit, dit qu'il
//      manque ses premiers jours, puis les recolle au bouton ; et la caisse
//      d'un vendeur se parcourt jusqu'à « Début de l'historique », chaque
//      paiement compté.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as attendre } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const PORT = 3163;
const NUAGE = 4973;
const B = `http://127.0.0.1:${PORT}`;
const N = `http://127.0.0.1:${NUAGE}`;
const SECRET = "secret-d-essai-de-l-historique";
const MDP_PATRON = "le-mot-de-passe-du-patron-histoire";
const MDP_VENDEUR = "le-mot-de-passe-du-vendeur-histoire";
const FUSEAU = "Africa/Douala";
const MTN_A = "89237010000000008901";
const ORANGE = "89237020000000004432";
const PAGE = 250;
// Le cookie où le site tient sa langue (noyau/langue.ts).
const COOKIE_LANGUE = "totem_langue";
const LOT = 60;

let echecs = 0;
const verifier = (quoi, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(66)} ${detail}`);
};

async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch { return true; }
}

// Un serveur resté ouvert ferait passer tout l'essai contre du vieux code.
for (const port of [PORT, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé — arrêtez l'essai précédent.`);
    process.exit(1);
  }
}

// « next start » sert ce qui est dans « .next », pas les fichiers du disque.
console.log("\nCompilation de la plateforme…");
await new Promise((resoudre, rejeter) => {
  const build = spawn("npx", ["next", "build"], { stdio: "ignore" });
  build.on("exit", (c) => (c === 0 ? resoudre() : rejeter(
    new Error("la compilation a échoué — l'historique ne peut rien prouver"))));
});

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE), FAUX_FLOTTE: "1" }, stdio: "ignore",
});
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    SUPABASE_URL: N, SUPABASE_CLE: "peu-importe",
    SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: "cle-de-secours-histoire", FUSEAU,
  },
  stdio: "ignore",
  // Son PROPRE groupe de processus : « npx » lance le vrai serveur en
  // dessous, et tuer « npx » seul le laissait vivant, port occupé.
  detached: true,
});

// --- Les outils -------------------------------------------------------------

const avec = (jeton) => (jeton ? { authorization: `Bearer ${jeton}` } : {});
const lire = (chemin, jeton) => fetch(B + chemin, { headers: avec(jeton), redirect: "manual" });
let adresse = 1;
const poste = (chemin, corps, jeton) => fetch(B + chemin, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `10.78.0.${adresse++}`,
             ...avec(jeton) },
  body: JSON.stringify(corps), redirect: "manual",
});
const donnees = async (q, jeton) => {
  const r = await lire(`/api/donnees?langue=fr&recus=0&${q}`, jeton);
  return r.ok ? r.json() : { statut: r.status };
};
/** Un instant de Douala (UTC+1), à la seconde, comme le robot l'écrit. */
const commeLeRobot = (t) => {
  const d = new Date(t + 3600000);
  return `${d.toISOString().slice(0, 19)}+01:00`;
};

/**
 * LA MARCHE DE L'ÉCRAN : une première lecture, puis `avant=` la suite, page
 * après page, en recollant sans doublon — exactement ce que font le
 * téléphone et le site (noyau/historique.ts, réécrit ici en quelques lignes
 * pour que le harnais ne dépende pas du code qu'il vérifie).
 */
async function marcher(premiere, { jeton, depuis } = {}) {
  const vus = new Set();
  const q0 = `${premiere}${depuis ? `&depuis=${encodeURIComponent(depuis)}` : ""}`;
  let d = await donnees(q0, jeton);
  for (const p of d.paiements ?? []) vus.add(p.id);
  let pages = 1, curseur = d.suite, bloque = false;
  while (typeof curseur === "string" && pages < 400) {
    const q = `sms=${PAGE}&avant=${encodeURIComponent(curseur)}`;
    d = await donnees(`${q}${depuis ? `&depuis=${encodeURIComponent(depuis)}` : ""}`, jeton);
    pages++;
    const avant = vus.size;
    for (const p of d.paiements ?? []) vus.add(p.id);
    if (vus.size === avant && d.suite === curseur) { bloque = true; break; }
    curseur = d.suite;
  }
  return { vus, pages, fin: curseur, bloque };
}

const navigateur = [];
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${B}/api/plateforme`)).ok) break; } catch { /* pas encore */ }
    await attendre(500);
  }

  const patron = (await (await poste("/api/inscription",
    { courriel: "patron@histoire.cm", motdepasse: MDP_PATRON })).json()).jeton;
  verifier("le propriétaire entre", Boolean(patron));
  if (!patron) throw new Error("sans session, l'historique ne prouve rien");

  // --- LA CAISSE --------------------------------------------------------------
  const semees = await (await fetch(`${N}/essai/semer-releve?jours=180&parJour=40`,
    { method: "POST" })).json();
  verifier("la caisse porte six mois, sur deux cartes MTN", semees.semes > 14000,
    `${semees.semes} lignes`);

  const poser = (lignes) => fetch(`${N}/rest/v1/paiements`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lignes),
  });
  // La caisse d'un VENDEUR : 1 200 encaissements sur la carte Orange, à
  // raison de vingt par jour — plus que ce que la page reçoit d'un coup.
  const orange = Array.from({ length: 1200 }, (_, i) => {
    const t = commeLeRobot(Date.now() - (i + 1) * 72 * 60000);
    return {
      terminal: "douala-faux", source_id: 95000 + i, compte: "Orange ·4432", carte: ORANGE,
      expediteur: "OrangeMoney", categorie: "encaissement", sens: "entree",
      montant: 1000 + i, tiers: `HISTO ${i}`, numero: "699000111", reference: `OR-${i}`,
      solde_apres: null, nature: null, texte: `Depot de ${1000 + i} FCFA de HISTO ${i}.`,
      emis_le: t, recu_le: t,
    };
  });
  await poser(orange);

  // UN LOT RELU À LA MÊME SECONDE, posé à cheval sur la première page — en
  // DERNIER, une fois la caisse entière en place : la
  // ligne n° 170 (les plus récentes d'abord) donne l'instant, le lot s'y
  // glisse juste après — soixante lignes, de la 171ᵉ à la 230ᵉ, quand la
  // première lecture du téléphone s'arrête à la 200ᵉ.
  const tete = await (await fetch(
    `${N}/rest/v1/paiements?select=id,recu_le&order=recu_le.desc&limit=171`)).json();
  const instantDuLot = commeLeRobot(Date.parse(tete[170].recu_le) - 1000);
  const lot = Array.from({ length: LOT }, (_, i) => ({
    terminal: "douala-faux", source_id: 90000 + i, compte: "MTN ·8901", carte: MTN_A,
    expediteur: "MTNMobileMoney", categorie: "encaissement", sens: "entree",
    montant: 500 + i, tiers: `LOT ${i}`, numero: "677000555", reference: `LOT-${i}`,
    solde_apres: null, nature: null, texte: `Vous avez recu ${500 + i} FCFA de LOT ${i}.`,
    emis_le: instantDuLot, recu_le: instantDuLot,
  }));
  await poser(lot);

  // --- LA VÉRITÉ, DEMANDÉE AU FAUX NUAGE LUI-MÊME --------------------------------
  // Page par page : le faux nuage ne rend que mille lignes à la fois, comme la
  // vraie base, et une vérité lue d'un coup ne serait que les mille premières.
  const tout = [];
  for (;;) {
    const page = await (await fetch(`${N}/rest/v1/paiements?select=id,carte,recu_le,reference`
      + `&order=id.asc&offset=${tout.length}`)).json();
    if (!page.length) break;
    tout.push(...page);
  }
  const verite = new Set(tout.map((l) => String(l.id)));
  const manquants = (vus, attendu) => [...attendu].filter((id) => !vus.has(id)).length;

  // --- 1. TOUTE LA CAISSE, PAGE APRÈS PAGE ---------------------------------------
  console.log("\n1. DES DEUX CENTS DERNIERS AU PREMIER SMS");
  const premiere = await donnees("sms=200", patron);
  verifier("la première lecture rend deux cents SMS et une suite",
    premiere.paiements?.length === 200 && typeof premiere.suite === "string",
    `${premiere.paiements?.length} · ${premiere.suite}`);
  const marche = await marcher("sms=200", { jeton: patron });
  verifier("chaque SMS de la caisse est atteint", manquants(marche.vus, verite) === 0,
    `${marche.vus.size} sur ${verite.size}, ${marche.pages} pages`);
  verifier("et rien qui n'y soit pas", [...marche.vus].every((id) => verite.has(id)));
  verifier("la dernière page dit « début de l'historique »", marche.fin === null && !marche.bloque,
    String(marche.fin));

  // --- 2. LE LOT DE LA MÊME SECONDE ---------------------------------------------
  console.log("\n2. UN LOT RELU À LA MÊME SECONDE, COUPÉ PAR LA PAGE");
  const idsDuLot = new Set(tout.filter((l) => /^LOT-/.test(l.reference ?? "")).map((l) => String(l.id)));
  const dansLaPremiere = (premiere.paiements ?? []).filter((p) => idsDuLot.has(p.id)).length;
  verifier("le lot est bien coupé par la première lecture",
    dansLaPremiere > 0 && dansLaPremiere < LOT, `${dansLaPremiere} sur ${LOT} dedans`);
  verifier("la suite reprend À l'instant du lot", premiere.suite != null
    && Date.parse(premiere.suite) === Date.parse(instantDuLot), premiere.suite);
  verifier("le lot arrive en entier", manquants(marche.vus, idsDuLot) === 0,
    `${LOT - manquants(marche.vus, idsDuLot)} sur ${LOT}`);
  // LE TÉMOIN : la borne exclue. Réécrit ici contre le faux nuage, comme une
  // plateforme qui aurait écrit `avant` à la façon de `jusqua`.
  const temoinLt = new Set((premiere.paiements ?? []).map((p) => p.id));
  {
    const suite = await (await fetch(`${N}/rest/v1/paiements?select=id&order=recu_le.desc`
      + `&recu_le=lt.${encodeURIComponent(premiere.suite)}&limit=${PAGE}`)).json();
    for (const l of suite) temoinLt.add(String(l.id));
  }
  verifier("le témoin (borne exclue) perd une partie du lot",
    manquants(temoinLt, idsDuLot) > 0, `${manquants(temoinLt, idsDuLot)} perdus`);

  // --- 3. UNE LECTURE COUPÉE PAR `lignes` --------------------------------------
  console.log("\n3. MILLE LUS, DEUX CENTS RAPPORTÉS : LA SUITE NE SAUTE RIEN");
  const coupee = await donnees("sms=1000&lignes=200", patron);
  verifier("deux cents rapportés", coupee.paiements?.length === 200, String(coupee.paiements?.length));
  const marcheCoupee = await marcher("sms=1000&lignes=200", { jeton: patron });
  verifier("chaque SMS est atteint quand même", manquants(marcheCoupee.vus, verite) === 0,
    `${marcheCoupee.vus.size} sur ${verite.size}`);
  // LE TÉMOIN : une suite calculée sous les mille LUS.
  const lus = await (await fetch(`${N}/rest/v1/paiements?select=id,recu_le&order=recu_le.desc&limit=1000`)).json();
  const temoinLus = new Set((coupee.paiements ?? []).map((p) => p.id));
  {
    const sous = lus[lus.length - 1].recu_le;
    const suite = await (await fetch(`${N}/rest/v1/paiements?select=id&order=recu_le.desc`
      + `&recu_le=lte.${encodeURIComponent(sous)}&limit=${PAGE}`)).json();
    for (const l of suite) temoinLus.add(String(l.id));
  }
  const tete1000 = new Set(lus.map((l) => String(l.id)));
  verifier("le témoin (suite sous les LUS) en saute des centaines",
    manquants(temoinLus, tete1000) > 500, `${manquants(temoinLus, tete1000)} sautés`);

  // --- 4. UNE PÉRIODE -----------------------------------------------------------
  console.log("\n4. UNE PÉRIODE SE PROLONGE JUSQU'À SON PREMIER JOUR");
  const depuis = new Date(Date.now() - 45 * 86400000).toISOString();
  const marchePeriode = await marcher("sms=1000", { jeton: patron, depuis });
  const veritePeriode = new Set(tout.filter((l) => Date.parse(l.recu_le) >= Date.parse(depuis))
    .map((l) => String(l.id)));
  verifier("toute la période est atteinte", manquants(marchePeriode.vus, veritePeriode) === 0,
    `${marchePeriode.vus.size} sur ${veritePeriode.size}, ${marchePeriode.pages} pages`);
  verifier("rien d'avant son premier jour", [...marchePeriode.vus].every((id) => veritePeriode.has(id)));
  verifier("et elle finit (suite : null)", marchePeriode.fin === null, String(marchePeriode.fin));

  // --- 5. LA PORTÉE ---------------------------------------------------------------
  console.log("\n5. UN VENDEUR NE REMONTE QUE SA CARTE");
  await poste("/api/comptes", { geste: "creer", prenom: "Awa", nom: "Histoire",
    courriel: "vendeur@histoire.cm", motdepasse: MDP_VENDEUR }, patron);
  const vendeur = (await (await poste("/api/session",
    { courriel: "vendeur@histoire.cm", motdepasse: MDP_VENDEUR })).json()).jeton;
  const idVendeur = (await (await lire("/api/comptes", patron)).json()).comptes
    .find((c) => c.courriel === "vendeur@histoire.cm")?.id;
  await poste("/api/comptes", { geste: "attribuer", id: idVendeur, iccid: ORANGE }, patron);
  const sienne = new Set(tout.filter((l) => l.carte === ORANGE).map((l) => String(l.id)));
  const marcheVendeur = await marcher("sms=200", { jeton: vendeur });
  verifier("toute sa carte est atteinte", manquants(marcheVendeur.vus, sienne) === 0,
    `${marcheVendeur.vus.size} sur ${sienne.size}`);
  verifier("et rien d'une autre", [...marcheVendeur.vus].every((id) => sienne.has(id)));
  const loin = await donnees(`sms=${PAGE}&avant=${encodeURIComponent(commeLeRobot(Date.now() - 170 * 86400000))}`,
    vendeur);
  verifier("une suite de cinq mois en arrière ne lui ouvre pas la caisse",
    (loin.paiements ?? []).every((p) => sienne.has(p.id)), `${loin.paiements?.length} lignes`);

  // --- 6. UNE SUITE FORGÉE ----------------------------------------------------------
  console.log("\n6. UNE SUITE FORGÉE EST IGNORÉE");
  const sans = await donnees(`sms=${PAGE}`, patron);
  for (const forge of ["2026-10-01'); drop table paiements; --", "n'importe quoi",
                       "2026-10-01T10:00:00&carte=eq.x", "9".repeat(60)]) {
    const d = await donnees(`sms=${PAGE}&avant=${encodeURIComponent(forge)}`, patron);
    verifier(`« ${forge.slice(0, 28)} » : comme sans suite`,
      d.paiements?.[0]?.id === sans.paiements?.[0]?.id
        && d.paiements?.length === sans.paiements?.length);
  }

  // --- 7. UN REÇU DE CINQ MOIS ---------------------------------------------------
  console.log("\n7. UN REÇU ÉTABLI IL Y A CINQ MOIS SE RETROUVE");
  const vieille = tout.find((l) => l.carte === MTN_A && /^RA/.test(l.reference ?? "")
    && Date.parse(l.recu_le) < Date.now() - 150 * 86400000);
  const ligneVieille = (await (await fetch(
    `${N}/rest/v1/paiements?select=*&id=eq.${vieille.id}`)).json())[0];
  const numero = `TM-2026-0515-${String(ligneVieille.source_id).padStart(4, "0")}`;
  await fetch(`${N}/rest/v1/recus`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ numero, reference: ligneVieille.reference, terminal: "douala-faux",
                           chemin: `2026/${numero}.pdf`, etabli_le: "2026-05-15T10:00:00+01:00" }),
  });
  // La page plus ancienne qui la porte : SANS son reçu (`recus=0`).
  const page = await donnees(`sms=${PAGE}&avant=${encodeURIComponent(ligneVieille.recu_le)}`, patron);
  const surLaPage = (page.paiements ?? []).find((p) => p.id === String(vieille.id));
  verifier("le témoin : la ligne arrive sans son reçu", surLaPage != null && surLaPage.recu == null,
    String(surLaPage?.recu));
  const trouve = await (await lire(`/api/recu-du-sms?id=${vieille.id}`, patron)).json();
  verifier("la fiche le retrouve", trouve.recu === numero, String(trouve.recu));
  const pasLeSien = await (await lire(`/api/recu-du-sms?id=${vieille.id}`, vendeur)).json();
  verifier("… pas le vendeur, à qui la carte n'est pas confiée", pasLeSien.recu == null);

  // --- 8. LE SITE ----------------------------------------------------------------
  console.log("\n8. LE SITE RECOLLE ET LE DIT");
  const nav = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
  });
  navigateur.push(nav);
  const entrer = async (courriel, mdp) => {
    // En français : c'est la langue de l'écran que le harnais lit. Le site
    // la tient dans un cookie, pas dans la langue du navigateur.
    const contexte = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await contexte.addCookies([{ name: COOKIE_LANGUE, value: "fr", url: B }]);
    const page = await contexte.newPage();
    await page.goto(B, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]:not([readonly])').fill(courriel);
    await page.locator('input[type="password"]').fill(mdp);
    await page.getByText(/^(Sign in|Se connecter)$/).last().click();
    await page.waitForTimeout(2500);
    return page;
  };
  const corps = (page) => page.evaluate(() => document.body.innerText);
  const attendreTexte = async (page, re, ms = 30000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) { if (re.test(await corps(page))) return true; await attendre(250); }
    return false;
  };

  // « Ce mois » dépasse-t-il ce que la page reçoit d'un coup (mille SMS) ?
  // Cela dépend du jour où l'essai tourne : on le CALCULE, et chaque cas a
  // son exigence — l'avertissement quand il manque des jours, et seulement
  // alors.
  const jourDouala = (t) => new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(new Date(t));
  const aujourdhui = jourDouala(Date.now());
  const premierDuMois = `${aujourdhui.slice(0, 8)}01`;
  const parReleve = [...tout].sort((a, b) => Date.parse(b.recu_le) - Date.parse(a.recu_le));
  const mordu = jourDouala(parReleve[999].recu_le) >= premierDuMois;
  const AVERTI = /premiers jours de cette période ne sont pas encore chargés/;
  const pagePatron = await entrer("patron@histoire.cm", MDP_PATRON);
  await pagePatron.goto(`${B}/paiements?periode=mois`, { waitUntil: "networkidle" });
  if (mordu) {
    const [a, m] = premierDuMois.split("-").map(Number);
    const hier = jourDouala(Date.now() - 86400000);
    const nomDuPremier = premierDuMois === aujourdhui ? "Aujourd’hui"
      : premierDuMois === hier ? "Hier"
      : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })
          .format(new Date(Date.UTC(a, m - 1, 1)));
    const vu = await corps(pagePatron);
    verifier("« Ce mois » dit qu'il manque ses premiers jours", AVERTI.test(vu),
      `mille SMS remontent au ${jourDouala(parReleve[999].recu_le)}`);
    // Un harnais qui échoue montre ce qu'il avait sous les yeux.
    if (!AVERTI.test(vu)) {
      console.log(`      à l'écran : ${vu.replace(/\s+/g, " ").slice(0, 400)}`);
      throw new Error("l'avertissement manque — la suite de l'essai n'aurait pas de sens");
    }
    // Un clic rend UNE page (cinq cents SMS) : selon le jour où l'essai
    // tourne, le premier du mois est à un clic ou à plusieurs. Écrit un 13,
    // l'essai n'en faisait qu'un — et le 16, il échouait sur une page qui
    // marchait. On clique donc tant que le premier n'est pas là, borné.
    const premierVu = new RegExp(`(^|\\n)${nomDuPremier}(\\n|$)`, "i");
    let recolle = false, clicsMois = 0;
    while (!recolle && clicsMois < 10) {
      const bouton = pagePatron.getByRole("button", { name: /Voir les paiements plus anciens/ });
      if (!(await bouton.count())) break;
      await bouton.click();
      clicsMois++;
      recolle = await attendreTexte(pagePatron, premierVu, 15000);
    }
    verifier("au bouton, le premier du mois arrive", recolle,
      `${nomDuPremier}, ${clicsMois} clic(s)`);
    if (!recolle) {
      const vuApres = (await corps(pagePatron)).replace(/\s+/g, " ");
      console.log(`      à l'écran : …${vuApres.slice(-500)}`);
    }
    verifier("et l'avertissement s'en va", !AVERTI.test(await corps(pagePatron)));
  } else {
    verifier("« Ce mois » tient dans la page : aucun avertissement",
      !AVERTI.test(await corps(pagePatron)), "le mois vient de commencer");
  }

  const pageVendeur = await entrer("vendeur@histoire.cm", MDP_VENDEUR);
  await pageVendeur.goto(`${B}/paiements`, { waitUntil: "networkidle" });
  const avantVendeur = (await corps(pageVendeur)).match(/HISTO \d+/g)?.length ?? 0;
  let clics = 0;
  while (clics < 10) {
    const bouton = pageVendeur.getByRole("button", { name: /Voir les paiements plus anciens/ });
    if (!(await bouton.count())) break;
    await bouton.click();
    clics++;
    await attendreTexte(pageVendeur, /Début de l'historique|Voir les paiements plus anciens/);
    await attendre(500);
  }
  const finVendeur = await corps(pageVendeur);
  const histo = new Set(finVendeur.match(/HISTO \d+/g) ?? []);
  verifier("la première page ne montre pas tout", avantVendeur < 1200, `${avantVendeur}`);
  verifier("au bouton, chaque paiement de sa carte est là", histo.size === 1200,
    `${histo.size} sur 1200, ${clics} clic(s)`);
  verifier("et la fin se dit : « Début de l'historique »", /Début de l'historique/.test(finVendeur));
} catch (e) {
  echecs++;
  console.error(`\n✗ ${e?.stack || e}`);
} finally {
  for (const n of navigateur) await n.close().catch(() => {});
  try { process.kill(-serveur.pid, "SIGKILL"); } catch { /* déjà parti */ }
  try { nuage.kill("SIGKILL"); } catch { /* déjà parti */ }
}

console.log(echecs === 0
  ? "\n✓ L'historique entier s'atteint, sans trou, et la fin se dit.\n"
  : `\n✗ ${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
