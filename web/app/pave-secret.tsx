"use client";

import { useState } from "react";
import { textesGuichet } from "@/lib/textes/guichet";
import { useLangue } from "./langue";
import { SoclePave } from "./ui/pave";

/**
 * Le pavé du code secret, sur la plateforme.
 *
 * LA RÈGLE DU CODE N'A PAS BOUGÉ, ET NE BOUGERA PAS. Les chiffres composés ne
 * vivent que dans la mémoire de cette page : jamais affichés (des pastilles),
 * jamais journalisés, envoyés au terminal seulement à « Valider » — puis
 * aussitôt oubliés ici, et masqués dans la base par le robot sitôt lus. Le
 * nom accessible des pastilles ne transmet QUE LA LONGUEUR, jamais un chiffre.
 * Le journal n'en garde que « •••• ».
 *
 * ── v2 · ce que la mesure au navigateur a montré, et ce qu'on en a fait ────
 *
 *   1. LA GRILLE PRENAIT 208 px SUR 390. 91 px de vide de chaque côté, 46 % de
 *      l'écran perdu — et 74 px morts de chaque côté à l'intérieur même de sa
 *      carte de 356. La grille prend maintenant TOUTE la largeur de sa carte,
 *      en trois colonnes égales : c'est la carte qui donne la largeur de la
 *      touche, plus une largeur de pavé décidée à part.
 *
 *   2. LES TOUCHES FAISAIENT 64 × 48 — ratio 1,33, plus larges que hautes pour
 *      un doigt qui est rond. Elles sont CARRÉES, et jamais sous 64 px.
 *
 *   3. LE PAVÉ SORTAIT DE L'ÉCRAN dès que le fil s'allongeait (voir
 *      `ui/pave.tsx`). Il est épinglé en bas, le fil défile derrière.
 *
 *   4. « VALIDER » JOUXTAIT « 0 » À 8 px : un zéro raté validait un code court.
 *      La gouttière est celle du système entre deux cibles voisines — 12 px,
 *      `--spacing-gouttiere-cible` — sur les deux axes, donc autour de Valider
 *      comme partout ailleurs.
 *
 *   5. LES PASTILLES FAISAIENT 12 px : on ne compte pas quatre points d'un
 *      coup d'œil à cette taille. Elles font 16, écartées de 12.
 *
 *   6. TITRE + NOTE FAISAIENT 60 px DE TEXTE AU-DESSUS D'UN CLAVIER. On ne lit
 *      pas une note en tapant un code : elle est DITE UNE SEULE FOIS, À
 *      L'OUVERTURE — c'est déjà le rôle de `noteSaisie`, juste avant que la
 *      session ne parte, et de la phrase de bas de page des Opérations, qui
 *      porte toutes deux la promesse (« jamais enregistré nulle part »). Il ne
 *      reste ici qu'une ligne, le titre, et il partage même sa ligne avec les
 *      pastilles qu'il annonce.
 *
 *      Ce n'est pas qu'une question de goût : mesuré, la note coûtait 72 px,
 *      et sur un téléphone de 360 × 640 c'étaient les 21 px qui empêchaient le
 *      pavé entier de tenir dans la zone qui le montre.
 *
 * CE QUI ÉTAIT BON ET QUI RESTE : la disposition téléphonique (1 en haut à
 * gauche, 0 en bas au centre), et « Valider » au bout de la dernière rangée —
 * on l'atteint des deux mains sans changer de prise.
 */

/**
 * LA TAILLE D'UNE TOUCHE SE CALCULE — elle ne se choisit pas.
 *
 *     touche = min(la colonne de la carte, ce que la hauteur permet)
 *              et jamais moins de 64
 *
 * LA COLONNE vient de la carte : la grille prend toute sa largeur, en trois
 * parts égales. C'est le premier constat — 208 px de grille sur 390 d'écran
 * n'étaient la mesure de rien.
 *
 * CE QUE LA HAUTEUR PERMET est l'autre bout de la même règle, et il a été
 * mesuré lui aussi : sur un téléphone de 360 × 640, une touche carrée tirée
 * sur toute la largeur fait 89 px, les quatre rangées 393, et le pavé
 * redevient trop grand pour la zone qui le montre — on retomberait dans le
 * défaut qu'on corrige. Les QUATRE RANGÉES NE PRENNENT DONC JAMAIS PLUS DE LA
 * MOITIÉ DE L'ÉCRAN. Sur 844 px de haut la règle ne mord pas, sur 640 elle
 * ramène la touche à 71.
 *
 * LE PLANCHER DE 64 est un cran de l'échelle, et il gagne toujours : mieux
 * vaut un pavé qu'on fait défiler d'un cheveu qu'une touche qu'on rate.
 */
