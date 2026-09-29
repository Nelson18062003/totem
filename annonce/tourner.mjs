#!/usr/bin/env node
// Tourne l'annonce de TOTEM : chaque image est dessinée par le plateau
// (annonce/plateau/), la musique est composée par annonce/musique.py, et
// ffmpeg monte les deux.
//
//   node annonce/tourner.mjs                      # 16:9, la vidéo entière
//   node annonce/tourner.mjs --format 9x16        # la déclinaison verticale
//   node annonce/tourner.mjs --temps 12.5,31,40   # quelques images en PNG, pour relire
//   node annonce/tourner.mjs --de 20 --a 34       # un extrait (en secondes), avec le son
//
// Aucune image n'est « jouée » : chacune est une fonction du temps. On peut
// donc la confier à n'importe quel ouvrier, dans n'importe quel ordre — et
// relire l'image de la 31e seconde sans rejouer les trente premières.
//
// Ce qu'il faut : Node 22, la bibliothèque playwright et son Chromium, Python 3
// avec numpy, et ffmpeg avec libx264 (variable FFMPEG, sinon `ffmpeg` du PATH,
// sinon celui du paquet Python imageio-ffmpeg).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const require = createRequire(import.meta.url);

// --- Les arguments -------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (nom, def) => { const i = args.indexOf(`--${nom}`); return i >= 0 ? args[i + 1] : def; };
const FORMAT = opt("format", "16x9");
const FORMATS = { "16x9": [1920, 1080], "9x16": [1080, 1920], "1x1": [1080, 1080] };
if (!FORMATS[FORMAT]) { console.error(`format inconnu : ${FORMAT} (connus : ${Object.keys(FORMATS).join(", ")})`); process.exit(2); }
const [W, H] = FORMATS[FORMAT];
const FPS = Number(opt("fps", "30"));
const OUVRIERS = Number(opt("ouvriers", String(Math.max(1, Math.min(6, os.cpus().length - 1)))));
const TEMPS = opt("temps", null);
const QUALITE = Number(opt("qualite", "0.95"));
// --leger : pour WhatsApp et les réseaux qui recompressent de toute façon —
// plus compressé, et 720 points de large en vertical, 1280 en paysage.
const LEGER = args.includes("--leger");
const CRF = opt("crf", LEGER ? "26" : "20");
const SORTIE = opt("sortie", path.join(ICI, "rendu", `totem-annonce-${FORMAT}${LEGER ? "-leger" : ""}.mp4`));
const TRAVAIL = opt("travail", path.join(os.tmpdir(), `totem-annonce-${FORMAT}`));

// --- Les polices -------------------------------------------------------------------
// Les polices de la marque (Inter, DM Sans) et une chasse fixe pour les SMS.
// Téléchargées une fois, jamais versionnées — comme brand/generer.py le fait
// pour DM Sans.
const POLICES = {
  "Inter.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
  "DMSans.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf",
  "JetBrainsMono.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
};
async function polices() {
  const dossier = path.join(ICI, ".polices");
  fs.mkdirSync(dossier, { recursive: true });
  for (const [nom, url] of Object.entries(POLICES)) {
    const f = path.join(dossier, nom);
    if (fs.existsSync(f) && fs.statSync(f).size > 10000) continue;
    process.stdout.write(`téléchargement de ${nom}… `);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${nom} : ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log("ok");
  }
}

// --- ffmpeg ------------------------------------------------------------------------
function trouverFfmpeg() {
  const essais = [process.env.FFMPEG, "ffmpeg"].filter(Boolean);
  for (const e of essais) {
    const r = spawnSync(e, ["-hide_banner", "-encoders"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.includes("libx264")) return e;
  }
  const r = spawnSync("python3", ["-c", "import imageio_ffmpeg as i; print(i.get_ffmpeg_exe())"], { encoding: "utf8" });
  if (r.status === 0) return r.stdout.trim();
  throw new Error("ffmpeg avec libx264 introuvable (FFMPEG=…, ou pip install imageio-ffmpeg)");
}

// --- Le plateau servi en local ------------------------------------------------------
// Un port choisi par le système : jamais un port qu'un essai précédent, resté
// ouvert, occuperait déjà — il servirait alors du vieux code.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".png": "image/png" };
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = path.join(RACINE, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(p).pipe(res);
    });
    s.listen(0, "127.0.0.1", () => ok(s));
  });
}

function chargerPlaywright() {
  for (const p of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(p); } catch {}
  }
  throw new Error("playwright introuvable");
}

