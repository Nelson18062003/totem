"use client";

import { useEffect, useRef } from "react";
import { Brins } from "../marque";

// L'ouverture de la page de présentation : la tresse se dessine au fil du
// défilement, de bas en haut — le totem s'érige — puis le mot apparaît.
//
// Tout tient dans une variable CSS, `--trace`, qui va de 0 à 1 avec le
// défilement de la section. Le reste est du CSS pur : chaque brin est un
// contour en pointillé dont la part visible suit la variable, et le mot
// s'éclaircit sur la fin. Le tracé, lui, reste celui de `marque.tsx` — on ne
// redessine rien ici, on ne fait que le révéler.
//
// Sans JavaScript, ou quand le visiteur préfère éviter les animations, la
// variable garde sa valeur de repli, 1 : la marque est entière, immobile, et
// la section tient sur un seul écran.

/** Part du défilement consacrée au dessin ; le mot arrive ensuite. */
const PART_DESSIN = 0.78;

// Posé avant le premier affichage, pour que la tresse ne paraisse jamais
// entière puis effacée : si le visiteur accepte les animations, la section
// démarre vide (`--trace: 0`) et prend sa hauteur de défilement.
const PREPARATION = `
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  var reglage = document.createElement("style");
  reglage.textContent = "#ouverture{--trace:0;height:300vh}";
  document.head.appendChild(reglage);
}
`;

export function Ouverture() {
  const cadre = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = cadre.current;
    if (!section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let demande = 0;
    const mesurer = () => {
      demande = 0;
      const zone = section.getBoundingClientRect();
      const course = zone.height - window.innerHeight;
      const avancee = course > 0 ? Math.min(1, Math.max(0, -zone.top / course)) : 1;
      section.style.setProperty("--trace", avancee.toFixed(4));
    };
    const demander = () => {
      if (!demande) demande = requestAnimationFrame(mesurer);
    };

    // À l'arrivée par navigation interne, le réglage initial n'a pas été
    // rejoué : on redonne ici sa hauteur de défilement à la section.
    section.style.height = "300vh";
    mesurer();
    window.addEventListener("scroll", demander, { passive: true });
    window.addEventListener("resize", demander);
    return () => {
      cancelAnimationFrame(demande);
      window.removeEventListener("scroll", demander);
      window.removeEventListener("resize", demander);
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PREPARATION }} />
      <section
        id="ouverture"
        ref={cadre}
        aria-label="TOTEM"
        style={
          {
            // La part déjà tracée de chaque brin, puis l'arrivée du mot.
            "--dessin": `clamp(0, calc(var(--trace, 1) / ${PART_DESSIN}), 1)`,
            "--lettre": "clamp(0, calc((var(--trace, 1) - 0.82) / 0.18), 1)",
            // L'échelle du verrouillage vertical : tout découle de la hauteur
            // de capitale, comme dans la charte.
            "--capitale": "clamp(2rem, 8vw, 3.25rem)",
          } as React.CSSProperties
        }
      >
        <div className="sticky top-0 flex h-dvh flex-col items-center justify-center">
          {/* Le verrouillage vertical de la charte, en texte vivant : symbole
              à 2,1 hauteurs de capitale, écart de 0,78 — calé à l'œil pour
              tenir compte de la boîte de ligne du mot. */}
          <svg
            viewBox="0 0 32 32"
            aria-hidden="true"
            className="text-laterite"
            style={{
              // Le tracé occupe 28 des 32 unités de la grille : la boîte fait
              // donc 2,1 × 32/28 = 2,4 capitales pour un tracé de 2,1.
              width: "calc(var(--capitale) * 2.4)",
              height: "calc(var(--capitale) * 2.4)",
            }}
          >
            <Brins
              brin={{
                // `pathLength=1` : chaque brin mesure 1, quel que soit son
                // dessin. Un pointillé « 1 plein, 2 vide » décalé de
                // (dessin − 1) ne laisse alors paraître que la fin du tracé —
                // et la fin, c'est le bas : la tresse monte du sol.
                pathLength: 1,
                style: {
                  strokeDasharray: "1 2",
                  strokeDashoffset: "calc(var(--dessin) - 1)",
                },
              }}
            />
          </svg>

          <p
            className="font-bold uppercase leading-none tracking-marque"
            style={{
              fontSize: "calc(var(--capitale) / 0.7)",
              marginTop: "calc(var(--capitale) * 0.5)",
              opacity: "var(--lettre)",
              transform: "translateY(calc((1 - var(--lettre)) * 0.5rem))",
            }}
          >
            Totem
          </p>

          <p
            className="mt-5 max-w-xs text-center text-body leading-relaxed text-ink-soft"
            style={{ opacity: "var(--lettre)" }}
          >
            Le totem reste au pays&nbsp;; à travers lui, vous agissez à
            distance.
          </p>

          {/* Entièrement tracée (repli sans animation), l'invite se tait. */}
          <p
            className="absolute bottom-8 text-caption text-ink-faint"
            style={{ opacity: "calc(1 - var(--dessin) * 4)" }}
            aria-hidden="true"
          >
            Faites défiler
          </p>
        </div>
      </section>
    </>
  );
}
