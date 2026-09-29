// Les écrans de TOTEM, redessinés pour bouger.
//
// Ce n'est pas une invention : chaque pièce suit ce que l'application montre
// vraiment (boutique/captures/, web/noyau/textes/, mobile/src/). Mêmes
// libellés, mêmes gris, mêmes rayons de 8 points, même carte sombre. Les
// données sont celles du faux nuage des essais (web/scripts/faux-nuage.mjs) —
// « Boutique », MTN ·8901, MAMA CLARISSE — jamais un vrai client.
//
// Deux écarts assumés, tous deux dictés par la charte (docs/IDENTITE.md §6) :
// les logos des opérateurs ne sont pas dessinés (marques de tiers), et leurs
// couleurs ne vivent qu'en pastille de quelques points ; et le filigrane de la
// carte est en latérite clair (le mobile le teint à la couleur de l'opérateur,
// ce que la charte interdit), sur la tranche droite, jamais sous le chiffre.

import { C, dessinerTresse, MOT, dessinerMot } from "./marque.js";
import { borne, montant } from "./outils.js";

export const POLICE = "Inter, sans-serif";
export const MARQUE = "'DM Sans', Inter, sans-serif";
export const CHASSE = "'JetBrains Mono', monospace";

export function rr(x, px, py, w, h, r) {
  x.beginPath();
  x.roundRect(px, py, w, h, r);
}

function texte(x, s, px, py, taille, o = {}) {
  x.font = `${o.graisse || 400} ${taille}px ${o.police || POLICE}`;
  x.fillStyle = o.couleur || C.texte;
  x.textAlign = o.align || "left";
  x.textBaseline = o.base || "alphabetic";
  if (o.espace) x.letterSpacing = `${o.espace}px`;
  x.fillText(s, px, py);
  if (o.espace) x.letterSpacing = "0px";
}

// --- Les icônes : trait de 1,5 sur une grille de 24, bouts arrondis --------------
export function icone(x, nom, cx, cy, taille, couleur = C.texte, trait = 1.5) {
  const k = taille / 24;
  x.save();
  x.translate(cx - taille / 2, cy - taille / 2);
  x.scale(k, k);
  x.strokeStyle = couleur; x.fillStyle = couleur;
  x.lineWidth = trait; x.lineCap = "round"; x.lineJoin = "round";
  x.beginPath();
  const L = (...p) => { x.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]); };
  switch (nom) {
    case "bas": L(12, 4, 12, 20); L(6, 14, 12, 20, 18, 14); break;
    case "haut": L(12, 20, 12, 4); L(6, 10, 12, 4, 18, 10); break;
    case "portefeuille": x.roundRect(3.5, 6.5, 17, 13, 2.5); L(6, 6.5, 17, 3.8, 17.5, 6.5); x.moveTo(17, 13); x.arc(16.5, 13, 0.6, 0, 7); break;
    case "telephone": x.roundRect(7, 3, 10, 18, 2); L(11, 17.5, 13, 17.5); break;
    case "maison": L(4, 11, 12, 4, 20, 11); L(6, 9.5, 6, 20, 18, 20, 18, 9.5); break;
    case "carte": x.roundRect(3, 6, 18, 12, 2); L(3, 10, 21, 10); break;
    case "boite": L(3, 13, 3, 19, 21, 19, 21, 13); L(3, 13, 8, 13, 9.5, 15.5, 14.5, 15.5, 16, 13, 21, 13); L(3, 13, 5.5, 5, 18.5, 5, 21, 13); break;
    case "grille": x.roundRect(4, 4, 7, 7, 1.5); x.roundRect(13, 4, 7, 7, 1.5); x.roundRect(4, 13, 7, 7, 1.5); x.roundRect(13, 13, 7, 7, 1.5); break;
    case "oeil": x.moveTo(2.5, 12); x.quadraticCurveTo(12, 2, 21.5, 12); x.quadraticCurveTo(12, 22, 2.5, 12); x.moveTo(15, 12); x.arc(12, 12, 3, 0, 7); L(4, 4, 20, 20); break;
    case "rafraichir": x.arc(12, 12, 7.5, -Math.PI * 0.35, Math.PI * 1.45); L(15.5, 3.5, 17, 6.5, 13.8, 7.6); break;
    case "fiche": x.roundRect(3, 5, 18, 14, 2); x.moveTo(10, 10); x.arc(8.5, 10, 1.6, 0, 7); L(5.5, 15.5, 8.5, 13.5, 11.5, 15.5); L(13.5, 10, 18, 10); L(13.5, 13.5, 18, 13.5); break;
    case "cadenas": x.roundRect(5, 10.5, 14, 10, 2); x.moveTo(8, 10.5); x.arc(12, 8.5, 4, Math.PI, 0); x.lineTo(16, 10.5); break;
    case "haut-parleur": L(4, 9.5, 4, 14.5, 8, 14.5, 13, 18.5, 13, 5.5, 8, 9.5, 4, 9.5); x.moveTo(16.5, 9); x.quadraticCurveTo(18.5, 12, 16.5, 15); break;
    case "chevron": L(9, 5, 16, 12, 9, 19); break;
    case "reglages": x.arc(12, 12, 3, 0, 7); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.moveTo(12 + Math.cos(a) * 6.5, 12 + Math.sin(a) * 6.5); x.lineTo(12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9); } x.moveTo(18.5, 12); x.arc(12, 12, 6.5, 0, 7); break;
    case "effacer": L(8, 5, 21, 5, 21, 19, 8, 19, 2.5, 12, 8, 5); L(12, 9.5, 17, 14.5); L(17, 9.5, 12, 14.5); break;
    case "coche": L(5, 12.5, 10, 17.5, 19, 7); break;
    case "signal": for (let i = 0; i < 4; i++) { x.moveTo(5 + i * 4.5, 19); x.lineTo(5 + i * 4.5, 16 - i * 3.5); } break;
    case "document": L(6, 3, 14, 3, 19, 8, 19, 21, 6, 21, 6, 3); L(14, 3, 14, 8, 19, 8); L(9, 13, 16, 13); L(9, 16.5, 16, 16.5); break;
    default: break;
  }
  x.stroke();
  x.restore();
}

