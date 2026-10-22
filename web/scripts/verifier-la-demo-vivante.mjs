// LA DÉMO VIVANTE, VRAIMENT JOUÉE — contre une VRAIE base.
//
//     node scripts/verifier-la-demo-vivante.mjs
//
// Les autres harnais parlent au faux nuage, une imitation de Supabase écrite
// ici. Celui-ci ne le peut pas : la démo vit dans la BASE — ses doubles, ses
// vues, son faux réseau en PL/pgSQL — et une imitation ne peut pas prendre en
// défaut un SQL qu'elle n'exécute pas. Il monte donc un PostgreSQL neuf, y
// joue le schéma et TOUTES les migrations, met devant un vrai PostgREST (le
// moteur de Supabase), puis lance la vraie plateforme, compilée.
//
// CE QU'IL CHERCHE À PRENDRE EN DÉFAUT :
//
//   · un testeur qui verrait une carte, un SMS, un compte de la MAISON ;
//   · le propriétaire de la maison qui verrait une carte de démo ;
//   · une demande de démo qui arriverait dans la vraie table des commandes
//     — celle que le vrai boîtier relève et compose ;
//   · un testeur qui fabriquerait des francs, entrerait dans la console, le
//     journal, ou l'écran de la démo ;
//   · un transfert joué par l'écran qui n'arriverait pas chez l'autre, ou
//     paierait avec un code faux ;
//   · un SMS de float qui partirait chez Glisil sans signature juste, ou ne
//     partirait pas ;
//   · la parité de la démo (somme des soldes = somme fabriquée) qui céderait.
//
// LA VÉRITÉ INDÉPENDANTE. « Le testeur ne voit pas la vraie carte » ne prouve
// rien si la vraie carte n'existe pas : le harnais l'écrit lui-même dans la
// base, la relit DIRECTEMENT (sans la plateforme), et seulement ensuite exige
// que l'écran du testeur ne la montre pas.
//
// Il ne touche à aucune base réelle : la sienne vit dans un dossier
// temporaire, sur des ports à lui, et meurt avec lui.

import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, chmodSync } from "node:fs";
import http from "node:http";
import { setTimeout as attendre } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(ICI, "..");
const RACINE = path.resolve(WEB, "..");

const PORT_PG = 5466;
const PORT_REST = 5468;
const PORT_NUAGE = 5469;     // le mandataire : /rest/v1 → PostgREST, /functions/v1 → faux Glisil
const PORT_WEB = 3141;
const B = `http://127.0.0.1:${PORT_WEB}`;
const NUAGE = `http://127.0.0.1:${PORT_NUAGE}`;
const SECRET = "secret-d-essai-pour-la-demo-vivante";
const JWT_SECRET = "un-secret-jwt-d-essai-d-au-moins-trente-deux-caracteres";
const CLE_GLISIL = "cle-du-terminal-totem-demo-chez-glisil";
const MDP = "un-mot-de-passe-assez-long";
const GRAPPE = "/var/lib/postgresql/totem-demo-vivante";
const POSTGREST_VERSION = "v12.2.3";
const POSTGREST_DIR = "/tmp/totem-postgrest";

