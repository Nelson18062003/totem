/**
 * GALERIE DE CONTRÔLE — les boutons.
 *
 * Une planche, pas une page : le superviseur l'assemble avec les autres
 * familles. On y voit toutes les variantes dans tous leurs états, chacun
 * étiqueté, et une rangée où les tailles se comparent côte à côte — c'est là
 * que se voient les 32, les 40 et les 44, et que se verrait une taille qui
 * aurait dérivé.
 *
 * Trois états ne se photographient pas : le survol, le focus et le pressé
 * n'existent que sous la main. Ils sont montrés sur des boutons vivants, avec
 * le geste à faire. Les deux autres — éteint, en cours — sont rendus tels quels.
 *
 * LE POINTILLÉ INDIGO N'EXISTE QUE SUR CETTE PAGE. Il ne dessine pas une aide :
 * il RÉVÈLE le pseudo-élément `::after` que pose `.cible`, c'est-à-dire la
 * région qui accepte réellement l'appui. C'est ce qui permet à une capture de
 * prouver qu'un bouton dessiné à 32 px répond bien sur 44.
 */

import {
  Bouton,
  BoutonIcone,
  FOND_PRESSE,
  type TailleBouton,
  type VarianteBouton,
} from "@/app/ui/bouton";
import { IconArrowUp, IconClose, IconDownload, IconPlus } from "@/app/icons";

const VARIANTES: Array<{ variante: VarianteBouton; libelle: string; hauteur: string }> = [
  { variante: "primaire", libelle: "Primaire", hauteur: "forte — 44 dessinés, 44 atteints" },
  { variante: "secondaire", libelle: "Secondaire", hauteur: "courante — 40 dessinés, 44 atteints" },
  { variante: "discret", libelle: "Discret", hauteur: "courante — 40 dessinés, 44 atteints" },
  { variante: "danger", libelle: "Danger", hauteur: "forte — 44 dessinés, 44 atteints" },
];

/**
 * Le pointillé posé SUR le pseudo-élément de `.cible` — pas un calque ajouté à
 * côté, qui ne prouverait rien. Ce qu'on voit est la zone qui répond.
 */
const ZONE_VISIBLE = "after:outline-1 after:outline-dashed after:outline-accent";

/**
 * Pour la taille `forte`, il n'y a pas de pseudo-élément : la boîte visuelle
 * FAIT déjà 44, elle est sa propre cible. Le pointillé tombe donc sur le
 * dessin lui-même — et c'est exactement ce que la planche doit montrer.
 */
const ZONE_CONFONDUE = "outline-1 outline-dashed outline-accent";

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

        <Case etat="icône seule — 32 dessinés">
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

/* ── La planche des trois tailles ────────────────────────────────────────── */

const TAILLES: Array<{
  taille: TailleBouton;
  boite: string;
  cible: string;
  note: string;
}> = [
  {
    taille: "compacte",
    boite: "32 — h-visuel",
    cible: "44 par .cible",
    note: "Barre déjà dense, action de queue de rangée, filtre.",
  },
  {
    taille: "courante",
    boite: "40 — h-visuel-lg",
    cible: "44 par .cible",
    note: "Le défaut. Secondaire et discret le prennent sans rien demander.",
  },
  {
    taille: "forte",
    boite: "44 — h-controle",
    cible: "sa propre hauteur",
    note: "Action primaire et action destructive. Ce qui coûte cher à rater se voit autant qu'il s'atteint.",
  },
];

/**
 * Les trois tailles, chacune avec sa zone d'appui rendue visible. C'est la
 * planche qu'on photographie : le rectangle plein fait 32, 40 ou 44 ; le
 * pointillé fait 44 dans les trois cas.
 */
