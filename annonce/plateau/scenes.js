// Les scènes. Chacune est une fonction (x, l, o) : x le contexte, l le temps
// local (voir montage.js : l.p de 0 à 1 dans le plan, l.l en temps musicaux,
// l.s en secondes, l.u le petit côté), o les réglages du plan.
//
// Règle de la charte (docs/IDENTITE.md §6) tenue partout : la marque est un
// aplat mat. Les effets vivent dans les transitions, la caméra, la lumière du
// décor — jamais sur le symbole ni sur le mot une fois posés.

import { acc, anim, avance, borne, bruit1, hache2, melange, montant } from "./outils.js";
import { C, dessinerTresse, dessinerTresseCadre, pointTresse, dessinerMot, MOT, CAP, RATIO_H, RATIO_V, ECART, SYM_H, BAS, HAUT, CX, toile, geometrie } from "./marque.js";
import { POLICE, CHASSE, MARQUE, rr, telephone, ecranAccueil, notification, pave, recu, icone, PT_W, PT_H } from "./interface.js";
import { montee, decode, machine, frappe, compteur, ajuster, police, couper, trait } from "./typo.js";
import { sim, boitier, globe, arcGlobe, ondes, projeter, vecteur } from "./objets.js";

export const DOUALA = [4.05, 9.70];

// --- Les fonds ------------------------------------------------------------------------
export function fondEncre(x, l, o = {}) {
  x.fillStyle = o.couleur || C.encre;
  x.fillRect(0, 0, l.W, l.H);
  if (o.lumiere !== false) {
    // Une lumière de décor, très basse, qui respire — pas sur la marque.
    const g = x.createRadialGradient(l.W * (o.lx ?? 0.5), l.H * (o.ly ?? 0.45), 0, l.W * (o.lx ?? 0.5), l.H * (o.ly ?? 0.45), Math.max(l.W, l.H) * 0.7);
    g.addColorStop(0, `rgba(208,138,99,${0.07 * (o.force ?? 1)})`);
    g.addColorStop(1, "rgba(208,138,99,0)");
    x.fillStyle = g; x.fillRect(0, 0, l.W, l.H);
  }
}

export function fondSable(x, l) {
  x.fillStyle = C.sable; x.fillRect(0, 0, l.W, l.H);
}

// Une grille de points qui dérive : le décor « données » des plans techniques.
export function grillePoints(x, l, o = {}) {
  const pas = o.pas || l.u * 0.045;
  x.fillStyle = o.couleur || "rgba(244,239,233,0.08)";
  const dy = (l.t * (o.vitesse || 12)) % pas;
  for (let yy = -pas; yy < l.H + pas; yy += pas)
    for (let xx = 0; xx < l.W + pas; xx += pas) x.fillRect(xx, yy + dy, 2, 2);
}

// --- La révélation : la Tresse se tresse -------------------------------------------------
// Les deux brins partent du même point, se croisent, se rejoignent en bas.
// Les coupes du passage dessous sont fixes dès la première image : le
// tressage est juste à chaque instant, jamais un « gribouillis ».
export function revelation(x, l, o = {}) {
  if (o.fond !== false) fondEncre(x, l, { force: 1.4 });
  const u = l.u;
  const trace = acc.deux3(avance(l.l, o.debutTrace ?? 0, o.finTrace ?? 2));
  const h = u * (o.taille ?? 0.46) * (1 + 0.04 * acc.sortie3(avance(l.l, 0, 8)));
  const cx = l.W / 2, cy = l.H / 2;
  // Des étincelles qui suivent la tête de chaque brin tant qu'il se trace.
  const geo = { x: cx, y: cy, h };
  if (trace > 0 && trace < 1) {
    for (const brin of ["a", "b"]) {
      const [px, py] = pointTresse(geo, brin, trace);
      for (let k = 0; k < 14; k++) {
        const age = hache2(k, 3) * 0.5;
        const [qx, qy] = pointTresse(geo, brin, Math.max(0, trace - age * 0.25));
        const a = (1 - age / 0.5) * 0.8;
        x.fillStyle = `rgba(255,214,180,${a})`;
        const r = u * 0.004 * (1 - age);
        x.beginPath(); x.arc(qx + (hache2(k, 9) - 0.5) * u * 0.02, qy + (hache2(k, 11) - 0.5) * u * 0.02, r, 0, 7); x.fill();
      }
      if (o.halo !== false) {
        const halo = x.createRadialGradient(px, py, 0, px, py, u * 0.06);
        halo.addColorStop(0, "rgba(255,220,190,0.55)"); halo.addColorStop(1, "rgba(255,220,190,0)");
        x.fillStyle = halo; x.beginPath(); x.arc(px, py, u * 0.06, 0, 7); x.fill();
      }
    }
  }
  if (o.tresse !== false) dessinerTresse(x, { x: cx, y: cy, h, fin: trace, couleur: o.couleur || C.lateriteClair });
}
// La Tresse seule, pour la couche vérité : la marque se trace sans effet.
export function revelationTresse(x, l, o = {}) {
  const trace = acc.deux3(avance(l.l, o.debutTrace ?? 0, o.finTrace ?? 2));
  const h = l.u * (o.taille ?? 0.46) * (1 + 0.04 * acc.sortie3(avance(l.l, 0, 8)));
  dessinerTresse(x, { x: l.W / 2, y: l.H / 2, h, fin: trace, couleur: o.couleur || C.lateriteClair });
}

// Le verrouillage qui se forme : le symbole glisse à sa place, le mot se
// découvre lettre à lettre derrière un masque. L'interlettrage ne s'anime pas.
export function verrouillageAnime(x, l, o = {}) {
  const u = l.u;
  // En vertical, le verrouillage doit tenir avec la poussée de la caméra : 76 % de la largeur.
  const cap = o.cap || (l.v ? u * 0.098 : u * 0.1);
  const hSym = RATIO_H * cap, largeurSym = (18 / SYM_H) * hSym, ecart = ECART * cap;
  const largeurMot = MOT.largeur * cap / CAP;
  const total = largeurSym + ecart + largeurMot;
  const cx = o.x ?? l.W / 2, cy = o.y ?? l.H / 2;
  const f = o.f ?? 1; // 0 : symbole seul au centre ; 1 : verrouillage posé
  const e = acc.deux4(borne(f));
  const hDepart = o.hDepart || u * 0.46, hFin = hSym * (BAS - HAUT) / SYM_H;
  const symX = melange(cx, cx - total / 2 + largeurSym / 2, e);
  dessinerTresse(x, { x: symX, y: cy, h: melange(hDepart, hFin, e), couleur: o.couleurSym || C.lateriteClair });
  const mx = cx - total / 2 + largeurSym + ecart;
  // Le mot attend que le symbole ait presque fini de glisser : sinon sa
  // première lettre monte PAR-DESSUS la Tresse encore en route.
  const pm = o.mot ?? borne((f - 0.72) / 0.28);
  if (pm > 0) {
    x.save();
    x.beginPath(); x.rect(mx - cap * 0.2, cy - cap, largeurMot + cap * 0.4, cap * 2); x.clip();
    dessinerMot(x, mx, cy + cap / 2, cap, o.couleurMot || C.clair, (i, n) => {
      const d = acc.sortie4(borne(pm * 1.6 - i * 0.12));
      return { dy: (1 - d) * cap * 1.3, alpha: d > 0 ? 1 : 0 };
    });
    x.restore();
  }
  return { total, cap };
}

// --- La carte de fin -----------------------------------------------------------------------
// Lisible sur un téléphone, dans un fil : la devise à 6 % du petit côté (et
// non 4), « BIENTÔT » en grand, en latérite, au-dessus de la légende des
// applications. o.rythme = [fin du tracé, début du mot, début et fin de la devise].
export function carteFin(x, l, o = {}) {
  fondSable(x, l);
  const u = l.u;
  const [finTrace, debutMot, debutDevise, finDevise] = o.rythme || [1.5, 0.4, 1.5, 3.8];
  // Un tracé nul : la Tresse est déjà posée à la coupe (elle vient d'être
  // tracée) ; seules les lettres du mot remontent.
  const arr = finTrace <= 0.05 ? 1 : acc.sortie4(avance(l.l, 0, 0.6));
  const trace = finTrace <= 0.05 ? 1 : acc.deux3(avance(l.l, 0, finTrace));
  const lettre = (cap) => (i) => {
    const d = acc.sortie4(borne(avance(l.l, debutMot, debutMot + 1.2) * 1.6 - i * 0.12));
    return { dy: (1 - d) * cap * 0.4, alpha: d };
  };
  let basMarque;
  x.save(); x.globalAlpha = arr;
  if (l.v) {
    // Le verrouillage vertical de la charte (totem-logo-vertical.svg) : le
    // symbole à 2,1 fois la capitale, le mot dessous, à 0,78 capitale d'écart.
    const cap = l.W * 0.1;
    const hSym = RATIO_V * cap, largeurMot = MOT.largeur * cap / CAP;
    const ySym = l.H * 0.22;
    dessinerTresse(x, { x: l.W / 2, y: ySym, h: hSym * (BAS - HAUT) / SYM_H, couleur: C.laterite, fin: trace });
    const yMot = ySym + hSym / 2 + ECART * cap + cap;
    dessinerMot(x, l.W / 2 - largeurMot / 2, yMot, cap, C.encre, lettre(cap));
    basMarque = yMot;
  } else {
    const cap = u * 0.08;
    const hSym = RATIO_H * cap, largeurSym = (18 / SYM_H) * hSym, ecart = ECART * cap;
    const largeurMot = MOT.largeur * cap / CAP;
    const total = largeurSym + ecart + largeurMot;
    const cy = l.H * 0.3;
    const g = l.W / 2 - total / 2;
    dessinerTresse(x, { x: g + largeurSym / 2, y: cy, h: hSym * (BAS - HAUT) / SYM_H, couleur: C.laterite, fin: trace });
    dessinerMot(x, g + largeurSym + ecart, cy + cap / 2, cap, C.encre, lettre(cap));
    basMarque = cy + cap * 1.2;
  }
  x.restore();
  // La devise, mot à mot, hors de la zone de protection. Trois lignes en vertical.
  const devise = o.devise || (l.v
    ? ["Le totem reste au pays ;", "à travers lui, vous", "agissez à distance."]
    : ["Le totem reste au pays ;", "à travers lui, vous agissez à distance."]);
  const plusLongue = devise.slice().sort((a, b) => b.length - a.length)[0];
  const taille = ajuster(x, plusLongue, l.W * (l.v ? 0.8 : 0.8), u * (l.v ? 0.066 : 0.06), 600);
  // montee() centre le bloc sur y : on descend d'une demi-hauteur de bloc.
  const yDevise = basMarque + u * (l.v ? 0.24 : 0.14) + (devise.length - 1) * taille * 1.3 / 2;
  montee(x, devise.join("\n"), avance(l.l, debutDevise, finDevise), {
    x: l.W / 2, y: yDevise, taille, graisse: 600, couleur: C.encre, interligne: 1.3, centreV: false, decalage: 0.07,
  });
  if (o.pied) {
    const p = avance(l.l, o.piedA ?? 4, (o.piedA ?? 4) + 0.3);
    if (p > 0) frappe(x, o.pied, p, { x: l.W / 2, y: l.H * (l.v ? 0.7 : 0.8), taille: u * (l.v ? 0.085 : 0.075), graisse: 800, couleur: C.laterite, depuis: 1.4, espace: 0.12 });
  }
}

