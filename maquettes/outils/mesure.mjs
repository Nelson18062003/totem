// Contrôle dimensionnel au pixel d'une maquette TOTEM ADMIN.
// Usage : node mesure.mjs <fichier.html> [--mobile]
// Charge la page dans Chromium, mesure chaque élément rendu, et liste les
// violations des normes (normes.json à côté de ce script). Zéro violation
// exigée avant toute livraison d'écran.
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ici = dirname(fileURLToPath(import.meta.url));
const fichier = process.argv[2];
const mobile = process.argv.includes("--mobile");
if (!fichier) { console.error("Usage : node mesure.mjs <fichier.html> [--mobile]"); process.exit(2); }

const normes = JSON.parse(readFileSync(join(ici, "normes.json"), "utf8"));
const N = mobile ? normes.mobile : normes.desktop;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--no-proxy-server"], proxy: { server: "direct://" },
});
const p = await b.newPage({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 940 },
  deviceScaleFactor: mobile ? 3 : 2,
});
await p.goto("file://" + resolve(fichier), { waitUntil: "load" });
await p.waitForTimeout(250);

const rapport = await p.evaluate((N) => {
  const violations = [];
  const vu = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return null;
    return r;
  };
  const idDe = (el) => {
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "")
      .trim().split(/\s+/).slice(0, 3).join(".");
    const texte = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}> « ${texte} »`;
  };
  const proche = (v, cible, tol = 0.6) => Math.abs(v - cible) <= tol;

  // 1. Débordement horizontal : interdit.
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1)
    violations.push({ regle: "debordement", detail: `la page déborde horizontalement (${de.scrollWidth}px pour ${de.clientWidth}px)` });

  // 2. Taille de police : uniquement l'échelle officielle.
  const textes = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!direct) continue;
    const r = vu(el); if (!r) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (!N.polices.some((t) => proche(fs, t, 0.15))) {
      const cle = `${fs}|${idDe(el)}`;
      if (!textes.has(cle)) { textes.add(cle); violations.push({ regle: "police", detail: `${fs}px hors échelle [${N.polices.join(", ")}] sur ${idDe(el)}` }); }
    }
  }

  // 2b. Un motif ne se pose pas sous une phrase.
  //   Le calcul de contraste part de la première couleur de fond opaque. Il ne
  //   sait rien d'une image : un titre posé sur le claustra à pleine opacité
  //   passait la mesure et restait illisible à l'œil. La règle est donc
  //   structurelle — l'élément qui porte le motif ne porte pas le texte. Le
  //   motif descend dans une couche (voir la classe .claustra de la feuille).
  const opaque = (c) => c && c !== "transparent" && !/rgba\([^)]*,\s*0(\.\d+)?\)$/.test(c);
  for (const fond of document.querySelectorAll("*")) {
    const bi = getComputedStyle(fond).backgroundImage;
    if (!bi || bi === "none" || !/url\(|gradient/.test(bi)) continue;
    for (const el of fond.querySelectorAll("*")) {
      const dit = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!dit) continue;
      // Y a-t-il une couleur pleine entre cette phrase et le motif ?
      let couvert = false;
      for (let p = el; p && p !== fond; p = p.parentElement)
        if (opaque(getComputedStyle(p).backgroundColor)) { couvert = true; break; }
      if (!couvert) {
        violations.push({ regle: "motif-sous-texte", detail: `« ${el.textContent.trim().slice(0, 42)} » repose à même un fond en image (${idDe(fond)}) — le motif doit descendre dans une couche` });
        break;   // une fois par motif suffit à le dire
      }
    }
  }

  // 3. Contrôles interactifs : hauteur exacte de l'échelle + cible minimale.
  const selInteractif = "button, a[href], [role=button], input, select, .btn, .tab, .segment i, .bascule";
  for (const el of document.querySelectorAll(selInteractif)) {
    if (el.closest("[data-mesure-ignore]")) continue;
    // Une case ou un bouton radio enfermé dans son étiquette n'est pas la
    // cible : toute l'étiquette l'est, et c'est là-dessus que le doigt tombe.
    // WCAG 2.2 §2.5.8 mesure la cible, pas le dessin qui la représente.
    let r = vu(el);
    if (el.matches("input[type=checkbox], input[type=radio]")) {
      // L'étiquette compte, qu'elle enferme la case ou qu'elle la désigne par
      // « for » : cliquer le texte coche la case, donc le texte EST la cible.
      const etq = el.closest("label")
        || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      const re = etq && vu(etq);
      if (re && r) r = { // l'union des deux boîtes, c'est ce que le doigt vise
        x: Math.min(r.x, re.x), y: Math.min(r.y, re.y),
        width: Math.max(r.x + r.width, re.x + re.width) - Math.min(r.x, re.x),
        height: Math.max(r.y + r.height, re.y + re.height) - Math.min(r.y, re.y),
      };
    }
    if (!r) continue;
    const enLigne = getComputedStyle(el).display === "inline" && el.tagName === "A";
    // Un lien dans une phrase se mesure à la phrase — on ne le contraint pas.
    if (enLigne) continue;
    if (r.height < N.cible_min || r.width < N.cible_min)
      violations.push({ regle: "cible", detail: `${Math.round(r.width)}×${Math.round(r.height)}px < ${N.cible_min}px minimum sur ${idDe(el)}` });
    // L'échelle des hauteurs vaut pour ce qui porte du texte sur une ligne.
    // Une case à cocher est carrée : sa mesure juste est la cible minimale de
    // 24px (WCAG 2.2 §2.5.8), déjà vérifiée au-dessus. La forcer à 28 ferait
    // une case plus haute que large, ce que personne ne dessine.
    const estCase = el.matches("input[type=checkbox], input[type=radio]");
    // Une rangée cliquable grandit avec son texte : elle relève de la règle des
    // rangées, pas de l'échelle des contrôles. Exception écrite dans la feuille.
    const estRangee = el.matches(".rangee");
    if (estRangee && r.height < N.ligne_table_min)
      violations.push({ regle: "rangee-basse", detail: `rangée de ${r.height.toFixed(0)}px sous le minimum de ${N.ligne_table_min}px sur ${idDe(el)}` });
    const estControle = !estCase && !estRangee && el.matches("button, [role=button], .btn, select, input, .tab");
    if (estControle && !N.hauteurs_controles.some((h) => proche(r.height, h)))
      violations.push({ regle: "hauteur-controle", detail: `hauteur ${r.height.toFixed(1)}px hors échelle [${N.hauteurs_controles.join(", ")}] sur ${idDe(el)}` });
  }

  // 4. Lignes de table : hauteur uniforme par table, et minimum respecté.
  for (const table of document.querySelectorAll("table, [data-table]")) {
    const lignes = [...table.querySelectorAll("tbody tr, [data-ligne]")].map((tr) => vu(tr)).filter(Boolean);
    if (lignes.length < 2) continue;
    const hs = lignes.map((r) => Math.round(r.height));
    const min = Math.min(...hs), max = Math.max(...hs);
    if (min < N.ligne_table_min)
      violations.push({ regle: "table", detail: `ligne de ${min}px < ${N.ligne_table_min}px minimum dans ${idDe(table)}` });
    if (max - min > N.ligne_table_ecart)
      violations.push({ regle: "table", detail: `lignes inégales (${min}→${max}px, écart ${max - min} > ${N.ligne_table_ecart}) dans ${idDe(table)}` });
  }

  // 4b. Une table ne doit jamais être plus large que la carte qui la porte :
  //     sinon une colonne entière disparaît sous le bord, sans rien signaler.
  for (const table of document.querySelectorAll("table")) {
    const r = vu(table); if (!r) continue;
    const hote = table.parentElement;
    const rh = hote.getBoundingClientRect();
    if (r.width > rh.width + 0.5)
      violations.push({ regle: "table-large", detail: `table de ${Math.round(r.width)}px dans un conteneur de ${Math.round(rh.width)}px — une colonne est coupée` });
  }

  // 5. Grille d'espacement : les retraits des grands blocs tombent sur la grille.
  for (const el of document.querySelectorAll(N.sel_blocs)) {
    const r = vu(el); if (!r) continue;
    const s = getComputedStyle(el);
    for (const cote of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
      const v = parseFloat(s[cote]);
      if (v > 0 && Math.abs(v / N.grille - Math.round(v / N.grille)) > 0.13)
        violations.push({ regle: "grille", detail: `${cote} ${v}px hors grille ${N.grille}px sur ${idDe(el)}` });
    }
  }

  // 6. Icônes SVG : uniquement les corps officiels.
  //    Le symbole de marque n'est PAS une icône : sa taille est fixée par la
  //    charte (docs/IDENTITE.md), pas par cette échelle. Il se déclare
  //    data-marque et sort du contrôle — mais il doit rester au-dessus de
  //    22px, seuil sous lequel la charte impose la variante fondue.
  for (const el of document.querySelectorAll("[data-marque]")) {
    const r = vu(el); if (!r) continue;
    if (r.height < 22)
      violations.push({ regle: "marque", detail: `symbole de marque à ${Math.round(r.height)}px — sous 22px la charte impose totem-symbole-mini.svg` });
  }
  for (const svg of document.querySelectorAll("svg")) {
    if (svg.closest("[data-mesure-ignore], [data-illustration], [data-marque]") || svg.hasAttribute("data-marque")) continue;
    const r = vu(svg); if (!r) continue;
    const carre = Math.abs(r.width - r.height) < 1.2;
    if (carre && !N.icones.some((t) => proche(r.width, t, 0.8)))
      violations.push({ regle: "icone", detail: `icône ${r.width.toFixed(1)}px hors échelle [${N.icones.join(", ")}] dans ${idDe(svg.parentElement)}` });
  }

  // 6b. Les chiffres doivent VRAIMENT avoir la même chasse. Déclarer
  //     « tabular-nums » ne suffit pas : si la police n'expose pas la fonction,
  //     la déclaration est sans effet et les colonnes flottent en silence.
  {
    const t = document.createElement("span");
    t.style.cssText = "position:absolute;visibility:hidden;font-size:100px;white-space:pre";
    document.body.appendChild(t);
    const l = (c) => { t.textContent = c.repeat(10); return t.getBoundingClientRect().width; };
    const larg = "0123456789".split("").map(l);
    t.remove();
    const ecart = Math.max(...larg) - Math.min(...larg);
    if (ecart > 1)
      violations.push({ regle: "chiffres", detail: `les chiffres n'ont pas la même chasse (écart ${(ecart / 10).toFixed(1)}px pour 100px de corps) — « tabular-nums » est sans effet avec cette police` });
  }

  // 7. Contraste réel de chaque texte sur son fond effectif (WCAG 2.2 §1.4.3).
  //    On remonte les ancêtres jusqu'au premier fond opaque : c'est le seul
  //    moyen de juger un texte pâle posé sur une carte posée sur le fond.
  const lum = (c) => {
    const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const rgb = (s) => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const alpha = (s) => { const m = s.match(/[\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
  const melange = (av, ar, a) => av.map((x, i) => x * a + ar[i] * (1 - a));
  const fondDe = (el) => {
    let n = el, fond = [255, 255, 255];
    const pile = [];
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const a = alpha(c);
      if (a > 0) { pile.push([rgb(c), a]); if (a === 1) break; }
      n = n.parentElement;
    }
    const base = getComputedStyle(document.body).backgroundColor;
    fond = rgb(base) || fond;
    for (let i = pile.length - 1; i >= 0; i--) fond = melange(pile[i][0], fond, pile[i][1]);
    return fond;
  };
  const vus = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!direct) continue;
    const r = vu(el); if (!r) continue;
    const st = getComputedStyle(el);
    const av = rgb(st.color); if (!av) continue;
    const encre = melange(av, fondDe(el), alpha(st.color));
    const fond = fondDe(el);
    const l1 = lum(encre), l2 = lum(fond);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const fs = parseFloat(st.fontSize), gras = Number(st.fontWeight) >= 700;
    const seuil = (fs >= 24 || (fs >= 18.66 && gras)) ? 3 : 4.5;
    if (ratio < seuil - 0.02) {
      const cle = st.color + "|" + fs + "|" + idDe(el);
      if (!vus.has(cle)) { vus.add(cle);
        violations.push({ regle: "contraste", detail: `${ratio.toFixed(2)}:1 < ${seuil}:1 exigé (${fs}px${gras ? " gras" : ""}) sur ${idDe(el)}` }); }
    }
  }

  // 8. Rythme : tout écart entre éléments vient de l'échelle d'espacement.
  const ECHELLE = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 104];
  for (const el of document.querySelectorAll(N.sel_blocs + ", .duo, .colonne, .kpis, .colonnes, .liste, .fil, .dl")) {
    const st = getComputedStyle(el);
    for (const prop of ["rowGap", "columnGap"]) {
      const v = parseFloat(st[prop]);
      if (!isNaN(v) && v > 0 && !ECHELLE.some((t) => Math.abs(t - v) < 0.5))
        violations.push({ regle: "rythme", detail: `${prop} ${v}px hors échelle d'espacement sur ${idDe(el)}` });
    }
  }

  return violations;
}, N);

await b.close();

if (rapport.length === 0) {
  console.log(`✔ ${fichier}${mobile ? " (mobile)" : ""} — zéro violation.`);
} else {
  console.log(`✘ ${fichier}${mobile ? " (mobile)" : ""} — ${rapport.length} violation(s) :`);
  for (const v of rapport) console.log(`  [${v.regle}] ${v.detail}`);
  process.exit(1);
}
