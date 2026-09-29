// La typographie qui bouge.
//
// Toutes ces fonctions prennent un `p` entre 0 et 1 (où en est l'entrée) et,
// quand il y a lieu, un `q` entre 0 et 1 (où en est la sortie). Aucune ne
// garde d'état : l'image n° n se dessine sans connaître l'image n - 1.

import { acc, borne, hache2, melange } from "./outils.js";
import { POLICE, CHASSE } from "./interface.js";

export function police(x, taille, graisse = 700, famille = POLICE) {
  x.font = `${graisse} ${taille}px ${famille}`;
}

// La plus grande taille (≤ max) pour que `texte` tienne dans `largeur`.
export function ajuster(x, texte, largeur, max, graisse = 700, famille = POLICE, espace = 0) {
  police(x, 100, graisse, famille);
  x.letterSpacing = `${espace * 100}px`;
  const w = Math.max(...String(texte).split("\n").map((l) => x.measureText(l).width));
  x.letterSpacing = "0px";
  return Math.min(max, (100 * largeur) / Math.max(1, w));
}

// Des mots qui montent de derrière un masque, l'un après l'autre.
// o : { x, y, taille, graisse, couleur, align, famille, decalage (entre deux mots, en fraction de p),
//       sortie (0..1), interligne, espace (em), accent: { mot: index, couleur } }
export function montee(x, texte, p, o) {
  const lignes = String(texte).split("\n");
  const taille = o.taille, inter = (o.interligne || 1.08) * taille;
  police(x, taille, o.graisse || 700, o.famille || POLICE);
  x.textBaseline = "alphabetic";
  const esp = (o.espace || 0) * taille;
  x.letterSpacing = `${esp}px`;
  const nMots = lignes.reduce((s, l) => s + l.split(" ").length, 0);
  const dec = o.decalage ?? Math.min(0.12, 0.6 / Math.max(1, nMots));
  let k = 0;
  const hTotal = inter * (lignes.length - 1);
  lignes.forEach((ligne, li) => {
    const mots = ligne.split(" ");
    const largeurs = mots.map((m) => x.measureText(m).width);
    const blanc = x.measureText(" ").width;
    const total = largeurs.reduce((a, b) => a + b, 0) + blanc * (mots.length - 1);
    let px = o.align === "left" ? o.x : o.align === "right" ? o.x - total : o.x - total / 2;
    const py = o.y - hTotal / 2 + li * inter + (o.centreV === false ? 0 : taille * 0.35);
    mots.forEach((m, mi) => {
      const e = acc.sortie4(borne((p - k * dec) / Math.max(0.05, 1 - dec * (nMots - 1))));
      const s = o.sortie ? acc.entree3(borne((o.sortie - k * dec * 0.5) / Math.max(0.05, 1 - dec * 0.5 * (nMots - 1)))) : 0;
      x.save();
      x.beginPath();
      x.rect(px - taille * 0.2, py - taille * 1.05, largeurs[mi] + taille * 0.4, taille * 1.35);
      x.clip();
      const dy = (1 - e) * taille * 1.15 - s * taille * 1.6;
      x.globalAlpha *= 1 - s;
      x.fillStyle = o.accent && o.accent.mot === k ? o.accent.couleur : o.couleur || "#fff";
      x.textAlign = "left";
      x.fillText(m, px, py + dy);
      x.restore();
      px += largeurs[mi] + blanc;
      k++;
    });
  });
  x.letterSpacing = "0px";
}

// Le texte se décode : des caractères au hasard se figent un à un sur le vrai.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#*%&$@";
export function decode(x, texte, p, o) {
  const n = texte.length;
  let s = "";
  for (let i = 0; i < n; i++) {
    const c = texte[i];
    const seuil = (i / n) * 0.7;
    if (c === " " || p >= seuil + 0.3) s += c;
    else if (p < seuil) s += p > seuil - 0.25 ? ALPHABET[Math.floor(hache2(i, Math.floor(p * 60) + (o.graine || 0)) * ALPHABET.length)] : " ";
    else s += ALPHABET[Math.floor(hache2(i * 7, Math.floor(p * 90)) * ALPHABET.length)];
  }
  police(x, o.taille, o.graisse || 700, o.famille || POLICE);
  x.letterSpacing = `${(o.espace || 0) * o.taille}px`;
  x.fillStyle = o.couleur || "#fff";
  x.textAlign = o.align || "center";
  x.textBaseline = "middle";
  x.fillText(s, o.x, o.y);
  x.letterSpacing = "0px";
}