async function main() {
  await polices();
  const { chromium } = chargerPlaywright();
  const serveur = await servir();
  const url = `http://127.0.0.1:${serveur.address().port}/annonce/plateau/index.html?w=${W}&h=${H}&fps=${FPS}`;
  // Sans carte graphique : Skia sur le processeur, cinq fois plus rapide ici
  // que SwiftShader qui imite une carte graphique.
  const lancement = { args: ["--disable-gpu", "--font-render-hinting=none", "--disable-lcd-text"] };
  if (process.env.CHROMIUM) lancement.executablePath = process.env.CHROMIUM;
  // Un navigateur par ouvrier : deux pages du même site dans un même
  // navigateur peuvent partager un seul processus, et ne rien paralléliser.
  const navigateurs = [];

  async function ouvrier() {
    const navigateur = await chromium.launch(lancement);
    navigateurs.push(navigateur);
    const page = await navigateur.newPage({ viewport: { width: 64, height: 64 } });
    page.on("pageerror", (e) => { console.error("erreur du plateau :", e.message); process.exitCode = 1; });
    page.on("console", (m) => { if (m.type() === "error") console.error("plateau :", m.text()); });
    await page.goto(url);
    const info = await page.evaluate(() => window.preparer());
    if (info.erreur) throw new Error(info.erreur);
    return { page, info };
  }

  const premier = await ouvrier();
  const { duree } = premier.info;
  console.log(`plateau prêt : ${W}×${H}, ${FPS} i/s, ${duree.toFixed(2)} s, marque vérifiée contre brand/`);

  // Mode relecture : quelques images en PNG.
  if (TEMPS) {
    const dossier = opt("dossier", path.join(ICI, "rendu", "images"));
    fs.mkdirSync(dossier, { recursive: true });
    for (const t of TEMPS.split(",").map(Number)) {
      const n = Math.round(t * FPS);
      const d = await premier.page.evaluate(([n]) => window.image(n, "image/png"), [n]);
      const f = path.join(dossier, `${FORMAT}-${t.toFixed(2).padStart(6, "0")}s.png`);
      fs.writeFileSync(f, Buffer.from(d.split(",")[1], "base64"));
      console.log(f);
    }
    for (const n of navigateurs) await n.close();
    serveur.close();
    return;
  }

  const de = Number(opt("de", "0")), a = Math.min(duree, Number(opt("a", String(duree))));
  const n0 = Math.round(de * FPS), n1 = Math.round(a * FPS);
  fs.rmSync(TRAVAIL, { recursive: true, force: true });
  fs.mkdirSync(TRAVAIL, { recursive: true });

  const ouvriers = [premier];
  for (let i = 1; i < OUVRIERS; i++) ouvriers.push(await ouvrier());
  let suivant = n0, faites = 0;
  const debut = Date.now();
  await Promise.all(ouvriers.map(async ({ page }) => {
    while (suivant < n1) {
      const n = suivant++;
      const d = await page.evaluate(([n, q]) => window.image(n, "image/jpeg", q), [n, QUALITE]);
      fs.writeFileSync(path.join(TRAVAIL, `${String(n - n0).padStart(5, "0")}.jpg`), Buffer.from(d.split(",")[1], "base64"));
      if (++faites % 60 === 0) {
        const ecoule = (Date.now() - debut) / 1000;
        process.stdout.write(`\r${faites}/${n1 - n0} images — ${(ecoule / faites * 1000).toFixed(0)} ms/image, reste ${((n1 - n0 - faites) * ecoule / faites).toFixed(0)} s   `);
      }
    }
  }));
  console.log(`\n${faites} images en ${((Date.now() - debut) / 1000).toFixed(0)} s`);
  for (const n of navigateurs) await n.close();
  serveur.close();

  // La musique, composée sur la même grille de temps.
  const son = path.join(TRAVAIL, "musique.wav");
  execFileSync("python3", [path.join(ICI, "musique.py"), son], { stdio: "inherit" });

  const ffmpeg = trouverFfmpeg();
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  const r = spawnSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", String(FPS), "-i", path.join(TRAVAIL, "%05d.jpg"),
    "-ss", String(de), "-t", String(a - de), "-i", son,
    ...(LEGER ? ["-vf", W > H ? "scale=1280:-2:flags=lanczos" : "scale=720:-2:flags=lanczos"] : []),
    "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", LEGER ? "160k" : "256k",
    "-movflags", "+faststart", "-shortest", SORTIE,
  ], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg a échoué");
  console.log(`→ ${path.relative(process.cwd(), SORTIE)} (${(fs.statSync(SORTIE).size / 1e6).toFixed(1)} Mo)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