// --- Le téléphone -----------------------------------------------------------------
// Un appareil générique, ni Apple ni Samsung : un bloc sombre, un bord fin qui
// accroche la lumière, un îlot pour la caméra. L'ombre est celle de l'objet,
// pas celle de la marque.
export const PT_W = 390, PT_H = 844;
export function telephone(x, cx, cy, h, dessinerEcran, o = {}) {
  const w = h * (PT_W + 28) / (PT_H + 28);
  const k = h / (PT_H + 28);
  const r = 58 * k;
  x.save();
  x.translate(cx, cy);
  if (o.rotation) x.rotate(o.rotation);
  if (o.ombre !== false) {
    x.save();
    x.shadowColor = "rgba(0,0,0,0.55)"; x.shadowBlur = h * 0.08; x.shadowOffsetY = h * 0.03;
    rr(x, -w / 2, -h / 2, w, h, r); x.fillStyle = "#0b0b0d"; x.fill();
    x.restore();
  }
  rr(x, -w / 2, -h / 2, w, h, r); x.fillStyle = "#0b0b0d"; x.fill();
  const g = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, "rgba(255,255,255,0.28)"); g.addColorStop(0.5, "rgba(255,255,255,0.05)"); g.addColorStop(1, "rgba(255,255,255,0.18)");
  x.strokeStyle = g; x.lineWidth = Math.max(1, 2.2 * k); x.stroke();
  // L'écran : 390 × 844 points, à l'échelle k.
  const ex = -PT_W * k / 2, ey = -PT_H * k / 2;
  x.save();
  rr(x, ex, ey, PT_W * k, PT_H * k, 46 * k); x.clip();
  x.translate(ex, ey); x.scale(k, k);
  dessinerEcran(x);
  x.restore();
  // La caméra, en poinçon : un téléphone Android générique — c'est là que la
  // sonnerie est prouvée (docs/MOBILE.md : sans clé Apple, un iPhone ne sonne pas).
  x.beginPath(); x.arc(0, ey + 24 * k, 9 * k, 0, 7); x.fillStyle = "#000"; x.fill();
  x.restore();
  return { w, h, k };
}

