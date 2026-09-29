// La marque, pour qu'elle bouge.
//
// Le symbole est décrit UNE SEULE FOIS, dans brand/generer.py. Ce fichier en
// recopie le calcul — pas le dessin : les mêmes paramètres, les mêmes
// polylignes, la même cambrure Catmull-Rom, les mêmes coupes au passage
// dessous. Une recopie peut dériver sans bruit ; `verifierContreSVG` compare
// donc ce que ce calcul donne à brand/totem-symbole.svg, et le tournage
// s'arrête s'ils ne tombent pas d'accord au millième.
//
// Ce que ce fichier ajoute, c'est le TEMPS : un brin peut n'être tracé qu'en
// partie, s'épaissir, porter une lumière qui court le long de lui.

import { borne } from "./outils.js";

export const C = {
  laterite: "#9a4b2e",
  lateriteClair: "#d08a63",
  encre: "#16171a",
  sable: "#f4efe9",
  clair: "#fbfbfc",
  surface: "#f5f5f5",
  carte: "#ffffff",
  surface2: "#e6e6e6",
  ligne: "#d9d9d9",
  texte: "#1e1e1e",
  texteDoux: "#444444",
  texteFaible: "#767676",
  positif: "#02542d",
  positifVif: "#14ae5c",
  negatif: "#c00f0c",
  attente: "#975102",
  mtn: "#ffcc00",
  orange: "#ff7900",
};

// --- Les paramètres de brand/generer.py, tels quels -----------------------------
export const GRILLE = 32, LOBES = 3, CX = 16.0, AMP = 6.6, BRIN = 4.8;
export const HAUT = 4.4, BAS = 27.6, CAMBRURE = 0.7, JEU = 1.15;
export const CAP = 20.0, TRACKING = 0.18, RATIO_H = 1.45, RATIO_V = 2.1, ECART = 0.78;
export const SYM_H = 28.0, SYM_Y = 2.0;

// Les deux polylignes : elles coïncident aux bornes paires (les croisements)
// et atteignent leur écart maximal aux bornes impaires.
export function brins(lobes = LOBES, cx = CX, haut = HAUT, bas = BAS) {
  const m = 2 * lobes, h = (bas - haut) / m, a = [], b = [];
  for (let i = 0; i <= m; i++) {
    const y = haut + h * i;
    if (i % 2 === 0) { a.push([cx, y]); b.push([cx, y]); }
    else {
      const s = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
      a.push([cx + AMP * s, y]); b.push([cx - AMP * s, y]);
    }
  }
  return [a, b];
}

// Catmull-Rom -> Bézier : la liste des segments cubiques [p1, c1, c2, p2].
export function cambre(pts, tension = CAMBRURE) {
  const p = [pts[0], ...pts, pts[pts.length - 1]], segs = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3];
    const c2 = [p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3];
    segs.push([p1, c1, c2, p2]);
  }
  return segs;
}

// Les coupes du passage dessous : pour chaque brin, les rectangles orientés
// le long du brin du DESSUS, où le brin du dessous s'interrompt.
export function coupes(lobes = LOBES, cx = CX, haut = HAUT, bas = BAS) {
  const [a, b] = brins(lobes, cx, haut, bas);
  const m = 2 * lobes, h = (bas - haut) / m, res = { a: [], b: [] };
  let k = 0;
  for (let i = 2; i < m; i += 2, k++) {
    const y = haut + h * i;
    const [dessus, dessous] = k % 2 === 0 ? ["a", "b"] : ["b", "a"];
    const src = dessus === "a" ? a : b;
    const ang = Math.atan2(src[i + 1][1] - src[i - 1][1], src[i + 1][0] - src[i - 1][0]);
    res[dessous].push({ x: cx, y, ang, lo: BRIN * 3.2, la: BRIN + 2 * JEU });
  }
  return res;
}

