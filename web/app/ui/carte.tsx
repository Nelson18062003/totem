import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * LES CARTES — famille 5.3 du système (docs/SYSTEME.md).
 *
 * Une carte est une SURFACE : elle regroupe, elle ne réclame rien. Toutes ses
 * dimensions sont posées ici, une seule fois :
 *
 *   — padding `p-4` (16), convergence Polaris / Carbon / Radix ;
 *   — rayon `rounded-card` (12), la valeur de Material et de Radix ;
 *   — filet `border-line` — DÉCORATIF. Il sépare, il n'affirme rien. Une carte
 *     n'est pas un contrôle : si elle devenait cliquable, son filet passerait
 *     à `border-contour` (3:1, WCAG 1.4.11), ce qui n'est pas le cas ici.
 */

/** La surface. Rien d'autre : ce qu'on met dedans ne la regarde pas. */
export function Carte({
  bordABord = false,
  className = "",
  children,
  ...reste
}: ComponentPropsWithoutRef<"div"> & {
  /**
   * La carte contient une LISTE : elle retire son padding horizontal, et c'est
   * la rangée qui le porte avec son `px-4`. Un seul padding, jamais deux —
   * deux paddings font 32 px de retrait, et le séparateur ne tombe plus sur
   * les 16 px annoncés.
   *
   * La raison n'est pas graphique : c'est la RANGÉE qu'on touche, et une zone
   * de contact qui s'arrête à 16 px du bord perd du doigt sur toute sa
   * longueur. Le padding vertical, lui, reste : il tient la liste à distance
   * des coins arrondis.
   */
  bordABord?: boolean;
}) {
  return (
    <div
      {...reste}
      className={`rounded-card border border-line bg-surface-raised ${
        bordABord ? "py-4" : "p-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * LE TITRE D'UNE SECTION — au-dessus d'une carte ou d'une liste.
 *
 * Il existait sous deux formes dans un même fichier : `mb-3` quand il était
 * seul, `mb-1` quand une phrase le suivait — deux écarts différents pour un
 * seul objet, parce que la marge du titre payait pour la phrase. Ici l'écart
 * INTERNE (titre → phrase) vaut `mt-1` (4) et l'écart EXTERNE (l'en-tête → ce
 * qu'il annonce) vaut `mb-3` (12), qu'il y ait une phrase ou non.
 *
 * `text-heading` porte déjà sa graisse (600) et son interligne (24) : on
 * n'ajoute ni `font-semibold` ni `leading-*`.
 */
export function EnTeteSection({
  titre,
  detail,
  action,
  niveau = 2,
  className = "",
}: {
  /** Le titre. Court : il nomme la section, il ne la résume pas. */
  titre: ReactNode;
  /** La phrase d'explication, quand la section en demande une. */
  detail?: ReactNode;
  /** Une action de droite — « Tout voir », un bouton. Facultative. */
  action?: ReactNode;
  /** Le niveau du titre dans le document. Le style ne change pas. */
  niveau?: 2 | 3;
  className?: string;
}) {
  const Titre = niveau === 3 ? "h3" : "h2";
  return (
    <div className={`mb-3 flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <Titre className="text-heading">{titre}</Titre>
        {detail && <p className="mt-1 text-small text-ink-soft">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
