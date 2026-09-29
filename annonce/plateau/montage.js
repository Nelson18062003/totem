// Le montage : quel plan à quel temps, comment on passe de l'un à l'autre, et
// quels effets tombent sur quels coups.
//
// Le temps se compte en TEMPS MUSICAUX (des noires), pas en secondes : le
// conducteur (annonce/conducteur.json) donne le tempo, et la musique le lit
// aussi. Un plan qui commence « au temps 32 » tombe donc sur le coup que
// musique.py pose au temps 32 — par construction, pas par réglage.

import { acc, borne, bruit1 } from "./outils.js";
import { C, chargerMot, verifierContreSVG, toile } from "./marque.js";
import { postProduire, masqueLosange, masqueClaustra, voileRembobinage } from "./effets.js";
import { chargerTerre } from "./objets.js";
import { PLANS } from "./plans.js";

let W, H, COND, T;

export async function preparer(w, h, fps) {
  W = w; H = h;
  const [sym, logo, cond] = await Promise.all([
    fetch("../../brand/totem-symbole.svg").then((r) => r.text()),
    fetch("../../brand/totem-logo.svg").then((r) => r.text()),
    fetch("../conducteur.json").then((r) => r.json()),
  ]);
  const ecart = verifierContreSVG(sym);
  if (ecart) return { erreur: `la Tresse du plateau ne suit plus brand/generer.py : ${ecart}` };
  chargerMot(logo);
  await chargerTerre();
  COND = cond; T = 60 / cond.tempo;
  // Les plans doivent couvrir le conducteur sans trou ni chevauchement.
  let fin = 0;
  for (const p of PLANS) {
    if (Math.abs(p.de - fin) > 1e-6) return { erreur: `trou ou chevauchement avant le plan « ${p.nom} » (temps ${fin} → ${p.de})` };
    fin = p.a;
  }
  if (Math.abs(fin - cond.duree_temps) > 1e-6) return { erreur: `les plans finissent au temps ${fin}, le conducteur à ${cond.duree_temps}` };
  return { duree: cond.duree_temps * T + (cond.queue_s || 0), plans: PLANS.length };
}

// Le temps local d'un plan, tel que ses fonctions le reçoivent.
function local(plan, b, n) {
  return {
    b,                                       // le temps musical global
    l: b - plan.de,                          // le temps musical depuis le début du plan
    p: (b - plan.de) / (plan.a - plan.de),   // 0..1 dans le plan
    s: (b - plan.de) * T,                    // secondes depuis le début du plan
    t: b * T,                                // secondes globales
    n, W, H, T,
    v: H > W,                                // format vertical
    u: Math.min(W, H),                       // le petit côté : l'unité des tailles
  };
}

// Un plan se dessine dans sa propre toile, avec son temps local.
function rendrePlan(cle, plan, b, n) {
  const [c, x] = toile(cle, W, H);
  x.save();
  plan.dessiner(x, local(plan, b, n), plan);
  x.restore();
  return c;
}

// Le gel : pendant plan.gel = { de, a } (en temps locaux), l'image s'arrête
// sur l'instant « de » et toute la post-production tombe à zéro.
function gele(plan, b) {
  return plan.gel && b - plan.de >= plan.gel.de && b - plan.de < plan.gel.a;
}

// Les effets qui tombent sur les coups du conducteur.
function effetsDuConducteur(b) {
  const f = { flash: 0, secousse: 0, aberration: 0, glitch: 0, zoom: 0 };
  for (const e of COND.evenements || []) {
    const d = b - e.temps;
    if (d < -0.02 || d > 8) continue;
    const s = d * T; // secondes depuis l'événement
    if (e.type === "impact") {
      f.flash = Math.max(f.flash, Math.exp(-s * (e.decroissance ?? 5)) * (e.flash ?? 0.9));
      if (e.couleurFlash) f.couleurFlash = e.couleurFlash;
      f.secousse = Math.max(f.secousse, Math.exp(-s * 3.2));
      f.aberration = Math.max(f.aberration, Math.exp(-s * 4) * 26);
      f.zoom = Math.max(f.zoom, Math.exp(-s * 5) * 0.05);
      f.fuite = Math.max(f.fuite || 0, Math.exp(-s * 1.5) * (e.fuite ?? 0.6)); f.phaseFuite = Math.min(1, s / 2.5);
    } else if (e.type === "frappe") {
      f.secousse = Math.max(f.secousse, Math.exp(-s * 9) * 0.5);
      f.aberration = Math.max(f.aberration, Math.exp(-s * 10) * 12);
      f.zoom = Math.max(f.zoom, Math.exp(-s * 10) * 0.025);
      f.flash = Math.max(f.flash, Math.exp(-s * 14) * 0.18);
    } else if (e.type === "glitch") {
      if (s < (e.duree || 0.25)) f.glitch = Math.max(f.glitch, e.force || 0.85);
    }
  }
  return f;
}

