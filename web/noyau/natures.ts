// Les natures qu'un propriétaire peut choisir à la main pour un SMS — celles
// qui donnent lieu à un reçu. UNE seule liste côté web : la fiche du SMS et
// les deux guichets d'API lisent ici. Elle est le miroir de `NATURES` dans
// `totem/declencheur.py` : ajouter une nature, c'est toucher LES DEUX — le
// terminal ignore silencieusement une valeur qu'il ne connaît pas, et le
// reçu partirait alors sous la lecture du robot au lieu du choix du
// propriétaire.
export const NATURES = ["depot", "retrait", "transfert", "solde"] as const;

export type Nature = (typeof NATURES)[number];

export const estNature = (v: unknown): v is Nature =>
  typeof v === "string" && (NATURES as readonly string[]).includes(v);
