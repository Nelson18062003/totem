// Le découpage : chaque plan, son début et sa fin en temps musicaux, sa
// transition d'entrée, ses effets, et sa couche VÉRITÉ. Les temps doivent
// coïncider avec annonce/conducteur.json — montage.js refuse de tourner s'il
// y a un trou.
//
// Une règle tient tout le film : LE FAUX TREMBLE, LE VRAI NE BOUGE PAS. Un
// montant faux, une panique, une panne vivent dans le MONDE et subissent
// glitch, secousse, aberration. Un chiffre juste, l'interface réelle, la
// marque se posent dans la couche VÉRITÉ, que la post-production ne touche
// jamais — seule la caméra la déplace.
//
// Sept actes : la distance, le point (et le nom), ce qu'il fait, le piège,
// l'épreuve, le rappel, la signature. 117 temps : 58,5 s, plus la queue —
// sous la minute d'un statut WhatsApp.

import { C } from "./marque.js";
import { acc, avance, borne, melange } from "./outils.js";
import {
  fondEncre, fondSable, distance, carton, manoeuvre, revelation, revelationTresse, verrouillageAnime,
  titreDrop, region, dansRegion, ecoute, lecture, ecranVerrouille, menuBoutons, paveJoue, recuSort,
  attaque, claustra, carteFin, poussiere, balayage, motFantome, choc, coupure, coupureVerite,
  piegeLecture, piegeLegende, piegeChoc, piegeVerite, couture, moities, pointMonde, pointVerite, plongee, poseApresPoint,
} from "./scenes.js";
import { police, frappe, ajuster } from "./typo.js";
import { PT_W, PT_H } from "./interface.js";

// Le SMS du film, un seul texte partout : la notification le montre mot pour
// mot, le lecteur le lit. 09:13 à Douala, 04:13 à Montréal.
const SMS = "MobileMoney: Vous avez recu 35 000 FCFA de MAMA CLARISSE (670334455). Ref: PP260929.0913.A41. Nouveau solde: 447 500 FCFA.";

// Un carton posé dans une des deux moitiés de la couture. En vertical, la
// moitié du bas est courte (sa fin passe sous la légende des applications) :
// les cartons de « là-bas » se posent à droite du téléphone.
function cartonMoitie(x, l, cote, texte, o = {}) {
  const m = moities(l)[cote];
  const zone = l.v && cote === "la" ? { x: l.W * 0.42, y: l.H * 0.62, w: l.W * 0.46, h: l.H * 0.2 } : m;
  const y = l.v ? (cote === "la" ? zone.y + zone.h * 0.5 : m.y + m.h * 0.86) : m.y + m.h * 0.8;
  carton(x, { ...l, W: zone.w, H: zone.h, u: Math.min(m.w, m.h) }, l.v && cote === "la" ? texte.replace(" voyez", "\nvoyez") : texte, {
    ...o, x: zone.x + zone.w / 2, y, max: o.max || 0.1,
  });
}

// Une démonstration : le décor et le titre dans le monde, l'interface réelle
// dans la vérité.
const FANTOMES = {
  "Il écoute.": "ÉCOUTE", "Il lit.": "LECTURE",
  "On ne tape plus.\nOn appuie.": "BOUTONS", "Il compose.": "SECRET", "Et le reçu\nsuit.": "REÇU",
};
function decor(x, l, mot, sous, depuis = 0) {
  fondEncre(x, l, { lx: l.v ? 0.5 : 0.68, ly: l.v ? 0.6 : 0.5 });
  balayage(x, l);
  if (FANTOMES[mot]) motFantome(x, l, FANTOMES[mot]);
  poussiere(x, l, { force: 0.8 });
  if (l.l >= depuis) titreDrop(x, { ...l, l: l.l - depuis }, mot, sous);
}
function demo(mot, sous, fn) {
  return {
    dessiner: (x, l) => decor(x, l, mot, sous),
    verite: (x, l) => dansRegion(x, l, region(l), (x2, l2) => fn(x2, l2)),
  };
}
// Un carton qui FRAPPE : présent dès la première image, il arrive plus grand et se pose.
function cartonFrappe(x, l, texte, o = {}) {
  const lignes = texte.split("\n");
  const plusLongue = lignes.slice().sort((a, b) => b.length - a.length)[0];
  const t = ajuster(x, plusLongue, l.W * (l.v ? 0.8 : 0.74), l.u * (o.max || 0.14), o.graisse || 800);
  const p = avance(l.l, o.de ?? 0, (o.de ?? 0) + 0.35);
  lignes.forEach((ligne, i) => {
    const y = (o.y ?? l.H / 2) + (i - (lignes.length - 1) / 2) * t * 1.08;
    frappe(x, ligne, borne(p * 1.4 - i * 0.2), { x: l.W / 2, y, taille: t, graisse: o.graisse || 800, couleur: o.accent === i || o.accent2 === i ? C.lateriteClair : (o.couleur || C.clair), depuis: l.v ? 1.1 : 1.25, espace: -0.02 });
  });
}

