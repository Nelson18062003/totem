import type { Metadata } from "next";
import { GalerieBoutons } from "./boutons";
import { GalerieChamps } from "./champs";
import { GalerieCartes } from "./cartes";
import { GalerieNavigation } from "./navigation";
import { GalerieSelecteurs } from "./selecteurs";
import { GalerieEtats } from "./etats";

export const metadata: Metadata = { title: "Le système — TOTEM" };

// La planche de contrôle du système.
//
// Elle n'est pas une vitrine : c'est l'endroit où l'on VÉRIFIE. Chaque famille
// y montre tous ses états côte à côte, à la même largeur, sur le même fond —
// et c'est cette mise en regard qui rend une incohérence visible. Neuf
// hauteurs de bouton dispersées dans neuf écrans ne se voient pas ; les mêmes
// neuf hauteurs alignées sur une planche sautent aux yeux.
//
// C'est aussi ce qu'on photographie : une capture de cette page prouve le
// système mieux qu'un tableau de valeurs.

const FAMILLES = [
  { id: "boutons", titre: "Boutons", detail: "Quatre variantes, cinq états. 44 px de plancher, 48 pour ce qui coûte cher à rater.", Galerie: GalerieBoutons },
  { id: "champs", titre: "Champs et formulaires", detail: "Hauteur déclarée, contour à 3:1, et aucune signature ne permet un champ anonyme.", Galerie: GalerieChamps },
  { id: "cartes", titre: "Cartes et listes", detail: "Trois hauteurs de rangée — 56, 72, 88 — et un plafond tenu par le typage.", Galerie: GalerieCartes },
  { id: "navigation", titre: "Navigation", detail: "La même hauteur déplié et replié. Un seul badge de non-lus, deux formes.", Galerie: GalerieNavigation },
  { id: "selecteurs", titre: "Sélecteurs et contrôles", detail: "Le visuel peut être petit ; la cible fait 44. Les zones sont tracées en pointillés.", Galerie: GalerieSelecteurs },
  { id: "etats", titre: "États et feedback", detail: "Un seul état vide. Des squelettes qui ne mentent pas sur la hauteur qu'ils remplacent.", Galerie: GalerieEtats },
];

export default function Systeme() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
      <header className="border-b border-line pb-8">
        <p className="text-caption uppercase tracking-marque text-ink-faint">
          TOTEM
        </p>
        <h1 className="mt-2 text-title">Le système</h1>
        <p className="mt-3 max-w-lecture text-body text-ink-soft">
          La précision ne vient pas du soin apporté à chaque bouton. Elle vient
          d’un système de contraintes écrit d’avance, auquel chaque bouton se
          soumet. Cette page montre les six familles et tous leurs états — c’est
          en les mettant côte à côte qu’une incohérence devient visible.
        </p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Grille", "4 px, échelle fermée à huit crans"],
            ["Cible", "44 px de plancher, 48 pour l’essentiel"],
            ["Hauteur", "déclarée, jamais subie"],
          ].map(([terme, detail]) => (
            <div key={terme} className="rounded-card border border-line p-4">
              <dt className="text-caption uppercase text-ink-faint">{terme}</dt>
              <dd className="mt-1 text-small text-ink">{detail}</dd>
            </div>
          ))}
        </dl>

        <nav aria-label="Les familles" className="mt-6 flex flex-wrap gap-2">
          {FAMILLES.map((f) => (
            <a
              key={f.id}
              href={`#${f.id}`}
              className="flex h-controle items-center rounded-full border border-contour px-4 text-small font-medium text-ink transition-teintes hover:bg-surface-2 active:bg-surface-3"
            >
              {f.titre}
            </a>
          ))}
        </nav>
      </header>

      {FAMILLES.map(({ id, titre, detail, Galerie }) => (
        <section key={id} id={id} className="scroll-mt-8 border-b border-line py-12 last:border-0">
          <h2 className="text-heading">{titre}</h2>
          <p className="mt-1 max-w-lecture text-small text-ink-soft">{detail}</p>
          <div className="mt-8">
            <Galerie />
          </div>
        </section>
      ))}

      <footer className="py-8 text-small text-ink-faint">
        <p className="max-w-lecture">
          Les valeurs vivent dans{" "}
          <code className="text-ink">web/app/globals.css</code> et s’assemblent
          selon <code className="text-ink">docs/SYSTEME.md</code>. Rien ne
          s’écrit ailleurs :{" "}
          <code className="text-ink">scripts/verifier-le-systeme.mjs</code> relit
          les écrans et refuse ce qui sort de l’échelle. Une règle que personne
          ne compte n’est pas une règle.
        </p>
      </footer>
    </main>
  );
}