// --- Le SMS, tel qu'il arrive ----------------------------------------------------------------
// Une bulle sombre, le texte en chasse fixe qui s'écrit, l'heure.
export function bulleSms(x, cx, cy, w, texte, p, o = {}) {
  const taille = o.taille || w * 0.042;
  police(x, taille, 500, CHASSE);
  const lignes = couper(x, texte, w - taille * 2.4);
  const inter = taille * 1.45;
  const h = lignes.length * inter + taille * 3.2;
  const e = acc.sortie4(borne(p * 4));
  x.save();
  x.globalAlpha *= e * (o.alpha ?? 1);
  x.translate(cx, cy + (1 - e) * taille * 2);
  if (o.echelle) x.scale(o.echelle, o.echelle);
  rr(x, -w / 2, -h / 2, w, h, taille * 0.9);
  x.fillStyle = o.fond || "rgba(30,31,36,0.96)"; x.fill();
  x.strokeStyle = "rgba(244,239,233,0.14)"; x.lineWidth = 1.5; x.stroke();
  police(x, taille * 0.78, 600, POLICE);
  x.fillStyle = "rgba(244,239,233,0.55)"; x.textAlign = "left";
  x.fillText(o.expediteur || "MobileMoney", -w / 2 + taille * 1.2, -h / 2 + taille * 1.6);
  x.textAlign = "right"; x.fillText(o.heure || "23:18", w / 2 - taille * 1.2, -h / 2 + taille * 1.6);
  machine(x, texte, o.ecrit ?? borne(p * 1.3), {
    x: -w / 2 + taille * 1.2, y: -h / 2 + taille * 3.1, taille, largeur: w - taille * 2.4,
    couleur: C.clair, t: o.t, curseur: o.curseur ?? p < 0.95, interligne: 1.45,
  });
  x.restore();
  return h;
}

// Un carton : une phrase qui monte, centrée.
export function carton(x, l, texte, o = {}) {
  const u = l.u;
  const largeur = l.W * (l.v ? 0.8 : 0.78);
  const taille = o.taille ? o.taille * u : ajuster(x, texte.split("\n").sort((a, b) => b.length - a.length)[0], largeur, u * (o.max || 0.13), o.graisse || 700);
  montee(x, texte, o.p ?? avance(l.l, o.de ?? 0, o.a ?? 1), {
    x: o.x ?? l.W / 2, y: o.y ?? l.H / 2, taille, graisse: o.graisse || 700,
    couleur: o.couleur || C.clair, sortie: o.sortie, accent: o.accent, espace: o.espace ?? -0.02,
  });
}

// --- La Terre et la distance ---------------------------------------------------------------
export function distance(x, l, o = {}) {
  fondEncre(x, l, { force: 0.6 });
  const u = l.u;
  const r = (l.v ? l.W * 0.46 : u * 0.42) * melange(1, o.rapproche ?? 1, acc.deux3(l.p));
  const g = {
    x: l.v ? l.W / 2 : l.W * 0.36, y: l.v ? l.H * 0.4 : l.H * 0.52, r,
    lat: melange(o.lat0 ?? 30, o.lat1 ?? 24, acc.deux3(l.p)), lon: melange(o.lon0 ?? -30, o.lon1 ?? -8, acc.deux3(l.p)),
  };
  globe(x, g);
  const villes = o.villes || [[48.86, 2.35]];
  const [dx, dy] = projeter(vecteur(...DOUALA), g);
  ondes(x, dx, dy, u * 0.08, l.s, { couleur: C.lateriteClair, alpha: 0.9, largeur: 2 });
  x.beginPath(); x.arc(dx, dy, u * 0.008, 0, 7); x.fillStyle = C.lateriteClair; x.fill();
  villes.forEach((v, i) => {
    const p = acc.deux3(avance(l.l, (o.debutArc ?? 0.5) + i * 0.25, (o.debutArc ?? 0.5) + i * 0.25 + (o.dureeArc ?? 2)));
    const vit = 0.45 + hache2(i, 41) * 0.3;
    const imp = o.impulsions ? [l.s * vit + hache2(i, 42), -(l.s * vit * 0.8) + hache2(i, 43) + 0.5] : null;
    const bout = arcGlobe(x, g, DOUALA, v, p, { couleur: C.lateriteClair, largeur: Math.max(2, u * 0.003), hauteur: 0.14, impulsions: imp });
    if (p > 0.98) { x.beginPath(); x.arc(bout[0], bout[1], u * 0.007, 0, 7); x.fillStyle = C.clair; x.fill(); }
  });
  return g;
}

// --- Il lit : le SMS se découpe en champs -------------------------------------------------
// Le texte brut en haut ; un balayage surligne ce que le lecteur retient
// (analyse_sms.py) ; chaque morceau part se ranger dans une fiche. Les
// libellés sont ceux de la fiche d'un SMS dans l'application.
export function disposer(x, texte, largeur) {
  const lignes = [];
  let debut = 0;
  for (const l of couper(x, texte, largeur)) {
    const i = texte.indexOf(l, debut);
    lignes.push({ texte: l, debut: i });
    debut = i + l.length;
  }
  return lignes;
}
export function boiteDe(x, lignes, i0, i1, ox, oy, inter) {
  for (let k = 0; k < lignes.length; k++) {
    const L = lignes[k];
    if (i0 >= L.debut && i0 < L.debut + L.texte.length) {
      const a = x.measureText(L.texte.slice(0, i0 - L.debut)).width;
      const b = x.measureText(L.texte.slice(0, Math.min(i1, L.debut + L.texte.length) - L.debut)).width;
      return { x: ox + a, y: oy + k * inter, w: b - a };
    }
  }
  return null;
}

export function lecture(x, l, o) {
  const u = l.u, v = l.W / l.H < 1.3; // presque carré ou vertical : le texte au-dessus, la fiche dessous
  const texte = o.texte;
  const champs = o.champs; // [{ cle, libelle, valeur, couleur }]
  // En vertical, le texte en haut à 5 % de la largeur ; la fiche se pose
  // juste dessous, et le texte brut pâlit quand elle est remplie.
  const taille = v ? Math.min(l.W * 0.05, l.H * 0.04) : u * 0.03;
  const largeur = v ? l.W * 0.84 : l.W * 0.44;
  police(x, taille, 500, CHASSE);
  const lignes = disposer(x, texte, largeur);
  const inter = taille * 1.55;
  const ox = v ? l.W * 0.08 : l.W * 0.06, oy = v ? l.H * 0.06 + inter * 1.3 : l.H * 0.34;
  // Le texte brut.
  const pTexte = avance(l.l, 0, o.dureeTexte ?? 1);
  police(x, taille * 0.8, 600, POLICE); x.fillStyle = "rgba(244,239,233,0.45)"; x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.letterSpacing = `${taille * 0.12}px`; x.fillText(o.entete || "SMS REÇU · MTN ·8901 · 23:18", ox, oy - inter * 1.3); x.letterSpacing = "0px";
  police(x, taille, 500, CHASSE);
  const nVis = Math.floor(texte.length * acc.sortie3(pTexte));
  const pali = v ? 0.72 * avance(l.l, (o.debutFiche ?? 1.8) + 0.9, (o.debutFiche ?? 1.8) + 1.4) : 0;
  lignes.forEach((L, k) => {
    const vis = Math.max(0, Math.min(L.texte.length, nVis - L.debut));
    x.fillStyle = `rgba(244,239,233,${0.9 - pali})`;
    x.fillText(L.texte.slice(0, vis), ox, oy + k * inter);
  });
  // Le balayage : une ligne de lumière qui descend le texte.
  const pScan = avance(l.l, o.debutScan ?? 1, o.finScan ?? 2);
  if (pScan > 0 && pScan < 1) {
    const sy = oy - inter + pScan * (lignes.length + 0.5) * inter;
    const g = x.createLinearGradient(0, sy - inter, 0, sy + inter * 0.3);
    g.addColorStop(0, "rgba(208,138,99,0)"); g.addColorStop(1, "rgba(208,138,99,0.35)");
    x.fillStyle = g; x.fillRect(ox - taille, sy - inter, largeur + taille * 2, inter * 1.3);
    x.fillStyle = C.lateriteClair; x.fillRect(ox - taille, sy + inter * 0.3, largeur + taille * 2, 2);
  }
  // Les surlignages, puis le vol vers la fiche.
  const fx = v ? l.W * 0.08 : l.W * 0.56, fy = v ? oy + (lignes.length - 1) * inter + taille * 1.4 : l.H * 0.22;
  const fw = v ? l.W * 0.84 : l.W * 0.38, rang = v ? Math.min(u * 0.13, l.H * 0.1) : u * 0.1;
  const pFiche = acc.sortie4(avance(l.l, o.debutFiche ?? 1.8, (o.debutFiche ?? 1.8) + 0.6));
  if (pFiche > 0) {
    x.save(); x.globalAlpha = pFiche;
    rr(x, fx, fy, fw, rang * (champs.length + 0.9), u * 0.018); x.fillStyle = "#1e1f24"; x.fill();
    x.strokeStyle = "rgba(244,239,233,0.14)"; x.lineWidth = 1.5; x.stroke();
    x.restore();
  }
  champs.forEach((c, k) => {
    police(x, taille, 500, CHASSE);
    const i0 = texte.indexOf(c.cherche);
    const bte = i0 >= 0 ? boiteDe(x, lignes, i0, i0 + c.cherche.length, ox, oy, inter) : null;
    const pSurl = acc.sortie3(avance(l.l, (o.debutScan ?? 1) + k * 0.2, (o.debutScan ?? 1) + k * 0.2 + 0.3));
    if (bte && pSurl > 0) {
      x.save();
      x.globalAlpha = 0.9;
      rr(x, bte.x - 4, bte.y - taille * 1.0, bte.w * pSurl + 8, taille * 1.35, 4);
      x.strokeStyle = c.couleur || C.lateriteClair; x.lineWidth = 2; x.stroke();
      x.fillStyle = "rgba(208,138,99,0.12)"; x.fill();
      x.restore();
    }
    const pVol = acc.deux3(avance(l.l, (o.debutFiche ?? 1.8) + 0.2 + k * 0.18, (o.debutFiche ?? 1.8) + 0.8 + k * 0.18));
    if (pVol > 0 && bte) {
      const cibleX = fx + fw * 0.06, cibleY = fy + rang * (k + 0.95);
      const px = melange(bte.x, cibleX + fw * 0.44, pVol), py = melange(bte.y, cibleY, pVol);
      // Le libellé de la fiche.
      police(x, taille * 0.72, 600, POLICE); x.fillStyle = `rgba(244,239,233,${0.5 * pVol})`;
      x.letterSpacing = `${taille * 0.1}px`; x.textAlign = "left";
      x.fillText(c.libelle.toUpperCase(), cibleX, cibleY);
      x.letterSpacing = "0px";
      // La valeur qui vole et se pose.
      police(x, melange(taille, taille * 1.2, pVol), 600, pVol > 0.5 ? POLICE : CHASSE);
      x.fillStyle = c.couleur || C.clair;
      x.fillText(pVol > 0.5 ? c.valeur : c.cherche, px, py);
      if (k < champs.length - 1 && pVol > 0.9) { x.fillStyle = "rgba(244,239,233,0.08)"; x.fillRect(cibleX, cibleY + rang * 0.4, fw * 0.88, 1); }
    }
  });
  // L'étiquette de nature.
  const pNat = acc.sortie4(avance(l.l, o.debutNature ?? 3.2, (o.debutNature ?? 3.2) + 0.4));
  if (pNat > 0 && o.nature) {
    police(x, taille * 0.9, 600, POLICE);
    const tw = x.measureText(o.nature).width + taille * 1.6;
    const nx = fx + fw - tw - fw * 0.05, ny = fy - taille * 2.2;
    x.save(); x.globalAlpha = pNat; x.translate(nx + tw / 2, ny + taille * 0.8); x.scale(0.8 + 0.2 * pNat, 0.8 + 0.2 * pNat);
    rr(x, -tw / 2, -taille * 0.8, tw, taille * 1.6, taille * 0.8); x.fillStyle = "#cff7d3"; x.fill();
    x.fillStyle = C.positif; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(o.nature, 0, 1);
    x.restore();
  }
}

