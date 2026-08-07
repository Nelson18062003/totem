"use client";

import { useState } from "react";
import { textesGuichet } from "@/lib/textes/guichet";
import { useLangue } from "./langue";

/**
 * Le pavé du code secret, sur la plateforme.
 *
 * Les chiffres composés ne vivent que dans la mémoire de cette page : jamais
 * affichés (des points), jamais journalisés, envoyés au terminal seulement à
 * « Valider » — puis aussitôt oubliés ici, et masqués dans la base par le
 * robot sitôt lus. Le journal n'en garde que « •••• ».
 *
 * C'est l'objet le plus manipulé au pouce de l'application, et c'était le
 * moins mesuré. Trois défauts relevés, tous corrigés ici :
 *
 *   1. LA TOUCHE NE FAISAIT PAS UN NOMBRE ENTIER DE PIXELS. 224 px de large
 *      pour trois colonnes et deux écarts de 12 : 70,67 px par touche. Une
 *      largeur qui ne tombe pas juste ne tombe juste sur aucun écran.
 *
 *   2. L'ÉCART ÉTAIT DE 6 px — un multiple de 2, jamais de 4, donc hors de
 *      l'échelle. Il est à 8, le premier cran qui satisfasse aussi le minimum
 *      de WCAG 2.5.8 entre deux cibles voisines.
 *
 *   3. AUCUNE TOUCHE NE DÉCLARAIT SA HAUTEUR. « Effacer » et « Valider »
 *      faisaient 42 px intrinsèques : elles n'atteignaient 48 que par
 *      étirement de la grille sur la touche « 0 », dont la BORDURE payait la
 *      différence. Retirez cette bordure, la rangée s'affaisse. Chaque touche
 *      pose maintenant `h-controle-fort` (48) — un pavé de code se rate cher.
 */

/**
 * LA LARGEUR DU PAVÉ SE CALCULE — elle ne se choisit pas :
 *
 *     largeur = 3 × colonne + 2 × écart
 *
 * La COLONNE est un cran de l'échelle (64) : assez large pour le mot le plus
 * long du pavé, « Valider » / « Confirm ». L'ÉCART en est un autre (8). Les
 * trois colonnes tombent donc exactement sur 64 px chacune, et la division est
 * juste par construction — ce n'est plus la largeur du pavé qui décide de la
 * touche, c'est la touche qui décide de la largeur du pavé.
 */
const MESURES = {
  "--colonne": "calc(var(--spacing) * 16)", /* 64 */
  "--ecart": "calc(var(--spacing) * 2)", /*  8 */
  "--largeur-pave": "calc(3 * var(--colonne) + 2 * var(--ecart))", /* 208 */
} as React.CSSProperties;

/* Le socle d'une touche. La hauteur est POSÉE (48), la largeur est celle de sa
   colonne, le contenu se centre dedans. Aucun padding vertical ne participe. */
const TOUCHE =
  "flex h-controle-fort w-full items-center justify-center rounded-btn " +
  "font-medium transition-teintes";

/* Le chiffre : contour PORTEUR (3,04:1) — c'est lui qui dit « ceci est une
   touche ». Le filet décoratif valait 1,26:1 et n'annonçait rien. */
const CHIFFRE =
  `${TOUCHE} border border-contour bg-surface-raised text-body text-ink ` +
  "tabnums hover:bg-surface-2 active:bg-surface-3";

/* Effacer : discrète, mais de la même taille que les autres. */
const EFFACER =
  `${TOUCHE} text-small text-ink hover:bg-surface-2 active:bg-surface-3`;

/* Valider : l'indigo porte l'action. Éteinte, elle change de COULEUR — jamais
   d'opacité : `opacity-30` sur du blanc donne 1,96:1, du texte illisible. */
const VALIDER = `${TOUCHE} text-small bg-accent text-sur-couleur hover:bg-accent-hover active:bg-accent-presse`;
const VALIDER_ETEINT = `${TOUCHE} text-small bg-surface-eteint text-ink-eteint`;

const CHIFFRES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PaveSecret({ onValider }: { onValider: (code: string) => void }) {
  const langue = useLangue();
  const t = textesGuichet[langue];
  const [code, setCode] = useState("");

  const appuyer = (c: string) => setCode((v) => (v.length >= 6 ? v : v + c));
  const effacer = () => setCode((c) => c.slice(0, -1));
  const valider = () => {
    if (code.length < 4) return;
    onValider(code);
    setCode("");        // rien ne subsiste après l'envoi
  };

  const pretAValider = code.length >= 4;

  return (
    <div className="flex flex-col items-center gap-4" style={MESURES}>
      <p className="text-small text-ink-soft">{t.paveTitre}</p>

      {/* Ce qui s'affiche est tout ce qui sera jamais montré : des points. Le
          nom accessible ne transmet que la LONGUEUR, jamais un chiffre. */}
      <div className="flex h-6 items-center gap-2" aria-label={t.chiffresComposes(code.length)}>
        {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
          <span key={i}
            className={`size-3 rounded-full transition-teintes ${
              i < code.length ? "bg-ink" : "border border-contour"
            }`} />
        ))}
      </div>

      <div className="grid w-[var(--largeur-pave)] grid-cols-3 gap-[var(--ecart)]">
        {CHIFFRES.map((c) => (
          <button key={c} type="button" onClick={() => appuyer(c)} className={CHIFFRE}>
            {c}
          </button>
        ))}
        <button type="button" onClick={effacer} aria-label={t.effacerDernier} className={EFFACER}>
          {t.effacer}
        </button>
        <button type="button" onClick={() => appuyer("0")} className={CHIFFRE}>
          0
        </button>
        <button type="button" onClick={valider} disabled={!pretAValider}
          className={pretAValider ? VALIDER : VALIDER_ETEINT}>
          {t.valider}
        </button>
      </div>

      <p className="max-w-lecture text-center text-small text-ink-soft">
        {t.paveNote}
      </p>
    </div>
  );
}