// La pulsation de la grosse caisse, pendant les sections qui en ont une.
function pulsation(b) {
  for (const s of COND.sections) {
    if (b >= s.de && b < s.a && s.nature === "drop") {
      const d = (b - s.de) % 1;
      return Math.exp(-d * T * 12);
    }
  }
  return 0;
}

function transition(sortant, entrant, type, f, o = {}) {
  const [c, x] = toile("transition", W, H);
  const e = borne(f);
  switch (type) {
    case "losange": {
      // Le vide de la Tresse s'ouvre : on passe À TRAVERS.
      x.drawImage(sortant, 0, 0);
      x.save();
      masqueLosange(x, W, H, acc.entree3(e) * 1.05, W / 2, H / 2);
      x.clip();
      x.drawImage(entrant, 0, 0);
      x.restore();
      break;
    }
    case "claustra": {
      x.drawImage(sortant, 0, 0);
      x.save();
      masqueClaustra(x, W, H, acc.deux3(e), { origine: o.origine || [0.5, 0.5] });
      x.clip();
      x.drawImage(entrant, 0, 0);
      x.restore();
      break;
    }
    case "fouet": {
      // L'image sortante file d'un côté, l'entrante arrive de l'autre.
      const s = o.sens || -1, dx = acc.deux4(e) * W * s;
      x.drawImage(sortant, dx, 0);
      x.drawImage(entrant, dx - W * s, 0);
      break;
    }
    case "fouetV": {
      const s = o.sens || -1, dy = acc.deux4(e) * H * s;
      x.drawImage(sortant, 0, dy);
      x.drawImage(entrant, 0, dy - H * s);
      break;
    }
    case "zoom": {
      // L'image sortante grossit et s'efface, l'entrante arrive de loin.
      const z1 = 1 + acc.entree3(e) * 2.5, z2 = 0.7 + 0.3 * acc.sortie3(e);
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      x.save(); x.globalAlpha = borne(e * 1.8);
      x.translate(W / 2, H / 2); x.scale(z2, z2); x.drawImage(entrant, -W / 2, -H / 2); x.restore();
      x.save(); x.globalAlpha = 1 - borne(e * 1.6);
      x.translate(W / 2, H / 2); x.scale(z1, z1); x.drawImage(sortant, -W / 2, -H / 2); x.restore();
      break;
    }
    case "volet": {
      // Un volet de latérite qui passe.
      const pos = acc.deux3(e) * (W * 1.6) - W * 0.3;
      x.drawImage(sortant, 0, 0);
      x.save(); x.beginPath(); x.rect(0, 0, Math.max(0, pos - W * 0.15), H); x.clip(); x.drawImage(entrant, 0, 0); x.restore();
      x.fillStyle = C.laterite; x.fillRect(pos - W * 0.15, 0, W * 0.15, H);
      break;
    }
    case "coupe":
      x.drawImage(entrant, 0, 0);
      break;
    case "fondu":
    default:
      x.drawImage(sortant, 0, 0);
      x.globalAlpha = e; x.drawImage(entrant, 0, 0); x.globalAlpha = 1;
  }
  return c;
}