// --- Le recollage : deux morceaux, un seul message ----------------------------------------
export function recollage(x, l, o = {}) {
  const u = l.u, v = l.W / l.H < 1.3;
  const a = o.a || "Vous avez recu 13", b1 = "0000", b2 = " FCFA de KAMGA Eric.";
  const b = b1 + b2;
  const colle = acc.deux4(avance(l.l, o.debutColle ?? 1.5, (o.debutColle ?? 1.5) + 0.8));
  const entreeA = acc.sortie4(avance(l.l, 0.1, 0.6)), entreeB = acc.sortie4(avance(l.l, 0.6, 1.1));
  // En étroit, le message recollé tient sur deux lignes : « …recu 130000 » / « FCFA de KAMGA Eric. »
  const taille = v ? ajuster(x, a + b1, l.W * 0.84, u * 0.075, 500, CHASSE) : ajuster(x, a + b, l.W * 0.8, u * 0.05, 500, CHASSE);
  police(x, taille, 500, CHASSE);
  const wa = x.measureText(a).width, wb1 = x.measureText(b1).width, wb = x.measureText(b).width;
  const cy = l.H * (v ? 0.34 : 0.44);
  let xa, ya, xb, yb;
  if (v) {
    const ligne1 = x.measureText(a + b1).width;
    xa = melange(l.W * 0.08, l.W / 2 - ligne1 / 2, colle); ya = melange(cy - taille * 1.8, cy, colle);
    xb = melange(l.W * 0.08, l.W / 2 - ligne1 / 2 + wa, colle); yb = melange(cy + taille * 1.2, cy, colle);
  } else {
    const total = wa + wb;
    xa = melange(l.W * 0.5 - wa - u * 0.06, l.W / 2 - total / 2, colle); ya = melange(cy - u * 0.12, cy, colle);
    const xb0 = Math.min(l.W * 0.5 + u * 0.06, l.W * 0.96 - wb - taille * 0.6);
    xb = melange(xb0, l.W / 2 - total / 2 + wa, colle); yb = melange(cy + u * 0.12, cy, colle);
  }
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  const etiquette = (s_, px, py, e) => {
    police(x, taille * 0.5, 600, POLICE); x.fillStyle = `rgba(244,239,233,${0.55 * e * (1 - colle)})`;
    x.letterSpacing = `${taille * 0.06}px`; x.fillText(s_, px, py - taille * 1.25); x.letterSpacing = "0px";
  };
  const cadre = (px, py, w, e) => {
    x.save(); x.globalAlpha = e * (1 - colle * 0.9);
    rr(x, px - taille * 0.5, py - taille * 1.1, w + taille, taille * 1.6, taille * 0.3);
    x.strokeStyle = "rgba(244,239,233,0.25)"; x.lineWidth = 1.5; x.stroke(); x.restore();
  };
  if (entreeA > 0) {
    cadre(xa, ya, wa, entreeA); etiquette("MORCEAU 1 / 2", xa, ya, entreeA);
    police(x, taille, 500, CHASSE); x.fillStyle = `rgba(244,239,233,${entreeA})`; x.fillText(a, xa, ya);
  }
  if (entreeB > 0) {
    const wCadre = v ? Math.max(wb1, x.measureText(b2.trim()).width) : wb;
    cadre(xb, yb, wCadre, entreeB); etiquette("MORCEAU 2 / 2", xb, yb, entreeB);
    police(x, taille, 500, CHASSE); x.fillStyle = `rgba(244,239,233,${entreeB})`;
    if (v) {
      x.fillText(b1, xb, yb);
      const l2 = x.measureText(b2.trim()).width;
      x.fillText(b2.trim(), melange(xb, l.W / 2 - l2 / 2, colle), yb + taille * 1.35);
    } else x.fillText(b, xb, yb);
  }
  // Le montant, relu : « 13 », faux, tremble et se fait barrer ; 130 000 se pose.
  const pRes = acc.sortie4(avance(l.l, (o.debutColle ?? 1.5) + 1, (o.debutColle ?? 1.5) + 1.5));
  if (pRes > 0) {
    const ry = cy + (v ? taille * 4.4 : u * 0.2);
    const tr = v ? l.W * 0.075 : u * 0.06;
    police(x, tr, 700, POLICE);
    x.textAlign = "center";
    x.save(); x.globalAlpha = pRes;
    const g = l.W / 2 - (v ? l.W * 0.3 : u * 0.24);
    const trem = (1 - avance(l.l, (o.debutColle ?? 1.5) + 1.6, (o.debutColle ?? 1.5) + 1.9)) * u * 0.004;
    x.fillStyle = "rgba(255,90,79,0.45)"; x.fillText("13", g + 3 + hache2(l.n, 1) * trem * 2 - trem, ry);
    x.fillStyle = "rgba(244,239,233,0.5)"; x.fillText("13", g + hache2(l.n, 2) * trem * 2 - trem, ry);
    trait(x, g - tr * 0.6, ry - tr * 0.32, g + tr * 0.6, ry - tr * 0.32, avance(l.l, (o.debutColle ?? 1.5) + 1.5, (o.debutColle ?? 1.5) + 1.8), C.negatif, 4);
    x.fillStyle = C.clair; x.fillText("→", l.W / 2 - (v ? l.W * 0.13 : u * 0.09), ry);
    x.fillStyle = C.lateriteClair; x.textAlign = "left";
    x.fillText("130 000 FCFA", l.W / 2 - (v ? l.W * 0.05 : u * 0.03), ry);
    x.restore();
  }
}

// --- La claustra : le mur ajouré -----------------------------------------------------------
// Les colonnes de la Tresse, voisines décalées d'un demi-lobe, comme le
// panneau totem-motif.svg — mais qui se construisent.
export function claustra(x, l, o = {}) {
  const u = l.u;
  const colonne = o.colonne || (l.v ? l.W / 5 : l.W / 9);
  const k = colonne / 18; // 18 unités de grille = 2·AMP + BRIN
  const lobe = (BAS - HAUT) / 3; // un lobe du symbole, en unités
  const nLobes = Math.ceil(l.H / (lobe * k)) + 4;
  const nCol = Math.ceil(l.W / colonne) + 1;
  const decalageVertical = (o.defile || 0) * lobe * k * 2;
  const geo = geometrie(nLobes, 0, nLobes * lobe);
  for (let c = 0; c < nCol; c++) {
    const cx = c * colonne + (o.x0 || 0);
    const dc = Math.abs(c - (nCol - 1) / 2) / ((nCol - 1) / 2);
    const pc = acc.deux3(borne(((o.p ?? 1) * 1.6 - dc * 0.6)));
    if (pc <= 0) continue;
    const decal = (c % 2 ? lobe / 2 : 0) * k;
    const hauteur = nLobes * lobe * k;
    const cy = hauteur / 2 - lobe * k * 2 - decal + (decalageVertical % (lobe * k * 2));
    dessinerTresse(x, { x: cx, y: cy, h: hauteur, geo, lobes: nLobes, couleur: o.couleur || C.laterite, fin: pc, alpha: o.alpha });
  }
}

// --- Le menu USSD devient des boutons ----------------------------------------------------------
// À gauche (ou en haut), ce que le réseau envoie : un menu en texte, qu'on
// parcourt en tapant des chiffres. Puis chaque ligne devient un bouton.
// Le menu est celui que rejoue le faux nuage (web/scripts/faux-nuage.mjs).
export const MENU_MTN = ["MTN MoMo", "1. Transfert d'argent", "2. Retrait", "3. Paiement", "4. Mon compte", "5. Mon solde"];
export function menuBoutons(x, l, o = {}) {
  const u = l.u, v = l.v;
  const f = acc.deux4(avance(l.l, o.debutMue ?? 1.5, (o.debutMue ?? 1.5) + 1.2));
  const w = o.largeur ?? (v ? l.W * 0.8 : u * 0.62), cx = l.W / 2;
  const taille = w * 0.058, inter = taille * 1.9;
  const h0 = inter * MENU_MTN.length + taille * 2.5;
  const y0 = l.H / 2 - h0 / 2;
  // Le cadre du menu : un écran de téléphone d'avant, qui s'efface.
  x.save(); x.globalAlpha = 1 - f;
  rr(x, cx - w / 2, y0, w, h0, taille * 0.5); x.fillStyle = "#c9d3b0"; x.fill();
  x.restore();
  MENU_MTN.forEach((ligne, i) => {
    const titre = i === 0;
    const yA = y0 + taille * 1.9 + i * inter;
    const yB = l.H / 2 - (MENU_MTN.length * inter * 1.25) / 2 + i * inter * 1.25 + inter * 0.5;
    const e = acc.deux4(borne(f * 1.4 - i * 0.08));
    const yy = melange(yA, yB, e);
    const libelle = titre ? ligne : ligne.replace(/^\d\. /, "");
    if (!titre && e > 0) {
      x.save(); x.globalAlpha = e;
      rr(x, cx - w / 2, yy - inter * 0.45, w, inter * 0.95, 10);
      x.fillStyle = C.carte; x.fill(); x.strokeStyle = C.ligne; x.lineWidth = 1.5; x.stroke();
      icone(x, "chevron", cx + w / 2 - taille * 1.3, yy + inter * 0.02, taille * 0.9, C.texteDoux);
      x.restore();
    }
    police(x, taille * (titre ? 1.05 : 1), titre ? 700 : 500, e > 0.5 ? POLICE : CHASSE);
    x.fillStyle = e > 0.5 ? (titre ? C.clair : C.texte) : "#1f2a12";
    x.textAlign = "left"; x.textBaseline = "middle";
    x.fillText(e > 0.5 ? libelle : ligne, cx - w / 2 + taille * (e > 0.5 && !titre ? 1.1 : 0.9), yy);
  });
  if (f < 0.1) {
    police(x, taille, 500, CHASSE); x.fillStyle = "#1f2a12"; x.textAlign = "left";
    const curseur = Math.floor(l.s * 2.5) % 2 ? "_" : " ";
    x.fillText("Répondre : " + (o.saisie || "") + curseur, cx - w / 2 + taille * 0.9, y0 + h0 - taille * 1.1);
  }
  // Un doigt qui appuie sur « Transfert d'argent ».
  const pAppui = avance(l.l, o.appui ?? 3.2, (o.appui ?? 3.2) + 0.4);
  if (pAppui > 0 && pAppui < 1) {
    const yB = l.H / 2 - (MENU_MTN.length * inter * 1.25) / 2 + inter * 1.25 + inter * 0.5;
    const r = u * 0.03 * (1 + pAppui * 1.5);
    x.save(); x.globalAlpha = (1 - pAppui) * 0.6;
    x.beginPath(); x.arc(cx + w * 0.2, yB, r, 0, 7); x.fillStyle = C.lateriteClair; x.fill();
    x.restore();
  }
}

