// Les outils du plateau : le temps, les accélérations, le hasard reproductible.
//
// Tout ce qui bouge dans l'annonce est une FONCTION DU TEMPS. Rien n'est
// animé « en direct » : l'image n° 1 234 se calcule toute seule, dans
// n'importe quel ordre, par n'importe quel ouvrier, et donne toujours les
// mêmes pixels. C'est ce qui permet de rendre à plusieurs en parallèle — et
// de revenir sur une image précise sans rejouer celles d'avant.

export const borne = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const melange = (a, b, t) => a + (b - a) * t;
// Où en est-on entre a et b, ramené à [0, 1].
export const avance = (t, a, b) => borne((t - a) / (b - a));
export const lisse = (a, b, t) => { const x = avance(t, a, b); return x * x * (3 - 2 * x); };

// Accélérations. Toutes prennent x dans [0, 1] et rendent [0, 1].
export const acc = {
  lin: (x) => x,
  entree2: (x) => x * x,
  sortie2: (x) => 1 - (1 - x) * (1 - x),
  entree3: (x) => x * x * x,
  sortie3: (x) => 1 - Math.pow(1 - x, 3),
  sortie4: (x) => 1 - Math.pow(1 - x, 4),
  deux3: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  deux4: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  sortieExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  entreeExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  deuxExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  // Dépasse un peu, revient : le geste d'un objet qui a du poids.
  sortieRetour: (x, k = 1.70158) => 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2),
  // Un ressort amorti — la valeur oscille autour de 1 et s'y pose.
  ressort: (x, raideur = 7, amorti = 5.5) => 1 - Math.exp(-amorti * x) * Math.cos(raideur * x * Math.PI * 0.5 * 1.6),
  // Un « coup » : monte d'un coup, redescend doucement.
  coup: (x) => (x <= 0 ? 0 : Math.exp(-x * 6)),
};

// Anime une valeur de v0 à v1 entre les instants a et b.
export const anim = (t, a, b, v0, v1, f = acc.sortie3) => melange(v0, v1, f(avance(t, a, b)));

// --- Le hasard reproductible -------------------------------------------------
// Math.random() rendrait chaque image différente d'un rendu à l'autre, et
// deux ouvriers ne tomberaient pas d'accord sur la même image.
export function hache(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hache2 = (a, b) => hache(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
export const hache3 = (a, b, c) => hache(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791));

export function hasard(graine) {
  let s = (graine >>> 0) || 1;
  const f = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  f.entre = (a, b) => a + (b - a) * f();
  f.signe = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// Bruit de valeur, lissé : pour les frémissements, les dérives, la caméra
// qui respire. bruit1(x) varie doucement entre -1 et 1.
export function bruit1(x, graine = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return melange(hache2(i, graine) * 2 - 1, hache2(i + 1, graine) * 2 - 1, u);
}
export function bruit2(x, y, graine = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hache3(ix, iy, graine), b = hache3(ix + 1, iy, graine);
  const c = hache3(ix, iy + 1, graine), d = hache3(ix + 1, iy + 1, graine);
  return melange(melange(a, b, ux), melange(c, d, ux), uy) * 2 - 1;
}
// Plusieurs octaves : une dérive qui a du grain.
export function fbm(x, y, graine = 0, octaves = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) { v += a * bruit2(x * f, y * f, graine + o * 17); f *= 2; a *= 0.5; }
  return v;
}

// --- Les nombres, écrits comme au Cameroun -------------------------------------
// « 157 500 », avec l'espace fine insécable des milliers.
export function montant(n) {
  const s = Math.round(n).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
