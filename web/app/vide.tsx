/**
 * État vide — ce qu'on voit quand il n'y a rien à montrer.
 *
 * IL N'Y EN A PLUS QU'UN. Cet état était réécrit à la main quatre fois, avec
 * quatre retraits différents (48, 40, 32 et 20 px de haut en bas), alors que ce
 * fichier existait déjà. Le seul état vide de l'application vit désormais dans
 * `app/ui/etat.tsx`, avec son retrait unique de 24 px.
 *
 * Ce fichier ne fait plus que le passer aux écrans qui l'appellent ici depuis
 * toujours : `titre`, `detail`, `action` — les mêmes propriétés, au même nom.
 * Rien à changer chez eux, et rien de nouveau à écrire à la main.
 */
export { Vide } from "./ui/etat";
