// Les objets : la puce, le boîtier, la Terre.
//
// Le boîtier est dessiné au trait, en perspective isométrique — un plan
// d'architecte plutôt qu'une photo. On y reconnaît ce que la fiche de Douala
// décrit (docs/FICHE-DOUALA.md) : « la carte verte », « la petite carte
// bleue » et sa fente SIM, deux antennes vissées, les voyants.

import { C } from "./marque.js";
import { borne, acc, melange } from "./outils.js";
import { rr } from "./interface.js";

// --- La puce SIM, coin coupé ------------------------------------------------------
export function sim(x, cx, cy, w, o = {}) {
  const h = w * 0.66, cut = w * 0.16;
  x.save();
  x.translate(cx, cy);
  if (o.rotation) x.rotate(o.rotation);
  if (o.echelle) x.scale(o.echelle, o.echelle);
  x.globalAlpha *= o.alpha ?? 1;
  x.beginPath();
  x.moveTo(-w / 2 + cut, -h / 2);
  x.lineTo(w / 2 - 6, -h / 2); x.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + 6);
  x.lineTo(w / 2, h / 2 - 6); x.quadraticCurveTo(w / 2, h / 2, w / 2 - 6, h / 2);
  x.lineTo(-w / 2 + 6, h / 2); x.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - 6);
  x.lineTo(-w / 2, -h / 2 + cut);
  x.closePath();
  x.fillStyle = o.fond || "#1d1e22"; x.fill();
  x.strokeStyle = o.bord || "rgba(244,239,233,0.35)"; x.lineWidth = Math.max(1, w * 0.008); x.stroke();
  // La puce dorée et ses contacts.
  const pw = w * 0.34, ph = h * 0.46, px = -w * 0.2 - pw / 2, py = -ph / 2;
  const g = x.createLinearGradient(px, py, px + pw, py + ph);
  g.addColorStop(0, "#d9b77a"); g.addColorStop(0.5, "#f1dca8"); g.addColorStop(1, "#b89150");
  rr(x, px, py, pw, ph, pw * 0.12); x.fillStyle = g; x.fill();
  x.strokeStyle = "rgba(90,60,20,0.55)"; x.lineWidth = Math.max(1, w * 0.006);
  x.beginPath();
  x.moveTo(px + pw * 0.5, py); x.lineTo(px + pw * 0.5, py + ph);
  x.moveTo(px, py + ph * 0.33); x.lineTo(px + pw * 0.38, py + ph * 0.33);
  x.moveTo(px, py + ph * 0.66); x.lineTo(px + pw * 0.38, py + ph * 0.66);
  x.moveTo(px + pw * 0.62, py + ph * 0.33); x.lineTo(px + pw, py + ph * 0.33);
  x.moveTo(px + pw * 0.62, py + ph * 0.66); x.lineTo(px + pw, py + ph * 0.66);
  x.stroke();
  // Le nom de la carte et la pastille de l'opérateur (couleur = donnée, 4 % de la largeur).
  if (o.libelle) {
    x.font = `600 ${w * 0.085}px Inter, sans-serif`;
    x.fillStyle = "rgba(244,239,233,0.9)"; x.textAlign = "left"; x.textBaseline = "middle";
    x.fillText(o.libelle, w * 0.06, -h * 0.02);
    if (o.pastille) { x.beginPath(); x.arc(w * 0.02, -h * 0.02, w * 0.022, 0, 7); x.fillStyle = o.pastille; x.fill(); }
  }
  if (o.sous) {
    x.font = `400 ${w * 0.06}px 'JetBrains Mono', monospace`;
    x.fillStyle = "rgba(244,239,233,0.5)"; x.textAlign = "left";
    x.fillText(o.sous, w * 0.02, h * 0.2);
  }
  x.restore();
}

// --- Les ondes : des arcs qui partent d'un point -----------------------------------
export function ondes(x, cx, cy, r, t, o = {}) {
  const n = o.n || 3, periode = o.periode || 1.2;
  x.save();
  for (let i = 0; i < n; i++) {
    const f = ((t / periode + i / n) % 1);
    const rr_ = r * (0.2 + f);
    x.globalAlpha = (1 - f) * (o.alpha ?? 0.8);
    x.strokeStyle = o.couleur || C.lateriteClair; x.lineWidth = o.largeur || 2;
    x.beginPath();
    if (o.angle != null) x.arc(cx, cy, rr_, o.angle - (o.ouverture || 0.6), o.angle + (o.ouverture || 0.6));
    else x.arc(cx, cy, rr_, 0, Math.PI * 2);
    x.stroke();
  }
  x.restore();
}

