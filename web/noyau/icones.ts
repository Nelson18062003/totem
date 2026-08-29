// Le jeu d'icônes, décrit UNE SEULE FOIS.
//
// Au trait, 1,5 px, sur une grille de 24×24. Aucun emoji dans l'application —
// ni sur la plateforme, ni sur le téléphone.
//
// Ici on ne trouve que la GÉOMÉTRIE : des tracés, des rectangles, des
// cercles. Chaque monde la dessine avec ses propres outils — la plateforme
// avec le <svg> du navigateur (`web/app/icons.tsx`), le téléphone avec
// react-native-svg (`mobile/src/icones.tsx`) — mais tous deux lisent CES
// coordonnées-là.
//
// La raison est la même que pour le reste du noyau : trente-deux icônes
// recopiées dans deux fichiers, ce sont trente-deux occasions de diverger.
// Corriger une flèche ici la corrige des deux côtés.

/** Une forme élémentaire. Le trait, la couleur et la taille viennent du
 *  rendu, jamais d'ici : une icône se teinte par son entourage. */
export type Forme =
  | { f: "path"; d: string }
  | { f: "rect"; x: string; y: string; w: string; h: string; r?: string }
  | { f: "circle"; cx: string; cy: string; r: string };

/** Les attributs communs à tout le jeu — le trait de 1,5 px, les bouts
 *  ronds. Les deux rendus les appliquent tels quels. */
export const TRAIT = {
  vueBoite: "0 0 24 24",
  epaisseur: 1.5,
  bout: "round",
  jointure: "round",
} as const;