// --- L'écran d'accueil (« Vue d'ensemble ») -------------------------------------------
// e : { solde, soldeVisible (0..1), nouveau (0..1 : un SMS qui entre en tête),
//       tuileActive (0..3 ou -1), appui (0..1) }
export function ecranAccueil(x, e = {}) {
  x.fillStyle = C.surface; x.fillRect(0, 0, PT_W, PT_H);
  // Barre d'état.
  texte(x, "9:41", 32, 34, 15, { graisse: 600 });
  icone(x, "signal", 330, 29, 16, C.texte, 2);
  rr(x, 348, 22, 24, 12, 3.5); x.strokeStyle = C.texte; x.lineWidth = 1.2; x.stroke(); rr(x, 350, 24, 18, 8, 2); x.fillStyle = C.texte; x.fill();

  texte(x, "Bonjour, Boutique", 16, 78, 14, { couleur: C.texteDoux });
  texte(x, "Vue d’ensemble", 16, 106, 26, { graisse: 600 });
  icone(x, "reglages", 360, 96, 22, C.texte);

  // Les deux cartes SIM : la pastille de couleur de l'opérateur, 6 points.
  const puce = (px, libelle, pastille, actif) => {
    x.font = `500 14px ${POLICE}`;
    const w = x.measureText(libelle).width + 44;
    rr(x, px, 126, w, 34, 17);
    x.fillStyle = actif ? C.accent2 || "#2c2c2c" : C.carte; x.fill();
    if (!actif) { x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke(); }
    x.beginPath(); x.arc(px + 18, 143, 3, 0, 7); x.fillStyle = pastille; x.fill();
    texte(x, libelle, px + 28, 148, 14, { graisse: 500, couleur: actif ? "#fff" : C.texte });
    return w;
  };
  const w1 = puce(70, "MTN ·8901", C.mtn, true);
  puce(70 + w1 + 8, "Orange ·4432", C.orange, false);

  // La carte « la caisse ».
  const cx = 16, cy = 176, cw = 358, ch = 226;
  const dg = x.createLinearGradient(cx + cw * 0.1, cy, cx + cw * 0.9, cy + ch);
  dg.addColorStop(0, "#3a331a"); dg.addColorStop(0.45, "#161618"); dg.addColorStop(1, "#0d0d0f");
  rr(x, cx, cy, cw, ch, 20); x.fillStyle = dg; x.fill();
  // Le filigrane : latérite clair (la charte interdit le symbole jaune), 10 %.
  x.save(); rr(x, cx, cy, cw, ch, 20); x.clip();
  dessinerTresse(x, { x: cx + cw * 0.97, y: cy + ch * 0.86, h: ch * 0.95 * (27.6 - 4.4) / 28, couleur: C.lateriteClair, alpha: 0.12 });
  x.restore();
  texte(x, "MTN MoMo", cx + 22, cy + 38, 13, { graisse: 600, couleur: "rgba(255,255,255,0.72)", espace: 0.5 });
  x.beginPath(); x.arc(cx + 14, cy + 33.5, 3, 0, 7); x.fillStyle = C.mtn; x.fill();
  icone(x, "signal", cx + cw - 30, cy + 32, 16, "#ffffff", 2.2);
  // Masqué par défaut dans l'application ; le teaser le découvre d'un geste.
  const vis = e.soldeVisible ?? 1;
  const s = e.solde ?? 412500;
  x.save();
  x.globalAlpha = vis;
  texte(x, montant(s), cx + 22, cy + 122, 58, { graisse: 700, couleur: "#fff", espace: -1.5 });
  x.font = `700 58px ${POLICE}`; x.letterSpacing = "-1.5px";
  const lw = x.measureText(montant(s)).width; x.letterSpacing = "0px";
  texte(x, "FCFA", cx + 28 + lw, cy + 122, 18, { graisse: 500, couleur: "rgba(255,255,255,0.6)" });
  x.restore();
  if (vis < 1) { x.save(); x.globalAlpha = 1 - vis; texte(x, "••••••", cx + 22, cy + 118, 44, { graisse: 700, couleur: "#fff" }); x.restore(); }
  texte(x, "677 12 34 56", cx + 22, cy + 180, 17, { graisse: 500, couleur: "rgba(255,255,255,0.92)", espace: 2 });
  texte(x, "CAISSE PRINCIPALE", cx + cw - 20, cy + 180, 11, { graisse: 500, couleur: "rgba(255,255,255,0.55)", align: "right", espace: 1.4 });
  texte(x, "↻  D’après l’interrogation de 23:24", PT_W / 2, cy + ch + 22, 12, { couleur: C.texteFaible, align: "center" });

  // Trois commandes rondes.
  ["oeil", "rafraichir", "fiche"].forEach((n, i) => {
    const bx = PT_W / 2 + (i - 1) * 62, by = cy + ch + 64;
    x.beginPath(); x.arc(bx, by, 22, 0, 7); x.fillStyle = C.carte; x.fill(); x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke();
    icone(x, n, bx, by, 20, C.texte);
  });

  // Les quatre tuiles.
  const tuiles = [["bas", "Dépôt"], ["portefeuille", "Retrait"], ["haut", "Transfert"], ["telephone", "Mon numéro"]];
  tuiles.forEach(([ic, lib], i) => {
    const tx = 16 + (i % 2) * 183, ty = cy + ch + 102 + Math.floor(i / 2) * 84, tw = 175, th = 76;
    const actif = e.tuileActive === i;
    const ap = actif ? (e.appui || 0) : 0;
    x.save();
    x.translate(tx + tw / 2, ty + th / 2); x.scale(1 - 0.03 * ap, 1 - 0.03 * ap); x.translate(-(tx + tw / 2), -(ty + th / 2));
    rr(x, tx, ty, tw, th, 8); x.fillStyle = ap > 0 ? `rgba(230,230,230,${0.5 + 0.5 * ap})` : C.carte; x.fill();
    if (ap <= 0) { x.fillStyle = C.carte; x.fill(); }
    x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke();
    icone(x, ic, tx + tw / 2, ty + 27, 20, C.texte);
    texte(x, lib, tx + tw / 2, ty + 58, 15, { align: "center", graisse: 500 });
    x.restore();
  });

  // Les derniers SMS.
  const ly = cy + ch + 290;
  texte(x, "Derniers SMS", 16, ly, 20, { graisse: 600 });
  texte(x, "Tout voir ›", PT_W - 16, ly, 14, { couleur: C.texteDoux, align: "right" });
  const lignes = [
    { sens: "entree", nom: "MAMA CLARISSE", meta: "23:18", montant: "+35 000 FCFA" },
    { sens: "code", nom: "MTN", meta: "22:51" },
    { sens: "sortie", nom: "BOUTIQUE AKWA", meta: "22:01", montant: "−5 000 FCFA" },
    { sens: "entree", nom: "TAILLEUR JEAN", meta: "18:36", montant: "+8 000 FCFA", nonLu: false },
  ];
  if (e.nouveauSms) lignes.unshift(e.nouveauSms);
  const n = e.nouveau ?? 1;
  const hL = 68;
  x.save();
  rr(x, 16, ly + 14, PT_W - 32, hL * 5, 8); x.clip();
  let y0 = ly + 14 - (e.nouveauSms ? hL * (1 - n) : 0);
  lignes.forEach((l, i) => {
    x.save();
    if (e.nouveauSms && i === 0) x.globalAlpha = borne(n * 1.5);
    ligneSms(x, 16, y0 + i * hL, PT_W - 32, hL, l, e.nouveauSms && i === 0 ? e.eclat || 0 : 0);
    x.restore();
  });
  x.restore();
  rr(x, 16, ly + 14, PT_W - 32, hL * 5, 8); x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke();

  barreOnglets(x, 0);
}