// La machine à écrire, avec son curseur. Rend la position du curseur.
export function machine(x, texte, p, o) {
  const n = Math.floor(borne(p) * texte.length);
  police(x, o.taille, o.graisse || 500, o.famille || CHASSE);
  x.fillStyle = o.couleur || "#fff";
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  const lignes = couper(x, texte.slice(0, n), o.largeur || 1e9);
  const inter = (o.interligne || 1.4) * o.taille;
  lignes.forEach((l, i) => x.fillText(l, o.x, o.y + i * inter));
  const derniere = lignes[lignes.length - 1] || "";
  const cx = o.x + x.measureText(derniere).width + 2, cy = o.y + (lignes.length - 1) * inter;
  if (o.curseur !== false && (Math.floor((o.t || 0) * 2.2) % 2 === 0 || p < 1)) {
    x.fillStyle = o.couleurCurseur || o.couleur || "#fff";
    x.fillRect(cx, cy - o.taille * 0.85, o.taille * 0.55, o.taille * 1.05);
  }
  return { x: cx, y: cy, lignes };
}

// Coupe un texte en lignes qui tiennent dans `largeur`.
export function couper(x, texte, largeur) {
  const res = [];
  for (const para of String(texte).split("\n")) {
    const mots = para.split(" ");
    let l = "";
    for (const m of mots) {
      const t = l ? l + " " + m : m;
      if (x.measureText(t).width > largeur && l) { res.push(l); l = m; } else l = t;
    }
    res.push(l);
  }
  return res;
}

// Le coup : le mot arrive plus grand et flou, et se pose net sur le temps.
export function frappe(x, texte, p, o) {
  const e = acc.sortieExpo(borne(p));
  const echelle = melange(o.depuis || 1.6, 1, e);
  police(x, o.taille, o.graisse || 800, o.famille || POLICE);
  x.letterSpacing = `${(o.espace || 0) * o.taille}px`;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.save();
  x.translate(o.x, o.y);
  x.scale(echelle, echelle);
  // Un sillage : deux échos plus grands et plus pâles, qui s'éteignent.
  if (e < 0.98) {
    for (let i = 2; i >= 1; i--) {
      x.globalAlpha = (1 - e) * 0.25 / i;
      x.save(); x.scale(1 + i * 0.08 * (1 - e), 1 + i * 0.08 * (1 - e));
      x.fillStyle = o.couleur || "#fff"; x.fillText(texte, 0, 0); x.restore();
    }
  }
  x.globalAlpha = borne(p * 4) * (o.alpha ?? 1);
  x.fillStyle = o.couleur || "#fff";
  x.fillText(texte, 0, 0);
  x.restore();
  x.letterSpacing = "0px";
}

// Un compteur qui défile jusqu'à sa valeur, chiffres à chasse fixe.
export function compteur(x, valeur, p, o) {
  const v = Math.round(valeur * acc.sortie4(borne(p)));
  const s = (o.format || ((n) => String(n)))(v);
  police(x, o.taille, o.graisse || 700, o.famille || POLICE);
  x.fontVariantNumeric = "tabular-nums";
  x.fillStyle = o.couleur || "#fff";
  x.textAlign = o.align || "center"; x.textBaseline = "alphabetic";
  x.letterSpacing = `${(o.espace || 0) * o.taille}px`;
  x.fillText(s, o.x, o.y);
  x.letterSpacing = "0px";
  return s;
}

// Un trait qui se trace (souligné, filet, cadre).
export function trait(x, x0, y0, x1, y1, p, couleur, largeur = 2) {
  if (p <= 0) return;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(melange(x0, x1, borne(p)), melange(y0, y1, borne(p)));
  x.strokeStyle = couleur; x.lineWidth = largeur; x.lineCap = "round"; x.stroke();
}