let echecs = 0;
function verifier(quoi, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(66)} ${JSON.stringify(obtenu)}`);
}
function exiger(quoi, condition, detail = "") {
  if (!condition) echecs++;
  console.log(`  ${condition ? "✓" : "✗"} ${quoi}${detail ? `  ${detail}` : ""}`);
}

// --- les ports ---------------------------------------------------------------
async function portLibre(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}
for (const port of [PORT_REST, PORT_NUAGE, PORT_WEB]) {
  if (!(await portLibre(port))) {
    console.error(`\n✗ Le port ${port} est déjà occupé : un essai précédent tourne encore,`);
    console.error("  et ces vérifications porteraient sur SON code. Arrêtez-le, puis relancez.");
    process.exit(1);
  }
}

// --- PostgreSQL ----------------------------------------------------------------
const binPg = ["/usr/lib/postgresql", "/usr/local/pgsql"].flatMap((d) =>
  existsSync(d) ? readdirSync(d).map((v) => path.join(d, v, "bin")) : [])
  .find((b) => existsSync(path.join(b, "initdb")));
if (!binPg) {
  console.error("✗ PostgreSQL n'est pas installé ici : rien ne peut être éprouvé.");
  process.exit(1);
}
const enRoot = process.getuid?.() === 0;
const pgCmd = (cmd) => {
  const ligne = `PATH='${binPg}:${process.env.PATH}' ${cmd}`;
  return enRoot
    ? spawnSync("su", ["postgres", "-c", ligne], { encoding: "utf8" })
    : spawnSync("sh", ["-c", ligne], { encoding: "utf8" });
};
if (spawnSync(path.join(binPg, "pg_isready"), ["-h", "/tmp", "-p", String(PORT_PG)]).status === 0) {
  console.error(`✗ Un PostgreSQL écoute déjà sur le port ${PORT_PG} : on mesurerait SA base.`);
  process.exit(1);
}

const psql = (sql, base = "totem") => {
  const r = spawnSync(path.join(binPg, "psql"),
    ["-h", "/tmp", "-p", String(PORT_PG), "-U", "totem", "-d", base, "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-c", sql],
    { encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } });
  if (r.status !== 0) throw new Error(`psql : ${r.stderr}`);
  return r.stdout.trim();
};
const psqlFichier = (fichier) => {
  const r = spawnSync(path.join(binPg, "psql"),
    ["-h", "/tmp", "-p", String(PORT_PG), "-U", "totem", "-d", "totem", "-v", "ON_ERROR_STOP=1", "-q", "-f", fichier],
    { encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } });
  if (r.status !== 0) throw new Error(`${path.basename(fichier)} : ${r.stderr}`);
};

const enfants = [];
function arreterTout() {
  for (const e of enfants) {
    try { process.kill(-e.pid, "SIGTERM"); } catch { /* déjà parti */ }
    try { e.kill("SIGTERM"); } catch { /* déjà parti */ }
  }
  pgCmd(`pg_ctl -D ${GRAPPE} stop -m immediate`);
  rmSync(GRAPPE, { recursive: true, force: true });
}
process.on("exit", arreterTout);
process.on("SIGINT", () => process.exit(130));

console.log("\nUne base neuve, le schéma, toutes les migrations…");
rmSync(GRAPPE, { recursive: true, force: true });
mkdirSync(GRAPPE, { recursive: true });
if (enRoot) execFileSync("chown", ["postgres:postgres", GRAPPE]);
chmodSync(GRAPPE, 0o700);
if (pgCmd(`initdb -D ${GRAPPE} -U totem --auth=trust`).status !== 0) {
  console.error("✗ initdb a échoué");
  process.exit(1);
}
pgCmd(`pg_ctl -D ${GRAPPE} -o '-p ${PORT_PG} -k /tmp' -l /tmp/totem-demo-vivante.log start`);
for (let i = 0; i < 20; i++) {
  if (spawnSync(path.join(binPg, "pg_isready"), ["-h", "/tmp", "-p", String(PORT_PG)]).status === 0) break;
  await attendre(500);
}
psql("create database totem;", "postgres");
// Le décor de Supabase : ses rôles, et la clé de service qui passe les
// règles de ligne (BYPASSRLS) — c'est ainsi que la plateforme lit en vrai.
psql(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role authenticator login noinherit;
  grant anon, authenticated, service_role to authenticator;`);
psqlFichier(path.join(RACINE, "sql/schema.sql"));
for (const m of readdirSync(path.join(RACINE, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  psqlFichier(path.join(RACINE, "migrations", m));
  console.log(`  ✓ ${m}`);
}
psql(`
  grant usage on schema public to service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  grant execute on all functions in schema public to service_role;`);

// LA MAISON, écrite par le harnais lui-même : un boîtier, une vraie carte,
// un vrai SMS d'argent. C'est ce qu'un testeur ne doit JAMAIS voir.
const VRAIE_CARTE = "89237010000000008901";
psql(`
  insert into terminaux (id, nom, vu_le, version) values ('akwa', 'Akwa', now(), '1.0');
  insert into cartes (terminal, iccid, imsi_prefixe, operateur, libelle, nom, numero, premiere_vue, derniere_vue)
    values ('akwa', '${VRAIE_CARTE}', '62401', 'MTN', 'MTN ·8901', 'BOUTIQUE AKWA', '677123456', now(), now());
  insert into comptes (terminal, iccid, libelle, operateur, reseau, numero, solde, signal, solde_maj, maj)
    values ('akwa', '${VRAIE_CARTE}', 'MTN ·8901', 'MTN', 'MTN', '677123456', 4231500, 20, now(), now());
  insert into paiements (terminal, source_id, compte, carte, sens, montant, tiers, numero, reference,
                         solde_apres, expediteur, categorie, texte, emis_le, recu_le)
    values ('akwa', 1, 'MTN ·8901', '${VRAIE_CARTE}', 'entree', 4231500, 'NKENGAFAC MBOUNGOU', '699112233',
            '9988776655', 4231500, 'MobileMoney', 'encaissement',
            'Vous avez recu 4231500 FCFA de NKENGAFAC MBOUNGOU (699112233). Transaction Id : 9988776655.',
            now(), now());`);

// --- PostgREST ------------------------------------------------------------------
const binRest = path.join(POSTGREST_DIR, "postgrest");
if (!existsSync(binRest)) {
  console.log(`\nPostgREST ${POSTGREST_VERSION} (le moteur de Supabase) se télécharge…`);
  mkdirSync(POSTGREST_DIR, { recursive: true });
  const archive = path.join(POSTGREST_DIR, "postgrest.tar.xz");
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
  const r = spawnSync("curl", ["-sSfL", "-o", archive, url], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`✗ PostgREST introuvable et non téléchargeable : ${r.stderr}`);
    process.exit(1);
  }
  execFileSync("tar", ["-xJf", archive, "-C", POSTGREST_DIR]);
}
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const corpsJwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ role: "service_role", iss: "essai" })}`;
const CLE_SERVICE = `${corpsJwt}.${createHmac("sha256", JWT_SECRET).update(corpsJwt).digest("base64url")}`;
const rest = spawn(binRest, [], {
  env: {
    ...process.env,
    PGRST_DB_URI: `postgres://authenticator@/totem?host=/tmp&port=${PORT_PG}`,
    PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET, PGRST_SERVER_PORT: String(PORT_REST),
    PGRST_SERVER_HOST: "127.0.0.1",
  },
  stdio: "ignore", detached: true,
});
enfants.push(rest);