export const ICONES = {
  Home: [
    { f: "path", d: "M3.5 10.5 12 4l8.5 6.5" },
    { f: "path", d: "M5.5 9.8V20h13V9.8" },
  ],
  Card: [
    { f: "rect", x: "3", y: "6", w: "18", h: "12", r: "2" },
    { f: "path", d: "M3 10h18" },
  ],
  Inbox: [
    { f: "path", d: "M4 13V6h16v7" },
    { f: "path", d: "M4 13h4l1.5 2.5h5L16 13h4v5H4z" },
  ],
  Chart: [
    { f: "path", d: "M4 19V11M9.3 19V5M14.7 19v-5M20 19V8" },
  ],
  Grid: [
    { f: "rect", x: "3.5", y: "3.5", w: "7", h: "7", r: "1.5" },
    { f: "rect", x: "13.5", y: "3.5", w: "7", h: "7", r: "1.5" },
    { f: "rect", x: "3.5", y: "13.5", w: "7", h: "7", r: "1.5" },
    { f: "rect", x: "13.5", y: "13.5", w: "7", h: "7", r: "1.5" },
  ],
  ArrowDown: [
    { f: "path", d: "M12 5v14" },
    { f: "path", d: "m6.5 13.5 5.5 5.5 5.5-5.5" },
  ],
  ArrowUp: [
    { f: "path", d: "M12 19V5" },
    { f: "path", d: "m6.5 10.5 5.5-5.5 5.5 5.5" },
  ],
  Plus: [
    { f: "path", d: "M12 5v14M5 12h14" },
  ],
  Search: [
    { f: "circle", cx: "11", cy: "11", r: "6.5" },
    { f: "path", d: "m16 16 4 4" },
  ],
  Close: [
    { f: "path", d: "m6 6 12 12M18 6 6 18" },
  ],
  Settings: [
    { f: "circle", cx: "12", cy: "12", r: "3" },
    { f: "path", d: "M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.6 1.6 0 0 0 15 19.4a1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 4.6a1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v.09c0 .67.4 1.27 1.03 1.51H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" },
  ],
  Download: [
    { f: "path", d: "M12 4v11" },
    { f: "path", d: "m7.5 10.5 4.5 4.5 4.5-4.5" },
    { f: "path", d: "M5 19h14" },
  ],
  Copy: [
    { f: "rect", x: "9", y: "9", w: "11", h: "11", r: "2" },
    { f: "path", d: "M5 15V6a2 2 0 0 1 2-2h9" },
  ],
  Refund: [
    { f: "path", d: "M4 10h11a4.5 4.5 0 1 1 0 9h-6" },
    { f: "path", d: "m8 6-4 4 4 4" },
  ],
  Lock: [
    { f: "rect", x: "5", y: "10.5", w: "14", h: "9.5", r: "2" },
    { f: "path", d: "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" },
  ],
  List: [
    { f: "path", d: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" },
  ],
  Wallet: [
    { f: "path", d: "M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" },
    { f: "rect", x: "4", y: "7.5", w: "16", h: "12", r: "2" },
    { f: "path", d: "M16.5 13.5h.01" },
  ],
  Phone: [
    { f: "rect", x: "7", y: "3", w: "10", h: "18", r: "2" },
    { f: "path", d: "M11 18h2" },
  ],
  Bank: [
    { f: "path", d: "M4 10h16M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3.5 18h17M12 4l8 6H4z" },
  ],
  Identite: [
    { f: "rect", x: "3", y: "5", w: "18", h: "14", r: "2" },
    { f: "circle", cx: "8.5", cy: "11", r: "2" },
    { f: "path", d: "M6 16c.5-1.4 1.5-2 2.5-2s2 .6 2.5 2M14 9.5h4M14 13h4M14 15.5h2.5" },
  ],
  Chevron: [
    { f: "path", d: "m9 6 6 6-6 6" },
  ],
  Globe: [
    { f: "circle", cx: "12", cy: "12", r: "8.5" },
    { f: "path", d: "M3.5 12h17" },
    { f: "path", d: "M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5Z" },
  ],
  Refresh: [
    { f: "path", d: "M20 12a8 8 0 1 1-2.34-5.66" },
    { f: "path", d: "M20 4v4.5h-4.5" },
  ],
  Hash: [
    { f: "path", d: "M9.5 4 8 20M16 4l-1.5 16M4.5 9h16M3.5 15h16" },
  ],
  Doc: [
    { f: "path", d: "M6 3h8l4 4v14H6z" },
    { f: "path", d: "M14 3v4h4" },
    { f: "path", d: "M9 13h6M9 17h4" },
  ],
  Transfer: [
    { f: "path", d: "M4 8.5h13.5" },
    { f: "path", d: "M14 5l3.5 3.5L14 12" },
    { f: "path", d: "M20 15.5H6.5" },
    { f: "path", d: "M10 12l-3.5 3.5L10 19" },
  ],
  Megaphone: [
    { f: "path", d: "M14 5.5 7 9H4.5v6H7l7 3.5z" },
    { f: "path", d: "M17.5 9.5a4.5 4.5 0 0 1 0 5" },
  ],
  Bubble: [
    { f: "path", d: "M12 4.5a7.5 7.5 0 0 1 0 15c-1.2 0-2.3-.28-3.3-.78L4.5 19.5l.8-4.2A7.5 7.5 0 0 1 12 4.5Z" },
  ],
  Mail: [
    { f: "rect", x: "3.5", y: "5.5", w: "17", h: "13", r: "2" },
    { f: "path", d: "m4.5 7.5 7.5 5.5 7.5-5.5" },
  ],
  Eye: [
    { f: "path", d: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" },
    { f: "circle", cx: "12", cy: "12", r: "3" },
  ],
  EyeOff: [
    { f: "path", d: "M4 4l16 16" },
    { f: "path", d: "M10.6 6c.46-.07.93-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17.6 17.6 0 0 1-2.4 3.2M6.4 6.9A17 17 0 0 0 2.5 12S6 18.1 12 18.1c1.4 0 2.7-.33 3.8-.84" },
    { f: "path", d: "M9.9 9.9a3 3 0 0 0 4.2 4.2" },
  ],
  PuceSim: [
    { f: "rect", x: "4", y: "6", w: "16", h: "12", r: "2.5" },
    { f: "path", d: "M4 12h16" },
    { f: "path", d: "M9.5 6v6M14.5 12v6" },
  ],
} as const satisfies Record<string, readonly Forme[]>;

/** Le nom d'une icône du jeu. */
export type NomIcone = keyof typeof ICONES;