export function ligneSms(x, px, py, w, h, l, eclat = 0) {
  x.fillStyle = C.carte; x.fillRect(px, py, w, h);
  if (eclat > 0) { x.fillStyle = `rgba(20,174,92,${0.14 * eclat})`; x.fillRect(px, py, w, h); }
  x.fillStyle = C.ligne; x.fillRect(px, py + h - 1, w, 1);
  const fonds = { entree: "#d3f5de", sortie: C.surface2, code: C.surface2, pub: "#fff1c2" };
  const ics = { entree: "bas", sortie: "haut", code: "cadenas", pub: "haut-parleur" };
  const coul = { entree: C.positif, sortie: C.texte, code: C.texte, pub: "#5b4200" };
  rr(x, px + 16, py + 16, 36, 36, 6); x.fillStyle = fonds[l.sens]; x.fill();
  icone(x, ics[l.sens], px + 34, py + 34, 16, coul[l.sens]);
  if (l.nonLu !== false && (l.sens === "entree" || l.sens === "code")) { x.beginPath(); x.arc(px + 66, py + 29, 3, 0, 7); x.fillStyle = C.texte; x.fill(); }
  texte(x, l.nom, px + (l.sens === "entree" || l.sens === "code" ? 74 : 66), py + 34, 15.5, { graisse: 500 });
  texte(x, l.meta, px + 66, py + 53, 12.5, { couleur: C.texteFaible });
  if (l.montant) texte(x, l.montant, px + w - 16, py + 38, 15, { graisse: 600, couleur: l.sens === "entree" ? C.positif : C.negatif, align: "right" });
}