const MESURES = {
  "--gouttiere": "var(--spacing-gouttiere-cible)", /* 12 */
  "--touche-max":
    "max(calc(var(--spacing) * 16), calc((50dvh - 3 * var(--gouttiere)) / 4))",
  "--largeur-pave": "calc(3 * var(--touche-max) + 2 * var(--gouttiere))",
} as React.CSSProperties;

/**
 * LE SOCLE D'UNE TOUCHE — et sa hauteur est DÉCLARÉE.
 *
 * C'était le défaut de la v1 : aucune touche ne posait sa hauteur. « Effacer »
 * et « Valider » faisaient 42 px intrinsèques et n'atteignaient 48 que par
 * étirement de la grille sur la touche « 0 », dont la BORDURE payait la
 * différence — retirez cette bordure, la rangée s'affaisse.
 *
 * Ici chaque touche tient toute seule : `aspect-square` lui donne la hauteur
 * de sa propre largeur (elle est carrée quoi qu'il arrive à ses voisines), et
 * `min-h-16` pose le plancher de 64 px que la grille ne peut pas lui prendre.
 * Enlevez n'importe quelle touche : les autres ne bougent pas d'un pixel.
 */
const TOUCHE =
  "flex aspect-square min-h-16 w-full items-center justify-center rounded-btn " +
  "transition-teintes";

/* Le chiffre : contour PORTEUR (3,04:1) — c'est lui qui dit « ceci est une
   touche ». Le filet décoratif valait 1,26:1 et n'annonçait rien. Le glyphe
   monte d'un cran : dans une touche de 100 px, un 16 px est une poussière. */
const CHIFFRE =
  `${TOUCHE} border border-contour bg-surface-raised text-title text-ink ` +
  "tabnums hover:bg-surface-2 active:bg-surface-3";

/* Effacer : discrète, mais de la même taille que les autres. */
const EFFACER =
  `${TOUCHE} text-small font-medium text-ink hover:bg-surface-2 active:bg-surface-3`;

/* Valider : l'indigo porte l'action. Éteinte, elle change de COULEUR — jamais
   d'opacité : `opacity-30` sur du blanc donne 1,96:1, du texte illisible. */
const VALIDER =
  `${TOUCHE} text-small font-medium bg-accent text-sur-couleur ` +
  "hover:bg-accent-hover active:bg-accent-presse";
const VALIDER_ETEINT =
  `${TOUCHE} text-small font-medium bg-surface-eteint text-ink-eteint`;

/* La pastille de saisie : 16 px, pleine quand le chiffre est composé, cerclée
   du contour porteur quand il reste à venir. */
const PASTILLE = "size-4 rounded-full transition-teintes";

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
    <SoclePave mesures={MESURES}>
      {/* Le titre annonce les pastilles : ils tiennent la même ligne. Ce qui
          s'affiche est tout ce qui sera jamais montré — des points. Le nom
          accessible ne transmet que la LONGUEUR, jamais un chiffre ; `role`
          le rend enfin lisible par un lecteur d'écran (sur une boîte sans
          rôle, l'étiquette n'était annoncée nulle part). */}
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 truncate text-small text-ink-soft">{t.paveTitre}</p>
        <div
          role="img"
          aria-label={t.chiffresComposes(code.length)}
          className="flex shrink-0 items-center gap-3"
        >
          {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
            <span
              key={i}
              className={`${PASTILLE} ${
                i < code.length ? "bg-ink" : "border border-contour"
              }`}
            />
          ))}
        </div>
      </div>

      {/* LA GRILLE — toute la largeur de sa carte, trois colonnes égales, et
          la gouttière du système entre deux cibles voisines : 12 px, sur les
          deux axes. « Valider » n'est donc plus à 8 px de « 0 ». */}
      <div className="mx-auto grid w-full max-w-[var(--largeur-pave)] grid-cols-3 gap-[var(--gouttiere)]">
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
    </SoclePave>
  );
}