// --- Échantillonnage : pour tracer un brin « jusqu'à » un point ----------------
function bez(s, t) {
  const u = 1 - t, [p0, p1, p2, p3] = s;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
export function echantillonner(segs, parSeg = 40) {
  const pts = [bez(segs[0], 0)], lon = [0];
  for (const s of segs) for (let j = 1; j <= parSeg; j++) {
    const q = bez(s, j / parSeg), p = pts[pts.length - 1];
    lon.push(lon[lon.length - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); pts.push(q);
  }
  return { pts, lon, total: lon[lon.length - 1] };
}
// Le point à la fraction f de la longueur.
export function pointA(ech, f) {
  const L = borne(f) * ech.total, { pts, lon } = ech;
  let lo = 0, hi = lon.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lon[m] < L) lo = m; else hi = m; }
  const k = (L - lon[lo]) / Math.max(1e-9, lon[hi] - lon[lo]);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k];
}
// Trace le morceau [f0, f1] du brin comme un chemin ouvert.
export function cheminPartiel(ctx, ech, f0, f1) {
  const { pts, lon, total } = ech, L0 = borne(f0) * total, L1 = borne(f1) * total;
  if (L1 <= L0) return false;
  const d = pointA(ech, f0);
  ctx.moveTo(d[0], d[1]);
  for (let i = 0; i < pts.length; i++) if (lon[i] > L0 && lon[i] < L1) ctx.lineTo(pts[i][0], pts[i][1]);
  const f = pointA(ech, f1); ctx.lineTo(f[0], f[1]);
  return true;
}

// --- Des toiles de travail, réutilisées ------------------------------------------
const reserve = new Map();
export function toile(cle, w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  let c = reserve.get(cle);
  if (!c) { c = document.createElement("canvas"); reserve.set(cle, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none";
  x.clearRect(0, 0, w, h);
  return [c, x];
}

// Géométrie en cache, par nombre de lobes.
const geoCache = new Map();
export function geometrie(lobes = LOBES, haut = HAUT, bas = BAS) {
  const cle = `${lobes}:${haut}:${bas}`;
  if (!geoCache.has(cle)) {
    const [a, b] = brins(lobes, CX, haut, bas);
    geoCache.set(cle, {
      a: echantillonner(cambre(a)), b: echantillonner(cambre(b)),
      coupes: coupes(lobes, CX, haut, bas), haut, bas, lobes,
    });
  }
  return geoCache.get(cle);
}

// Dessine la Tresse.
//   x, y     : centre du tracé, en pixels
//   h        : hauteur du tracé (de HAUT à BAS, sans l'épaisseur), en pixels
//   debut/fin: la portion tracée de chaque brin, de 0 (haut) à 1 (bas)
//   epais    : multiplie l'épaisseur du brin (1 = charte)
//   couleur, couleurB : un brin peut porter une autre teinte (le « double »)
//   tisse    : le passage dessus-dessous (faux = les brins fondus, variante mini)
//   lueur    : halo additif autour des brins (0 = aucun)
export function dessinerTresse(ctx, o) {
  const lobes = o.lobes || LOBES;
  const g = o.geo || geometrie(lobes);
  const hauteurUnites = g.bas - g.haut;
  const k = o.h / hauteurUnites;
  const epais = (o.epais ?? 1) * BRIN;
  const marge = epais * 1.2 + 4 / k;
  const wU = 2 * AMP + 2 * marge, hU = hauteurUnites + 2 * marge;
  const W = wU * k, H = hU * k;
  const debutA = o.debut ?? 0, finA = o.fin ?? 1;
  const debutB = o.debutB ?? debutA, finB = o.finB ?? finA;
  const couleur = o.couleur || C.laterite, couleurB = o.couleurB || couleur;

  const place = (x) => { x.setTransform(k, 0, 0, k, (-(CX - AMP - marge)) * k, (-(g.haut - marge)) * k); };
  const tracer = (x, ech, f0, f1, c, largeur) => {
    x.beginPath();
    if (!cheminPartiel(x, ech, f0, f1)) return;
    x.strokeStyle = c; x.lineWidth = largeur; x.lineCap = o.bout || "round"; x.lineJoin = "round"; x.stroke();
  };
  const [ca, xa] = toile("tresse-a", W, H);
  const [cb, xb] = toile("tresse-b", W, H);
  place(xa); place(xb);
  tracer(xa, g.a, debutA, finA, couleur, epais);
  tracer(xb, g.b, debutB, finB, couleurB, epais);
  if (o.tisse !== false) {
    for (const [x, liste] of [[xa, g.coupes.a], [xb, g.coupes.b]]) {
      x.globalCompositeOperation = "destination-out";
      for (const r of liste) {
        x.save(); x.translate(r.x, r.y); x.rotate(r.ang);
        const la = r.la * (o.epais ?? 1); // le jeu suit l'épaisseur
        x.fillStyle = "#000"; x.fillRect(-r.lo / 2, -la / 2, r.lo, la);
        x.restore();
      }
      x.globalCompositeOperation = "source-over";
    }
  }
  const x0 = o.x - W / 2, y0 = o.y - H / 2;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.lueur) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= o.lueur;
    ctx.filter = `blur(${Math.max(2, o.h * 0.035)}px)`;
    ctx.drawImage(ca, x0, y0); ctx.drawImage(cb, x0, y0);
    ctx.restore();
  }
  ctx.drawImage(ca, x0, y0);
  ctx.drawImage(cb, x0, y0);
  ctx.restore();
  return { k, x0, y0, W, H, g };
}

