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
// UNE idée, en quatre temps : vos cartes SIM restent au pays ; TOTEM ; à
// travers lui, vous voyez et vous agissez ; la signature. 64 temps : 32 s,
// plus la queue. Une première version en racontait sept (le piège des
// chiffres d'une autre écriture, la coupure de courant, les comptes…) : tout
// était vrai, et c'était trop — « c'est trop compliqué ». Une annonce donne
// envie ; la preuve, elle, se montre à qui la demande.

import { C } from "./marque.js";
import { acc, avance, borne, melange } from "./outils.js";
import {
  fondEncre, fondSable, distance, carton, revelation, revelationTresse, verrouillageAnime,
  titreDrop, region, dansRegion, ecranVerrouille, menuBoutons, recuSort,
  claustra, carteFin, poussiere, balayage, motFantome, choc, couture, moities, pointMonde, pointVerite, plongee, poseApresPoint,
} from "./scenes.js";
import { police, frappe, ajuster } from "./typo.js";
import { PT_W, PT_H } from "./interface.js";

// Le SMS du film : la notification le montre mot pour mot. 09:13 à Douala,
// 04:13 à Montréal.
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
  "Et le reçu\nsuit.": "REÇU",
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
// Les deux moitiés de « On appuie » : côte à côte en 16:9, l'une sur l'autre en 9:16.
function moitieMenu(l, cote) {
  if (l.v) return cote === "reseau" ? { x: l.W * 0.07, y: l.H * 0.3, w: l.W * 0.82, h: l.H * 0.26 } : { x: l.W * 0.07, y: l.H * 0.62, w: l.W * 0.82, h: l.H * 0.25 };
  return cote === "reseau" ? { x: 0, y: l.H * 0.26, w: l.W / 2, h: l.H * 0.68 } : { x: l.W / 2, y: l.H * 0.26, w: l.W / 2, h: l.H * 0.68 };
}
function etiquetteMoitie(x, l, r, texte) {
  police(x, l.u * (l.v ? 0.03 : 0.024), 600);
  x.fillStyle = "rgba(244,239,233,0.62)"; x.textAlign = "center"; x.textBaseline = "alphabetic";
  x.letterSpacing = `${l.u * 0.004}px`;
  x.fillText(texte, r.x + r.w / 2, r.y + (l.v ? -l.u * 0.012 : -l.u * 0.02));
  x.letterSpacing = "0px";
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
  // --- 1. LE PROBLÈME : les SIM au pays, vous ailleurs -----------------------------------------
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
  // --- 2. LE NOM ------------------------------------------------------------------------------------
  {
    nom: "point", de: 12, a: 23, transition: { type: "coupe", duree: 0.01 },
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
    nom: "plongee", de: 23, a: 26, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.8 }); poussiere(x, l, { n: 120, force: 1.2 }); },
    verite(x, l) { plongee(x, l, { de: 0, a: 3, facteur: 90 }); },
    fx: ({ l }) => ({ zoomFlou: 0.12 * acc.entree3(borne(l / 3)), aberration: 0.5, pousse: 0 }),
  },

  // --- 3. CE QUE ÇA CHANGE : vous voyez, vous agissez ---------------------------------------------
  {
    // On sort du losange face à la notification, en gros plan : on la LIT.
    // Puis la caméra recule jusqu'au téléphone, et la phrase arrive.
    // Une coupe sur le coup : la plongée finit déjà DANS le vide du losange ;
    // une transition en losange s'ouvrirait sur du noir.
    nom: "sonne", de: 26, a: 30, transition: { type: "coupe", duree: 0.01 },
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
    nom: "agissez", de: 30, a: 34, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondEncre(x, l, { force: 0.5 }); poussiere(x, l); },
    verite(x, l) { cartonFrappe(x, l, "À travers lui,\nvous agissez.", { max: 0.15, accent: 1 }); },
  },
  {
    // L'écran fendu de l'ouverture revient, et la règle du film tient dans une
    // image : à gauche, le menu que le réseau envoie, dans le MONDE — il
    // tremble ; à droite, les mêmes lignes devenues boutons, dans la VÉRITÉ.
    nom: "appuyez", de: 34, a: 38, transition: { type: "fouetV", duree: 0.5 },
    dessiner(x, l) {
      fondEncre(x, l, { force: 0.5 }); balayage(x, l); poussiere(x, l, { force: 0.6 });
      const g = moitieMenu(l, "reseau");
      dansRegion(x, l, g, (x2, l2) => menuBoutons(x2, l2, { saisie: "1", debutMue: 99, appui: 99, largeur: Math.min(l2.W * 0.86, l2.H * 1.15) }));
      etiquetteMoitie(x, l, g, "LE MENU DU RÉSEAU");
      // La couture, entre les deux.
      x.strokeStyle = "rgba(244,239,233,0.22)"; x.lineWidth = 2; x.beginPath();
      if (l.v) { x.moveTo(l.W * 0.07, l.H * 0.58); x.lineTo(l.W * 0.89, l.H * 0.58); } else { x.moveTo(l.W / 2, l.H * 0.26); x.lineTo(l.W / 2, l.H * 0.94); }
      x.stroke();
    },
    verite(x, l) {
      carton(x, l, l.v ? "On ne tape plus.\nOn appuie." : "On ne tape plus. On appuie.", { de: 0, a: 0.5, y: l.H * (l.v ? 0.18 : 0.14), max: l.v ? 0.1 : 0.075, graisse: 800 });
      const d = moitieMenu(l, "totem");
      dansRegion(x, l, d, (x2, l2) => menuBoutons(x2, l2, { debutMue: -2, appui: 3, largeur: Math.min(l2.W * 0.86, l2.H * 1.15) }));
      etiquetteMoitie(x, l, d, "DANS TOTEM");
    },
    fx: ({ l }) => ({ glitch: (l % 1) < 0.1 ? 0.3 : 0, secousse: 3, aberration: 4 }),
  },
  {
    nom: "recu", de: 38, a: 42, transition: { type: "volet", duree: 0.75 },
    // Le reçu du transfert qu'on vient de composer : ce qui est parti, et vers qui.
    ...demo("Et le reçu\nsuit.", "Propre, à montrer.", (x, l) => recuSort(x, l, {
      debut: 0.4, titre: "Reçu de transfert", libelle: "MONTANT ENVOYÉ", sens: "À", montant: 5000,
      de: "BOUTIQUE AKWA", deNumero: "690 11 22 33", heure: "09 h 21", numero: "N° TM-2026-0929-0042",
    })),
  },

  // --- 4. LE RAPPEL, ET LA SIGNATURE --------------------------------------------------------------
  {
    nom: "claustra", de: 42, a: 48, transition: { type: "claustra", duree: 1.5 },
    dessiner(x, l) { fondSable(x, l); },
    // Trois phrases qu'on peut répéter à quelqu'un.
    verite(x, l) {
      claustra(x, l, { p: avance(l.l, 0, 1.5), defile: l.p * 0.5 });
      // L'entrée ouvre la bande ; la sortie fait monter le mot et éteint la
      // bande, sans la rétrécir sous un mot encore entier.
      ["Vos SIM, au pays.", "Vous voyez.", "Vous agissez."].forEach((m, i) => {
        const ent = acc.sortie4(avance(l.l, 1.5 + i, 2.1 + i)), sor = acc.entree3(avance(l.l, 5.2, 5.8));
        if (ent <= 0 || sor >= 1) return;
        const hb = l.u * 0.16;
        const y = l.H / 2 + (i - 1) * hb * 1.1;
        x.save(); x.globalAlpha = ent * (1 - sor);
        x.fillStyle = C.encre; x.fillRect(l.W / 2 - l.W * (l.v ? 0.42 : 0.24) * ent, y - hb / 2, l.W * (l.v ? 0.84 : 0.48) * ent, hb);
        x.restore();
        carton(x, l, m, { p: ent, sortie: sor, y, max: 0.095, couleur: C.sable });
      });
    },
    fx: () => ({ lueur: 0, vignette: 0, grain: 0, aberration: 0 }),
  },
  {
    nom: "partout", de: 48, a: 54, transition: { type: "losange", duree: 1.5 },
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

  {
    nom: "final", de: 54, a: 60, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) {
      fondEncre(x, l, { force: 1.2 });
      if (l.l < 2.3) {
        // Les étincelles suivent les brins ; l'onde part une fois la Tresse posée,
        // au-delà de sa zone de protection.
        revelation(x, l, { finTrace: 1.2, tresse: false, halo: false });
        poussiere(x, l, { n: 90 });
        const h = l.u * 0.46;
        choc(x, l, 1.3, { rayon: h / 2 + h * 18 / 23.2, anneaux: false });
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
    fx: () => ({ lueur: 0, aberration: 0, vignette: 0 }),
  },
  {
    // Une coupe franche, sur le temps : un fondu dédoublerait le verrouillage.
    nom: "fin", de: 60, a: 64, transition: { type: "coupe", duree: 0.01 },
    dessiner(x, l) { fondSable(x, l); },
    verite(x, l) { carteFin(x, l, { pied: "BIENTÔT", piedA: 1.9, rythme: [0.01, 0, 0.6, 1.9] }); },
    fx: () => ({ lueur: 0, vignette: 0, grain: 0, aberration: 0, pousse: 0 }),
  },
];