// --- L'écran verrouillé qui reçoit le SMS ----------------------------------------------------
// Le titre de la notification est le nom de la carte ; le corps, le SMS tel
// quel (totem/notification.py).
export function ecranVerrouille(x, l, o = {}) {
  const u = l.u, v = l.v;
  const h = o.h ?? (v ? l.H * 0.78 : l.H * 0.9);
  const vib = o.vibre ? Math.sin(l.s * 90) * u * 0.004 * Math.max(0, 1 - avance(l.l, o.vibre, o.vibre + 1.2)) * (l.l > o.vibre ? 1 : 0) : 0;
  const px = (o.x ?? l.W / 2) + vib, py = o.y ?? l.H / 2;
  if (o.ondes && l.l > (o.vibre ?? 0)) ondes(x, px, py, h * 0.7, l.s, { couleur: C.lateriteClair, alpha: 0.35, largeur: 2, periode: 1.1 });
  telephone(x, px, py, h, (e) => {
    const fond = e.createLinearGradient(0, 0, PT_W, PT_H);
    fond.addColorStop(0, "#2b2420"); fond.addColorStop(0.6, "#16171a"); fond.addColorStop(1, "#0f1012");
    e.fillStyle = fond; e.fillRect(0, 0, PT_W, PT_H);
    e.fillStyle = "rgba(255,255,255,0.9)"; e.textAlign = "center";
    e.font = `500 18px ${POLICE}`; e.fillText(o.date || "mardi 29 septembre", PT_W / 2, 118);
    e.font = `600 86px ${POLICE}`; e.fillText(o.heure || "23:18", PT_W / 2, 206);
    const pN = acc.sortie4(avance(l.l, o.notif ?? 0.5, (o.notif ?? 0.5) + 0.35));
    if (pN > 0) {
      e.save(); e.globalAlpha = pN; e.translate(0, (1 - pN) * -40);
      notification(e, 14, 250, PT_W - 28, { titre: o.titre || "MTN ·8901", texte: o.texte, heure: "maintenant", hauteur: 128, lignesMax: 4 });
      e.restore();
    }
    if (o.recu) {
      const pR = acc.sortie4(avance(l.l, o.recu, o.recu + 0.35));
      if (pR > 0) {
        e.save(); e.globalAlpha = pR; e.translate(0, (1 - pR) * -40);
        notification(e, 14, 392, PT_W - 28, { titre: "TOTEM", texte: "Reçu d’encaissement prêt · TM-2026-0929-0042.pdf", heure: "maintenant", hauteur: 84, lignesMax: 2 });
        e.restore();
      }
    }
  });
}

// --- L'attaque : des milliers de SMS piégés ---------------------------------------------------
// Des SMS d'opérateurs, mutés : chiffres d'une autre écriture, espaces
// insécables, montants coupés. Le compteur monte ; « montant inventé »
// reste à zéro.
const PIEGES = [
  "Depot de 5٥٠٠٠0000 FCFA", "Vous avez recu 2O 000 FCFA", "Transfert de 1 5OO FCFA vers", "Nouveau solde: 87 3OO FCFA.",
  "You have received 50000 XAF from 67744", "Retrait effectué : 5 000 FCFA.", "Montant Transaction: 184137FCFA, Frais", "recu 13",
  "Cash in of 500000 XAF on", "Vous avez recu 1O OOO FCFA", "Vous avez envoye 80 000 FCFA a", "Solde : 895000 FCFA.",
];
export function attaque(x, l, o = {}) {
  const u = l.u, v = l.v;
  const n = 90;
  police(x, u * 0.02, 500, CHASSE);
  for (let i = 0; i < n; i++) {
    const vitesse = 0.3 + hache2(i, 1) * 0.7;
    const f = (l.s * vitesse * 0.6 + hache2(i, 2)) % 1;
    const yy = l.H * (1.1 - f * 1.25);
    const xx = l.W * hache2(i, 3);
    const s = PIEGES[i % PIEGES.length];
    x.fillStyle = `rgba(244,239,233,${0.08 + 0.2 * hache2(i, 4)})`;
    x.textAlign = "center";
    x.fillText(s, xx, yy);
    if (hache2(i, Math.floor(l.s * 8)) < 0.04) { x.fillStyle = "rgba(192,15,12,0.5)"; x.fillText(s, xx + 2, yy); }
  }
  // Le compteur.
  const p = avance(l.l, o.debut ?? 0.3, o.fin ?? 3);
  const taille = v ? l.W * 0.2 : u * 0.24;
  x.save();
  x.shadowColor = "rgba(0,0,0,0.9)"; x.shadowBlur = u * 0.05;
  compteur(x, 30000, p, { x: l.W / 2, y: l.H * (v ? 0.44 : 0.52), taille, graisse: 800, couleur: C.clair, format: montant, espace: -0.04 });
  x.restore();
  police(x, u * (v ? 0.045 : 0.04), 600);
  x.fillStyle = C.lateriteClair; x.textAlign = "center"; x.letterSpacing = `${u * 0.004}px`;
  x.fillText(o.legende || "SMS PIÉGÉS", l.W / 2, l.H * (v ? 0.44 : 0.52) + taille * 0.42);
  x.letterSpacing = "0px";
}

// --- Le pavé du code secret, joué ----------------------------------------------------------
// Les points se remplissent sur les temps ; jamais un chiffre à l'écran.
export function paveJoue(x, l, o = {}) {
  const u = l.u, v = l.v;
  const w = o.largeur ?? (v ? l.W * 0.78 : u * 0.52);
  const temps = o.temps || [0.5, 1, 1.5, 2, 2.5];
  const touches = o.touches || ["4", "8", "1", "7", "2"];
  // Aucune touche chiffrée ne s'allume : on verrait quels chiffres sont tapés.
  // Le retour de l'appui passe par le point qui se remplit (il grossit, puis revient).
  let saisi = 0, touche = null, appui = 0, pouls = 0;
  temps.forEach((tt, i) => {
    if (l.l >= tt) saisi = i + 1;
    const d = l.l - tt;
    if (d >= 0 && d < 0.35) pouls = 1 - d / 0.35;
  });
  const pv = o.valider;
  if (pv != null && l.l >= pv) { touche = "Valider"; appui = Math.max(0, 1 - (l.l - pv) / 0.35); }
  pave(x, l.W / 2 - w / 2, l.H / 2 - w * 392 / 320 / 2 + (o.dy || 0), w, { saisi, touche, appui, pouls, longueur: 5 });
}

// --- Le reçu qui sort --------------------------------------------------------------------------
export function recuSort(x, l, o = {}) {
  const u = l.u, v = l.v;
  // En vertical, le reçu se tient debout : à l'italienne, seul le montant s'y lisait.
  const portrait = v;
  const w = portrait ? Math.min(l.W * 0.86, l.H * 0.78) : l.W * (l.W / l.H < 1.3 ? 0.9 : 0.62);
  const p = acc.sortie4(avance(l.l, o.debut ?? 0, (o.debut ?? 0) + 0.9));
  const h = w * (portrait ? 1.25 : 0.707);
  const y = l.H / 2 - h / 2 + (1 - p) * l.H * 0.6;
  x.save();
  x.translate(l.W / 2, y + h / 2); x.rotate((1 - p) * 0.08); x.translate(-l.W / 2, -(y + h / 2));
  x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = u * 0.06; x.shadowOffsetY = u * 0.02;
  rr(x, l.W / 2 - w / 2, y, w, h, 8); x.fillStyle = "#fff"; x.fill();
  x.shadowColor = "transparent";
  recu(x, l.W / 2 - w / 2, y, w, { ...o, portrait });
  x.restore();
}

// --- La semaine en barres ------------------------------------------------------------------------
// Comme l'écran Analyse : sept barres, la meilleure en encre, les autres en gris.
export function semaine(x, l, o = {}) {
  const u = l.u, v = l.v;
  const valeurs = o.valeurs || [35000, 8000, 50000, 15000, 27500, 42000, 20000];
  const jours = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
  const w = v ? l.W * 0.84 : u * 1.05, hz = v ? l.H * 0.3 : l.H * 0.42;
  const x0 = l.W / 2 - w / 2, y0 = l.H * (v ? 0.62 : 0.72);
  const max = Math.max(...valeurs);
  const pas = w / valeurs.length, bw = pas * 0.72;
  const total = valeurs.reduce((a, b) => a + b, 0);
  police(x, u * 0.03, 500); x.fillStyle = "rgba(244,239,233,0.6)"; x.textAlign = "left";
  x.fillText("Encaissements de la semaine", x0, y0 - hz - u * 0.12);
  compteur(x, total, avance(l.l, 0.2, 2), { x: x0, y: y0 - hz - u * 0.04, taille: u * 0.075, graisse: 600, couleur: C.clair, align: "left", format: (n) => montant(n) + " FCFA", espace: -0.02 });
  valeurs.forEach((val, i) => {
    const e = acc.sortie4(avance(l.l, 0.3 + i * 0.12, 1.1 + i * 0.12));
    const hh = (val / max) * hz * 0.85 * e + u * 0.008;
    const meilleur = val === max;
    rr(x, x0 + i * pas + (pas - bw) / 2, y0 - hh, bw, hh, 6);
    x.fillStyle = meilleur ? C.clair : "rgba(244,239,233,0.22)"; x.fill();
    police(x, u * 0.022, 400); x.fillStyle = "rgba(244,239,233,0.5)"; x.textAlign = "center";
    x.fillText(jours[i], x0 + i * pas + pas / 2, y0 + u * 0.04);
    if (e > 0.9) { police(x, u * 0.02, 600); x.fillStyle = meilleur ? C.clair : "rgba(244,239,233,0.6)"; x.fillText(montant(val), x0 + i * pas + pas / 2, y0 - hh - u * 0.015); }
  });
}

// --- La pluie de SMS : l'argent bouge, loin ---------------------------------------------------
// Des SMS arrivent l'un après l'autre, à des profondeurs différentes. Les
// textes sont ceux du faux nuage et des tests « inventés » (jamais un vrai).
export const SMS_ESSAI = [
  ["MobileMoney", "Vous avez recu 35 000 FCFA de MAMA CLARISSE (670334455). Nouveau solde: 447 500 FCFA."],
  ["OrangeMoney", "Transfert de 5 000 FCFA vers BOUTIQUE AKWA effectue. Frais: 100 FCFA. Solde: 87 300 FCFA."],
  ["MobileMoney", "Vous avez recu 8 000 FCFA de TAILLEUR JEAN (651672233). Nouveau solde: 455 500 FCFA."],
  ["MobileMoney", "Vous avez recu 50 000 FCFA de ETS KAMDEM (699887711). Nouveau solde: 505 500 FCFA."],
  ["OrangeMoney", "Retrait effectué : 5000 FCFA. Solde : 82 300 FCFA."],
  ["MobileMoney", "Vous avez recu 27500 FCFA de ABENA Rose (677445566). Nouveau solde: 533 000 FCFA."],
  ["MobileMoney", "Vous avez recu 15 000 FCFA de MAMA CLARISSE (670334455). Nouveau solde: 548 000 FCFA."],
  ["OrangeMoney", "Votre solde est de 82 300 FCFA."],
];
export function pluieSms(x, l, o = {}) {
  const u = l.u, v = l.v;
  const arrivees = o.arrivees || [0, 1, 1.75, 2.25, 2.75, 3.1, 3.4, 3.65];
  const heures = ["23:18", "23:21", "23:26", "23:31", "23:34", "23:40", "23:47", "23:52"];
  const recul = acc.deux3(avance(l.l, o.debutRecul ?? 3, o.fin ?? 8));
  const ordre = arrivees.map((_, i) => i).reverse(); // le premier SMS, dessiné en dernier : au-dessus
  ordre.forEach((i) => {
    const ta = arrivees[i];
    if (l.l < ta) return;
    const [exp, txt] = SMS_ESSAI[i % SMS_ESSAI.length];
    const ang = hache2(i, 5) * Math.PI * 2;
    const dist = i === 0 ? 0 : (0.22 + hache2(i, 6) * 0.2) * (v ? l.H * 0.9 : l.W);
    const px = l.W / 2 + Math.cos(ang) * dist * (v ? 0.4 : 0.55);
    const py = l.H / 2 + Math.sin(ang) * dist * (v ? 0.6 : 0.4);
    const prof = i === 0 ? 1 : 0.55 + hache2(i, 7) * 0.3;
    const ech = prof * (1 - recul * 0.35);
    const w = v ? l.W * 0.86 : u * 1.05;
    x.save();
    x.globalAlpha = i === 0 ? 1 - recul * 0.4 : 0.35 + prof * 0.5;
    bulleSms(x, i === 0 ? l.W / 2 : px, i === 0 ? l.H / 2 : py, w, txt, avance(l.l, ta, ta + 1.2), { t: l.t, expediteur: exp, heure: heures[i], echelle: ech, curseur: i === arrivees.length - 1 });
    x.restore();
  });
}