export function barreOnglets(x, actif = 0) {
  const bw = 290, bh = 58, bx = (PT_W - bw) / 2, by = PT_H - 34 - bh;
  x.save();
  x.shadowColor = "rgba(0,0,0,0.12)"; x.shadowBlur = 18; x.shadowOffsetY = 4;
  rr(x, bx, by, bw, bh, 29); x.fillStyle = "rgba(255,255,255,0.97)"; x.fill();
  x.restore();
  rr(x, bx, by, bw, bh, 29); x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke();
  const noms = [["maison", "Accueil"], ["carte", "Cartes"], ["boite", "SMS"], ["grille", "Opérations"]];
  let px = bx + 6;
  noms.forEach(([ic, lib], i) => {
    if (i === actif) {
      x.font = `600 14px ${POLICE}`;
      const w = x.measureText(lib).width + 56;
      rr(x, px, by + 6, w, bh - 12, 23); x.fillStyle = "#2c2c2c"; x.fill();
      icone(x, ic, px + 22, by + bh / 2, 20, "#fff", 1.7);
      texte(x, lib, px + 38, by + bh / 2 + 5, 14, { graisse: 600, couleur: "#fff" });
      px += w + 4;
    } else {
      icone(x, ic, px + 24, by + bh / 2, 20, C.texteDoux, 1.5);
      px += 50;
    }
  });
}

// --- La notification : le SMS, mot pour mot ----------------------------------------
// Sur l'écran verrouillé, les chiffres d'un code partent (masquer_le_code) ;
// un encaissement, lui, se lit entier.
export function notification(x, px, py, w, o) {
  const h = o.hauteur || 116;
  x.save();
  rr(x, px, py, w, h, 22);
  x.fillStyle = o.fond || "rgba(245,245,245,0.94)"; x.fill();
  // L'icône de l'application : la tuile encre, le symbole sable à 66 %.
  const ix = px + 16, iy = py + 16, is = 38;
  rr(x, ix, iy, is, is, is * 7.2 / 32); x.fillStyle = C.encre; x.fill();
  dessinerTresse(x, { x: ix + is / 2, y: iy + is / 2, h: is * 0.66 * (27.6 - 4.4) / 32, couleur: C.sable, tisse: is >= 22 });
  texte(x, o.titre || "TOTEM", px + 66, py + 32, 14, { graisse: 600 });
  texte(x, o.heure || "maintenant", px + w - 16, py + 32, 12.5, { couleur: C.texteFaible, align: "right" });
  x.font = `400 14px ${POLICE}`;
  const mots = o.texte.split(" "), lignes = [];
  let l = "";
  for (const m of mots) { const t = l ? l + " " + m : m; if (x.measureText(t).width > w - 84) { lignes.push(l); l = m; } else l = t; }
  lignes.push(l);
  lignes.slice(0, o.lignesMax || 4).forEach((s, i) => texte(x, s, px + 66, py + 54 + i * 19, 14, { couleur: C.texte }));
  x.restore();
  return h;
}

// --- Le pavé du code secret ---------------------------------------------------------
// Tel que mobile/src/pave-secret.tsx le dessine : des points qui se remplissent
// (jamais les chiffres), des touches blanches bordées, « Valider » grisé tant
// qu'il manque des chiffres. saisi : combien de chiffres composés ; touche : la
// touche sous le doigt, appui : 0..1.
export function pave(x, px, py, w, o = {}) {
  const k = w / 320;
  x.save(); x.translate(px, py); x.scale(k, k);
  rr(x, 0, 0, 320, 392, 16); x.fillStyle = C.surface; x.fill(); x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke();
  texte(x, "Code secret Mobile Money", 160, 38, 14, { graisse: 500, couleur: C.texteDoux, align: "center" });
  const n = o.saisi || 0, total = o.longueur || 5;
  for (let i = 0; i < total; i++) {
    x.beginPath(); const cx = 160 + (i - (total - 1) / 2) * 18;
    const gros = i === n - 1 ? 1 + 0.3 * (o.pouls || 0) : 1;
    if (i < n) { x.arc(cx, 64, 5 * gros, 0, 7); x.fillStyle = C.texte; x.fill(); }
    else { x.arc(cx, 64, 4, 0, 7); x.strokeStyle = C.texteFaible; x.lineWidth = 1; x.stroke(); }
  }
  const touches = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Effacer", "0", "Valider"];
  touches.forEach((t, i) => {
    const cx = 20 + (i % 3) * 96, cy = 92 + Math.floor(i / 3) * 72, tw = 88, th = 62;
    const actif = o.touche === t ? (o.appui || 0) : 0;
    x.save();
    if (actif) { x.translate(cx + tw / 2, cy + th / 2); x.scale(1 - 0.03 * actif, 1 - 0.03 * actif); x.translate(-cx - tw / 2, -cy - th / 2); }
    rr(x, cx, cy, tw, th, 8);
    if (t === "Valider") {
      const pret = n >= 4;
      x.globalAlpha = pret ? 1 : 0.6; x.fillStyle = pret ? (actif ? "#1e1e1e" : "#2c2c2c") : C.surface3 || "#d9d9d9"; x.fill();
      texte(x, "Valider", cx + tw / 2, cy + th / 2 + 5, 14, { align: "center", graisse: 600, couleur: pret ? "#fff" : C.texteDoux });
    } else if (t === "Effacer") {
      texte(x, "Effacer", cx + tw / 2, cy + th / 2 + 5, 14, { align: "center", couleur: C.texteDoux });
    } else {
      x.fillStyle = actif ? C.surface2 : C.carte; x.fill(); x.strokeStyle = C.ligne; x.lineWidth = 1; x.stroke();
      texte(x, t, cx + tw / 2, cy + th / 2 + 6, 17, { align: "center", graisse: 500 });
    }
    x.restore();
  });
  x.restore();
}

