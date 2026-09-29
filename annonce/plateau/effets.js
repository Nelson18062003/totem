// La post-production, image par image, en 2D.
//
// Pourquoi pas WebGL : mesuré sur la machine de tournage, la passe WebGL
// coûtait 210 ms par image — le processeur y imite une carte graphique qu'il
// n'a pas. La même chaîne en composition 2D, sans carte graphique, tient en
// 45 ms. Chaque effet est donc une suite de compositions : isoler un canal
// par multiplication, recomposer par addition, flouter une copie réduite.
//
// Ordre de la chaîne : caméra (secousse, zoom) → flous de mouvement →
// glitch → aberration chromatique → lueur → flash → vignette → grain.

import { hache, hache2, borne } from "./outils.js";
import { toile } from "./marque.js";

let bruits = null;
function preparerBruits() {
  bruits = [];
  for (let n = 0; n < 4; n++) {
    const c = document.createElement("canvas"); c.width = c.height = 384;
    const x = c.getContext("2d"), im = x.createImageData(384, 384);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.floor(hache(i * 7 + n * 1000003) * 255);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    bruits.push(c);
  }
}

let vignetteCache = null;
function vignette(W, H) {
  if (vignetteCache && vignetteCache.width === W && vignetteCache.height === H) return vignetteCache;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const r = Math.hypot(W, H) / 2;
  const g = x.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r * 1.05);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.6, "#e8e8e8"); g.addColorStop(1, "#5a5a5a");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  vignetteCache = c;
  return c;
}

// Isole un canal : copie puis multiplie par la couleur pure.
function canal(src, cle, couleur) {
  const [c, x] = toile(cle, src.width, src.height);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "multiply";
  x.fillStyle = couleur; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = "source-over";
  return c;
}

// Dessine `img` mis à l'échelle s autour de (cx, cy), décalé de (dx, dy).
function poser(x, img, s, cx, cy, dx = 0, dy = 0) {
  const W = img.width, H = img.height;
  x.drawImage(img, cx - cx * s + dx, cy - cy * s + dy, W * s, H * s);
}