// --- La manœuvre : *126#, attendre, taper 1… --------------------------------------------------
// La phrase est celle de la fiche du magasin (docs/PLAY-STORE.md) :
// « *126#, attendre, taper 1, attendre, taper 4, se tromper, recommencer. »
export const MANOEUVRE = ["*126#", "attendre…", "taper 1", "attendre…", "taper 4", "se tromper.", "recommencer.", "recommencer."];
export function manoeuvre(x, l, o = {}) {
  const u = l.u, v = l.v;
  const temps = o.temps || [0, 1, 1.75, 2.5, 3, 3.5, 3.75, 4];
  let k = 0;
  temps.forEach((tt, i) => { if (l.l >= tt) k = i; });
  const mot = MANOEUVRE[k];
  const p = avance(l.l, temps[k], temps[k] + 0.3);
  const taille = ajuster(x, "recommencer.", l.W * (v ? 0.8 : 0.7), u * (v ? 0.18 : 0.2), 800, CHASSE);
  const erreur = mot === "se tromper.";
  const yMot = v ? l.H * 0.62 : l.H / 2;
  // Les mots d'avant, en écho, de plus en plus pâles : trois au plus, et jamais
  // sous les bandes. En vertical, ils tombent SOUS le mot, loin de la couture.
  const hautBande = (v ? 0 : 0.095) * l.H + 0.03 * l.H;
  for (let j = Math.max(0, k - 3); j < k; j++) {
    const y = v ? yMot + taille * (0.75 + (k - j) * 0.45) : yMot - taille * (0.9 + (k - j) * 0.42);
    if (!v && y < hautBande + taille * 0.3) continue;
    police(x, taille * 0.32, 500, CHASSE);
    x.fillStyle = `rgba(244,239,233,${0.14 + 0.08 * (j - k + 3)})`;
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.fillText(MANOEUVRE[j], l.W / 2, y);
  }
  frappe(x, mot, p, { x: l.W / 2, y: yMot, taille, graisse: 800, famille: CHASSE, couleur: erreur ? "#ff5a4f" : C.clair, depuis: v ? 1.06 : 1.25, espace: -0.03 });
}

// --- Les outils de composition du drop -------------------------------------------------------
// Un titre à gauche (16:9) ou en haut (9:16), la démonstration dans la place
// qui reste. La démonstration se dessine dans une RÉGION : une scène écrite
// pour l'écran entier y tient telle quelle.
export function region(l) {
  // En vertical, la démonstration reste entre 7 et 89 % de la largeur (la
  // colonne d'icônes des applications) et au-dessus de leur légende.
  return l.v
    ? { x: l.W * 0.07, y: l.H * 0.34, w: l.W * 0.82, h: l.H * 0.52 }
    : { x: l.W * 0.42, y: 0, w: l.W * 0.58, h: l.H };
}
export function dansRegion(x, l, r, fn) {
  x.save();
  x.beginPath(); x.rect(r.x, r.y, r.w, r.h); x.clip();
  x.translate(r.x, r.y);
  fn(x, { ...l, W: r.w, H: r.h, u: Math.min(r.w, r.h), v: r.h > r.w });
  x.restore();
}
export const SOUS_REFERENCE = "Votre code, jamais affiché.";
export function titreDrop(x, l, mot, sous, o = {}) {
  const u = l.u, v = l.v;
  // Une seule taille pour tout l'acte, réglée sur la plus longue ligne : « Il lit. »
  // n'est pas deux fois plus gros que « On ne tape plus. »
  const reference = "On ne tape plus.";
  const taille = v ? ajuster(x, reference, l.W * 0.8, u * 0.15, 800) : ajuster(x, reference, l.W * 0.33, u * 0.13, 800);
  const n = mot.split("\n").length;
  // En vertical, on place le HAUT du bloc (à 14 % de la hauteur : la poussée
  // de la caméra le remonte vers 12 %) : un titre de deux lignes ne monte pas sous la barre d'état.
  const px = v ? l.W / 2 : l.W * 0.06, py = v ? l.H * 0.14 + taille * (0.37 + (n - 1) * 0.5) : l.H * 0.44;
  montee(x, mot, avance(l.l, 0, 0.5), { x: px, y: py, taille, graisse: 800, couleur: o.couleur || C.clair, align: v ? "center" : "left", espace: -0.03, sortie: o.sortie, interligne: 1.0 });
  if (sous) {
    // Une seule taille de sous-titre pour tout l'acte, réglée sur la plus longue ligne.
    const ts = v ? u * 0.044 : Math.min(u * 0.05, ajuster(x, SOUS_REFERENCE, l.W * 0.34, u * 0.05, 500));
    const derniereBase = py + (n - 1) * taille / 2 + taille * 0.35;
    montee(x, sous, avance(l.l, 0.35, 1.1), { x: px, y: derniereBase + taille * (v ? 0.55 : 0.6) + ts, taille: ts, graisse: 500, couleur: "rgba(244,239,233,0.9)", align: v ? "center" : "left", interligne: 1.28, centreV: false, sortie: o.sortie });
  }
}

// --- Les cartes SIM, restées au pays -----------------------------------------------------------
export function cartesSim(x, l, o = {}) {
  const u = l.u, v = l.v;
  const w = v ? l.W * 0.5 : u * 0.42;
  const f = l.s;
  const e1 = acc.sortie4(avance(l.l, 0, 0.8)), e2 = acc.sortie4(avance(l.l, 0.3, 1.1));
  sim(x, l.W / 2 - w * 0.32, l.H * (v ? 0.36 : 0.44) + Math.sin(f * 1.3) * u * 0.008 + (1 - e1) * u * 0.3, w, { libelle: "MTN ·8901", pastille: C.mtn, sous: "8923 7010 … 8901", rotation: -0.1 + Math.sin(f) * 0.02, alpha: e1 });
  sim(x, l.W / 2 + w * 0.32, l.H * (v ? 0.44 : 0.52) + Math.sin(f * 1.1 + 1) * u * 0.008 + (1 - e2) * u * 0.3, w, { libelle: "Orange ·4432", pastille: C.orange, sous: "8923 7020 … 4432", rotation: 0.08 + Math.sin(f + 2) * 0.02, alpha: e2 });
}

// --- Il écoute : le boîtier et ses deux modems ----------------------------------------------------
export function ecoute(x, l, o = {}) {
  // Plein cadre sur l'objet : la carte verte, son modem, le second modem à
  // côté. Chaque puce vient s'enficher dans SA fente, sur un temps.
  const u = l.u, v = l.v;
  const s = u * (v ? 0.17 : 0.18);
  const cx = v ? l.W * 0.36 : l.W * 0.52, cy = v ? l.H * 0.57 : l.H * 0.5;
  const { fentes } = boitier(x, cx, cy, s, {
    t: l.s, second: true, monte: avance(l.l, 0, 0.6), demarrage: l.l < 1.5,
    ondes: acc.sortie3(avance(l.l, 0.7, 1.4)), ondes2: acc.sortie3(avance(l.l, 1.2, 1.9)),
  });
  const cartes = [
    { libelle: "MTN ·8901", pastille: C.mtn, t0: 0.5 },
    { libelle: "Orange ·4432", pastille: C.orange, t0: 1.0 },
  ];
  cartes.forEach((c, i) => {
    const [fx, fy] = fentes[i];
    const e = acc.entree3(avance(l.l, c.t0 - 0.45, c.t0));
    const pose = l.l >= c.t0;
    const w = u * (pose ? 0.06 : 0.14 - 0.08 * e);
    const px = melange(fx + (i ? u * 0.1 : -u * 0.25), fx, e), py = melange(fy - u * 0.42, fy - u * 0.01, e);
    sim(x, px, py, w, { libelle: pose ? null : c.libelle, pastille: c.pastille, rotation: melange(-0.3 + i * 0.5, 0.52, e), alpha: borne(avance(l.l, c.t0 - 0.5, c.t0 - 0.3)) });
    // Le clic de l'enfichage : un anneau bref.
    const d = (l.l - c.t0) * l.T;
    if (d >= 0 && d < 0.35) {
      x.save(); x.globalAlpha = 1 - d / 0.35; x.strokeStyle = C.lateriteClair; x.lineWidth = 3;
      x.beginPath(); x.arc(fx, fy, u * (0.02 + d * 0.3), 0, 7); x.stroke(); x.restore();
    }
    if (pose) {
      const te = u * (v ? 0.045 : 0.026);
      police(x, te, 600); x.textAlign = "center";
      const yl = fy + u * 0.05 + te;
      // Une pastille sombre sous l'étiquette : posée sur la carte, elle doit se lire.
      const lw = x.measureText(c.libelle).width;
      rr(x, fx - lw / 2 - te * 1.1, yl - te * 1.05, lw + te * 1.7, te * 1.45, te * 0.72);
      x.fillStyle = "rgba(22,23,26,0.86)"; x.fill();
      x.fillStyle = "rgba(244,239,233,0.92)";
      x.fillText(c.libelle, fx, yl);
      x.beginPath(); x.arc(fx - x.measureText(c.libelle).width / 2 - te * 0.6, yl - te * 0.35, te * 0.22, 0, 7); x.fillStyle = c.pastille; x.fill();
    }
  });
}

