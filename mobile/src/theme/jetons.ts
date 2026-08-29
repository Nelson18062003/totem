// Les jetons de l'interface, pour le téléphone.
//
// Ce fichier est le PENDANT de `web/app/globals.css`, pas une invention. Les
// valeurs y sont relevées une par une : deux TOTEM qui ne se ressemblent pas
// seraient deux produits. Voir `docs/IDENTITE.md`.
//
// Ce qui ne se négocie pas, et qui vient de la charte :
//
//   — la latérite ne porte QUE la marque. Jamais un état, jamais un bouton.
//     L'action est neutre : le bouton premier est sombre.
//   — PAS d'ombre. La plateforme est mate : les plans se séparent par les
//     bordures et les fonds. Décision du propriétaire — ne pas en
//     réintroduire, si tentant que ce soit sur un téléphone.
//   — les couleurs opérateur sont des DONNÉES, pas la marque : un liseré,
//     une pastille, un point. Jamais un aplat de fond, jamais du texte.

export const couleurs = {
  // Neutres — la base de tout
  surface: "#f5f5f5",          // fond d'écran
  surfaceHaute: "#ffffff",     // cartes
  surface2: "#e6e6e6",         // champs, appui, pastilles
  surface3: "#d9d9d9",         // séparateurs pleins, barres
  encre: "#1e1e1e",            // texte principal
  encreDouce: "#444444",       // texte secondaire
  encrePale: "#767676",        // texte tertiaire — passe AA
  trait: "#d9d9d9",            // bordures fines

  // Latérite — LA couleur de la marque, et rien d'autre
  laterite: "#9a4b2e",
  lateriteClair: "#d08a63",    // sur fond sombre
  sable: "#f4efe9",            // fond des surfaces de marque

  // L'action est neutre, comme dans la charte
  accent: "#2c2c2c",
  accentAppui: "#1e1e1e",
  accentDoux: "#e6e6e6",

  // Sémantique — vert, rouge, ambre
  positif: "#02542d",          // crédit
  positifVif: "#14ae5c",       // pastilles, points d'état
  negatif: "#c00f0c",          // débit
  alerte: "#975102",           // attente

  // Couleurs opérateur — des données, jamais la marque
  opMtn: "#ffcc00",
  opOrange: "#ff7900",
} as const;

// L'échelle typographique de la charte, ramenée à l'application.
export const textes = {
  display: 32,
  titre: 24,
  intertitre: 20,
  corps: 16,
  petit: 14,
  legende: 12,
} as const;

// Rayons : 8 partout, 4 pour le détail.
export const rayons = {
  carte: 8,
  bouton: 8,
  petit: 4,
  rond: 999,
} as const;

// Le pas d'espacement. Un seul rythme, pour que rien ne flotte.
export const espaces = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Les familles chargées au démarrage (voir `src/app/_layout.tsx`).
// DM Sans ne sert QU'AU MOT « TOTEM » : le logotype ne se recompose pas
// dans une autre police. Tout le reste est en Inter.
export const polices = {
  corps: "Inter_400Regular",
  moyen: "Inter_500Medium",
  demi: "Inter_600SemiBold",
  gras: "Inter_700Bold",
  marque: "DMSans_700Bold",
} as const;

// L'interlettrage du mot TOTEM — lapidaire, comme une inscription gravée.
// Ne s'applique qu'au nom de la marque, jamais au reste des capitales.
export const INTERLETTRAGE_MARQUE = 0.18 * textes.petit;

/** La couleur d'un opérateur, pour un liseré ou une pastille — jamais un fond. */
export function couleurOperateur(operateur: string): string {
  const o = operateur.toUpperCase();
  if (o.startsWith("MTN")) return couleurs.opMtn;
  if (o.startsWith("ORANGE")) return couleurs.opOrange;
  return couleurs.encrePale;
}