export const PLANS = [
  // --- I. LA DISTANCE ------------------------------------------------------------------------------
  // La phrase qui dit la situation est là dès la première image : sur un fil,
  // la vidéo part muette, et l'image 0 sert d'aperçu.
  {
    nom: "couture", de: 0, a: 12,
    dessiner(x, l) {
      fondEncre(x, l, { force: 0.4 });
      couture(x, l, { approche: [8, 12] });
      if (l.l < 4.6) cartonMoitie(x, l, "ici", "Vos cartes SIM\nrestent au pays.", { de: -0.6, a: 0.1, sortie: avance(l.l, 4.1, 4.6), max: 0.08 });
      if (l.l >= 4.6 && l.l < 8.2) cartonMoitie(x, l, "ici", "Les paiements arrivent.", { de: 4.6, a: 5.2, sortie: avance(l.l, 7.7, 8.2), max: 0.08 });
    },
    // « Vous, non. » et « Vous ne voyez rien. » sont vrais : ils se posent sans trembler.
    verite(x, l) {
      if (l.l >= 2 && l.l < 4.6) cartonMoitie(x, l, "la", "Vous, non.", { de: 2, a: 2.3, sortie: avance(l.l, 4.1, 4.6), max: 0.14 });
      if (l.l >= 8.2) cartonMoitie(x, l, "la", "Vous ne voyez rien.", { de: 8.2, a: 8.7, max: 0.08 });
    },
    fx: () => ({ lueur: 0.12, grain: 0.07, vignette: 0.7 }),
  },
  {
    nom: "manoeuvre", de: 12, a: 20, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) {
      fondEncre(x, l, { force: 0.2 });
      x.save(); x.globalAlpha = l.v ? 0.1 : 0.22; couture(x, { ...l, l: 12 + l.l }, { ouverture: false, approche: [8, 12] }); x.restore();
      manoeuvre(x, l, { temps: [0, 1, 2, 3, 4, 5, 6, 7] });
    },
    fx: ({ l }) => ({ glitch: l > 5 && l < 5.35 ? 0.6 : l > 6 ? 0.2 + 0.3 * (l - 6) : 0, secousse: l > 6 ? 5 + 5 * (l - 6) : 0, lignes: 0.5 }),
  },
  {
    nom: "reseau", de: 20, a: 22, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) {
      fondEncre(x, l, { force: 0.2 });
      const t = ajuster(x, "Le réseau lâche…", l.W * (l.v ? 0.8 : 0.8), l.u * 0.2, 800, "'JetBrains Mono', monospace");
      frappe(x, "Le réseau lâche…", avance(l.l, 0, 0.3), { x: l.W / 2, y: l.H * 0.46, taille: t, graisse: 800, famille: "'JetBrains Mono', monospace", couleur: C.clair, depuis: l.v ? 1.08 : 1.3, espace: -0.03 });
      // Les barres du réseau, qui tombent une à une.
      const n = 4 - Math.min(4, Math.floor(l.l * 2.5));
      const u = l.u, bx = l.W / 2 - u * 0.1, by = l.H * 0.7;
      for (let i = 0; i < 4; i++) {
        x.fillStyle = i < n ? C.clair : "rgba(244,239,233,0.15)";
        x.fillRect(bx + i * u * 0.06, by - (i + 1) * u * 0.035, u * 0.04, (i + 1) * u * 0.035);
      }
    },
    fx: ({ l }) => ({ secousse: 10, glitch: 0.35 + 0.3 * l, aberration: 6, lignes: 0.6 }),
  },
  // Le film se rembobine lui-même, jusqu'à la première image.
  { nom: "rembobinage", de: 22, a: 24, rembobine: { courbe: 1.6 }, dessiner() {} },

  // --- II. LE POINT, ET LE NOM ---------------------------------------------------------------------
  {
    nom: "point", de: 24, a: 35, transition: { type: "coupe", duree: 0.01 },
    // Le point naît dans le silence — l'écran n'est jamais vide. Les brins se
    // tracent et prennent la place de la couture ; puis le nom se pose à côté,
    // avec ce qu'est la chose. Le mot se retire, la Tresse revient au centre,
    // et la plongée part de là.
    dessiner(x, l) { pointMonde(x, l, { debutTrace: 2, finTrace: 5 }); },
    verite(x, l) {
      const pose = poseApresPoint(l);
      if (l.l < 5.8) { pointVerite(x, l, { debutTrace: 2, finTrace: 5, recul: [5, 5.8] }); return; }
      const f = avance(l.l, 5.8, 7) - avance(l.l, 10.1, 11);
      verrouillageAnime(x, l, { f, hDepart: pose.h, y: pose.y });
      carton(x, l, "Un boîtier au pays.\nVos cartes SIM dedans.", {
        de: 6.8, a: 7.4, sortie: avance(l.l, 9.8, 10.3), y: l.H * (l.v ? 0.62 : 0.68), max: l.v ? 0.075 : 0.065, graisse: 600, couleur: "rgba(244,239,233,0.94)",
      });
    },
    fx: ({ l }) => ({ aberration: 0, lueur: 0, grain: 0.03 * borne((l - 1) / 1), vignette: 0.4 * borne((l - 1) / 1), pousse: 0 }),
  },
  {
    nom: "plongee", de: 35, a: 38, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.8 }); poussiere(x, l, { n: 120, force: 1.2 }); },
    verite(x, l) { plongee(x, l, { de: 0, a: 3, facteur: 90 }); },
    fx: ({ l }) => ({ zoomFlou: 0.12 * acc.entree3(borne(l / 3)), aberration: 0.5, pousse: 0 }),
  },

  // --- III. CE QU'IL FAIT --------------------------------------------------------------------------
  {
    // On sort du losange face à la notification, en gros plan : on la LIT.
    // Puis la caméra recule jusqu'au téléphone, et la phrase arrive.
    nom: "sonne", de: 38, a: 42, transition: { type: "losange", duree: 0.75 },
    dessiner: (x, l) => decor(x, l, "À travers lui,\nvous voyez.", "Le SMS de Douala,\nmot pour mot.", 2),
    verite(x, l) {
      const largeurNotif = l.v ? l.W * 0.86 : l.W * 0.6;
      const k1 = largeurNotif / (PT_W - 28), h1 = k1 * (PT_H + 28);
      const r = region(l);
      const h2 = r.h * 0.9;
      const g = acc.deux4(avance(l.l, 2, 2.9));
      ecranVerrouille(x, l, {
        texte: SMS, notif: 0.1, vibre: 0.1, ondes: g > 0.5, heure: "04:13",
        x: melange(l.W / 2, r.x + r.w / 2, g), y: melange(l.H / 2 + 108 * k1, r.y + r.h / 2, g), h: melange(h1, h2, g),
      });
    },
  },
  {
    nom: "ecoute", de: 42, a: 46, transition: { type: "fouet", duree: 0.5 },
    dessiner: (x, l) => decor(x, l, "Il écoute.", "Une SIM par opérateur,\nà l’écoute en permanence."),
    verite: (x, l) => ecoute(x, l),
  },
  {
    nom: "lit", de: 46, a: 52, transition: { type: "zoom", duree: 0.75 },
    ...demo("Il lit.", "Montant, nom, solde :\nrien d’inventé.", (x, l) => lecture(x, l, {
      texte: SMS, entete: "SMS REÇU · MTN ·8901 · 09:13", nature: "Encaissement", dureeTexte: 0.6, debutScan: 0.6, finScan: 1.4, debutFiche: 1.5, debutNature: 3.2,
      champs: [
        { cherche: "35 000 FCFA", libelle: "Montant", valeur: "+35 000 FCFA", couleur: "#7ee2a4" },
        { cherche: "MAMA CLARISSE", libelle: "De", valeur: "MAMA CLARISSE" },
        { cherche: "670334455", libelle: "Numéro", valeur: "670 33 44 55" },
        { cherche: "447 500 FCFA", libelle: "Nouveau solde", valeur: "447 500 FCFA" },
      ],
    })),
  },
  {
    nom: "agissez", de: 52, a: 56, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.5 }); poussiere(x, l); },
    verite(x, l) { cartonFrappe(x, l, "À travers lui,\nvous agissez.", { max: 0.15, accent: 1 }); },
  },
  {
    nom: "appuyez", de: 56, a: 61, transition: { type: "fouetV", duree: 0.5 },
    ...demo("On ne tape plus.\nOn appuie.", "Les menus du réseau\ndeviennent des boutons.", (x, l) => menuBoutons(x, l, { saisie: "1", debutMue: 0.8, appui: 3 })),
  },
  {
    // Le *126# de l'ouverture, qui échouait : c'est lui que le boîtier compose.
    nom: "secret", de: 61, a: 66, transition: { type: "fouet", duree: 0.5 },
    ...demo("Il compose.", "Le *126#, pour vous.\nVotre code, jamais affiché.", (x, l) => paveJoue(x, l, { temps: [0.5, 1, 1.5, 2, 2.5], valider: 3.25 })),
  },
  {
    nom: "recu", de: 66, a: 70, transition: { type: "volet", duree: 0.75 },
    // Le reçu du transfert qu'on vient de composer : ce qui est parti, et vers qui.
    ...demo("Et le reçu\nsuit.", "Propre, à montrer.", (x, l) => recuSort(x, l, {
      debut: 0.4, titre: "Reçu de transfert", libelle: "MONTANT ENVOYÉ", sens: "À", montant: 5000,
      de: "BOUTIQUE AKWA", deNumero: "690 11 22 33", heure: "09 h 21", numero: "N° TM-2026-0929-0042",
    })),
  },

  // --- IV. LE PIÈGE : le faux tremble, le vrai ne bouge pas ------------------------------------------
  // Une attaque, pas une panne d'autrefois : quiconque connaît le numéro de la
  // SIM peut lui écrire.
  {
    nom: "piege-lecture", de: 70, a: 74, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.2 }); piegeLecture(x, l); },
    verite(x, l) { piegeLegende(x, l); },
    fx: ({ l }) => ({ secousse: 14 * acc.entree3(borne(l / 3.6)), aberration: 1 + 10 * acc.entree3(borne(l / 3.6)), lignes: 0.4 }),
  },
  {
    nom: "piege-choc", de: 74, a: 78, transition: { type: "coupe", duree: 0.01 },
    gel: { de: 1.98, a: 4 },
    dessiner(x, l) {
      fondEncre(x, l, { force: 0.2 });
      x.fillStyle = "rgba(192,15,12,0.2)"; x.fillRect(0, 0, l.W, l.H);
      piegeChoc(x, l);
    },
    // Pendant le gel, le rouge se vide et les chiffres s'effacent, sans un effet, sans un bruit.
    verite(x, l) {
      if (l.l < 2) return;
      const vide = acc.deux3(avance(l.l, 2.2, 3.8));
      x.fillStyle = C.encre; x.fillRect(0, 0, l.W, l.H);
      piegeChoc(x, l, { vide });
    },
    fx: () => ({ glitch: 0.8, secousse: 24, aberration: 18, lignes: 0.5 }),
  },
  {
    nom: "illisible", de: 78, a: 83, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.3 }); },
    verite(x, l) { piegeVerite(x, l, { ligne1: 0.25, ligne2: 1.5 }); },
    fx: () => ({ aberration: 0, lueur: 0, grain: 0.03 }),
  },

  // --- V. L'ÉPREUVE -----------------------------------------------------------------------------------
  {
    nom: "attaque", de: 83, a: 87, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) {
      fondEncre(x, l, { couleur: "#0f1012", force: 0.3 });
      attaque(x, l, { debut: 0, fin: 1.8, legende: "SMS PIÉGÉS, LANCÉS CONTRE LUI" });
    },
    verite(x, l) { if (l.l >= 2) carton(x, l, "Il tient.", { p: 1, y: l.H * (l.v ? 0.7 : 0.8), max: 0.1 }); },
    fx: ({ l }) => ({ lignes: 0.6, glitch: l < 0.3 ? 0.7 : 0 }),
  },
  {
    // La cause AVANT l'effet : le courant saute, l'écran s'éteint, et au retour
    // le double qu'une machine naïve aurait compté est barré.
    // (eprouver-la-chaine.py : relu au redémarrage, reconnu, pas recompté.)
    nom: "coupure", de: 87, a: 92, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.3 }); coupure(x, l, { noir: 1.5 }); },
    verite(x, l) {
      coupureVerite(x, l, { noir: 1.5 });
      const y = l.H * (l.v ? 0.78 : 0.86);
      if (l.l < 1.5) carton(x, l, "Le courant saute.", { de: 0.1, a: 0.5, y, max: 0.075 });
      else if (l.l >= 2.9) carton(x, l, "Rien n’est compté deux fois.", { de: 2.9, a: 3.5, y, max: 0.075 });
    },
    fx: ({ l }) => ({ glitch: l > 1.3 && l < 1.5 ? 0.9 : l > 2 && l < 2.12 ? 0.6 : 0 }),
  },
  {
    nom: "porte", de: 92, a: 95, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.2 }); },
    // Un compte nouveau attend l'accord du propriétaire (verifier-les-comptes) ;
    // le boîtier n'ouvre aucune porte sur Internet (README).
    verite(x, l) { cartonFrappe(x, l, "Personne n’entre\nsans vous.", { max: l.v ? 0.16 : 0.14, accent: 1 }); },
  },

  // --- VI. LE RAPPEL ----------------------------------------------------------------------------------
  {
    nom: "claustra", de: 95, a: 101, transition: { type: "claustra", duree: 1.5 },
    dessiner(x, l) { fondSable(x, l); },
    // Trois phrases qu'on peut répéter à quelqu'un.
    verite(x, l) {
      claustra(x, l, { p: avance(l.l, 0, 1.5), defile: l.p * 0.5 });
      ["Vos SIM, au pays.", "Vous voyez.", "Vous agissez."].forEach((m, i) => {
        const e = acc.sortie4(avance(l.l, 1.5 + i, 2.1 + i)) * (1 - acc.entree3(avance(l.l, 5.2, 5.8)));
        if (e <= 0) return;
        const hb = l.u * 0.16;
        const y = l.H / 2 + (i - 1) * hb * 1.1;
        x.save(); x.globalAlpha = e;
        x.fillStyle = C.encre; x.fillRect(l.W / 2 - l.W * (l.v ? 0.42 : 0.24) * e, y - hb / 2, l.W * (l.v ? 0.84 : 0.48) * e, hb);
        x.restore();
        carton(x, l, m, { p: e, y, max: 0.095, couleur: C.sable });
      });
    },
    fx: () => ({ lueur: 0, vignette: 0, grain: 0, aberration: 0 }),
  },
  {
    nom: "partout", de: 101, a: 107, transition: { type: "losange", duree: 1.5 },
    dessiner(x, l) {
      distance(x, l, {
        villes: [[48.86, 2.35], [50.85, 4.35], [51.51, -0.13], [45.5, -73.57], [52.52, 13.4], [29.76, -95.37], [40.71, -74.0]],
        lat0: 14, lat1: 12, lon0: -18, lon1: 2, debutArc: 0.5, dureeArc: 1.5, impulsions: true, rapproche: 1.1,
      });
    },
    verite(x, l) {
      const cx = l.v ? l.W / 2 : l.W * 0.78, cy = l.v ? l.H * 0.68 : l.H * 0.5;
      carton(x, l, "Vous, partout.", { de: 0.9, a: 1.5, sortie: avance(l.l, 3, 3.5), x: cx, y: cy, max: 0.085 });
      carton(x, l, "Lui, au pays.", { de: 3.5, a: 4.1, x: cx, y: cy, max: 0.085, accent: { mot: 2, couleur: C.lateriteClair } });
    },
  },

  // --- VII. LA SIGNATURE -------------------------------------------------------------------------------
  {
    nom: "final", de: 107, a: 113, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) {
      fondEncre(x, l, { force: 1.2 });
      if (l.l < 2.3) {
        // Les étincelles suivent les brins ; l'onde part une fois la Tresse posée,
        // au-delà de sa zone de protection.
        revelation(x, l, { finTrace: 1.2, tresse: false, halo: false });
        poussiere(x, l, { n: 90 });
        const h = l.u * 0.46;
        choc(x, l, 1.3, { rayon: h / 2 + h * 18 / 23.2 });
      }
    },
    // La marque est de la vérité : aucun effet ne la touche.
    verite(x, l) {
      if (l.l < 2.3) revelationTresse(x, l, { finTrace: 1.2 });
      else {
        verrouillageAnime(x, l, { f: avance(l.l, 2.3, 3.5), hDepart: l.u * 0.46 * 1.04 * (1 + 0.04 * acc.sortie3(borne(2.3 / 8))) });
        // docs/MOBILE.md : « TOTEM est une télécommande » ; docs/PLAY-STORE.md : « Aucun argent n'y transite. »
        carton(x, l, "Une télécommande.\nAucun argent n’y transite.", { de: 3.3, a: 3.9, y: l.H * (l.v ? 0.64 : 0.72), max: l.v ? 0.07 : 0.06, graisse: 600, couleur: "rgba(244,239,233,0.92)" });
      }
    },
    fx: () => ({ lueur: 0, aberration: 0, vignette: 0.3 }),
  },
  {
    // Une coupe franche, sur le temps : un fondu dédoublerait le verrouillage.
    nom: "fin", de: 113, a: 117, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondSable(x, l); },
    verite(x, l) { carteFin(x, l, { pied: "BIENTÔT", piedA: 1.9, rythme: [0.8, 0.2, 0.6, 1.9] }); },
    fx: () => ({ lueur: 0, vignette: 0, grain: 0, aberration: 0, pousse: 0 }),
  },
];
