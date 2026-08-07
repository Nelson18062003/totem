"use client";

import type { ReactNode } from "react";

/**
 * L'ÉPINGLAGE BAS — le socle sur lequel se pose le pavé du code secret.
 *
 * MESURÉ AVANT : avec huit échanges — le cas normal d'un dépôt — le fil de la
 * session fait 938 px pour 636 visibles. La grille du pavé commençait à
 * y = 759 sous un corps qui s'arrête à 762 : le pavé était HORS ÉCRAN, et il
 * fallait le chercher au doigt pendant qu'un réseau attend une réponse.
 *
 * LA DÉCISION : le pavé est épinglé en bas de la zone qui défile, et le fil
 * défile DERRIÈRE lui. On ne va plus chercher le clavier : il est là.
 *
 * ── Pourquoi une pièce à part, et pourquoi elle épingle son parent ─────────
 *
 * `position: sticky` ne peut décoller un objet que dans les limites de son
 * BLOC CONTENEUR : un objet collé au bas d'une boîte qui épouse exactement sa
 * taille n'a nulle part où remonter, et le collage ne fait rien du tout.
 *
 * Or le pavé n'est jamais posé nu : la session l'enveloppe dans une carte
 * (`EncadrePave`), et cette carte épouse sa taille. Coller le pavé lui-même
 * serait donc sans effet — c'est LE CONTENANT qu'il faut coller, celui dont le
 * bloc conteneur est le fil tout entier.
 *
 * D'où la règle ci-dessous : quel que soit l'enveloppe où on le pose, le socle
 * l'épingle. Rien à savoir chez l'appelant, rien à retoucher le jour où
 * l'enveloppe change — et rien à défaire non plus : la règle ne vit que tant
 * que le pavé est à l'écran, puisqu'elle est portée par sa présence.
 *
 * Le socle porte SA PROPRE SURFACE OPAQUE : sans elle, les bulles du fil se
 * liraient au travers du clavier. Aucun filet, aucun rayon — c'est l'enveloppe
 * qui les porte, et deux bordures concentriques ne veulent rien dire.
 */

/** La marque que la règle ci-dessous reconnaît. Un seul endroit l'écrit. */
const MARQUE = "socle-pave";

/* « Le parent direct du socle est épinglé en bas. » C'est la seule façon
   d'exprimer, en CSS, que le collage appartient au contenant et non au
   contenu. `:where()` n'ajoute aucun poids : une classe posée par l'appelant
   reprend toujours la main. */
const REGLE = `:where(*):has(> .${MARQUE}){position:sticky;bottom:0}`;

export function SoclePave({
  children,
  /** Les mesures nommées du pavé — elles descendent d'ici à toute la grille. */
  mesures,
}: {
  children: ReactNode;
  mesures?: React.CSSProperties;
}) {
  return (
    <>
      <style>{REGLE}</style>
      <div className={`${MARQUE} flex flex-col gap-3 bg-surface-raised`} style={mesures}>
        {children}
      </div>
    </>
  );
}
