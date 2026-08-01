"use client";

import { useId } from "react";

// Marque TOTEM — symbole et verrouillage.
//
// Le symbole est « La Tresse » : deux brins qui se croisent à chaque registre
// et se rejoignent aux deux bouts. Entre deux croisements, le vide dessine un
// losange — le treillis naît du tressage, il n'est pas posé dessus.
//
// Les tracés de référence sont produits par `brand/generer.py`, qui fait
// autorité. Ce fichier en est le portage React. Voir docs/IDENTITE.md.

const BRIN_A =
  "M16 4.4C17.54 5.302 22.6 6.462 22.6 8.267C22.6 10.071 19.08 10.329 16 12.133" +
  "C12.92 13.938 9.4 14.196 9.4 16C9.4 17.804 12.92 18.062 16 19.867" +
  "C19.08 21.671 22.6 21.929 22.6 23.733C22.6 25.538 17.54 26.698 16 27.6";

const BRIN_B =
  "M16 4.4C14.46 5.302 9.4 6.462 9.4 8.267C9.4 10.071 12.92 10.329 16 12.133" +
  "C19.08 13.938 22.6 14.196 22.6 16C22.6 17.804 19.08 18.062 16 19.867" +
  "C12.92 21.671 9.4 21.929 9.4 23.733C9.4 25.538 14.46 26.698 16 27.6";

const EPAISSEUR = 4.8;

/** Les deux croisements intérieurs, et le brin qu'ils interrompent. */
const CROISEMENTS = [
  { y: 12.133, dessous: "b" },
  { y: 19.867, dessous: "a" },
] as const;

function Coupe({ y }: { y: number }) {
  // Le brin du dessous est interrompu sur toute la largeur de celui du dessus,
  // plus un jeu : c'est ce vide qui donne le passage dessus-dessous.
  return (
    <rect
      x={-7.68}
      y={-3.55}
      width={15.36}
      height={7.1}
      fill="#000"
      transform={`translate(16,${y}) rotate(149.64)`}
    />
  );
}

/**
 * Les deux brins tressés, à poser dans un `<svg viewBox="0 0 32 32">`.
 *
 * C'est la tresse elle-même, sans son cadre : le composant `<Symbole/>`
 * l'habille pour l'usage courant, la page de présentation la fait se
 * dessiner. `brin` s'ajoute aux attributs des deux tracés — il permet par
 * exemple de piloter leur contour — sans jamais toucher au dessin.
 */
export function Brins({
  tisse = true,
  brin,
}: {
  tisse?: boolean;
  brin?: React.ComponentProps<"path">;
}) {
  const id = useId();
  const trait = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: EPAISSEUR,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...brin,
  };

  return (
    <>
      {tisse && (
        <defs>
          {(["a", "b"] as const).map((brinId) => (
            <mask
              key={brinId}
              id={`${id}-${brinId}`}
              maskUnits="userSpaceOnUse"
              x={-0.2}
              y={-0.4}
              width={32.4}
              height={32.8}
            >
              <rect x={-0.2} y={-0.4} width={32.4} height={32.8} fill="#fff" />
              {CROISEMENTS.filter((c) => c.dessous === brinId).map((c) => (
                <Coupe key={c.y} y={c.y} />
              ))}
            </mask>
          ))}
        </defs>
      )}
      <path d={BRIN_A} {...trait} mask={tisse ? `url(#${id}-a)` : undefined} />
      <path d={BRIN_B} {...trait} mask={tisse ? `url(#${id}-b)` : undefined} />
    </>
  );
}

/**
 * Le symbole seul, à la couleur du texte courant.
 *
 * En dessous de 22 px, les jours du tressage tombent sous le pixel et se
 * bouchent : on fond alors les deux brins. C'est la même silhouette, le
 * passage en moins.
 */
export function Symbole({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="TOTEM"
    >
      <Brins tisse={size >= 22} />
    </svg>
  );
}

/**
 * Le verrouillage horizontal : symbole + mot.
 *
 * Le symbole fait 1,45 fois la hauteur de capitale du mot, comme dans les
 * fichiers de `brand/`. Avec `text-body` (15 px, capitale ≈ 10,5 px) cela
 * donne un tracé visible de 15 px — soit une boîte de 17, le tracé n'occupant
 * que 28 des 32 unités de sa grille. On monte à 22 pour garder le tressage
 * visible : c'est le seul endroit où la marque prime sur la règle.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Symbole size={22} className="text-laterite" />
      <span className="text-body font-bold uppercase tracking-marque">Totem</span>
    </span>
  );
}
