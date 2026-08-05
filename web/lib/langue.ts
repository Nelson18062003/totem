// --- La langue de la plateforme ----------------------------------------------
// Deux langues, l'anglais d'abord : la majorité des utilisateurs est
// anglophone, et le français reste à un geste dans les réglages.
//
// La préférence vit dans un cookie ordinaire (pas httpOnly : l'écran doit
// pouvoir la changer d'un clic, sans aller-retour serveur). Le serveur le lit
// pour rendre chaque page dans la bonne langue dès la première peinture.
//
// Ce que la langue ne touche JAMAIS : le texte venu du réseau. Les réponses
// USSD et les SMS de l'opérateur s'affichent mot pour mot, dans la langue où
// la SIM les a reçus — les traduire serait les trahir.

export type Langue = "en" | "fr";

export const LANGUE_DEFAUT: Langue = "en";

export const COOKIE_LANGUE = "totem_langue";

/** Lit une valeur venue d'un cookie ou d'ailleurs, sans jamais échouer. */
export function langueDe(valeur: string | null | undefined): Langue {
  return valeur === "fr" ? "fr" : valeur === "en" ? "en" : LANGUE_DEFAUT;
}

/** Les deux choix, pour les sélecteurs de langue. */
export const LANGUES: { code: Langue; libelle: string }[] = [
  { code: "en", libelle: "English" },
  { code: "fr", libelle: "Français" },
];
