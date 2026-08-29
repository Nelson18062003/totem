"use client";

import { useId } from "react";
import {
  BRIN_A, BRIN_B, COUPE, CROISEMENTS, EPAISSEUR, TAILLE_TISSAGE, VUE_BOITE,
} from "@noyau/marque";

// Marque TOTEM — symbole et verrouillage.
//
// Le symbole est « La Tresse » : deux brins qui se croisent à chaque registre
// et se rejoignent aux deux bouts. Entre deux croisements, le vide dessine un
// losange — le treillis naît du tressage, il n'est pas posé dessus.
//
// La géométrie vit dans `@noyau/marque`, partagée avec l'application du
// téléphone : le symbole est décrit une seule fois. Ce fichier n'en est que
// le rendu pour le navigateur. Voir docs/IDENTITE.md.

function Coupe({ y }: { y: number }) {
  // Le brin du dessous est interrompu sur toute la largeur de celui du dessus,
  // plus un jeu : c'est ce vide qui donne le passage dessus-dessous.
  return (
    <rect
      x={COUPE.x}
      y={COUPE.y}
      width={COUPE.largeur}
      height={COUPE.hauteur}
      fill="#000"
      transform={`translate(16,${y}) rotate(${COUPE.rotation})`}
    />
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
  const id = useId();
  const tisse = size >= TAILLE_TISSAGE;
  const brin = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: EPAISSEUR,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox={VUE_BOITE}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="TOTEM"
    >
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
      <path d={BRIN_A} {...brin} mask={tisse ? `url(#${id}-a)` : undefined} />
      <path d={BRIN_B} {...brin} mask={tisse ? `url(#${id}-b)` : undefined} />
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
      {/* DM Sans Bold : le logotype ne se recompose pas dans la police de
          l'interface (docs/IDENTITE.md). */}
      <span className="font-marque text-body font-bold uppercase tracking-marque">Totem</span>
    </span>
  );
}