// --- Le boîtier, en isométrique -------------------------------------------------------
// (u, v, w) → écran : u vers la droite-bas, v vers la gauche-bas, w vers le haut.
export function boitier(x, cx, cy, s, o = {}) {
  const t = o.t || 0;
  const iso = (u, v, w) => [cx + (u - v) * s * 0.866, cy + (u + v) * s * 0.5 - w * s];
  const poly = (pts, fond, bord, lw = 1.2) => {
    x.beginPath(); pts.forEach((p, i) => { const [a, b] = iso(...p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath();
    if (fond) { x.fillStyle = fond; x.fill(); }
    if (bord) { x.strokeStyle = bord; x.lineWidth = lw; x.stroke(); }
  };
  const boite = (u0, v0, w0, du, dv, dw, dessus, gauche, droite, bord) => {
    poly([[u0, v0 + dv, w0], [u0 + du, v0 + dv, w0], [u0 + du, v0 + dv, w0 + dw], [u0, v0 + dv, w0 + dw]], gauche, bord);
    poly([[u0 + du, v0, w0], [u0 + du, v0 + dv, w0], [u0 + du, v0 + dv, w0 + dw], [u0 + du, v0, w0 + dw]], droite, bord);
    poly([[u0, v0, w0 + dw], [u0 + du, v0, w0 + dw], [u0 + du, v0 + dv, w0 + dw], [u0, v0 + dv, w0 + dw]], dessus, bord);
  };
  const ligne = o.ligne || "rgba(244,239,233,0.55)";
  const monte = o.monte ?? 1; // 0..1 : les étages arrivent
  // La carte verte (Raspberry Pi 4) : 85 × 56.
  boite(-0.85, -0.56, 0, 1.7, 1.12, 0.03, "#173d2b", "#0f2a1d", "#12321f", ligne);
  // Ses puces et ses prises.
  boite(-0.2, -0.25, 0.03, 0.28, 0.28, 0.04, "#2a2b30", "#1b1c20", "#222328", ligne);
  boite(0.6, -0.5, 0.03, 0.25, 0.3, 0.13, "#b9bcc2", "#8d9096", "#a3a6ac", ligne); // USB
  boite(0.6, -0.1, 0.03, 0.25, 0.3, 0.13, "#b9bcc2", "#8d9096", "#a3a6ac", ligne); // USB
  boite(0.6, 0.28, 0.03, 0.25, 0.26, 0.11, "#c9ccd2", "#9da0a6", "#b3b6bc", ligne); // réseau
  // La petite carte bleue (le modem), posée au-dessus.
  const hHat = 0.28 + (1 - acc.sortie3(borne(monte))) * 1.2;
  x.save(); x.globalAlpha *= borne(monte * 2);
  boite(-0.85, -0.56, hHat, 1.62, 1.12, 0.03, "#1b3a66", "#122a4b", "#163257", ligne);
  // Le modem SIM7600 (boîtier métal).
  boite(-0.5, -0.35, hHat + 0.03, 0.55, 0.5, 0.06, "#c4c7cc", "#979aa0", "#aeb1b6", ligne);
  // La fente SIM.
  boite(0.2, 0.1, hHat + 0.03, 0.42, 0.3, 0.05, "#2a2b30", "#1b1c20", "#222328", ligne);
  // Les deux antennes, vissées sur MAIN et GNSS.
  for (const [u, v] of [[-0.75, -0.45], [-0.75, 0.2]]) {
    const [a0, b0] = iso(u, v, hHat + 0.03), [a1, b1] = iso(u, v, hHat + 1.35);
    x.strokeStyle = "#2a2b30"; x.lineWidth = s * 0.07; x.lineCap = "round";
    x.beginPath(); x.moveTo(a0, b0); x.lineTo(a1, b1); x.stroke();
    x.strokeStyle = ligne; x.lineWidth = 1.2; x.stroke();
    if (o.ondes) ondes(x, a1, b1, s * 1.1, t, { couleur: C.lateriteClair, alpha: 0.7 * o.ondes, largeur: Math.max(1.5, s * 0.012) });
  }
  x.restore();
  const fentes = [iso(0.41, 0.25, hHat + 0.08)];
  // Le second modem : une autre carte, à côté, reliée par un câble USB (docs/MEMENTO.md :
  // deux modems demandent un hub USB alimenté). Un modem par opérateur.
  if (o.second) {
    const du = 2.0, dv = 0.35;
    x.save(); x.globalAlpha *= borne(monte * 2);
    boite(-0.85 + du, -0.56 + dv, 0, 1.62, 1.12, 0.03, "#1b3a66", "#122a4b", "#163257", ligne);
    boite(-0.5 + du, -0.35 + dv, 0.03, 0.55, 0.5, 0.06, "#c4c7cc", "#979aa0", "#aeb1b6", ligne);
    boite(0.2 + du, 0.1 + dv, 0.03, 0.42, 0.3, 0.05, "#2a2b30", "#1b1c20", "#222328", ligne);
    for (const [u, v] of [[-0.75 + du, -0.45 + dv], [-0.75 + du, 0.2 + dv]]) {
      const [a0, b0] = iso(u, v, 0.03), [a1, b1] = iso(u, v, 1.35);
      x.strokeStyle = "#2a2b30"; x.lineWidth = s * 0.07; x.lineCap = "round";
      x.beginPath(); x.moveTo(a0, b0); x.lineTo(a1, b1); x.stroke();
      x.strokeStyle = ligne; x.lineWidth = 1.2; x.stroke();
      if (o.ondes2) ondes(x, a1, b1, s * 1.1, t + 0.4, { couleur: C.lateriteClair, alpha: 0.7 * o.ondes2, largeur: Math.max(1.5, s * 0.012) });
    }
    // Le câble USB, de la carte verte au second modem.
    const [c0x, c0y] = iso(0.85, -0.35, 0.1), [c1x, c1y] = iso(-0.85 + du, -0.3 + dv, 0.05);
    x.strokeStyle = "#3a3b40"; x.lineWidth = s * 0.035;
    x.beginPath(); x.moveTo(c0x, c0y); x.bezierCurveTo(c0x + s * 0.5, c0y + s * 0.2, c1x - s * 0.5, c1y + s * 0.3, c1x, c1y); x.stroke();
    x.restore();
    fentes.push(iso(0.41 + du, 0.25 + dv, 0.08));
  }
  // Les voyants : rouge fixe (le courant), vert qui clignote pendant le démarrage.
  const [lx, ly] = iso(-0.85, 0.35, 0.05);
  const clign = o.demarrage ? (Math.floor(t * 4) % 2) : 1;
  for (const [dx, coul, on] of [[0, "#ff3b30", 1], [s * 0.1, "#30d158", clign]]) {
    x.beginPath(); x.arc(lx + dx, ly, s * 0.028, 0, 7);
    x.fillStyle = on ? coul : "#333"; x.fill();
    if (on) { x.save(); x.globalAlpha = 0.35; x.beginPath(); x.arc(lx + dx, ly, s * 0.07, 0, 7); x.fillStyle = coul; x.fill(); x.restore(); }
  }
  return { iso, fentes };
}

// --- La Terre, en points ---------------------------------------------------------------
let TERRE = null;
export async function chargerTerre() {
  if (!TERRE) {
    const d = await fetch("./terre.json").then((r) => r.json());
    const p = d.points, n = p.length / 2;
    TERRE = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const la = (p[2 * i] / 10) * Math.PI / 180, lo = (p[2 * i + 1] / 10) * Math.PI / 180;
      TERRE[3 * i] = Math.cos(la) * Math.sin(lo);
      TERRE[3 * i + 1] = Math.sin(la);
      TERRE[3 * i + 2] = Math.cos(la) * Math.cos(lo);
    }
  }
  return TERRE;
}

// Un point (lat, lon en degrés) → vecteur unité.
export function vecteur(lat, lon) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}
// La rotation qui amène (lat0, lon0) face à nous.
function tourner(v, lat0, lon0) {
  const lo = -lon0 * Math.PI / 180, la = lat0 * Math.PI / 180;
  const x1 = v[0] * Math.cos(lo) + v[2] * Math.sin(lo), z1 = -v[0] * Math.sin(lo) + v[2] * Math.cos(lo), y1 = v[1];
  const y2 = y1 * Math.cos(la) - z1 * Math.sin(la), z2 = y1 * Math.sin(la) + z1 * Math.cos(la);
  return [x1, y2, z2];
}
export function projeter(v, g) {
  const r = tourner(v, g.lat, g.lon);
  return [g.x + r[0] * g.r, g.y - r[1] * g.r, r[2]];
}

// g : { x, y, r, lat, lon (le centre de la vue), couleur, taillePoint }
export function globe(x, g) {
  if (!TERRE) return;
  x.save();
  // Le disque, à peine plus clair que le fond.
  const halo = x.createRadialGradient(g.x, g.y, g.r * 0.9, g.x, g.y, g.r * 1.25);
  halo.addColorStop(0, "rgba(208,138,99,0.10)"); halo.addColorStop(1, "rgba(208,138,99,0)");
  x.fillStyle = halo; x.beginPath(); x.arc(g.x, g.y, g.r * 1.25, 0, 7); x.fill();
  x.beginPath(); x.arc(g.x, g.y, g.r, 0, 7); x.fillStyle = g.fond || "#1a1b1f"; x.fill();
  x.strokeStyle = "rgba(244,239,233,0.12)"; x.lineWidth = 1; x.stroke();
  const tp = g.taillePoint || Math.max(1.2, g.r * 0.006);
  x.fillStyle = g.couleur || "rgba(244,239,233,0.55)";
  const n = TERRE.length / 3;
  const la = g.lat * Math.PI / 180, lo = -g.lon * Math.PI / 180;
  const cl = Math.cos(lo), sl = Math.sin(lo), ca = Math.cos(la), sa = Math.sin(la);
  for (let i = 0; i < n; i++) {
    const vx = TERRE[3 * i], vy = TERRE[3 * i + 1], vz = TERRE[3 * i + 2];
    const x1 = vx * cl + vz * sl, z1 = -vx * sl + vz * cl;
    const y2 = vy * ca - z1 * sa, z2 = vy * sa + z1 * ca;
    if (z2 < 0.02) continue;
    const a = 0.25 + 0.75 * z2;
    x.globalAlpha = a * (g.alpha ?? 1);
    x.fillRect(g.x + x1 * g.r - tp / 2, g.y - y2 * g.r - tp / 2, tp, tp);
  }
  x.restore();
}

// Un arc de grand cercle entre deux lieux, tracé jusqu'à p, soulevé au milieu.
export function arcGlobe(x, g, a, b, p, o = {}) {
  const va = vecteur(a[0], a[1]), vb = vecteur(b[0], b[1]);
  const om = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
  const n = 80, pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, s0 = Math.sin((1 - f) * om) / Math.sin(om), s1 = Math.sin(f * om) / Math.sin(om);
    const h = 1 + (o.hauteur ?? 0.18) * Math.sin(Math.PI * f);
    const v = [(va[0] * s0 + vb[0] * s1) * h, (va[1] * s0 + vb[1] * s1) * h, (va[2] * s0 + vb[2] * s1) * h];
    pts.push(projeter(v, g));
  }
  const m = Math.floor(borne(p) * n);
  x.save();
  x.strokeStyle = o.couleur || C.lateriteClair; x.lineWidth = o.largeur || 3; x.lineCap = "round";
  x.beginPath();
  for (let i = 0; i <= m; i++) { const [px, py] = pts[i]; i ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.stroke();
  // Des impulsions qui circulent sur l'arc tracé : ce qui part du pays, ce qui y revient.
  if (o.impulsions && p >= 1) {
    for (const f0 of o.impulsions) {
      const f = ((f0 % 1) + 1) % 1;
      const [qx, qy] = pts[Math.floor(f * n)];
      const r = (o.largeur || 3) * 2.2;
      const g = x.createRadialGradient(qx, qy, 0, qx, qy, r * 4);
      g.addColorStop(0, "rgba(255,230,210,0.95)"); g.addColorStop(1, "rgba(255,230,210,0)");
      x.fillStyle = g; x.beginPath(); x.arc(qx, qy, r * 4, 0, 7); x.fill();
    }
  }
  x.restore();
  pts.fin = pts[m];
  return pts[m];
}
