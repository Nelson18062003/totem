/**
 * GALERIE DE CONTRÔLE — les boutons.
 *
 * Une planche, pas une page : le superviseur l'assemble avec les autres
 * familles. On y voit toutes les variantes dans tous leurs états, chacun
 * étiqueté, et une rangée où les hauteurs se comparent côte à côte — c'est là
 * que se voient les 44 et les 48, et que se verrait une hauteur qui aurait
 * dérivé.
 *
 * Trois états ne se photographient pas : le survol, le focus et le pressé
 * n'existent que sous la main. Ils sont montrés sur des boutons vivants, avec
 * le geste à faire. Les deux autres — éteint, en cours — sont rendus tels quels.
 */

import {
  Bouton,
  BoutonIcone,
  FOND_PRESSE,
  type VarianteBouton,
} from "@/app/ui/bouton";
import { IconArrowUp, IconClose, IconDownload, IconPlus } from "@/app/icons";

const VARIANTES: Array<{ variante: VarianteBouton; libelle: string; hauteur: string }> = [
  { variante: "primaire", libelle: "Primaire", hauteur: "48 — h-controle-fort" },
  { variante: "secondaire", libelle: "Secondaire", hauteur: "44 — h-controle" },
  { variante: "discret", libelle: "Discret", hauteur: "44 — h-controle" },
  { variante: "danger", libelle: "Danger", hauteur: "48 — h-controle-fort" },
];

function Etiquette({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-caption text-ink-faint">{children}</p>;
}

function Case({
  etat,
  children,
}: {
  etat: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Etiquette>{etat}</Etiquette>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

/** Une variante, ses cinq états, plus le chargement. */
function Planche({
  variante,
  libelle,
  hauteur,
}: {
  variante: VarianteBouton;
  libelle: string;
  hauteur: string;
}) {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-4">
        <h3 className="text-heading">{libelle}</h3>
        <p className="text-small text-ink-soft">{hauteur}</p>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <Case etat="repos">
          <Bouton variante={variante}>Encaisser</Bouton>
        </Case>

        <Case etat="survol — passez la souris">
          <Bouton variante={variante}>Encaisser</Bouton>
        </Case>

        <Case etat="focus — atteignez-le au clavier">
          <Bouton variante={variante}>Encaisser</Bouton>
        </Case>

        <Case etat="pressé — maintenez le clic">
          <Bouton variante={variante}>Encaisser</Bouton>
        </Case>

        {/* Le pressé épinglé : le même bouton, son ton de pressé posé en
            classe statique. C'est la seule façon qu'une capture d'écran en
            garde la trace. */}
        <Case etat="pressé — épinglé">
          <Bouton variante={variante} className={FOND_PRESSE[variante]}>
            Encaisser
          </Bouton>
        </Case>

        <Case etat="éteint">
          <Bouton variante={variante} desactive>
            Encaisser
          </Bouton>
        </Case>

        <Case etat="en cours — largeur inchangée">
          <Bouton variante={variante} enCours>
            Encaisser
          </Bouton>
        </Case>

        <Case etat="avec icône">
          <Bouton variante={variante} icone={<IconPlus />}>
            Encaisser
          </Bouton>
        </Case>

        <Case etat="lien (rend un a / Link)">
          <Bouton variante={variante} href="/encaissements" iconeFin={<IconArrowUp />}>
            Voir les reçus
          </Bouton>
        </Case>

        <Case etat="icône seule — 44 × 44">
          <BoutonIcone
            variante={variante}
            icone={<IconDownload />}
            aria-label="Télécharger le reçu"
          />
        </Case>

        <Case etat="icône seule — éteinte">
          <BoutonIcone
            variante={variante}
            icone={<IconClose />}
            aria-label="Fermer la fiche"
            desactive
          />
        </Case>
      </div>
    </section>
  );
}

/** Les hauteurs côte à côte, alignées par le bas : 48 · 44 · 44 · 48 · 44. */
function RangeeDesHauteurs() {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-4">
        <h3 className="text-heading">Les hauteurs, côte à côte</h3>
        <p className="max-w-lecture text-small text-ink-soft">
          Deux hauteurs, pas neuf. 48 pour ce qui coûte cher à rater — l&apos;action
          principale et l&apos;action destructive — 44 pour tout le reste. Un bouton
          d&apos;icône est un carré de 44.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Etiquette>48</Etiquette>
          <Bouton variante="primaire">Primaire</Bouton>
        </div>
        <div>
          <Etiquette>44</Etiquette>
          <Bouton variante="secondaire">Secondaire</Bouton>
        </div>
        <div>
          <Etiquette>44</Etiquette>
          <Bouton variante="discret">Discret</Bouton>
        </div>
        <div>
          <Etiquette>48</Etiquette>
          <Bouton variante="danger">Danger</Bouton>
        </div>
        <div>
          <Etiquette>44 × 44</Etiquette>
          <BoutonIcone
            variante="secondaire"
            icone={<IconPlus />}
            aria-label="Ajouter un compte"
          />
        </div>
      </div>
    </section>
  );
}

/** Pleine largeur : la largeur change, la hauteur ne bouge pas. */
function PleineLargeur() {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-4">
        <h3 className="text-heading">Pleine largeur</h3>
        <p className="text-small text-ink-soft">
          La largeur s&apos;étend, la hauteur reste posée.
        </p>
      </header>
      <div className="flex flex-col gap-2">
        <Bouton variante="primaire" pleineLargeur icone={<IconPlus />}>
          Encaisser un paiement
        </Bouton>
        <Bouton variante="secondaire" pleineLargeur>
          Annuler
        </Bouton>
      </div>
    </section>
  );
}

export function GalerieBoutons() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-title">Boutons</h2>
        <p className="max-w-lecture text-small text-ink-soft">
          Une seule fabrique, quatre variantes, cinq états. La hauteur est
          posée, le contenu est centré — aucun bouton ne calcule sa hauteur en
          empilant des paddings.
        </p>
      </header>

      <RangeeDesHauteurs />

      {VARIANTES.map((v) => (
        <Planche key={v.variante} {...v} />
      ))}

      <PleineLargeur />
    </div>
  );
}