function PlancheDesTailles() {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-4">
        <h3 className="text-heading">Les trois tailles, et leur zone d&apos;appui</h3>
        <p className="max-w-lecture text-small text-ink-soft">
          On dessine petit, on vise grand. Le rectangle plein est la boîte
          visuelle — 32, 40, 44. Le pointillé indigo est le pseudo-élément que
          pose <code>.cible</code>{" "}: la région qui accepte l&apos;appui. Elle
          fait 44 dans les trois cas, sans un seul pixel de padding vertical —
          le padding aurait déplacé le survol, l&apos;anneau de focus et la mise
          en page, les trois à la fois.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {TAILLES.map(({ taille, boite, cible, note }) => (
          <div key={taille} className="flex flex-col gap-2">
            <p className="text-small font-medium text-ink">
              {taille} — boîte {boite}, cible {cible}
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <Bouton variante="secondaire" taille={taille}>
                Encaisser
              </Bouton>
              <Bouton
                variante="secondaire"
                taille={taille}
                className={taille === "forte" ? ZONE_CONFONDUE : ZONE_VISIBLE}
              >
                Encaisser
              </Bouton>
              <Bouton variante="primaire" taille={taille} icone={<IconPlus />}>
                Encaisser
              </Bouton>
              <Bouton variante="secondaire" taille={taille} desactive>
                Encaisser
              </Bouton>
              <Bouton variante="secondaire" taille={taille} enCours>
                Encaisser
              </Bouton>
            </div>
            <p className="max-w-lecture text-caption text-ink-faint">{note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * La gouttière. Deux cibles voisines qui se recouvrent perdent leur aire
 * commune : la norme la retire du calcul, et les deux boutons retombent sous
 * les 44 qu'ils croyaient avoir.
 */
function LaGouttiere() {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-4">
        <h3 className="text-heading">La gouttière entre deux cibles : 12 px</h3>
        <p className="max-w-lecture text-small text-ink-soft">
          Deux boutons compacts font 32 px de haut et 44 px de cible : la cible
          déborde de 6 px de chaque côté. À 8 px d&apos;écart, les deux zones se
          recouvrent de 4 px — et la norme retire l&apos;aire commune du calcul :
          les deux retombent à 40. Il faut un pas d&apos;au moins 44, donc 12 px
          de gouttière. Sur l&apos;horizontale, <code>.cible</code>{" "}ne déborde
          pas : c&apos;est l&apos;axe où l&apos;on aligne.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <div>
          <Etiquette>gap-2 (8 px) — les cibles se recouvrent, refusé</Etiquette>
          <div className="flex flex-col gap-2">
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Aujourd&apos;hui
            </Bouton>
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Cette semaine
            </Bouton>
          </div>
        </div>

        <div>
          <Etiquette>gap-3 (12 px) — le minimum, les cibles se touchent sans se mordre</Etiquette>
          <div className="flex flex-col gap-3">
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Aujourd&apos;hui
            </Bouton>
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Cette semaine
            </Bouton>
          </div>
        </div>

        <div>
          <Etiquette>
            côte à côte — la cible ne déborde pas horizontalement, gap-3 suffit
          </Etiquette>
          <div className="flex flex-wrap gap-3">
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Aujourd&apos;hui
            </Bouton>
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Cette semaine
            </Bouton>
            <Bouton variante="secondaire" taille="compacte" className={ZONE_VISIBLE}>
              Ce mois
            </Bouton>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Les boîtes visuelles côte à côte, alignées par le bas : 44 · 40 · 40 · 44 · 32. */
function RangeeDesHauteurs() {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <header className="mb-4">
        <h3 className="text-heading">Les boîtes visuelles, côte à côte</h3>
        <p className="max-w-lecture text-small text-ink-soft">
          Trois tailles, pas neuf. 44 pour ce qui coûte cher à rater —
          l&apos;action principale et l&apos;action destructive — 40 pour le
          courant, 32 pour le compact et le bouton d&apos;icône. La zone
          d&apos;appui, elle, fait 44 partout : elle ne se voit pas, elle se
          mesure.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <Etiquette>44 · forte</Etiquette>
          <Bouton variante="primaire">Primaire</Bouton>
        </div>
        <div>
          <Etiquette>40 · courante</Etiquette>
          <Bouton variante="secondaire">Secondaire</Bouton>
        </div>
        <div>
          <Etiquette>40 · courante</Etiquette>
          <Bouton variante="discret">Discret</Bouton>
        </div>
        <div>
          <Etiquette>44 · forte</Etiquette>
          <Bouton variante="danger">Danger</Bouton>
        </div>
        <div>
          <Etiquette>32 · compacte</Etiquette>
          <Bouton variante="secondaire" taille="compacte">
            Compact
          </Bouton>
        </div>
        <div>
          <Etiquette>32 × 32 · cible 44 × 44</Etiquette>
          <BoutonIcone
            variante="secondaire"
            icone={<IconPlus />}
            aria-label="Ajouter un compte"
            className={ZONE_VISIBLE}
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
      <div className="flex flex-col gap-3">
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
          Une seule fabrique, quatre variantes, trois tailles, cinq états. La
          hauteur est posée, le contenu est centré — aucun bouton ne calcule sa
          hauteur en empilant des paddings, et aucun n&apos;atteint ses 44 px de
          cible autrement que par un pseudo-élément. Aucun ancêtre ne doit
          porter <code>overflow: hidden</code>{" "}: il rognerait la zone
          d&apos;appui sans que rien ne le signale.
        </p>
      </header>

      <PlancheDesTailles />

      <LaGouttiere />

      <RangeeDesHauteurs />

      {VARIANTES.map((v) => (
        <Planche key={v.variante} {...v} />
      ))}

      <PleineLargeur />
    </div>
  );
}