// --- le mandataire, et le faux Glisil ----------------------------------------------
// Glisil, ici, ne fait qu'une chose : VÉRIFIER la signature de la porte
// (la même règle que supabase/functions/_shared/porte.ts chez Glisil), et
// noter ce qu'il reçoit. Une ligne mal signée est refusée en 401.
const recuParGlisil = [];
let refusParGlisil = 0;
// les sorties de démo que Glisil attend de voir payées (0032), et ce qu'on lui en a rendu
const sortiesDemo = [];
const mandataire = http.createServer(async (req, res) => {
  const morceaux = [];
  for await (const m of req) morceaux.push(m);
  const corps = Buffer.concat(morceaux);
  if (req.url.startsWith("/functions/v1/totem-commandes")) {
    const cible = req.url.slice("/functions/v1/".length);
    const ts = req.headers["x-totem-horodatage"];
    const attendue = createHmac("sha256", CLE_GLISIL)
      .update(`${ts}.${req.method} ${cible}.${corps.toString("utf8")}`).digest("hex");
    const repondre = (statut, json) => { res.writeHead(statut, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
    if (req.headers["x-totem-terminal"] !== "totem-demo" || req.headers["x-totem-signature"] !== attendue
        || Math.abs(Date.now() / 1000 - Number(ts)) > 300) { refusParGlisil++; return repondre(401, { erreur: "signature refusée" }); }
    if (req.method === "GET") {
      return repondre(200, sortiesDemo.filter((x) => x.etat === "en_attente")
        .map(({ reference, operateur, numero, montant }) => ({ reference, operateur, numero, montant })));
    }
    const b = JSON.parse(corps.toString("utf8") || "{}");
    const x = sortiesDemo.find((y) => y.reference === b.reference);
    if (!x || b.type !== "sorties_demo") return repondre(400, { erreur: "sortie inconnue" });
    if (b.etat === "en_cours") {
      if (x.etat !== "en_attente") return repondre(409, { erreur: "sortie déjà prise" });
      x.etat = "en_cours"; x.prises = (x.prises ?? 0) + 1;
      return repondre(200, { reference: x.reference, pris: true });
    }
    if (x.etat !== "en_cours") return repondre(400, { erreur: "cette sortie n'a pas été prise" });
    if (b.etat === "envoyee") { x.etat = "envoyee"; x.transaction_id = b.transaction_id; return repondre(200, { reference: x.reference, etat: "envoyee" }); }
    if (b.etat === "echouee") { x.etat = "annulee"; x.motif = b.motif; return repondre(200, { reference: x.reference, etat: "annulee" }); }
    return repondre(400, { erreur: "etat inconnu" });
  }
  if (req.url.startsWith("/functions/v1/totem-sms")) {
    const ts = req.headers["x-totem-horodatage"];
    const attendue = createHmac("sha256", CLE_GLISIL)
      .update(`${ts}.POST totem-sms.${corps.toString("utf8")}`).digest("hex");
    const fenetre = Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
    if (req.headers["x-totem-terminal"] !== "totem-demo" || req.headers["x-totem-signature"] !== attendue || !fenetre) {
      refusParGlisil++;
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ erreur: "signature refusée" }));
      return;
    }
    const { lignes } = JSON.parse(corps.toString("utf8"));
    recuParGlisil.push(...lignes);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(lignes.map((l) => ({ source_id: l.source_id, resultat: "credite", reference: `GL-${l.source_id}` }))));
    return;
  }
  if (!req.url.startsWith("/rest/v1/")) { res.writeHead(404); res.end(); return; }
  const entetes = { ...req.headers };
  delete entetes.host;
  delete entetes["content-length"];
  try {
    const r = await fetch(`http://127.0.0.1:${PORT_REST}${req.url.slice("/rest/v1".length)}`, {
      method: req.method, headers: entetes,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : corps,
    });
    const sortie = Buffer.from(await r.arrayBuffer());
    const h = {};
    r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
    res.writeHead(r.status, h);
    res.end(sortie);
  } catch (e) {
    res.writeHead(502); res.end(String(e));
  }
});
await new Promise((ok) => mandataire.listen(PORT_NUAGE, "127.0.0.1", ok));

