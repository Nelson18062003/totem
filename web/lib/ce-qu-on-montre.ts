// CE QU'ON MONTRE À CELUI QUI REGARDE — la seule porte des écrans vers les
// données.
//
// Deux mondes passent par ici : la maison (la base, filtrée par la portée de
// la personne) et la vitrine de démonstration (un jeu inventé, qui ne lit
// jamais la base). Chaque écran posait jusqu'ici sa propre ligne
// `chargerDonnees(langue, porteeDe() ?? RIEN, …)` : ajouter la vitrine écran
// par écran, c'était promettre d'en oublier un — et l'écran oublié aurait
// montré à l'examinateur le vrai terminal du propriétaire. La décision se
// prend donc une fois, ici.

import type { Donnees, EtatTerminal } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import {
  chargerDonnees, chargerDonneesDeDemonstration, chargerTerminal,
  chargerTerminalDeDemonstration,
} from "@/lib/serveur";
import { RIEN, porteeDe } from "@/lib/portee";
import { estDemonstration } from "@/lib/demonstration";

type Bornes = Parameters<typeof chargerDonnees>[2];

/** Les données de l'écran, pour celui qui regarde. `req` : le téléphone,
 *  qui porte son jeton dans l'en-tête ; absent, le cookie du navigateur. */
export async function donneesMontrees(
  langue: Langue, bornes?: Bornes, req?: Request,
): Promise<Donnees> {
  if (await estDemonstration(req)) return chargerDonneesDeDemonstration(langue, bornes);
  return chargerDonnees(langue, (await porteeDe(req)) ?? RIEN, bornes);
}

/** Le terminal que la coquille affiche en haut de chaque page — celui qui
 *  porte les cartes de la personne, et aucun si elle n'en a pas. */
export async function terminalMontre(langue: Langue): Promise<EtatTerminal | null> {
  if (await estDemonstration()) return chargerTerminalDeDemonstration(langue);
  return chargerTerminal(langue, (await porteeDe()) ?? RIEN);
}