// p : les réglages de l'image — tous facultatifs.
//   camera   { x, y, rot, zoom }        secousse et respiration de la caméra
//   zoomFlou  force (0..0.3), centre [cx, cy] en fraction
//   fouet    { dx, dy }                 flou directionnel (en px)
//   glitch   force (0..1), graine
//   aberration force en px au bord
//   lueur    force (0..2), seuil (0..1)
//   flash    { alpha, couleur }
//   vignette force (0..1)
//   grain    force (0..0.3), n = numéro d'image
//   lignes   force des lignes de balayage (0..1)
//   bandes   hauteur des bandes cinéma (fraction)
export function postProduire(src, sortie, p) {
  if (!bruits) preparerBruits();
  const W = src.width, H = src.height;
  const [A, a] = toile("post-a", W, H);

  // 1. La caméra.
  const cam = p.camera || {};
  const z = (cam.zoom || 1);
  a.fillStyle = "#000"; a.fillRect(0, 0, W, H);
  a.save();
  a.translate(W / 2 + (cam.x || 0), H / 2 + (cam.y || 0));
  a.rotate(cam.rot || 0);
  a.scale(z, z);
  a.drawImage(src, -W / 2, -H / 2);
  a.restore();
  let cour = A;

  // 2. Les flous de mouvement : on empile des copies, en moyenne glissante.
  if ((p.zoomFlou || 0) > 0.002) {
    const [B, b] = toile("post-b", W, H);
    const [cx, cy] = (p.centre || [0.5, 0.5]).map((v, i) => v * (i ? H : W));
    b.drawImage(cour, 0, 0);
    const n = 8;
    for (let i = 1; i < n; i++) { b.globalAlpha = 1 / (i + 1); poser(b, cour, 1 + p.zoomFlou * (i / (n - 1)), cx, cy); }
    b.globalAlpha = 1; cour = B;
  }
  if (p.fouet && (Math.abs(p.fouet.dx || 0) + Math.abs(p.fouet.dy || 0)) > 1) {
    const [B, b] = toile(cour === A ? "post-b" : "post-c", W, H);
    b.drawImage(cour, 0, 0);
    const n = 8;
    for (let i = 1; i < n; i++) {
      b.globalAlpha = 1 / (i + 1);
      const f = i / (n - 1) - 0.5;
      b.drawImage(cour, (p.fouet.dx || 0) * f, (p.fouet.dy || 0) * f);
    }
    b.globalAlpha = 1; cour = B;
  }

  // 3. Le glitch : des bandes arrachées, décalées, et des blocs déplacés.
  if ((p.glitch || 0) > 0.01) {
    const [G, g] = toile("post-g", W, H);
    g.drawImage(cour, 0, 0);
    const f = p.glitch, s = (p.graine || 0) * 131;
    const bandes = Math.floor(4 + f * 14);
    for (let i = 0; i < bandes; i++) {
      const y = Math.floor(hache2(s, i * 3) * H), h = Math.floor((0.004 + hache2(s, i * 3 + 1) ** 3 * 0.12) * H);
      const dx = (hache2(s, i * 3 + 2) - 0.5) * W * 0.18 * f;
      g.drawImage(cour, 0, y, W, h, dx, y, W, h);
      if (hache2(s, i + 99) < f * 0.5) { // la bande perd un canal
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.35 * f;
        g.fillStyle = hache2(s, i + 7) < 0.5 ? "#ff0040" : "#00e5ff";
        g.fillRect(0, y, W, h); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
    }
    const blocs = Math.floor(f * 10);
    for (let i = 0; i < blocs; i++) {
      const bw = (0.04 + hache2(s + 5, i) * 0.2) * W, bh = (0.01 + hache2(s + 6, i) * 0.06) * H;
      const sx = hache2(s + 7, i) * (W - bw), sy = hache2(s + 8, i) * (H - bh);
      const dx = sx + (hache2(s + 9, i) - 0.5) * 0.25 * W * f, dy = sy + (hache2(s + 10, i) - 0.5) * 0.05 * H;
      g.drawImage(cour, sx, sy, bw, bh, dx, dy, bw, bh);
    }
    cour = G;
  }

  // 4. L'aberration chromatique : rouge un peu plus grand, bleu un peu plus
  //    petit, autour du centre — comme une lentille qui disperse au bord.
  const ab = (p.aberration || 0) + (p.glitch || 0) * 14;
  if (ab > 0.3) {
    const r = canal(cour, "post-r", "#ff0000"), gg = canal(cour, "post-v", "#00ff00"), bl = canal(cour, "post-bl", "#0000ff");
    const [S, s] = toile("post-s", W, H);
    s.fillStyle = "#000"; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = "lighter";
    const k = ab / (W / 2);
    const dx = (p.aberrationDx || 0);
    poser(s, r, 1 + k, W / 2, H / 2, -dx, 0);
    s.drawImage(gg, 0, 0);
    poser(s, bl, 1 - k, W / 2, H / 2, dx, 0);
    s.globalCompositeOperation = "source-over";
    cour = S;
  }

  const o = sortie.getContext("2d");
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = "source-over"; o.filter = "none";
  o.drawImage(cour, 0, 0);

  // 5. La lueur : une copie réduite, seuillée, floutée, ajoutée par écran.
  if ((p.lueur || 0) > 0.01) {
    const q = 6, w = Math.ceil(W / q), h = Math.ceil(H / q);
    const [L, l] = toile("post-l", w, h);
    const seuil = p.seuil ?? 0.55;
    l.filter = `brightness(${(1 - seuil * 0.6).toFixed(3)}) contrast(${(1 + seuil * 2.2).toFixed(3)})`;
    l.drawImage(sortie, 0, 0, w, h);
    l.filter = "none";
    const [L2, l2] = toile("post-l2", w, h);
    l2.filter = `blur(${Math.max(2, w / 90).toFixed(1)}px)`;
    l2.drawImage(L, 0, 0);
    l2.filter = "none";
    o.save();
    o.globalCompositeOperation = "screen";
    o.globalAlpha = borne(p.lueur, 0, 1);
    o.imageSmoothingQuality = "high";
    o.drawImage(L2, 0, 0, W, H);
    if (p.lueur > 1) { o.globalAlpha = borne(p.lueur - 1, 0, 1); o.drawImage(L2, 0, 0, W, H); }
    o.restore();
  }

  // 5 bis. La fuite de lumière : deux taches chaudes qui traversent l'image,
  //        en écran — la lumière qui fuit dans une caméra de cinéma.
  if ((p.fuite || 0) > 0.01) {
    o.save();
    o.globalCompositeOperation = "screen";
    const f = p.fuite, ph = p.phaseFuite || 0;
    for (const [cx, cy, r, c] of [
      [W * (0.1 + 0.9 * ph), H * 0.3, Math.max(W, H) * 0.55, "255,150,90"],
      [W * (1.1 - 1.0 * ph), H * 0.85, Math.max(W, H) * 0.4, "208,120,80"],
    ]) {
      const g = o.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${c},${0.55 * f})`); g.addColorStop(1, `rgba(${c},0)`);
      o.fillStyle = g; o.fillRect(0, 0, W, H);
    }
    o.restore();
  }

  // 6. Le flash.
  if (p.flash && p.flash.alpha > 0.003) {
    o.save();
    o.globalCompositeOperation = p.flash.mode || "screen";
    o.globalAlpha = borne(p.flash.alpha);
    o.fillStyle = p.flash.couleur || "#ffffff";
    o.fillRect(0, 0, W, H);
    o.restore();
  }

  // 7. Les lignes de balayage.
  if ((p.lignes || 0) > 0.01) {
    o.save(); o.globalAlpha = 0.12 * p.lignes; o.fillStyle = "#000";
    const pas = Math.max(3, Math.round(H / 270));
    for (let y = 0; y < H; y += pas) o.fillRect(0, y, W, 1);
    o.restore();
  }

  // 8. La vignette.
  if ((p.vignette ?? 0.6) > 0.01) {
    o.save(); o.globalCompositeOperation = "multiply"; o.globalAlpha = p.vignette ?? 0.6;
    o.drawImage(vignette(W, H), 0, 0); o.restore();
  }

  // 9. Le grain : jamais le même d'une image à l'autre.
  if ((p.grain ?? 0.07) > 0.005) {
    const n = p.n || 0, t = bruits[n % 4];
    o.save(); o.globalCompositeOperation = "overlay"; o.globalAlpha = p.grain ?? 0.07;
    // Un grain de deux pixels : plus proche de la pellicule, et bien moins
    // coûteux à compresser qu'un bruit au pixel près.
    const pat = o.createPattern(t, "repeat");
    o.translate(-Math.floor(hache(n * 3) * 768), -Math.floor(hache(n * 3 + 1) * 768));
    o.scale(2, 2);
    o.fillStyle = pat; o.fillRect(0, 0, W / 2 + 384, H / 2 + 384);
    o.restore();
  }

  // 10. Les bandes cinéma.
  if ((p.bandes || 0) > 0.001) {
    const h = Math.round(p.bandes * H);
    o.fillStyle = "#000"; o.fillRect(0, 0, W, h); o.fillRect(0, H - h, W, h);
  }
}

// --- Les transitions --------------------------------------------------------------
// Chacune compose l'image SORTANTE et l'image ENTRANTE selon f dans [0, 1].

// Un losange qui s'ouvre au centre : le vide de la Tresse devient une porte.
export function masqueLosange(x, W, H, f, cx = W / 2, cy = H / 2, ratio = 1.55) {
  const r = f * (Math.max(W, H) * 1.25);
  x.beginPath();
  x.moveTo(cx, cy - r * ratio / 1.55 * 1.0);
  x.lineTo(cx + r / 1.55 * 1.2, cy);
  x.lineTo(cx, cy + r * ratio / 1.55 * 1.0);
  x.lineTo(cx - r / 1.55 * 1.2, cy);
  x.closePath();
}

// La claustra : un treillis de losanges qui s'ouvrent l'un après l'autre,
// depuis un point d'origine. Le mur ajouré devient passage.
export function masqueClaustra(x, W, H, f, o = {}) {
  const pas = o.pas || Math.max(W, H) / 11;
  const ox = (o.origine?.[0] ?? 0.5) * W, oy = (o.origine?.[1] ?? 0.5) * H;
  const dmax = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy));
  x.beginPath();
  for (let j = -1; j * pas * 0.5 < H + pas; j++) {
    for (let i = -1; i * pas < W + pas; i++) {
      const cx = i * pas + (j % 2 ? pas / 2 : 0), cy = j * pas * 0.5;
      const d = Math.hypot(cx - ox, cy - oy) / dmax;
      const loc = borne((f * 1.6 - d * 0.6) / 1.0);
      if (loc <= 0) continue;
      const r = loc * pas * 0.72;
      x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath();
    }
  }
}


// --- Le rembobinage : une bande magnétique qu'on rembobine ---------------------------------------
// Par-dessus une image déjà faite : des lignes, une bande de « tracking » qui
// remonte, du bruit de tête, et le signe ◀◀.
export function voileRembobinage(sortie, u, n) {
  const W = sortie.width, H = sortie.height, o = sortie.getContext("2d");
  o.save();
  o.setTransform(1, 0, 0, 1, 0, 0);
  // Les lignes de balayage.
  o.globalAlpha = 0.18; o.fillStyle = "#000";
  for (let y = 0; y < H; y += 4) o.fillRect(0, y, W, 2);
  // La bande de tracking, qui remonte.
  const yb = H - ((n * 37) % (H + 200)) + 100, hb = H * 0.07;
  o.globalAlpha = 0.5;
  for (let i = 0; i < 40; i++) {
    const yy = yb + hache2(n, i) * hb, ww = W * (0.2 + hache2(n, i + 50) * 0.8);
    o.fillStyle = hache2(n, i + 90) < 0.5 ? "#ffffff" : "#9ab";
    o.fillRect(hache2(n, i + 70) * (W - ww), yy, ww, 1 + hache2(n, i + 30) * 2);
  }
  // Le signe ◀◀ et le compteur.
  o.globalAlpha = 0.85; o.fillStyle = "#fbfbfc";
  // En vertical, le signe descend sous la barre d'état des applications, et grossit.
  const v = H > W;
  const s = v ? W * 0.06 : H * 0.035, x0 = v ? W * 0.08 : H * 0.06, y0 = v ? H * 0.13 : H * 0.08;
  for (let k = 0; k < 2; k++) { o.beginPath(); o.moveTo(x0 + k * s * 0.9 + s, y0 - s / 2); o.lineTo(x0 + k * s * 0.9, y0); o.lineTo(x0 + k * s * 0.9 + s, y0 + s / 2); o.closePath(); o.fill(); }
  o.restore();
}