// --- la plateforme -------------------------------------------------------------------
if (process.env.SANS_COMPILER !== "1") {
  // « next start » sert « .next », pas le disque : sans recompiler, on
  // mesurerait le code d'hier.
  console.log("\nLa plateforme se compile (next build)…");
  const r = spawnSync("npx", ["next", "build"], { cwd: WEB, encoding: "utf8", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (r.status !== 0) {
    console.error(r.stdout.slice(-3000), r.stderr.slice(-3000));
    console.error("✗ La compilation a échoué.");
    process.exit(1);
  }
}
const serveur = spawn("npx", ["next", "start", "-p", String(PORT_WEB)], {
  cwd: WEB,
  env: {
    ...process.env,
    SUPABASE_URL: NUAGE, SUPABASE_CLE: CLE_SERVICE,
    SESSION_SECRET: SECRET,
    XAFE_DEMO_URL: NUAGE, XAFE_DEMO_CLE: CLE_GLISIL,
  },
  stdio: "ignore", detached: true,
});
enfants.push(serveur);

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${NUAGE}/rest/v1/utilisateurs?select=id&limit=1`, { headers: { authorization: `Bearer ${CLE_SERVICE}` } })).ok) break; } catch { /* pas encore */ }
  await attendre(300);
}
for (let i = 0; i < 90; i++) {
  try { if ((await fetch(B + "/api/plateforme")).ok) break; } catch { /* pas encore */ }
  await attendre(500);
}

// --- les gestes ------------------------------------------------------------------------
let adresse = 1;
const adresseNeuve = () => `10.88.${(adresse >> 8) & 255}.${adresse++ & 255}`;
const avec = (jeton) => (jeton ? { authorization: `Bearer ${jeton}` } : {});
const json = (r) => r.json().catch(() => ({}));
const poste = (chemin, corps, jeton) => fetch(B + chemin, {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/json", "x-forwarded-for": adresseNeuve(), ...avec(jeton) },
  body: JSON.stringify(corps),
});
const lire = (chemin, jeton) => fetch(B + chemin, {
  redirect: "manual", headers: { "x-forwarded-for": adresseNeuve(), ...avec(jeton) },
});
const session = async (courriel, motdepasse = MDP) =>
  (await json(await poste("/api/session?langue=fr", { courriel, motdepasse }))).jeton;
const sujetDuJeton = (jeton) => (jeton ?? "").split(".")[0];
const donnees = async (jeton) => json(await lire("/api/donnees?langue=fr&sms=200&recus=0", jeton));

async function jouer(jeton, type, parametres) {
  const r = await json(await poste("/api/commande?langue=fr", { type, parametres }, jeton));
  if (!r.id) return { erreur: r.erreur ?? "aucune demande" };
  for (let i = 0; i < 20; i++) {
    const c = await json(await lire(`/api/commande/${r.id}?langue=fr`, jeton));
    if (c.etat === "faite" || c.etat === "echouee") return c;
    await attendre(200);
  }
  return { erreur: "la demande n'a pas fini" };
}

try {
  console.log("\nLA MAISON EXISTE — vérifiée dans la base, sans la plateforme");
  verifier("la vraie carte est dans « cartes »", psql(`select count(*) from cartes where iccid = '${VRAIE_CARTE}'`), "1");
  verifier("son SMS de 4 231 500 F est dans « paiements »", psql("select count(*) from paiements where montant = 4231500"), "1");

  // La première inscription fait le propriétaire de la maison.
  const ins = await json(await poste("/api/inscription?langue=fr", {
    prenom: "Nelson", nom: "Proprietaire", adresse: "Akwa, Douala, Cameroun",
    telephone: "+237677000000", courriel: "proprio@maison.cm", motdepasse: MDP,
  }));
  const PROPRIO = ins.jeton;
  verifier("le propriétaire de la maison entre (sujet « c: »)", sujetDuJeton(PROPRIO).startsWith("c:"), true);
  const inv = await json(await poste("/api/inscription?langue=fr", {
    prenom: "Paul", nom: "Public", adresse: "Bonapriso, Douala, Cameroun",
    telephone: "+237677000001", courriel: "public@maison.cm", motdepasse: MDP,
  }));
  const PUBLIC = inv.jeton;

  console.log("\nLA NAISSANCE DE LA DÉMO — par le vrai propriétaire, et lui seul");
  verifier("le propriétaire voit qu'il n'y a pas encore d'administrateur",
    (await json(await lire("/api/demo?langue=fr", PROPRIO))).administrateur, false);
  const adminDemo = { action: "administrateur", prenom: "Admin", nom: "Demo", courriel: "admin@demo.cm", motdepasse: MDP };
  verifier("un inscrit du public ne crée pas l'administrateur de la démo",
    (await poste("/api/demo?langue=fr", adminDemo, PUBLIC)).status, 403);
  verifier("le propriétaire le crée", (await poste("/api/demo?langue=fr", adminDemo, PROPRIO)).status, 200);
  verifier("un second administrateur est refusé",
    (await poste("/api/demo?langue=fr", { ...adminDemo, courriel: "autre@demo.cm" }, PROPRIO)).status, 409);
  verifier("l'adresse d'un compte de la maison est refusée",
    (await poste("/api/demo?langue=fr", { ...adminDemo, courriel: "public@maison.cm" }, PROPRIO)).status, 409);
  verifier("il n'entre PAS dans la vraie table des comptes",
    psql("select count(*) from utilisateurs where courriel = 'admin@demo.cm'"), "0");

  const ADMIN = await session("admin@demo.cm");
  verifier("l'administrateur de la démo entre (sujet « d: »)", sujetDuJeton(ADMIN).startsWith("d:"), true);

  console.log("\nLES TESTEURS — créés par l'administrateur, nés avec leurs cartes");
  for (const [prenom, courriel] of [["Ali", "ali@demo.cm"], ["Bea", "bea@demo.cm"]]) {
    verifier(`l'administrateur crée ${prenom}`, (await poste("/api/comptes?langue=fr",
      { geste: "creer", prenom, nom: "Testeur", courriel, motdepasse: MDP }, ADMIN)).status, 201);
  }
  verifier("un testeur avec l'adresse d'un vrai compte est refusé", (await poste("/api/comptes?langue=fr",
    { geste: "creer", prenom: "X", nom: "Y", courriel: "proprio@maison.cm", motdepasse: MDP }, ADMIN)).status, 409);
  const ALI = await session("ali@demo.cm");
  const BEA = await session("bea@demo.cm");
  const dAli = await donnees(ALI);
  const carteDe = (d, op) => (d.sims ?? []).find((s) => s.operateur === op);
  verifier("Ali voit ses deux cartes, et elles seules",
    (dAli.sims ?? []).map((s) => s.operateur).sort(), ["MTN", "Orange"]);
  const ALI_MTN = carteDe(dAli, "MTN");
  const BEA_MTN = carteDe(await donnees(BEA), "MTN");
  verifier("…des cartes de démo (émetteur 99, numéro en 600)",
    (dAli.sims ?? []).every((s) => /^8923799/.test(s.iccid) && /^600/.test(s.numero)), true);

  console.log("\nCHACUN DANS SON MONDE");
  const tout = (d) => JSON.stringify(d);
  exiger("Ali ne voit RIEN de la maison (carte, SMS, montant, nom)",
    !tout(dAli).includes(VRAIE_CARTE) && !tout(dAli).includes("4231500") && !tout(dAli).includes("NKENGAFAC"));
  const dAdmin = await donnees(ADMIN);
  verifier("l'administrateur voit les six cartes de démo", (dAdmin.sims ?? []).length, 6);
  exiger("…et aucune de la maison", !tout(dAdmin).includes(VRAIE_CARTE) && !tout(dAdmin).includes("NKENGAFAC"));
  const dProprio = await donnees(PROPRIO);
  verifier("le propriétaire voit sa vraie carte", (dProprio.sims ?? []).map((s) => s.iccid), [VRAIE_CARTE]);
  exiger("…et aucune carte de démo", !tout(dProprio).includes("8923799"));
  const comptesAdmin = await json(await lire("/api/comptes?langue=fr", ADMIN));
  exiger("la liste des comptes de l'administrateur n'a que la démo",
    !tout(comptesAdmin).includes("maison.cm") && tout(comptesAdmin).includes("ali@demo.cm"));
  exiger("celle du propriétaire n'a que la maison",
    !tout(await json(await lire("/api/comptes?langue=fr", PROPRIO))).includes("demo.cm"));

  console.log("\nCE QUE LA DÉMO NE PASSE PAS");
  verifier("Ali ne fabrique pas de francs",
    (await poste("/api/demo?langue=fr", { action: "fabriquer", iccid: ALI_MTN?.iccid, montant: 1000000 }, ALI)).status, 403);
  verifier("le propriétaire de la maison non plus (ce n'est pas son monde)",
    (await poste("/api/demo?langue=fr", { action: "fabriquer", iccid: ALI_MTN?.iccid, montant: 1000000 }, PROPRIO)).status, 400);
  verifier("Ali n'ouvre pas l'écran de la démo", (await lire("/api/demo?langue=fr", ALI)).status, 403);
  for (const page of ["/console", "/journal", "/console/gens"]) {
    const r = await lire(page, ADMIN);
    verifier(`l'administrateur de la démo n'entre pas dans ${page}`,
      [r.status, (r.headers.get("location") ?? "").replace(B, "")], [307, "/"]);
  }
  verifier("ni dans les routes de la console",
    (await poste("/api/console/alertes/vue?langue=fr", { id: 1 }, ADMIN)).status, 403);

  console.log("\nFABRIQUER, PUIS PAYER — joué comme l'écran le joue");
  const fab = await json(await poste("/api/demo?langue=fr",
    { action: "fabriquer", iccid: ALI_MTN?.iccid, montant: 100000 }, ADMIN));
  verifier("l'administrateur fabrique 100 000 F sur la MTN d'Ali", [fab.ok, fab.solde], [true, 100000]);
  const menu = await jouer(ALI, "ussd", { code: "*126#", carte: ALI_MTN?.iccid });
  exiger("*126# rend le menu de démo", /1\. Transfert/.test(menu.resultat ?? ""), JSON.stringify(menu.resultat ?? menu));
  await jouer(ALI, "ussd_reponse", { texte: "1", carte: ALI_MTN?.iccid });
  await jouer(ALI, "ussd_reponse", { texte: BEA_MTN?.numero, carte: ALI_MTN?.iccid });
  const confirmation = await jouer(ALI, "ussd_reponse", { texte: "30000", carte: ALI_MTN?.iccid });
  exiger("l'écran de confirmation dit le montant et le nom, puis le code",
    /30 000 FCFA/.test(confirmation.resultat ?? "") && /BEA TESTEUR/.test(confirmation.resultat ?? "")
      && /code secret/.test(confirmation.resultat ?? ""), JSON.stringify(confirmation.resultat ?? confirmation));
  const faux = await jouer(ALI, "ussd_reponse", { texte: "0000", carte: ALI_MTN?.iccid, secret: true });
  exiger("un code faux est refusé", /incorrect/.test(faux.resultat ?? ""), JSON.stringify(faux.resultat ?? faux));
  await jouer(ALI, "ussd", { code: "*126#", carte: ALI_MTN?.iccid });
  await jouer(ALI, "ussd_reponse", { texte: "1", carte: ALI_MTN?.iccid });
  await jouer(ALI, "ussd_reponse", { texte: BEA_MTN?.numero, carte: ALI_MTN?.iccid });
  await jouer(ALI, "ussd_reponse", { texte: "30000", carte: ALI_MTN?.iccid });
  const fin = await jouer(ALI, "ussd_reponse", { texte: "1234", carte: ALI_MTN?.iccid, secret: true });
  exiger("le bon code paie", /Operation reussie/.test(fin.resultat ?? ""), JSON.stringify(fin.resultat ?? fin));
  verifier("…et le réseau dit la session finie", fin.reseau, "fini");
  const dBea = await donnees(BEA);
  verifier("Béa a reçu 30 000 F", carteDe(dBea, "MTN")?.solde, 30000);
  exiger("…avec le SMS de l'opérateur dans sa boîte",
    (dBea.paiements ?? []).some((p) => p.montant === 30000 && /Vous avez recu 30 000 FCFA/.test(p.smsBrut ?? "")));
  verifier("Ali a payé 30 000 F, une fois", carteDe(await donnees(ALI), "MTN")?.solde, 70000);
  verifier("aucun code secret ne reste dans une demande close",
    psql("select count(*) from demo_commandes where parametres ? 'texte' and parametres->>'secret' = 'true'"), "0");

  console.log("\nLES REÇUS — fabriqués par la plateforme, le même dessin que le boîtier");
  const smsDeBea = (dBea.paiements ?? []).find((p) => p.montant === 30000 && /Vous avez recu/.test(p.smsBrut ?? ""));
  const { recu: numeroDuRecu } = await json(await lire(`/api/recu-du-sms?id=${smsDeBea?.id}`, BEA));
  exiger("le SMS reçu par Béa a son reçu, tout de suite", /^TM-\d{4}-\d{4}-\d{4,}$/.test(numeroDuRecu ?? ""), String(numeroDuRecu));
  // Même référence des deux côtés d'un transfert : le reçu de Béa doit être
  // celui de SA ligne (la réception), pas celui de l'envoi d'Ali.
  verifier("…le sien, pas celui de l'envoi d'Ali (même référence)",
    Number(/-(\d+)$/.exec(numeroDuRecu ?? "")?.[1]), smsDeBea?.sourceId);
  const pdf = await lire(`/api/recu/${numeroDuRecu}?langue=fr`, BEA);
  const octets = Buffer.from(await pdf.arrayBuffer());
  verifier("Béa l'ouvre : un vrai PDF", [pdf.status, pdf.headers.get("content-type"), octets.subarray(0, 5).toString()],
    [200, "application/pdf", "%PDF-"]);
  exiger("…avec sa police embarquée (le dessin du boîtier)", octets.length > 40000 && octets.includes(Buffer.from("/FontFile2")),
    `${octets.length} octets`);
  verifier("Ali, qui l'a envoyé, n'ouvre pas le reçu de la carte de Béa", (await lire(`/api/recu/${numeroDuRecu}`, ALI)).status, 404);
  verifier("le propriétaire de la maison non plus", (await lire(`/api/recu/${numeroDuRecu}`, PROPRIO)).status, 404);
  const { url: lienDuRecu } = await json(await lire(`/api/recu/${numeroDuRecu}/lien?langue=fr`, BEA));
  const parLien = await fetch((lienDuRecu ?? "").replace(/^https?:\/\/[^/]+/, B), { redirect: "manual" });
  verifier("le lien de partage s'ouvre sans session (le téléphone)", [parLien.status, parLien.headers.get("content-type")],
    [200, "application/pdf"]);
  const sansMonde = await fetch((lienDuRecu ?? "").replace(/^https?:\/\/[^/]+/, B).replace("m=demo&", ""), { redirect: "manual" });
  exiger("…réécrit sans son monde, il ne s'ouvre plus", sansMonde.status !== 200, `(${sansMonde.status})`);
  const etabli = await jouer(BEA, "recu", { source_id: smsDeBea?.sourceId, carte: BEA_MTN?.iccid });
  exiger("« Établir le reçu » répond prêt", /prêt/.test(etabli.resultat ?? ""), JSON.stringify(etabli.resultat ?? etabli));

  console.log("\nLE VRAI BOÎTIER N'A RIEN REÇU");
  verifier("la vraie table des commandes est vide", psql("select count(*) from commandes"), "0");
  exiger("…pendant que la démo en a joué", Number(psql("select count(*) from demo_commandes")) >= 10);
  verifier("la maison n'a qu'un SMS, le sien", psql("select count(*) from paiements"), "1");

  console.log("\nLE PONT VERS GLISIL");
  const ADMIN_MTN = carteDe(await donnees(ADMIN), "MTN")
    ?? (dAdmin.sims ?? []).find((s) => s.operateur === "MTN" && ![ALI_MTN?.iccid, BEA_MTN?.iccid].includes(s.iccid));
  const lesSiennes = (dAdmin.sims ?? []).filter((s) => s.operateur === "MTN"
    && ![ALI_MTN?.iccid, BEA_MTN?.iccid].includes(s.iccid));
  const FLOAT = lesSiennes[0] ?? ADMIN_MTN;
  verifier("l'administrateur déclare sa MTN float de Glisil",
    (await poste("/api/demo?langue=fr", { action: "float", iccid: FLOAT?.iccid, float: true }, ADMIN)).status, 200);
  await jouer(BEA, "ussd", { code: "*126#", carte: BEA_MTN?.iccid });
  await jouer(BEA, "ussd_reponse", { texte: "1", carte: BEA_MTN?.iccid });
  await jouer(BEA, "ussd_reponse", { texte: FLOAT?.numero, carte: BEA_MTN?.iccid });
  await jouer(BEA, "ussd_reponse", { texte: "5000", carte: BEA_MTN?.iccid });
  const depot = await jouer(BEA, "ussd_reponse", { texte: "1234", carte: BEA_MTN?.iccid, secret: true });
  exiger("Béa paie 5 000 F au float", /Operation reussie/.test(depot.resultat ?? ""), JSON.stringify(depot.resultat ?? depot));
  // PERSONNE n'ouvre l'écran de l'administrateur : un vrai boîtier pousse le
  // SMS dès qu'il le lit, et le testeur attend son crédit chez Glisil sans
  // que l'administrateur passe par là. Une version de ce harnais visitait
  // /api/demo en boucle pour « laisser partir » la file — elle amenait
  // elle-même ce qu'elle vérifiait, et le dépôt d'un testeur restait en
  // attente pour de vrai.
  verifier("Glisil a reçu le SMS dès le paiement, sans que l'administrateur ouvre son écran",
    recuParGlisil.length, 1);
  const ligne = recuParGlisil[0];
  verifier("Glisil a reçu UNE ligne, signée juste", [recuParGlisil.length, refusParGlisil], [1, 0]);
  verifier("…l'encaissement du float, de Béa, 5 000 F",
    ligne && [ligne.terminal, ligne.sens, ligne.montant, ligne.float_numero, ligne.numero, ligne.operateur],
    [  "totem-demo", "entree", 5000, FLOAT?.numero, BEA_MTN?.numero, "mtn"]);
  verifier("…et la file note la réponse de Glisil",
    psql("select reponse from demo_file_xafe where envoye_le is not null"), `credite GL-${ligne?.source_id}`);
  verifier("le paiement de Béa, lui, n'est pas parti (ce n'est pas un float)",
    recuParGlisil.filter((l) => l.sens === "sortie").length, 0);

  console.log("\nUN RETRAIT DE DÉMO SE PAIE TOUT SEUL");
  const soldeDe = (iccid) => Number(psql(`select solde from demo_comptes where iccid = '${iccid}'`));
  const beaAvant = soldeDe(BEA_MTN?.iccid), floatAvant = soldeDe(FLOAT?.iccid);
  sortiesDemo.push({ reference: "XAFe-WD-T00001", operateur: "mtn", numero: BEA_MTN?.numero, montant: 3000, etat: "en_attente" });
  const reveiller = (signe = true) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", signe ? CLE_GLISIL : "pas-la-cle").update(`${ts}.POST demo-reveil.`).digest("hex");
    return fetch(`${B}/api/demo/reveil`, { method: "POST", headers: { "x-glisil-horodatage": ts, "x-glisil-signature": sig } });
  };
  verifier("un réveil mal signé est refusé, sans rien payer", [(await reveiller(false)).status, sortiesDemo[0].etat], [401, "en_attente"]);
  verifier("un réveil sans signature aussi", (await fetch(`${B}/api/demo/reveil`, { method: "POST" })).status, 401);
  const reveil = await reveiller();
  verifier("Glisil réveille la plateforme : la sortie est payée, sans un clic", [reveil.status, (await json(reveil)).payees], [200, 1]);
  const payee = sortiesDemo[0];
  exiger("…prise une fois, rendue « envoyée » avec l'ID du transfert de démo",
    payee.etat === "envoyee" && payee.prises === 1 && /^\d{6,}$/.test(payee.transaction_id ?? ""), JSON.stringify(payee));
  verifier("…l'argent a vraiment bougé : 3 000 F du float vers la carte de Béa",
    [soldeDe(FLOAT?.iccid), soldeDe(BEA_MTN?.iccid)], [floatAvant - 3000, beaAvant + 3000]);
  const preuve = recuParGlisil.find((l) => l.sens === "sortie");
  verifier("…et le SMS « envoyé » du float est parti chez Glisil, avec le même ID (la preuve)",
    preuve && [preuve.reference, preuve.numero, preuve.montant, preuve.float_numero],
    [payee.transaction_id, BEA_MTN?.numero, 3000, FLOAT?.numero]);
  const encore = await reveiller();
  verifier("un second réveil ne paie pas deux fois", [(await json(encore)).payees, soldeDe(BEA_MTN?.iccid)], [0, beaAvant + 3000]);
  sortiesDemo.push({ reference: "XAFe-WD-T00002", operateur: "mtn", numero: BEA_MTN?.numero, montant: 900000000, etat: "en_attente" });
  await reveiller();
  exiger("un float à court rend l'échec : rien n'est parti, Glisil rend les XAFe",
    sortiesDemo[1].etat === "annulee" && /Solde insuffisant/.test(sortiesDemo[1].motif ?? "") && soldeDe(BEA_MTN?.iccid) === beaAvant + 3000,
    JSON.stringify(sortiesDemo[1]));

  console.log("\nLA PARITÉ DE LA DÉMO");
  const etat = await json(await lire("/api/demo?langue=fr", ADMIN));
  verifier("l'écran : fabriqué = en circulation", [etat.fabrique, etat.enCirculation], [100000, 100000]);
  verifier("la base, relue directement",
    psql("select (select sum(solde) from demo_comptes) = (select sum(montant) from demo_emissions)"), "t");

  console.log("\nUN LIEN SIGNÉ NE SORT PAS DE LA DÉMO");
  const lien = await json(await lire(`/api/coordonnees/${ALI_MTN?.iccid}/lien?langue=fr`, ALI));
  if (lien.url) {
    const r = await fetch(lien.url.replace(/^https?:\/\/[^/]+/, B), { redirect: "manual" });
    exiger("ouvert sans session, il ne montre rien de la maison", r.status !== 200 || !(await r.text()).includes("NKENGAFAC"),
      `(${r.status})`);
  } else {
    exiger("pas de lien signé pour la démo", true);
  }

  // LE FREIN, À TRAVERS LE VRAI POSTGREST. Si l'appel à `frein_essai` ou à
  // `frein_rendre` échouait ici — forme de la réponse, arguments nuls, droit
  // manquant —, la plateforme retomberait EN SILENCE sur la mémoire de
  // l'instance : toutes les connexions de ce banc passeraient, et tous les
  // autres bancs aussi (ils parlent au faux nuage). C'est dans la BASE qu'on
  // regarde : les couples écrits avec leur début de fenêtre, chaque réussite
  // rendue, et le seul échec du banc encore compté.
  console.log("\nLE FREIN, À TRAVERS LE VRAI POSTGREST");
  const rate = await poste("/api/session?langue=fr", { courriel: "frein@demo.cm", motdepasse: "pas-le-bon-mot-de-passe" });
  verifier("un mauvais mot de passe est refusé", rate.status, 401);
  verifier("la base porte les couples, avec leur début de fenêtre",
    Number(psql("select count(*) from freins where cle like '%|@%' and debut is not null")) > 3, true);
  verifier("…et les comptes, sous leur empreinte",
    Number(psql("select count(*) from freins where cle ~ '^@[0-9a-f]{32}$'")) > 3, true);
  verifier("chaque connexion réussie a rendu son essai : seul l'échec reste compté",
    psql("select count(*) from freins where cle like '%|@%' and n > 0"), "1");
  verifier("et la plateforme n'a pas dû compter en mémoire",
    psql("select count(*) from evenements where texte like 'Le frein des mots de passe%'"), "0");
} catch (e) {
  echecs++;
  console.error("✗ Le harnais s'est arrêté :", e);
} finally {
  mandataire.close();
}

console.log("");
if (echecs === 0) {
  console.log("✓ La démo vivante tient : chacun dans son monde, de l'argent qui ne naît de rien.");
  process.exit(0);
}
console.log(`✗ ${echecs} vérification(s) en échec.`);
process.exit(1);