// La Tresse à n'importe quelle échelle — pour plonger dans le losange.
// Au lieu de toiles à la taille du symbole (qui feraient des centaines de
// millions de pixels quand on plonge), on tresse directement dans le cadre de
// l'écran : les deux toiles font la taille de l'image, et les coupes du
// passage dessous subissent la même transformation que les brins.
//   k        : pixels par unité de grille
//   ox, oy   : où tombe le point (CX, cy) de la grille, en pixels ; cy = 16 par défaut
export function dessinerTresseCadre(ctx, W, H, o) {
  const g = o.geo || geometrie(o.lobes || LOBES);
  const k = o.k, cy = o.cy ?? 16;
  const [ca, xa] = toile("tresse-cadre-a", W, H);
  const [cb, xb] = toile("tresse-cadre-b", W, H);
  for (const x of [xa, xb]) x.setTransform(k, 0, 0, k, o.ox - CX * k, o.oy - cy * k);
  const tracer = (x, ech, f0, f1) => {
    x.beginPath();
    if (!cheminPartiel(x, ech, f0, f1)) return;
    x.strokeStyle = o.couleur || C.laterite; x.lineWidth = BRIN; x.lineCap = "round"; x.lineJoin = "round"; x.stroke();
  };
  tracer(xa, g.a, o.debut ?? 0, o.fin ?? 1);
  tracer(xb, g.b, o.debut ?? 0, o.fin ?? 1);
  for (const [x, liste] of [[xa, g.coupes.a], [xb, g.coupes.b]]) {
    x.globalCompositeOperation = "destination-out";
    for (const r of liste) {
      x.save(); x.translate(r.x, r.y); x.rotate(r.ang);
      x.fillStyle = "#000"; x.fillRect(-r.lo / 2, -r.la / 2, r.lo, r.la);
      x.restore();
    }
    x.globalCompositeOperation = "source-over";
  }
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ca, 0, 0); ctx.drawImage(cb, 0, 0);
  ctx.restore();
}

// Le point d'un brin, en pixels, pour une Tresse placée par dessinerTresse.
export function pointTresse(o, brin, f) {
  const g = o.geo || geometrie(o.lobes || LOBES);
  const k = o.h / (g.bas - g.haut);
  const p = pointA(brin === "b" ? g.b : g.a, f);
  return [o.x + (p[0] - CX) * k, o.y + (p[1] - (g.haut + g.bas) / 2) * k];
}

