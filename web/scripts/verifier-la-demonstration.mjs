// LA VITRINE DE DÉMONSTRATION, VRAIMENT ESSAYÉE.
//
//     node scripts/verifier-la-demonstration.mjs
//
// Apple et Google n'acceptent TOTEM qu'après qu'un examinateur l'a ouvert.
// Le compte qu'on lui donne a des identifiants PUBLICS — ils sont dans la
// fiche du magasin, donc dans le dépôt. N'importe qui peut donc entrer par
// cette porte, et c'est voulu : elle n'ouvre qu'une vitrine.
//
// TOUT LE RISQUE EST LÀ : une vitrine dont une seule vitre donne sur la
// maison. Le harnais se met à la place de quiconque a lu le dépôt, entre avec
// ces identifiants, et cherche ce qui fuit :
//
//   · les données : une vraie carte, un vrai SMS, le vrai terminal ;
//   · les gestes : une vraie commande déposée pour le robot, un reçu, un
//     bénéficiaire, un lien de bilan « tout » ;
//   · l'administration : la console, les comptes, les appareils ;
//   · la fermeture : `DEMONSTRATION=non` doit fermer la porte ET les jetons
//     déjà émis.
//
// Il exige aussi l'inverse : que la vitrine MONTRE quelque chose (deux
// cartes, des SMS, une opération qui va jusqu'à « réussie »). Une vitrine
// vide passerait toutes les gardes, et l'examinateur refuserait
// l'application.
//
// SON TÉMOIN : la ligne de `porteeDe` qui rend RIEN à la démonstration. Sans
// elle, la démonstration — qui ne désigne aucun compte — tombe dans le cas
// « personne, donc le propriétaire » et voit TOUT. Retirez-la : ce harnais
// doit échouer.
//
// Il sert le code COMPILÉ : lancez « npx next build » avant.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as attendre } from "node:timers/promises";

const SECRET = "secret-d-essai-pour-la-demonstration";
const SECOURS = "cle-de-secours-d-essai-demonstration";
const PORT = 3133;
const PORT_FERME = 3134;
const NUAGE = 4977;
const B = `http://127.0.0.1:${PORT}`;
const BF = `http://127.0.0.1:${PORT_FERME}`;

// Les identifiants publiés dans la fiche du magasin.
const COURRIEL = "examen@totemlabs.app";
const MOTDEPASSE = "TOTEM-Examen-2026";

// Les cartes du faux nuage : la « maison ».
const VRAIES = ["89237010000000008901", "89237020000000004432"];
const DEMO = ["89237010000000000001", "89237020000000000002"];

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(56)} ${JSON.stringify(obtenu)}`);
}

// UN SERVEUR DÉJÀ LÀ EST UN PIÈGE : voir verifier-la-console.mjs.
async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}
for (const port of [PORT, PORT_FERME, NUAGE]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé. Un essai précédent tourne`);
    console.error("  encore : ces vérifications porteraient sur SON code. Arrêtez-le.");
    process.exit(1);
  }
}

const nuage = spawn("node", ["scripts/faux-nuage.mjs"], {
  env: { ...process.env, PORT: String(NUAGE) },
  stdio: "ignore",
});
const envServeur = {
  ...process.env,
  SUPABASE_URL: `http://127.0.0.1:${NUAGE}`, SUPABASE_CLE: "peu-importe",
  SESSION_SECRET: SECRET, TOTEM_MOT_DE_PASSE: SECOURS,
};
delete envServeur.DEMONSTRATION;
// Détachés, pour être arrêtés avec leurs enfants : tuer « npx » seul laisse
// tourner le vrai serveur, qui servirait l'essai suivant.
const serveur = spawn("npx", ["next", "start", "-p", String(PORT)],
  { env: envServeur, stdio: "ignore", detached: true });