// --- Le décor : de la poussière en profondeur, une lumière qui balaie --------------------------------
// Rien de la marque ici : le décor porte le mouvement, la marque reste mate.
export function poussiere(x, l, o = {}) {
  const n = o.n || 70;
  for (let i = 0; i < n; i++) {
    const z = 0.2 + hache2(i, 21) * 0.8;
    const vx = (hache2(i, 22) - 0.5) * 0.02, vy = -0.01 - hache2(i, 23) * 0.02;
    const px = ((hache2(i, 24) + l.s * vx * z) % 1 + 1) % 1 * l.W;
    const py = ((hache2(i, 25) + l.s * vy * z) % 1 + 1) % 1 * l.H;
    const r = l.u * 0.0025 * z;
    x.fillStyle = `rgba(244,220,200,${0.05 + 0.18 * z * (o.force ?? 1)})`;
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
}
export function balayage(x, l, o = {}) {
  // Une bande de lumière oblique qui traverse l'image une fois par mesure.
  const periode = o.periode || 4;
  const f = ((l.b % periode) / periode);
  const pos = -0.3 + f * 1.6;
  const g = x.createLinearGradient(l.W * (pos - 0.15), 0, l.W * (pos + 0.15), l.H * 0.4);
  g.addColorStop(0, "rgba(208,138,99,0)"); g.addColorStop(0.5, `rgba(208,138,99,${0.06 * (o.force ?? 1)})`); g.addColorStop(1, "rgba(208,138,99,0)");
  x.fillStyle = g; x.fillRect(0, 0, l.W, l.H);
}
// Le mot fantôme : très grand, au trait, qui dérive derrière la démonstration.
export function motFantome(x, l, mot, o = {}) {
  const taille = l.v ? l.H * 0.22 : l.H * 0.42;
  police(x, taille, 900, POLICE);
  x.save();
  x.globalAlpha = (o.alpha ?? 0.15) * acc.sortie3(avance(l.l, 0, 0.8));
  x.strokeStyle = C.lateriteClair; x.lineWidth = Math.max(1.5, l.u * 0.0022);
  x.textAlign = "left"; x.textBaseline = "middle";
  const dx = -l.s * l.u * 0.08;
  x.strokeText(mot, l.W * (l.v ? 0.02 : 0.3) + dx, l.v ? l.H * 0.62 : l.H * 0.52);
  x.restore();
}

// --- L'onde de choc de la révélation ------------------------------------------------------------------
export function choc(x, l, depuis, o = {}) {
  const s = (l.l - depuis) * l.T;
  if (s < 0 || s > 2) return;
  const r = (o.rayon ?? l.u * 0.1) + s * l.u * 1.1;
  x.save();
  // Charte §6 : on n'enferme pas le symbole dans un cercle. Autour de la
  // Tresse, l'onde ne garde que ses éclats.
  if (o.anneaux !== false) {
  x.globalAlpha = Math.max(0, 1 - s / 1.2) * 0.8;
  x.strokeStyle = o.couleur || "#ffd9bd"; x.lineWidth = l.u * 0.006 * (1 - s / 2);
  x.beginPath(); x.arc(l.W / 2, l.H / 2, r, 0, 7); x.stroke();
  x.globalAlpha = Math.max(0, 1 - s / 0.8) * 0.4;
  x.lineWidth = l.u * 0.02 * (1 - s / 2);
  x.beginPath(); x.arc(l.W / 2, l.H / 2, r * 0.8, 0, 7); x.stroke();
  }
  x.restore();
  // Des éclats qui partent du centre.
  for (let i = 0; i < 80; i++) {
    const a = hache2(i, 31) * Math.PI * 2, v = 0.3 + hache2(i, 32) * 1.2;
    const d = l.u * v * (1 - Math.exp(-s * 3)) * 0.8;
    x.fillStyle = `rgba(255,214,180,${Math.max(0, 1 - s / (0.6 + hache2(i, 33)))})`;
    x.fillRect(l.W / 2 + Math.cos(a) * d, l.H / 2 + Math.sin(a) * d, l.u * 0.004, l.u * 0.004);
  }
}

// --- Le piège : le SMS qui valait 550 millions --------------------------------------------------------
// Le premier lancement du harnais (outils/attaquer-le-lecteur.py) l'a trouvé :
// « Depot de 5٥٠٠٠0000 FCFA » se lisait 550 000 000 FCFA, parce que « ٥ »
// est aussi un chiffre. Aujourd'hui, le même message est « illisible ».
export function piege(x, l, o = {}) {
  const u = l.u, v = l.v;
  const sms = "Depot de 5٥٠٠٠0000 FCFA";
  const taille = ajuster(x, sms, l.W * (v ? 0.86 : 0.6), u * 0.08, 500, CHASSE);
  const y1 = l.H * (v ? 0.34 : 0.3);
  police(x, taille * 0.4, 600); x.fillStyle = "rgba(244,239,233,0.5)"; x.textAlign = "center";
  x.letterSpacing = `${taille * 0.04}px`; x.fillText("UN SMS PIÉGÉ", l.W / 2, y1 - taille * 1.2); x.letterSpacing = "0px";
  machine(x, sms, avance(l.l, 0, 0.8), { x: l.W / 2 - (police(x, taille, 500, CHASSE), x.measureText(sms).width / 2), y: y1, taille, couleur: C.clair, t: l.t, curseur: false });
  // La mauvaise lecture, qui clignote en rouge, puis se fait barrer.
  const pF = avance(l.l, 1, 1.4);
  const y2 = l.H * (v ? 0.5 : 0.52);
  if (pF > 0) {
    const faux = "550 000 000 FCFA ?";
    const tf = taille * 1.25;
    police(x, tf, 800);
    x.fillStyle = Math.floor(l.s * 10) % 2 && l.l < 2 ? "#ff5a4f" : "rgba(255,90,79,0.8)";
    x.textAlign = "center"; x.globalAlpha = acc.sortie3(pF);
    x.fillText(faux, l.W / 2, y2);
    x.globalAlpha = 1;
    const wf = x.measureText(faux).width;
    trait(x, l.W / 2 - wf / 2, y2 - tf * 0.33, l.W / 2 + wf / 2, y2 - tf * 0.33, avance(l.l, 2, 2.4), C.clair, Math.max(3, u * 0.006));
  }
  // Le tampon.
  const pT = avance(l.l, 2.4, 2.7);
  if (pT > 0) {
    const y3 = l.H * (v ? 0.68 : 0.76);
    const ech = 1.8 - 0.8 * acc.sortieExpo(pT);
    x.save(); x.translate(l.W / 2, y3); x.rotate(-0.06); x.scale(ech, ech); x.globalAlpha = borne(pT * 3);
    police(x, taille * 0.95, 800);
    const mot = "ILLISIBLE · AUCUN MONTANT";
    const tw = x.measureText(mot).width + taille * 1.2;
    x.strokeStyle = C.lateriteClair; x.lineWidth = Math.max(3, u * 0.005);
    rr(x, -tw / 2, -taille * 0.85, tw, taille * 1.7, taille * 0.2); x.stroke();
    x.fillStyle = C.lateriteClair; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(mot, 0, 2);
    x.restore();
  }
}

// --- La coupure : le courant saute, le compte ne double pas ---------------------------------------------
// eprouver-la-chaine.py : le robot écrit au journal AVANT d'effacer dans le
// modem ; un SMS relu au redémarrage est reconnu. Sans ce garde-fou,
// 157 500 F devenaient 315 000 F.
export function coupure(x, l, o = {}) {
  const u = l.u, v = l.v;
  const noir = l.l > (o.noir ?? 0.75) && l.l < (o.noir ?? 0.75) + 0.5;
  if (noir) { x.fillStyle = "#000"; x.fillRect(0, 0, l.W, l.H); return; }
  const apres = l.l >= (o.noir ?? 0.75) + 0.5;
  police(x, u * (v ? 0.045 : 0.036), 600); x.fillStyle = "rgba(244,239,233,0.78)"; x.textAlign = "center";
  x.letterSpacing = `${u * 0.004}px`;
  x.fillText(apres ? "APRÈS LA COUPURE" : "AVANT LA COUPURE", l.W / 2, l.H * (v ? 0.27 : 0.22)); x.letterSpacing = "0px";
  const taille = v ? l.W * 0.17 : u * 0.2;
  // Le journal : les deux encaissements du harnais (outils/eprouver-la-chaine.py).
  police(x, u * (v ? 0.038 : 0.032), 500, CHASSE); x.textAlign = "center"; x.fillStyle = "rgba(244,239,233,0.62)";
  const yJ = l.H * (v ? 0.36 : 0.29);
  x.fillText("+27 500 · ABENA Rose", l.W / 2, yJ);
  x.fillText("+130 000 · KAMGA Eric", l.W / 2, yJ + u * (v ? 0.055 : 0.045));
  // La tentation du double, barrée.
  if (apres) {
    const n0 = o.noir ?? 0.75;
    const pd = avance(l.l, n0 + 0.55, n0 + 0.9);
    police(x, taille * 0.4, 700);
    const yd = l.H * 0.66 - taille * 0.95;
    // Le faux tremble (doublure rouge et cyan) tant qu'il n'est pas barré.
    const trem = (1 - avance(l.l, n0 + 1.1, n0 + 1.3)) * u * 0.005;
    x.fillStyle = `rgba(0,229,255,${0.35 * acc.sortie3(pd)})`; x.fillText("315 000 F", l.W / 2 - 3 + (hache2(l.n, 3) - 0.5) * trem * 2, yd);
    x.fillStyle = `rgba(255,90,79,${0.8 * acc.sortie3(pd)})`; x.fillText("315 000 F", l.W / 2 + (hache2(l.n, 4) - 0.5) * trem * 2, yd);
    const wd = x.measureText("315 000 F").width;
    trait(x, l.W / 2 - wd / 2 - 8, yd - taille * 0.13, l.W / 2 + wd / 2 + 8, yd - taille * 0.13, avance(l.l, n0 + 0.9, n0 + 1.2), C.clair, Math.max(3, u * 0.005));
  }
}
// Le total juste ne tremble pas : il se pose après la post-production.
export function coupureVerite(x, l, o = {}) {
  const u = l.u, v = l.v;
  const noir = l.l > (o.noir ?? 0.75) && l.l < (o.noir ?? 0.75) + 0.5;
  if (noir) return;
  const apres = l.l >= (o.noir ?? 0.75) + 0.5;
  const taille = v ? l.W * 0.17 : u * 0.2;
  police(x, taille, 800); x.fillStyle = C.clair; x.textAlign = "center"; x.textBaseline = "alphabetic";
  x.fillText("157 500 F", l.W / 2, l.H * 0.66);
  if (apres) {
    const n0 = o.noir ?? 0.75;
    const pc = acc.sortie4(avance(l.l, n0 + 1.15, n0 + 1.45));
    x.save(); x.globalAlpha = pc;
    // En vertical, la coche se pose SOUS le nombre : à droite, elle toucherait le bord.
    if (v) icone(x, "coche", l.W / 2, l.H * 0.66 + taille * 0.5, taille * 0.4, "#7ee2a4", 2.5);
    else icone(x, "coche", l.W / 2 + x.measureText("157 500 F").width / 2 + taille * 0.35, l.H * 0.66 - taille * 0.33, taille * 0.4, "#7ee2a4", 2.5);
    x.restore();
  }
}

// --- Le piège, en quatre temps : lecture, choc, gel, vérité -------------------------------------
// Le faux tremble, le vrai ne bouge pas : le mauvais montant vit dans le
// MONDE (glitch, secousse, aberration), la vérité dans la couche VÉRITÉ que
// la post-production ne touche pas (voir montage.js).
export const PIEGE = { avant: "Depot de ", chiffres: "5٥٠٠٠0000", apres: " FCFA" };
const LECTURE_NAIVE = ["5", "55", "550", "5 500", "55 000", "550 000", "5 500 000", "55 000 000", "550 000 000"];

function mesuresPiege(x, l) {
  const v = l.v, u = l.u;
  // La taille qui fait tenir les chiffres ET « FCFA » dans la largeur.
  police(x, 100, 500, CHASSE);
  const r = x.measureText(PIEGE.chiffres).width / 100;
  // « FCFA » se dessine à 0,3 × la taille, 0,12 après le dernier chiffre : on le mesure.
  police(x, 30, 500, POLICE);
  const rF = 0.12 + x.measureText("FCFA").width / 100;
  const taille = Math.min(v ? l.W * 0.15 : u * 0.2, (l.W * (v ? 0.76 : 0.78)) / (r + rF));
  police(x, taille, 500, CHASSE);
  const w = x.measureText(PIEGE.chiffres).width;
  const x0 = l.W / 2 - (w + taille * rF) / 2, y = l.H * (v ? 0.42 : 0.48);
  const bords = [];
  for (let i = 0; i <= PIEGE.chiffres.length; i++) bords.push(x0 + x.measureText(PIEGE.chiffres.slice(0, i)).width);
  return { taille, w, x0, y, bords };
}

export function piegeLecture(x, l, o = {}) {
  const u = l.u, v = l.v;
  const m = mesuresPiege(x, l);
  const chauffe = acc.entree2(avance(l.l, 0.25, 3.6));
  // Le monde qui rougit.
  x.fillStyle = `rgba(192,15,12,${0.22 * chauffe})`; x.fillRect(0, 0, l.W, l.H);
  police(x, m.taille * 0.28, 500, POLICE); x.fillStyle = "rgba(244,239,233,0.5)"; x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillText("Depot de", m.x0, m.y - m.taille * 0.95);
  police(x, m.taille, 500, CHASSE); x.textAlign = "left";
  // Chaque signe à sa place ; les quatre signes d'une autre écriture, teintés.
  const nS = PIEGE.chiffres.length;
  const franchis = Math.min(nS, Math.floor(avance(l.l, 0.25, 3.5) * nS + 1e-6));
  for (let i = 0; i < nS; i++) {
    const c = PIEGE.chiffres[i], etranger = c.charCodeAt(0) > 127;
    x.fillStyle = etranger && i < franchis ? C.lateriteClair : C.clair;
    police(x, m.taille, 500, CHASSE);
    x.fillText(c, m.bords[i], m.y);
    if (i < franchis) {
      // Ce qu'une machine naïve y voit : un chiffre comme un autre.
      police(x, m.taille * 0.32, 600, POLICE); x.fillStyle = etranger ? C.lateriteClair : "rgba(244,239,233,0.6)"; x.textAlign = "center";
      x.fillText(String(Number.parseInt(c.normalize("NFKC"), 10) || (c === "٥" ? 5 : 0)), (m.bords[i] + m.bords[i + 1]) / 2, m.y + m.taille * 0.44);
      x.textAlign = "left";
    }
  }
  police(x, m.taille * 0.3, 500, POLICE); x.fillStyle = "rgba(244,239,233,0.6)";
  x.fillText("FCFA", m.x0 + m.w + m.taille * 0.12, m.y);
  // La barre de lecture.
  const n = PIEGE.chiffres.length;
  const pos = avance(l.l, 0.25, 3.5);
  const k = Math.min(n, Math.floor(pos * n + 1e-6));
  const bx = melange(m.bords[0], m.bords[n], acc.entree2(pos));
  if (pos > 0 && pos < 1) {
    const g = x.createLinearGradient(bx - u * 0.05, 0, bx, 0);
    g.addColorStop(0, "rgba(208,138,99,0)"); g.addColorStop(1, "rgba(208,138,99,0.4)");
    x.fillStyle = g; x.fillRect(bx - u * 0.05, m.y - m.taille, u * 0.05, m.taille * 1.25);
    x.fillStyle = C.lateriteClair; x.fillRect(bx - 2, m.y - m.taille * 1.05, 4, m.taille * 1.35);
  }
  // Le compteur qui s'emballe : ce que la machine naïve comprend.
  if (k > 0) {
    const tc = v ? l.W * 0.11 : u * 0.12;
    police(x, tc, 700, POLICE);
    x.fillStyle = `rgb(${Math.round(melange(244, 255, chauffe))},${Math.round(melange(239, 90, chauffe))},${Math.round(melange(233, 79, chauffe))})`;
    x.textAlign = "center";
    x.fillText(LECTURE_NAIVE[Math.min(k, n) - 1], l.W / 2, l.H * (v ? 0.66 : 0.8));
  }
}
// Au milieu du tremblement, la légende ne bouge pas. C'est une ATTAQUE :
// quiconque connaît le numéro de la SIM peut lui écrire (CLAUDE.md).
export function piegeLegende(x, l) {
  const e = acc.sortie4(avance(l.l, 0, 0.5));
  x.save(); x.globalAlpha = e;
  x.textAlign = "center"; x.textBaseline = "alphabetic";
  police(x, l.u * (l.v ? 0.06 : 0.05), 700); x.fillStyle = C.clair;
  x.fillText("Un SMS piégé.", l.W / 2, l.H * (l.v ? 0.17 : 0.17));
  police(x, l.u * (l.v ? 0.045 : 0.038), 500); x.fillStyle = "rgba(244,239,233,0.8)";
  x.fillText("Une machine naïve y lit :", l.W / 2, l.H * (l.v ? 0.17 : 0.17) + l.u * (l.v ? 0.07 : 0.06));
  const e2 = acc.sortie4(avance(l.l, 1.2, 1.7));
  if (e2 > 0) {
    x.globalAlpha = e2;
    police(x, l.u * (l.v ? 0.044 : 0.034), 500); x.fillStyle = C.lateriteClair;
    if (l.v) {
      x.fillText("« ٥ » et « ٠ » :", l.W / 2, l.H * 0.78);
      x.fillText("des chiffres d’une autre écriture.", l.W / 2, l.H * 0.78 + l.u * 0.06);
    } else x.fillText("« ٥ » et « ٠ » : des chiffres d’une autre écriture.", l.W / 2, l.H * 0.92);
  }
  x.restore();
}

export function piegeChoc(x, l, o = {}) {
  const u = l.u, v = l.v;
  // Sous le choc (zoom, secousse), le nombre doit rester dans le cadre.
  const t = ajuster(x, "550 000 000", l.W * (v ? 0.76 : 0.84), u * 0.3, 800);
  const vide = o.vide ?? 0; // 0..1 : le rouge se vide, les chiffres s'effacent (pendant le gel)
  const texte = "550 000 000";
  const reste = Math.ceil(texte.length * (1 - vide));
  police(x, t, 800, POLICE);
  const r = Math.round(melange(192, 90, vide)), g = Math.round(melange(15, 90, vide)), b = Math.round(melange(12, 90, vide));
  x.fillStyle = `rgb(${r},${g},${b})`; x.textAlign = "left"; x.textBaseline = "alphabetic";
  const w = x.measureText(texte).width;
  const x0 = l.W / 2 - w / 2, y = l.H * 0.55;
  const visible = texte.slice(0, reste);
  x.fillText(visible, x0, y);
  // « FCFA » suit le dernier chiffre qui reste, et s'efface avec lui.
  if (reste > 0) {
    police(x, t * 0.26, 700, POLICE);
    x.fillStyle = `rgba(${r},${g},${b},${1 - vide})`;
    police(x, t, 800, POLICE); const wv = x.measureText(visible).width;
    police(x, t * 0.26, 700, POLICE);
    x.textAlign = "right"; x.fillText("FCFA", x0 + wv, y + t * 0.3);
  }
}

export function piegeVerite(x, l, o = {}) {
  const u = l.u, v = l.v;
  const deux = o.ligne2 ?? 3;
  const m = mesuresPiege(x, l);
  // Le SMS piégé et sa pastille « Illisible », à la taille et à la place
  // qu'ils avaient pendant la lecture. Rend le bas de la pastille.
  const smsIllisible = (e) => {
    police(x, m.taille * 0.28, 500, POLICE); x.fillStyle = "rgba(244,239,233,0.5)"; x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.fillText("Depot de", m.x0, m.y - m.taille * 0.95);
    police(x, m.taille, 500, CHASSE); x.fillStyle = "rgba(244,239,233,0.9)";
    x.fillText(PIEGE.chiffres, m.x0, m.y);
    police(x, m.taille * 0.3, 500, POLICE); x.fillStyle = "rgba(244,239,233,0.6)";
    x.fillText("FCFA", m.x0 + m.w + m.taille * 0.12, m.y);
    // La pastille, à ses vraies couleurs, posée comme un tampon sur la clave.
    const tp = u * (v ? 0.075 : 0.07);
    police(x, tp, 700, POLICE);
    const pw = x.measureText("Illisible").width + tp * 1.4;
    const py = m.y + m.taille * 0.55;
    x.save(); x.translate(l.W / 2, py + tp * 0.85); x.scale(1.5 - 0.5 * e, 1.5 - 0.5 * e); x.globalAlpha *= borne(e * 3);
    rr(x, -pw / 2, -tp * 0.85, pw, tp * 1.7, tp * 0.85); x.fillStyle = "#fff1c2"; x.fill();
    x.fillStyle = "#522504"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("Illisible", 0, tp * 0.05);
    x.restore(); x.textBaseline = "alphabetic";
    return { py, tp };
  };
  // Juste avant la morale, la preuve se range en haut, en petit : elle reste
  // à l'écran pendant qu'on en tire la leçon — la vérité ne doit pas être
  // plus fugace que le mensonge qu'elle corrige.
  const monte = acc.deux3(avance(l.l, deux - 0.35, deux));
  const k = melange(1, 0.55, monte);
  x.save();
  x.translate(l.W / 2, melange(m.y + m.taille * 0.5, l.H * (v ? 0.22 : 0.2), monte)); x.scale(k, k); x.translate(-l.W / 2, -(m.y + m.taille * 0.5));
  const { py, tp } = smsIllisible(acc.sortieExpo(avance(l.l, 0, 0.12)));
  x.restore();
  if (l.l >= (o.ligne1 ?? 0.5) && monte < 1) {
    x.save(); x.globalAlpha *= 1 - monte;
    police(x, u * (v ? 0.075 : 0.09), 700, POLICE); x.fillStyle = C.clair; x.textAlign = "center";
    x.fillText("Aucun montant.", l.W / 2, py + tp * 1.7 + u * (v ? 0.14 : 0.13));
    x.restore();
  }
  if (l.l < deux) return;
  const tg = ajuster(x, "il n’invente rien.", l.W * (v ? 0.86 : 0.7), u * 0.16, 700);
  const yP = l.H / 2 + l.H * 0.05;
  police(x, tg, 700, POLICE); x.textAlign = "center"; x.textBaseline = "alphabetic";
  x.fillStyle = C.clair; x.fillText("Dans le doute,", l.W / 2, yP - tg * 0.15);
  if (l.l >= deux + 0.25) { x.fillStyle = C.lateriteClair; x.fillText("il n’invente rien.", l.W / 2, yP + tg * 1.0); }
}


// --- La couture : ici et là-bas -------------------------------------------------------------------
// L'écran fendu en deux. D'un côté Douala, la puce, les paiements qui
// arrivent. De l'autre, le téléphone de celui qui est loin, qui dort. Les
// ondes ne passent pas la couture. Les distances sont CALCULÉES depuis les
// coordonnées (grand cercle), et les heures suivent les fuseaux de fin
// septembre : Douala UTC+1, Paris et Bruxelles UTC+2, Montréal UTC−4.
export const AILLEURS = [
  { ville: "PARIS", lat: 48.86, lon: 2.35, decalage: 1 },
  { ville: "BRUXELLES", lat: 50.85, lon: 4.35, decalage: 1 },
  { ville: "MONTRÉAL", lat: 45.5, lon: -73.57, decalage: -5 },
];
export function km(a, b) {
  const va = vecteur(a[0], a[1]), vb = vecteur(b[0], b[1]);
  return Math.round(Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))) * 6371);
}
function heure(h, m) { return `${String((h + 24) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }

// La géométrie des deux moitiés : côte à côte en 16:9, l'une sur l'autre en 9:16.
export function moities(l) {
  return l.v
    ? { ici: { x: 0, y: 0, w: l.W, h: l.H / 2 }, la: { x: 0, y: l.H / 2, w: l.W, h: l.H / 2 }, couture: [0, l.H / 2, l.W, l.H / 2] }
    : { ici: { x: 0, y: 0, w: l.W / 2, h: l.H }, la: { x: l.W / 2, y: 0, w: l.W / 2, h: l.H }, couture: [l.W / 2, 0, l.W / 2, l.H] };
}

export function couture(x, l, o = {}) {
  const u = l.u, m = moities(l);
  const { ici, la } = m;
  const minute = 12 + Math.floor(l.l / 4);
  // Sous les bandes cinéma de l'ouverture (voir montage.js ; aucune en vertical).
  const haut = (l.v ? 0 : 0.095) * l.H;
  const hautIci = ici.y + (ici.y === 0 ? haut : 0), hautLa = la.y + (la.y === 0 ? haut : 0);
  const cxI = ici.x + ici.w * (l.v ? 0.7 : 0.5), cyI = ici.y + ici.h * (l.v ? 0.62 : 0.66);
  // La caméra part serrée sur la puce, puis recule et découvre la couture.
  const zOuv = o.ouverture === false ? 1 : 1 + 1.2 * (1 - acc.deux3(avance(l.l, 0, 2)));
  x.save();
  if (zOuv > 1.001) { x.beginPath(); x.rect(ici.x, ici.y, ici.w, ici.h); x.clip(); }
  x.translate(cxI, cyI); x.scale(zOuv, zOuv); x.translate(-cxI, -cyI);
  const entree = acc.sortie4(avance(l.l, 0, 0.6));
  // ICI : Douala — une heure de jour, chaude, énorme.
  police(x, u * 0.026, 600); x.fillStyle = "rgba(244,239,233,0.6)"; x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.letterSpacing = `${u * 0.004}px`; x.fillText("DOUALA", ici.x + u * 0.06, hautIci + u * 0.06); x.letterSpacing = "0px";
  x.save(); x.globalAlpha *= entree;
  police(x, u * 0.15, 700); x.fillStyle = "#ffe6d2"; x.letterSpacing = `${-u * 0.004}px`;
  x.fillText(heure(9, minute), ici.x + u * 0.055, hautIci + u * 0.2 + (1 - entree) * u * 0.05); x.letterSpacing = "0px";
  x.restore();
  // Les ondes des puces, coupées par la couture.
  x.save(); x.beginPath(); x.rect(ici.x, ici.y, ici.w, ici.h); x.clip();
  for (const tt of o.sonneries || [0.5, 2.5, 3.5, 4.5, 5.5, 6.5, 8.5, 10.5, 12.5, 14.5]) {
    const d = (l.l - tt) * l.T;
    if (d < 0 || d > 1.6) continue;
    const r = u * 0.08 + d * u * 0.5;
    x.save(); x.globalAlpha *= Math.max(0, 1 - d / 1.6) * 0.7;
    x.strokeStyle = C.lateriteClair; x.lineWidth = 2;
    x.beginPath(); x.arc(cxI, cyI, r, 0, 7); x.stroke();
    x.restore();
  }
  x.restore();
  // Deux cartes : un modem par opérateur. Orange en retrait, MTN devant.
  const ws = u * (l.v ? 0.28 : 0.24);
  sim(x, cxI + ws * 0.42, cyI - ws * 0.2 + (1 - entree) * u * 0.08, ws * 0.92, { libelle: "Orange ·4432", pastille: C.orange, rotation: 0.09, alpha: entree * 0.85 });
  sim(x, cxI - ws * 0.1, cyI + (1 - entree) * u * 0.08, ws, { libelle: "MTN ·8901", pastille: C.mtn, sous: "8923 7010 … 8901", rotation: -0.05, alpha: entree });
  // Le dernier SMS arrivé se lit en grand ; les précédents s'effacent dessous.
  const arrivees = o.arrivees || [0.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  const recus = arrivees.filter((a) => l.l >= a).length;
  x.textAlign = "left";
  for (let r = 0; r < Math.min(recus, l.v ? 2 : 4); r++) {
    const i = recus - 1 - r;
    const [, txt] = SMS_ESSAI[i % SMS_ESSAI.length];
    const e = r === 0 ? acc.sortie3(avance(l.l, arrivees[i], arrivees[i] + 0.4)) : 1;
    const court = r === 0 ? (txt.match(/^[^.(]*/)[0].trim()) : (txt.length > 34 ? txt.slice(0, 34) + "…" : txt);
    if (r === 0) police(x, u * (l.v ? 0.042 : 0.034), 600, POLICE); else police(x, u * (l.v ? 0.026 : 0.02), 500, CHASSE);
    const largeurMax = ici.w - u * 0.12;
    let t_ = court; while (x.measureText(t_).width > largeurMax && t_.length > 8) t_ = t_.slice(0, -2);
    if (t_ !== court) t_ = t_.trim() + "…";
    x.fillStyle = `rgba(244,239,233,${(r === 0 ? 0.95 : 0.34 - r * 0.07) * e})`;
    x.fillText(t_, ici.x + u * 0.06, hautIci + u * 0.27 + (r === 0 ? 0 : u * 0.024 + r * u * 0.04) - (1 - e) * u * 0.02);
  }
  // LÀ-BAS : Montréal d'abord — 04:12 contre 09:12, la nuit contre le jour.
  // Puis un feuilletage — Paris, Bruxelles — et retour à Montréal.
  const feuillet = o.feuillet || [[0, 2], [5, 0], [6, 1], [7, 2]];
  let k = 2, depuis = 0, avant = 2;
  for (const [tt, kk] of feuillet) if (l.l >= tt) { avant = k; k = kk; depuis = tt; }
  const ville = AILLEURS[k];
  const d = km([4.05, 9.7], [ville.lat, ville.lon]);
  const dAvant = depuis === 0 ? d : km([4.05, 9.7], [AILLEURS[avant].lat, AILLEURS[avant].lon]);
  const bascule = acc.sortie4(avance(l.l, depuis, depuis + 0.3));
  // En vertical, la marge droite laisse la colonne d'icônes des applications.
  const droite = la.x + la.w - (l.v ? l.W * 0.12 : u * 0.06);
  police(x, u * 0.026, 600); x.fillStyle = "rgba(244,239,233,0.6)"; x.textAlign = "right";
  x.letterSpacing = `${u * 0.004}px`; x.fillText(ville.ville, droite, hautLa + u * 0.06); x.letterSpacing = "0px";
  x.save(); x.globalAlpha *= entree;
  police(x, u * 0.15, 700); x.fillStyle = "#9fb3c8"; x.letterSpacing = `${-u * 0.004}px`;
  x.fillText(heure(9 + ville.decalage, minute), droite + u * 0.005, hautLa + u * 0.2 + (1 - entree) * u * 0.05); x.letterSpacing = "0px";
  // La distance, en chiffres qui roulent à chaque ville.
  police(x, u * 0.05, 600); x.fillStyle = C.clair;
  x.fillText(`à ${montant(Math.round(melange(dAvant, d, bascule)))} km`, droite, hautLa + u * 0.28);
  x.restore();
  // Le téléphone de celui qui est loin : l'écran de veille, et rien dessus.
  // Il s'approche quand on dit « rien ». En vertical, il reste au-dessus de la
  // légende des applications.
  const [a0, a1] = o.approche || [8.5, 13];
  const zT = 1 + 0.08 * acc.deux3(avance(l.l, a0, a1));
  const hT = (l.v ? la.h * 0.4 : la.h * 0.5) * zT;
  const pxT = la.x + la.w * (l.v ? 0.22 : 0.5), pyT = la.y + la.h * (l.v ? 0.45 : 0.64);
  telephone(x, pxT, pyT, hT, (e) => {
    e.fillStyle = "#07080a"; e.fillRect(0, 0, PT_W, PT_H);
    const g = e.createLinearGradient(0, 0, PT_W, PT_H);
    const r = ((l.s * 0.08) % 1.4) - 0.2;
    g.addColorStop(borne(r - 0.15), "rgba(159,179,200,0)"); g.addColorStop(borne(r), "rgba(159,179,200,0.09)"); g.addColorStop(borne(r + 0.15), "rgba(159,179,200,0)");
    e.fillStyle = g; e.fillRect(0, 0, PT_W, PT_H);
    // L'heure de là-bas, en veille, et la phrase qui dit le vide.
    e.textAlign = "center"; e.textBaseline = "alphabetic";
    police(e, PT_W * 0.2, 300); e.fillStyle = "rgba(159,179,200,0.55)";
    e.fillText(heure(9 + ville.decalage, minute), PT_W / 2, PT_H * 0.26);
    police(e, PT_W * 0.055, 500); e.fillStyle = "rgba(159,179,200,0.45)";
    e.fillText("Aucune notification", PT_W / 2, PT_H * 0.56);
  }, { ombre: false });
  // Un liseré froid : sans ombre, le corps se détache du fond.
  if (o.lisere !== false) {
    const kT = hT / (PT_H + 28), wT = hT * (PT_W + 28) / (PT_H + 28);
    x.save(); x.strokeStyle = "rgba(159,179,200,0.35)"; x.lineWidth = 2;
    rr(x, pxT - wT / 2 - 3, pyT - hT / 2 - 3, wT + 6, hT + 6, 58 * kT + 3); x.stroke();
    x.restore();
  }
  x.restore();
  // La couture : elle se trace à la première image, de bout en bout.
  const [x0, y0, x1, y1] = m.couture;
  const pc = acc.sortie3(avance(l.l, 0, 0.5));
  x.strokeStyle = "rgba(244,239,233,0.22)"; x.lineWidth = 2;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(melange(x0, x1, pc), melange(y0, y1, pc)); x.stroke();
  return { telephone: { x: pxT, y: pyT, h: hT } };
}

// --- Le point : la Tresse remplace la couture ------------------------------------------------------
// Tout est plat. Il ne reste que le fantôme de la couture. Un point de
// latérite naît — la première couleur de marque du film — et les deux brins
// partent de lui, le long de la couture, qu'ils effacent en passant.
export function pointMonde(x, l, o = {}) {
  x.fillStyle = C.encre; x.fillRect(0, 0, l.W, l.H);
  const m = moities(l);
  const h = hauteurPoint(l);
  const trace = acc.deux3(avance(l.l, o.debutTrace ?? 1, o.finTrace ?? 4));
  // Le fil de la couture s'efface une fois les brins posés : le symbole ne pend à rien.
  const efface = 1 - acc.deux3(avance(l.l, o.finTrace ?? 4, (o.finTrace ?? 4) + 1));
  const [x0, y0, x1, y1] = m.couture;
  x.save(); x.strokeStyle = "rgba(244,239,233,0.14)"; x.lineWidth = 2; x.globalAlpha = efface;
  if (l.v) {
    x.globalAlpha = efface * (1 - trace); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  } else {
    const yHaut = l.H / 2 - h / 2, yFront = yHaut + h * trace;
    x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0, yHaut); x.moveTo(x0, yFront); x.lineTo(x1, y1); x.stroke();
  }
  x.restore();
}
// Où se tient la Tresse à la fin du plan « point » : un peu plus haute et plus
// petite, pour laisser à la phrase sa zone de protection. La plongée part de là.
export function poseApresPoint(l) {
  return { h: l.v ? l.W * 0.5 : l.u * 0.36, y: l.H * (l.v ? 0.4 : 0.4) };
}
// La Tresse à sa naissance : 46 % du petit côté en 16:9 ; en vertical, où la
// hauteur abonde, 62 % de la largeur — sinon elle flotte dans le vide.
export function hauteurPoint(l) {
  return l.v ? l.W * 0.62 : l.u * 0.46;
}
export function pointVerite(x, l, o = {}) {
  const naissance = acc.sortie4(avance(l.l, 0, 1));
  const trace = acc.deux3(avance(l.l, o.debutTrace ?? 1, o.finTrace ?? 4));
  const [r0, r1] = o.recul || [(o.finTrace ?? 4) + 0.5, (o.finTrace ?? 4) + 1.5];
  const recul = acc.deux3(avance(l.l, r0, r1));
  const fin = poseApresPoint(l);
  const h = melange(hauteurPoint(l), fin.h, recul);
  const cx = l.W / 2, cy = melange(l.H / 2, fin.y, recul);
  if (trace <= 0) {
    // Le point : le bout commun des deux brins, là où ils vont naître.
    const k = h / (BAS - HAUT);
    x.beginPath(); x.arc(cx, cy - h / 2, 4.8 * k / 2 * naissance, 0, 7); x.fillStyle = C.lateriteClair; x.fill();
    return;
  }
  dessinerTresse(x, { x: cx, y: cy, h, fin: trace, couleur: C.lateriteClair });
}

// --- La plongée dans le losange ------------------------------------------------------------------
// La caméra plonge dans le jour central de la Tresse : le vide du symbole
// devient une porte. k grandit de façon exponentielle ; au-delà d'un certain
// grossissement, seul le vide remplit l'écran.
export function plongee(x, l, o = {}) {
  const depart = poseApresPoint(l);
  const k0 = depart.h / (BAS - HAUT);
  const f = avance(l.l, o.de ?? 0, o.a ?? 4);
  const k = k0 * Math.pow(o.facteur ?? 60, Math.pow(f, 1.8));
  // Le centre du losange glisse vers le centre de l'image pendant qu'on plonge.
  const oy = melange(depart.y, l.H / 2, acc.deux3(borne(f * 2)));
  dessinerTresseCadre(x, l.W, l.H, { k, ox: l.W / 2, oy, couleur: C.lateriteClair });
}