// --- Le mot ----------------------------------------------------------------------
// Le mot TOTEM vient du tracé de brand/totem-logo.svg (DM Sans Bold vectorisée,
// interlettrage de la charte). Capitale de 20 unités, ligne de base à y = 20.
export const MOT = { chemin: null, largeur: 0 };
export function chargerMot(svgLogo) {
  const m = svgLogo.match(/<path fill="[^"]*" transform="translate\(([\d.]+),0\)" d="([^"]+)"/);
  if (!m) throw new Error("brand/totem-logo.svg : le tracé du mot est introuvable");
  MOT.chemin = new Path2D(m[2]);
  // Largeur : la boîte du logo moins le décalage du mot.
  const vb = svgLogo.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
  MOT.largeur = parseFloat(vb[3]) - parseFloat(m[1]);
  MOT.lettres = decouperLettres(m[2]);
}
// Le tracé découpé lettre par lettre, pour les animer une à une.
function decouperLettres(d) {
  const sous = d.split(/(?=M)/).map((s) => {
    const nums = s.match(/-?\d+(\.\d+)?/g).map(Number);
    let xmin = Infinity, xmax = -Infinity;
    for (let i = 0; i < nums.length; i += 2) { xmin = Math.min(xmin, nums[i]); xmax = Math.max(xmax, nums[i]); }
    return { d: s, xmin, xmax };
  });
  // Un contour dont la boîte est contenue dans celle d'un autre est son trou (le O).
  const lettres = [];
  for (const s of sous) {
    const parent = lettres.find((l) => s.xmin >= l.xmin - 0.01 && s.xmax <= l.xmax + 0.01);
    if (parent) { parent.d += s.d; } else lettres.push({ ...s });
  }
  return lettres.map((l) => ({ chemin: new Path2D(l.d), xmin: l.xmin, xmax: l.xmax, centre: (l.xmin + l.xmax) / 2 }));
}
// Dessine le mot, capitale de hauteur `cap` px, ligne de base en (x, yBase).
// `lettre(i, n)` peut rendre, pour chaque lettre, { dx, dy, alpha, echelle }.
export function dessinerMot(ctx, x, yBase, cap, couleur, lettre) {
  const k = cap / CAP;
  ctx.save();
  ctx.fillStyle = couleur;
  if (!lettre) {
    ctx.translate(x, yBase - cap); ctx.scale(k, k); ctx.fill(MOT.chemin, "nonzero");
  } else {
    MOT.lettres.forEach((l, i) => {
      const e = lettre(i, MOT.lettres.length) || {};
      if (e.alpha === 0) return;
      ctx.save();
      ctx.globalAlpha *= e.alpha ?? 1;
      ctx.translate(x + (e.dx || 0), yBase - cap + (e.dy || 0));
      ctx.scale(k, k);
      if (e.echelle && e.echelle !== 1) { ctx.translate(l.centre, CAP / 2); ctx.scale(e.echelle, e.echelle); ctx.translate(-l.centre, -CAP / 2); }
      ctx.fill(l.chemin, "nonzero");
      ctx.restore();
    });
  }
  ctx.restore();
  return MOT.largeur * k;
}

// Le verrouillage horizontal de la charte : symbole à gauche, mot à droite,
// centré sur (x, y). `cap` = hauteur de capitale en px.
export function verrouillage(ctx, x, y, cap, o = {}) {
  const hSym = RATIO_H * cap;
  const largeurSym = (18 / SYM_H) * hSym;
  const ecart = ECART * cap;
  const largeurMot = MOT.largeur * cap / CAP;
  const total = largeurSym + ecart + largeurMot;
  const gauche = x - total / 2;
  // Le tracé du symbole fait 28 unités de haut dont 23,2 entre HAUT et BAS.
  dessinerTresse(ctx, {
    x: gauche + largeurSym / 2, y, h: hSym * (BAS - HAUT) / SYM_H,
    couleur: o.couleurSym || C.lateriteClair, debut: o.debut, fin: o.fin, lueur: o.lueur, alpha: o.alphaSym,
  });
  ctx.save();
  if (o.alphaMot != null) ctx.globalAlpha *= o.alphaMot;
  dessinerMot(ctx, gauche + largeurSym + ecart, y + cap / 2, cap, o.couleurMot || C.clair, o.lettre);
  ctx.restore();
  return { total, gauche, largeurSym };
}

// --- La vérification contre la source -----------------------------------------
// Relit les deux brins et les coupes de brand/totem-symbole.svg et exige que le
// calcul ci-dessus les retrouve au millième.
export function verifierContreSVG(svg) {
  const chemins = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1].match(/-?\d+\.\d+/g).map(Number));
  if (chemins.length !== 2) return "le symbole n'a pas deux brins";
  const [a, b] = brins();
  const aplatir = (segs) => [segs[0][0], ...segs.flatMap((s) => [s[1], s[2], s[3]])].flat();
  const attendus = [aplatir(cambre(a)), aplatir(cambre(b))];
  for (let n = 0; n < 2; n++) {
    if (chemins[n].length !== attendus[n].length) return `brin ${n} : ${chemins[n].length} nombres contre ${attendus[n].length}`;
    for (let i = 0; i < attendus[n].length; i++)
      if (Math.abs(chemins[n][i] - attendus[n][i]) > 0.0015) return `brin ${n}, nombre ${i} : ${chemins[n][i]} contre ${attendus[n][i].toFixed(3)}`;
  }
  const rects = [...svg.matchAll(/translate\(([\d.]+),([\d.]+)\) rotate\(([-\d.]+)\)/g)].map((m) => m.slice(1).map(Number));
  const c = coupes();
  const attendues = [...c.a, ...c.b].map((r) => [r.x, r.y, (r.ang * 180) / Math.PI]);
  if (rects.length !== attendues.length) return `${rects.length} coupes contre ${attendues.length}`;
  for (let i = 0; i < rects.length; i++)
    for (let j = 0; j < 3; j++)
      if (Math.abs(rects[i][j] - attendues[i][j]) > 0.006) return `coupe ${i} : ${rects[i]} contre ${attendues[i].map((v) => v.toFixed(2))}`;
  return null;
}
