// Marque TOTEM — symbole et verrouillage.
//
// Le symbole est « Le Pilier » : un T dont le fût porte deux incisions et
// repose sur un socle. Un seul tracé, règle `evenodd` — il se peint donc dans
// n'importe quelle couleur, sur n'importe quel fond, sans réserve de fond.
//
// Les tracés de référence vivent dans `brand/` ; ce fichier en est le portage
// React. Toute retouche se fait dans `brand/`, jamais ici seulement.
// Voir docs/IDENTITE.md.

const FUT =
  "M4.2 3H27.8A1.2 1.2 0 0 1 29 4.2V8.2A1.2 1.2 0 0 1 27.8 9.4H19.4V24.6H22" +
  "A1.2 1.2 0 0 1 23.2 25.8V27.8A1.2 1.2 0 0 1 22 29H10A1.2 1.2 0 0 1 8.8 27.8" +
  "V25.8A1.2 1.2 0 0 1 10 24.6H12.6V9.4H4.2A1.2 1.2 0 0 1 3 8.2V4.2" +
  "A1.2 1.2 0 0 1 4.2 3Z";

const INCISIONS =
  "M14.1 13.35H17.9A0.4 0.4 0 0 1 18.3 13.75V14.95A0.4 0.4 0 0 1 17.9 15.35" +
  "H14.1A0.4 0.4 0 0 1 13.7 14.95V13.75A0.4 0.4 0 0 1 14.1 13.35Z" +
  "M14.1 18.95H17.9A0.4 0.4 0 0 1 18.3 19.35V20.55A0.4 0.4 0 0 1 17.9 20.95" +
  "H14.1A0.4 0.4 0 0 1 13.7 20.55V19.35A0.4 0.4 0 0 1 14.1 18.95Z";

/**
 * Le symbole seul, à la couleur du texte courant.
 *
 * En dessous de 20 px les incisions se bouchent : elles mesurent alors moins
 * d'un pixel sur un écran non-retina. On sert donc le tracé simplifié — la
 * même silhouette, la gravure en moins.
 */
export function Symbole({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="TOTEM"
    >
      <path fill="currentColor" fillRule="evenodd" d={size >= 20 ? FUT + INCISIONS : FUT} />
    </svg>
  );
}

/**
 * Le verrouillage horizontal : symbole + mot, à la couleur du texte courant.
 *
 * Le symbole fait 1,5 fois la hauteur de capitale du mot, comme dans les
 * fichiers de `brand/`. Avec `text-body` (15 px, capitale ≈ 10,5 px) cela
 * donne un tracé visible de 16 px, soit une boîte de 20 — le symbole
 * n'occupant que 26 des 32 unités de sa grille.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Symbole size={20} />
      <span className="text-body font-bold uppercase tracking-marque">Totem</span>
    </span>
  );
}