export function dessiner(sortie, t, n) {
  const b = t / T;
  let i = PLANS.findIndex((p) => b >= p.de && b < p.a);
  if (i < 0) i = PLANS.length - 1; // la queue : le dernier plan tient
  const plan = PLANS[i];
  // Le rembobinage : le film se rejoue lui-même à l'envers, de plus en plus
  // vite, jusqu'à son début. Ce ne sont pas des images nouvelles : ce sont
  // les images d'avant, recalculées.
  if (plan.rembobine) {
    const u = borne((b - plan.de) / (plan.a - plan.de));
    const bSource = plan.de * (1 - Math.pow(u, plan.rembobine.courbe || 1.6)) - 1e-6;
    dessiner(sortie, Math.max(0, bSource) * T, n);
    voileRembobinage(sortie, u, n);
    return;
  }
  const gel = gele(plan, b);
  const bRendu = gel ? plan.de + plan.gel.de - 1e-6 : b;
  let image = rendrePlan("plan", plan, bRendu, n);
  const transFx = {};
  const tr = plan.transition;
  if (tr && i > 0 && b < plan.de + tr.duree) {
    const f = (b - plan.de) / tr.duree;
    const avant = rendrePlan("plan-avant", PLANS[i - 1], b, n);
    image = transition(avant, image, tr.type, f, tr);
    const cloche = Math.sin(Math.PI * borne(f));
    if (tr.type === "fouet") transFx.fouet = { dx: cloche * W * 0.18 };
    if (tr.type === "fouetV") transFx.fouet = { dy: cloche * H * 0.18 };
    if (tr.type === "zoom") transFx.zoomFlou = cloche * 0.25;
    if (tr.glitch) transFx.glitch = cloche * tr.glitch;
    if (tr.type !== "coupe") { transFx.fuite = cloche * 0.35; transFx.phaseFuite = f; }
  }
  const ev = gel ? { flash: 0, secousse: 0, aberration: 0, glitch: 0, zoom: 0 } : effetsDuConducteur(b);
  const pul = pulsation(b);
  const fx = gel ? { aberration: 0, lueur: 0, vignette: 0, grain: 0, pousse: 0, pulsation: 0, bandes: 0 }
    : plan.fx ? plan.fx({ b, l: b - plan.de, p: (b - plan.de) / (plan.a - plan.de), t, T }) || {} : {};
  const secousse = ev.secousse * H * 0.012 + (fx.secousse || 0);
  // Rien ne reste immobile : chaque plan avance lentement vers nous.
  const pousse = fx.pousse ?? 0.035 * acc.deux3(borne((b - plan.de) / (plan.a - plan.de)));
  // Les bandes cinéma pendant l'ouverture, qui s'effacent au coup de la révélation.
  const hb = H > W ? 0 : 0.095; // en vertical, pas de bandes : l'écran du téléphone est déjà étroit
  const bandes = fx.bandes ?? (b < COND.bandesJusqua ? hb : hb * (1 - acc.sortieExpo(borne((b - COND.bandesJusqua) / 2))));
  postProduire(image, sortie, {
    camera: {
      x: bruit1(t * 11, 3) * secousse,
      y: bruit1(t * 11, 7) * secousse,
      rot: bruit1(t * 7, 9) * ev.secousse * 0.004,
      zoom: 1 + ev.zoom + pul * (fx.pulsation ?? 0.011) + (fx.zoom || 0) + pousse + (secousse > 0.5 ? 0.02 : 0),
    },
    zoomFlou: (transFx.zoomFlou || 0) + (fx.zoomFlou || 0),
    centre: fx.centre,
    fouet: transFx.fouet,
    glitch: Math.max(ev.glitch, transFx.glitch || 0, fx.glitch || 0),
    graine: n,
    aberration: (fx.aberration ?? 1.2) + ev.aberration,
    lueur: fx.lueur ?? 0.25,
    seuil: fx.seuil,
    flash: { alpha: Math.max(ev.flash, fx.flash || 0), couleur: fx.couleurFlash || ev.couleurFlash || "#fff5ea" },
    fuite: Math.max(transFx.fuite || 0, ev.fuite || 0, fx.fuite || 0),
    phaseFuite: transFx.phaseFuite ?? ev.phaseFuite ?? 0.5,
    vignette: fx.vignette ?? 0.55,
    grain: fx.grain ?? 0.06,
    lignes: fx.lignes || 0,
    bandes,
    n,
  });

  // LA VÉRITÉ : ce qui est vrai ne tremble pas. Les chiffres justes, la
  // marque, l'interface réelle se dessinent APRÈS la post-production : ni
  // glitch, ni aberration, ni grain, ni secousse ne les touchent.
  // La vérité suit la CAMÉRA (la poussée, la pulsation, les fouets) — ce sont
  // des mouvements physiques — mais jamais la secousse ni les effets.
  const o = sortie.getContext("2d");
  const zoomCamera = gel ? 1 : 1 + ev.zoom + pul * (fx.pulsation ?? 0.011) + (fx.zoom || 0) + pousse;
  const poserVerite = (pl, alpha, dx = 0, dy = 0) => {
    if (!pl.verite || alpha <= 0.001) return;
    o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = alpha;
    o.translate(W / 2 + dx, H / 2 + dy); o.scale(zoomCamera, zoomCamera); o.translate(-W / 2, -H / 2);
    // La vérité n'est jamais gelée : pendant le gel du monde, elle continue de vivre.
    pl.verite(o, local(pl, b, n), pl);
    o.restore();
  };
  if (tr && i > 0 && b < plan.de + tr.duree && tr.type !== "coupe") {
    const f = borne((b - plan.de) / tr.duree);
    if (tr.type === "fouet" || tr.type === "fouetV") {
      const sens = tr.sens || -1, d = acc.deux4(f) * (tr.type === "fouet" ? W : H) * sens;
      const [ax, ay] = tr.type === "fouet" ? [d, 0] : [0, d];
      const [bx, by] = tr.type === "fouet" ? [d - W * sens, 0] : [0, d - H * sens];
      poserVerite(PLANS[i - 1], 1, ax, ay);
      poserVerite(plan, 1, bx, by);
    } else {
      poserVerite(PLANS[i - 1], 1 - acc.sortie3(borne(f * 2)));
      poserVerite(plan, acc.entree3(borne(f * 1.4 - 0.4)));
    }
  } else poserVerite(plan, 1);
}