// LE MÊME CODE, LA MÊME BASE, LE MÊME SECRET — vitrine fermée.
const ferme = spawn("npx", ["next", "start", "-p", String(PORT_FERME)],
  { env: { ...envServeur, DEMONSTRATION: "non" }, stdio: "ignore", detached: true });
const arreter = (p) => { try { process.kill(-p.pid); } catch { /* déjà parti */ } };

const appel = (base, chemin, { jeton, corps, cookie } = {}) =>
  fetch(base + chemin, {
    method: corps === undefined ? "GET" : "POST",
    headers: {
      ...(corps === undefined ? {} : { "content-type": "application/json" }),
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(cookie ? { cookie: `totem_session=${cookie}` } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    redirect: "manual",
  });

/** Combien de demandes la base des commandes porte — tous genres. */
async function commandesDeposees() {
  let n = 0;
  for (const type of ["solde", "ussd", "ussd_reponse", "ussd_fin", "recu", "identite"]) {
    const r = await fetch(`http://127.0.0.1:${NUAGE}/rest/v1/commandes?type=eq.${type}`);
    n += (await r.json()).length;
  }
  return n;
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${NUAGE}/rest/v1/utilisateurs`)).ok) break;
    } catch { /* pas encore */ }
    await attendre(300);
  }
  for (const base of [B, BF]) {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + "/api/plateforme")).ok) break; } catch { /* pas encore */ }
      await attendre(500);
    }
  }

  console.log("\nLA PORTE : les identifiants publiés, et eux seuls");
  {
    const faux = await appel(B, "/api/session",
      { corps: { courriel: COURRIEL, motdepasse: "TOTEM-Examen-2025" } });
    verifier("un mot de passe voisin est refusé", faux.status, 401);
    const vide = await appel(B, "/api/session", { corps: { courriel: COURRIEL } });
    verifier("sans mot de passe : refus", vide.status, 401);
  }
  const r = await appel(B, "/api/session", { corps: { courriel: COURRIEL, motdepasse: MOTDEPASSE } });
  const jeton = (await r.json()).jeton;
  verifier("le téléphone entre avec les identifiants publiés", [r.status, Boolean(jeton)], [200, true]);
  const rc = await appel(B, "/api/connexion", { corps: { courriel: COURRIEL, motdepasse: MOTDEPASSE } });
  const cookie = /totem_session=([^;]+)/.exec(rc.headers.get("set-cookie") ?? "")?.[1];
  verifier("le navigateur aussi", [rc.status, Boolean(cookie)], [200, true]);

  console.log("\nLA VITRINE MONTRE QUELQUE CHOSE");
  const d = await (await appel(B, "/api/donnees?sms=200", { jeton })).json();
  verifier("deux cartes, celles de la démonstration",
    (d.sims ?? []).map((s) => s.iccid).sort(), [...DEMO].sort());
  verifier("chacune avec un solde", (d.sims ?? []).every((s) => typeof s.solde === "number"), true);
  verifier("des SMS à lire", (d.paiements ?? []).length >= 8, true);
  verifier("des boutons d'opération, MTN et Orange",
    Object.values(d.raccourcis ?? {}).map((l) => l.length >= 4), [true, true]);
  verifier("un terminal en ligne", d.terminal?.enLigne, true);
  // Ce que le téléphone lit maintenant : l'instant du signe de vie, son âge
  // mesuré par la plateforme, l'heure de la réponse — et pour chaque carte,
  // ce qu'on sait VRAIMENT de sa présence. La vitrine passe par le même
  // chemin que les vrais écrans : elle doit les porter aussi.
  verifier("son dernier signe de vie, et son âge en secondes",
    [typeof d.terminal?.vuLe, typeof d.terminal?.vuIlYa === "number" && d.terminal.vuIlYa < 300],
    ["string", true]);
  verifier("l'heure de la réponse", typeof d.serveurA === "string" && !Number.isNaN(Date.parse(d.serveurA)), true);
  verifier("ses cartes sont en place, et le disent",
    (d.sims ?? []).map((s) => [s.presence, s.enPlace]), [["en_place", true], ["en_place", true]]);
  // L'état du boîtier PAR CARTE : le téléphone ne met une carte en pause que
  // si SON boîtier se tait. Une vitrine qui ne le porterait pas montrerait à
  // l'examinateur des gestes réglés sur le boîtier d'en tête.
  verifier("chaque carte dit que SON boîtier parle, avec l'heure où il a été entendu",
    (d.sims ?? []).map((s) => [s.boitierMuet,
      typeof s.boitierVuLe === "string" && s.boitierVuLe === d.terminal?.vuLe]),
    [[false, true], [false, true]]);
  verifier("elle se présente sous son nom, sans administrer",
    [d.courriel, d.proprietaire], [COURRIEL, false]);

  console.log("\n…ET RIEN DE LA MAISON");
  {
    const brut = JSON.stringify(d);
    verifier("aucune vraie carte dans les données", VRAIES.some((c) => brut.includes(c)), false);
    verifier("aucun SMS du faux nuage", brut.includes("8901") || brut.includes("4432"), false);
    verifier("pas le vrai terminal", brut.includes("Douala (faux)"), false);
    // Les pages du site : le même chemin, par le cookie.
    // « Ce qui s'est passé » (/journal) est le journal de TOTEM : réservé à
    // qui administre. La vitrine y est renvoyée à l'accueil (307), comme
    // n'importe quel inscrit — vérifié plus bas.
    for (const page of ["/", "/cartes", "/encaissements", "/actions", "/analyse"]) {
      const p = await appel(B, page, { cookie });
      const corps = await p.text();
      verifier(`la page ${page} ne montre aucune vraie carte`,
        [p.status, corps.includes("8901") || corps.includes("4432") || corps.includes("Douala (faux)")],
        [200, false]);
    }
    const journal = await appel(B, "/journal", { cookie });
    verifier("« Ce qui s'est passé » : refusé à la vitrine (renvoi à l'accueil)",
      [journal.status, /Douala \(faux\)|douala-faux/.test(await journal.text())], [307, false]);
    const accueil = await (await appel(B, "/", { cookie })).text();
    verifier("l'accueil du site montre la vitrine", accueil.includes("FAMILLE DÉMO"), true);
    // GRAND PUBLIC : la vitrine montre les comptes d'une personne, pas la
    // caisse d'un commerce — c'est ce qui avait fait arrêter l'examen (3.2).
    verifier("…celle d'une personne, pas d'une boutique et de ses clients",
      // En capitales, comme le jeu les écrit : « FournisseurLangue », le nom
      // d'un composant dans la page, n'est pas un fournisseur.
      /BOUTIQUE D[ÉE]MO|CLIENT D[ÉE]MO|FOURNISSEUR D[ÉE]MO/.test(accueil), false);
  }

  console.log("\nLE PROPRIÉTAIRE, LUI, NE VOIT PAS LA VITRINE");
  {
    const s = await (await appel(B, "/api/session", { corps: { motdepasse: SECOURS } })).json();
    const p = await (await appel(B, "/api/donnees?sms=200", { jeton: s.jeton })).json();
    const ids = (p.sims ?? []).map((x) => x.iccid);
    verifier("ses vraies cartes", VRAIES.every((c) => ids.includes(c)), true);
    verifier("et aucune carte inventée", DEMO.some((c) => ids.includes(c)), false);
  }

  console.log("\nUNE OPÉRATION SE JOUE JUSQU'AU BOUT — POUR DE FAUX");
  {
    const avant = await commandesDeposees();
    const lire = async (id) => (await (await appel(B, `/api/commande/${id}`, { jeton })).json());
    const deposer = async (type, parametres) =>
      (await (await appel(B, "/api/commande", { jeton, corps: { type, parametres } })).json()).id;
    const menu = await lire(await deposer("ussd", { code: "*126#", carte: DEMO[0] }));
    verifier("le menu de l'opérateur arrive", /Mobile Money/.test(menu.resultat ?? ""), true);
    const num = await lire(await deposer("ussd_reponse", { texte: "1", carte: DEMO[0] }));
    verifier("il demande le numéro", /numero/i.test(num.resultat ?? ""), true);
    const mt = await lire(await deposer("ussd_reponse", { texte: "670000011", carte: DEMO[0] }));
    verifier("puis le montant", /montant/i.test(mt.resultat ?? ""), true);
    const conf = await lire(await deposer("ussd_reponse", { texte: "5000", carte: DEMO[0] }));
    verifier("puis le code secret, message entier",
      /5 000 FCFA[\s\S]*code secret/.test(conf.resultat ?? ""), true);
    const fin = await lire(await deposer("ussd_reponse",
      { texte: "1234", secret: true, carte: DEMO[0] }));
    verifier("« opération réussie », et il le dit pour de faux",
      /reussie[\s\S]*DEMONSTRATION/.test(fin.resultat ?? ""), true);
    verifier("AUCUNE demande n'est entrée dans la base", await commandesDeposees(), avant);
  }

  console.log("\nAUCUN GESTE NE TOUCHE LA MAISON");
  {
    const avant = await commandesDeposees();
    // Un vrai numéro de commande : la démonstration ne le lit pas.
    const s = await (await appel(B, "/api/session", { corps: { motdepasse: SECOURS } })).json();
    const vraie = (await (await appel(B, "/api/commande",
      { jeton: s.jeton, corps: { type: "solde", parametres: {} } })).json()).id;
    const lue = await appel(B, `/api/commande/${vraie}`, { jeton });
    verifier("une vraie demande est introuvable pour elle", lue.status, 404);
    for (const [type, parametres] of [
      ["recu", { source_id: 1 }], ["identite", { iccid: VRAIES[0], nom: "X" }],
      ["raccourci", { operateur: "MTN", cle: "depot", action: "oublier" }],
    ]) {
      const g = await appel(B, "/api/commande", { jeton, corps: { type, parametres } });
      verifier(`le geste « ${type} » est refusé`, g.status, 403);
    }
    verifier("rien n'est entré dans la base (hors la demande du propriétaire)",
      await commandesDeposees(), avant + 1);
    const ben = await appel(B, "/api/beneficiaires",
      { jeton, corps: { geste: "enregistrer", carte: VRAIES[0], numero: "677000000", nom: "X" } });
    verifier("pas de bénéficiaire sur une vraie carte", ben.status, 403);
    const coord = await appel(B, `/api/coordonnees/${VRAIES[0]}/lien`, { jeton });
    verifier("pas les coordonnées d'une vraie carte", coord.status >= 400, true);
    const bilan = await appel(B, "/api/bilan/lien?jours=30", { jeton });
    verifier("pas de lien de bilan", bilan.status >= 400, true);
    const csv = await appel(B, "/api/bilan?jours=30", { jeton });
    const texte = csv.ok ? await csv.text() : "";
    verifier("le bilan ne porte aucun vrai SMS", texte.includes("8901"), false);
    const act = await (await appel(B, "/api/actualite", { jeton })).json();
    verifier("la pastille ne compte rien de la maison", act.dernier, 0);
  }

  console.log("\nELLE N'ADMINISTRE RIEN");
  {
    verifier("la liste des comptes : refus",
      (await appel(B, "/api/comptes", { jeton })).status, 403);
    const cree = await appel(B, "/api/comptes", { jeton,
      corps: { geste: "creer", prenom: "A", nom: "B", courriel: "a@b.cm", motdepasse: "x".repeat(14) } });
    verifier("créer un compte : refus", cree.status, 403);
    verifier("inscrire un téléphone aux notifications : refus",
      (await appel(B, "/api/appareil", { jeton,
        corps: { jeton: "ExponentPushToken[x]", plateforme: "ios", nom: "x" } })).status, 403);
    const c = await appel(B, "/console", { cookie });
    verifier("la console renvoie à l'accueil", [c.status, c.headers.get("location")?.endsWith("/")],
      [307, true]);
  }

  console.log("\nCE QUE FERA L'EXAMINATEUR : UN DÉPÔT, PAR LE BOUTON, DANS UN NAVIGATEUR");
  {
    // Les gestes jouent un menu SANS ÉTAT : chaque réponse se devine à sa
    // forme. Le harnais vérifie que le vrai parcours de l'écran — numéro et
    // montant tapés d'avance, réponses envoyées toutes seules — tombe bien
    // sur la bonne suite d'écrans, jusqu'au pavé puis à « réussie ».
    const nav = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium",
      args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
    });
    try {
      const contexte = await nav.newContext({ viewport: { width: 1280, height: 900 } });
      await contexte.addCookies([{ name: "totem_session", value: cookie, url: B }]);
      const page = await contexte.newPage();
      await page.goto(`${B}/actions`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /MTN/ }).first().click();
      await page.getByRole("button", { name: /^(Dépôt|Deposit)/ }).first().click();
      const fenetre = page.getByRole("dialog");
      await fenetre.waitFor({ timeout: 5000 });
      await fenetre.locator("input").first().fill("670000011");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await fenetre.locator("input").first().fill("5000");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await fenetre.getByRole("button", { name: /^(Confirmer|Confirm)$/ }).click();
      let pave = 0;
      for (let i = 0; i < 40 && pave < 9; i++) {
        await page.waitForTimeout(500);
        pave = await fenetre.getByRole("button", { name: /^[0-9]$/ }).count();
      }
      verifier("le pavé du code s'ouvre", pave >= 9, true);
      verifier("sous le message entier : montant et bénéficiaire",
        /5 000 FCFA[\s\S]*CLIENT DEMO/.test(await fenetre.innerText()), true);
      for (const c of "1234") {
        await fenetre.getByRole("button", { name: new RegExp(`^${c}$`) }).first().click();
      }
      await fenetre.getByRole("button", { name: /^(Valider|Confirm)$/i }).first().click();
      let fin = "";
      for (let i = 0; i < 20 && !/reussie/i.test(fin); i++) {
        await page.waitForTimeout(500);
        fin = await fenetre.innerText().catch(() => "");
      }
      verifier("« opération réussie », pour de faux", /reussie[\s\S]*DEMONSTRATION/.test(fin), true);
    } finally {
      await nav.close().catch(() => {});
    }
  }

  console.log("\nLA FICHE DU MAGASIN DONNE LES BONS IDENTIFIANTS");
  {
    // Une fiche qui porterait un ancien mot de passe partirait sans erreur —
    // et reviendrait refusée trois jours plus tard.
    const { apple } = require("../../mobile/store.config.js");
    verifier("ceux que la plateforme accepte",
      [apple.review.demoUsername, apple.review.demoPassword], [COURRIEL, MOTDEPASSE]);
  }

  console.log("\nFERMÉE (DEMONSTRATION=non) : LA PORTE, ET LES JETONS DÉJÀ ÉMIS");
  {
    const r2 = await appel(BF, "/api/session",
      { corps: { courriel: COURRIEL, motdepasse: MOTDEPASSE } });
    verifier("les identifiants publiés n'ouvrent plus", r2.status, 401);
    const vieux = await appel(BF, "/api/donnees", { jeton });
    verifier("un jeton d'examen déjà émis est refusé", vieux.status, 401);
    const page = await appel(BF, "/", { cookie });
    verifier("la page renvoie à la connexion", page.status, 307);
  }

  console.log("");
  if (echecs) {
    console.error(`✗ ${echecs} vérification(s) en défaut.`);
    process.exitCode = 1;
  } else {
    console.log("✓ La vitrine tient : elle montre, et ne donne sur rien.");
  }
} finally {
  arreter(serveur);
  arreter(ferme);
  nuage.kill();
}
process.exit(echecs ? 1 : 0);