// --- Le reçu ---------------------------------------------------------------------------
// Le même dessin que recus/apercus/ : l'émetteur en haut, un seul gros montant
// au milieu, les preuves dans le bandeau sable. Le logo de l'opérateur, lui,
// n'est pas redessiné ici.
export function recu(x, px, py, w, o) {
  const k = w / 1000, h = 707;
  x.save(); x.translate(px, py); x.scale(k, k);
  rr(x, 0, 0, 1000, h, 10); x.fillStyle = "#ffffff"; x.fill();
  const cap = 22;
  // Sous 22 px de haut à l'écran, la charte sert la variante mini : les deux brins fondus.
  const hSym = cap * 1.45 * (27.6 - 4.4) / 28;
  dessinerTresse(x, { x: 90, y: 104, h: hSym, couleur: C.laterite, tisse: hSym * 28 / 23.2 * k >= 22 });
  dessinerMot(x, 90 + 13 + cap * 0.78 + 4, 104 + cap / 2, cap, C.encre);
  texte(x, o.titre || "Reçu de transfert", 935, 104, 20, { graisse: 700, align: "right", police: MARQUE });
  texte(x, o.numero || "N° TM-2026-0929-0042", 935, 128, 12, { couleur: C.texteFaible, align: "right" });
  x.fillStyle = C.ligne; x.fillRect(66, 152, 868, 1.5);
  texte(x, o.libelle || "MONTANT REÇU", 66, 282, 12, { graisse: 600, couleur: "#8a7d72", espace: 3, police: MARQUE });
  const m = montant(o.montant ?? 20000);
  texte(x, m, 62, 360, 84, { graisse: 700, couleur: C.encre, police: MARQUE, espace: -2 });
  x.font = `700 84px ${MARQUE}`; x.letterSpacing = "-2px"; const mw = x.measureText(m).width; x.letterSpacing = "0px";
  texte(x, "FCFA", 74 + mw, 360, 34, { graisse: 700, couleur: "#5c5c5c", police: MARQUE });
  texte(x, o.sens || "DE", 600, 282, 12, { graisse: 600, couleur: "#8a7d72", espace: 3, police: MARQUE });
  texte(x, o.de || "MAMA CLARISSE", 600, 318, 24, { graisse: 700, couleur: C.encre, police: MARQUE });
  texte(x, o.deNumero || "670 33 44 55", 600, 348, 17, { couleur: "#5c5c5c" });
  rr(x, 66, 480, 868, 130, 14); x.fillStyle = "#f5f2ee"; x.fill();
  [["OPÉRATEUR", o.operateur || "MTN MoMo"], ["DATE", o.date || "29 septembre 2026"], ["HEURE", o.heure || "23 h 18"]].forEach(([a, b], i) => {
    texte(x, a, 98 + i * 300, 526, 11, { graisse: 600, couleur: "#8a7d72", espace: 2.6, police: MARQUE });
    texte(x, b, 98 + i * 300, 574, 22, { graisse: 700, couleur: C.encre, police: MARQUE });
  });
  texte(x, "Douala", 66, 654, 12, { couleur: C.texteFaible });
  x.restore();
  return h * k;
}
