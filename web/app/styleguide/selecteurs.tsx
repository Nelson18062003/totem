"use client";

import { useState } from "react";
import { IconGlobe } from "@/app/icons";
import {
  BarreFiltres,
  DeclencheurFiltre,
  FeuilleFiltres,
  type OptionFiltre,
} from "@/app/ui/filtre";
import {
  Case,
  GroupeSegments,
  Interrupteur,
  PuceFiltre,
  Radio,
} from "@/app/ui/selecteurs";

/*
 * LA GALERIE DES SÉLECTEURS — de quoi vérifier à l'œil ce que le système
 * promet par écrit : chaque contrôle dans ses quatre états (repos, coché,
 * focus, éteint), et la région d'appui rendue visible.
 *
 * Le contour en pointillés n'existe que sur cette page : c'est la CIBLE
 * (44 × 44, ou 48 × 44 pour l'interrupteur) dessinée par-dessus le visuel.
 * Elle prouve que ce qu'on voit peut être plus petit que ce qui répond.
 *
 * La colonne « focus » ne peut pas se déclencher toute seule : l'anneau est
 * global (`:focus-visible`) et n'apparaît qu'au clavier. On le reproduit ici à
 * l'identique — 2 px d'indigo, 2 px de décalage — posé sur le VISUEL de chaque
 * contrôle, pour montrer où il tombe. Tabulez dans la page : le vrai anneau
 * tombe exactement là.
 */

/** L'anneau du focus, reproduit sur le visuel (jamais sur la zone étendue). */
const ANNEAU = "outline-2 outline-solid outline-accent outline-offset-2";
const ANNEAU_BOUTON =
  "[&_button]:outline-2 [&_button]:outline-solid [&_button]:outline-accent [&_button]:outline-offset-2";
const ANNEAU_ENTREE =
  "[&_input]:outline-2 [&_input]:outline-solid [&_input]:outline-accent [&_input]:outline-offset-2";
const ANNEAU_SEGMENT =
  "[&_button:first-child]:outline-2 [&_button:first-child]:outline-solid [&_button:first-child]:outline-accent [&_button:first-child]:outline-offset-2";

/** La cible dessinée par-dessus le contrôle. Ne mesure rien : elle montre. */
function Cible({
  children,
  large,
}: {
  children: React.ReactNode;
  /** L'interrupteur est plus large que 44 : sa cible fait 48 × 44. */
  large?: boolean;
}) {
  return (
    <span className="relative inline-grid place-items-center">
      {children}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-dashed border-accent ${
          large ? "h-controle w-piste" : "size-controle"
        }`}
      />
    </span>
  );
}

function Titre({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-title">{children}</h2>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-lecture text-small text-ink-soft">{children}</p>;
}

/** Une case de la grille d'états : son nom, puis le contrôle. */
function Etat({
  nom,
  children,
}: {
  nom: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption uppercase text-ink-faint">{nom}</span>
      <div className="flex min-h-controle items-center">{children}</div>
    </div>
  );
}

function Grille({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 rounded-card border border-line bg-surface-raised p-6 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/* ── Les données de la planche « Filtres » ────────────────────────────────────
 * Ce sont exactement les sept choix qui débordaient sur l'écran des
 * encaissements : trois opérateurs, quatre catégories. Ils ne tenaient pas sur
 * une rangée en puces ; ils tiennent ici dans deux déclencheurs. */
const OPERATEURS: OptionFiltre[] = [
  { valeur: "mtn", libelle: "MTN MoMo" },
  { valeur: "orange", libelle: "Orange Money" },
  { valeur: "express", libelle: "Express Union" },
];

const CATEGORIES: OptionFiltre[] = [
  { valeur: "encaissement", libelle: "Encaissement", description: "42 opérations" },
  { valeur: "envoi", libelle: "Envoi", description: "18 opérations" },
  { valeur: "depot", libelle: "Dépôt", description: "9 opérations" },
  { valeur: "retrait", libelle: "Retrait", description: "6 opérations" },
];

/** Le cadre du téléphone : 384 px de carte, 352 utiles — plus étroit que les
 *  358 px réellement disponibles sur un écran de 390. Ce qui tient ici tient
 *  là-bas. */
function Telephone({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-sm rounded-card border border-line bg-surface-raised p-4">
      {children}
    </div>
  );
}

export function GalerieSelecteurs() {
  const [interrupteur, setInterrupteur] = useState(true);
  const [cochee, setCochee] = useState(true);
  const [radio, setRadio] = useState("orange");
  const [filtres, setFiltres] = useState<string[]>(["mtn"]);
  const [langue, setLangue] = useState("fr");

  // La planche « Filtres ». L'état appartient à l'écran, jamais à la barre :
  // une variable dit quelle feuille est ouverte, deux disent ce qui est retenu.
  const [feuille, setFeuille] = useState<null | "operateur" | "categorie">(null);
  const [operateur, setOperateur] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const nomDe = (options: OptionFiltre[], valeurs: string[]) =>
    valeurs.length === 0
      ? undefined
      : valeurs.length === 1
        ? options.find((o) => o.valeur === valeurs[0])?.libelle
        : `${valeurs.length} choisis`;

  const compteVivant = (operateur.length > 0 ? 1 : 0) + (categories.length > 0 ? 1 : 0);

  const basculerFiltre = (cle: string) =>
    setFiltres((f) => (f.includes(cle) ? f.filter((c) => c !== cle) : [...f, cle]));

  return (
    <div className="flex flex-col gap-12 p-6">
      <header>
        <h1 className="text-title">Sélecteurs et contrôles</h1>
        <Note>
          Le contour en pointillés indigo est la région qui accepte l&apos;appui :
          44 × 44 partout, 48 × 44 pour l&apos;interrupteur. Il ne s&apos;affiche
          que sur cette page. Le visuel, lui, peut être plus petit — 20 px pour
          une case ou un bouton radio.
        </Note>
      </header>

      {/* ── 1 · Interrupteur ─────────────────────────────────────────────── */}
      <section>
        <Titre>Interrupteur — piste 48 × 28, pastille 24, course 20</Titre>
        <Grille>
          <Etat nom="Repos">
            <Cible large>
              <Interrupteur
                libelle="Alertes SMS"
                libelleMasque
                actif={false}
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
          <Etat nom="Activé">
            <Cible large>
              <Interrupteur
                libelle="Alertes SMS"
                libelleMasque
                actif
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
          <Etat nom="Focus">
            <Cible large>
              <Interrupteur
                libelle="Alertes SMS"
                libelleMasque
                actif
                surChangement={() => {}}
                classe={ANNEAU_BOUTON}
              />
            </Cible>
          </Etat>
          <Etat nom="Éteint">
            <Cible large>
              <Interrupteur
                libelle="Alertes SMS"
                libelleMasque
                actif={false}
                eteint
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
        </Grille>
        <div className="mt-4 rounded-card border border-line bg-surface-raised p-4">
          <Interrupteur
            libelle="Prévenir à chaque encaissement"
            description="Un message par opération reçue sur le terminal."
            actif={interrupteur}
            surChangement={setInterrupteur}
            classe="w-full justify-between"
          />
        </div>
        <Note>
          La pastille translate de 20 px : elle glisse, elle ne saute pas. Piste
          au repos en <code>contour</code> (3,39:1 sur le fond), pastille
          blanche sur la piste (3,39:1) : WCAG 1.4.11 demande 3:1 aux deux.
        </Note>
      </section>

      {/* ── 2 · Case à cocher ────────────────────────────────────────────── */}
      <section>
        <Titre>Case à cocher — 20 visibles, cible 44</Titre>
        <Grille>
          <Etat nom="Repos">
            <Cible>
              <Case
                libelle="Inclure les retraits"
                libelleMasque
                cochee={false}
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
          <Etat nom="Cochée">
            <Cible>
              <Case
                libelle="Inclure les retraits"
                libelleMasque
                cochee
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
          <Etat nom="Focus">
            <Cible>
              <Case
                libelle="Inclure les retraits"
                libelleMasque
                cochee
                surChangement={() => {}}
                classe={ANNEAU_ENTREE}
              />
            </Cible>
          </Etat>
          <Etat nom="Éteint">
            <Cible>
              <Case
                libelle="Inclure les retraits"
                libelleMasque
                cochee
                eteint
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
        </Grille>
        <div className="mt-4 rounded-card border border-line bg-surface-raised p-4">
          <Case
            libelle="Joindre le reçu au message"
            description="Le reçu PDF part avec la confirmation."
            cochee={cochee}
            surChangement={setCochee}
          />
        </div>
        <Note>
          L&apos;anneau de focus cerne le carré de 20 px, pas la zone de 44 :
          c&apos;est l&apos;<code>&lt;input&gt;</code> qui reçoit le focus, et
          l&apos;enveloppe qui porte la cible.
        </Note>
      </section>

      {/* ── 3 · Bouton radio ─────────────────────────────────────────────── */}
      <section>
        <Titre>Bouton radio — 20 visibles, cible 44</Titre>
        <Grille>
          <Etat nom="Repos">
            <Cible>
              <Radio
                libelle="MTN"
                libelleMasque
                nom="galerie-repos"
                valeur="mtn"
                choisi={false}
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
          <Etat nom="Choisi">
            <Cible>
              <Radio
                libelle="MTN"
                libelleMasque
                nom="galerie-choisi"
                valeur="mtn"
                choisi
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
          <Etat nom="Focus">
            <Cible>
              <Radio
                libelle="MTN"
                libelleMasque
                nom="galerie-focus"
                valeur="mtn"
                choisi
                surChangement={() => {}}
                classe={ANNEAU_ENTREE}
              />
            </Cible>
          </Etat>
          <Etat nom="Éteint">
            <Cible>
              <Radio
                libelle="MTN"
                libelleMasque
                nom="galerie-eteint"
                valeur="mtn"
                choisi
                eteint
                surChangement={() => {}}
              />
            </Cible>
          </Etat>
        </Grille>
        <div className="mt-4 flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
          <Radio
            libelle="Orange Money"
            nom="galerie-operateur"
            valeur="orange"
            choisi={radio === "orange"}
            surChangement={setRadio}
          />
          <Radio
            libelle="MTN MoMo"
            nom="galerie-operateur"
            valeur="mtn"
            choisi={radio === "mtn"}
            surChangement={setRadio}
          />
          <Radio
            libelle="Les deux"
            nom="galerie-operateur"
            valeur="deux"
            choisi={radio === "deux"}
            surChangement={setRadio}
          />
        </div>
        <Note>
          Deux cibles voisines de 44 se touchent sans se chevaucher : leurs
          centres sont à 44 px, au-dessus du minimum de 24.
        </Note>
      </section>

      {/* ── 4 · Puce sélectionnable ──────────────────────────────────────── */}
      <section>
        <Titre>Puce sélectionnable — h-controle (44), une seule hauteur</Titre>
        <Grille>
          <Etat nom="Repos">
            <PuceFiltre
              libelle="Orange"
              selectionnee={false}
              surChangement={() => {}}
            />
          </Etat>
          <Etat nom="Sélectionnée">
            <PuceFiltre libelle="Orange" selectionnee surChangement={() => {}} />
          </Etat>
          <Etat nom="Focus">
            <PuceFiltre
              libelle="Orange"
              selectionnee
              surChangement={() => {}}
              classe={ANNEAU}
            />
          </Etat>
          <Etat nom="Éteint">
            <PuceFiltre
              libelle="Orange"
              selectionnee={false}
              eteint
              surChangement={() => {}}
            />
          </Etat>
        </Grille>
        <div className="mt-4 flex flex-wrap gap-2 rounded-card border border-line bg-surface-raised p-4">
          <PuceFiltre
            libelle="MTN"
            selectionnee={filtres.includes("mtn")}
            surChangement={() => basculerFiltre("mtn")}
          />
          <PuceFiltre
            libelle="Orange"
            selectionnee={filtres.includes("orange")}
            surChangement={() => basculerFiltre("orange")}
          />
          <PuceFiltre
            libelle="Dépôts"
            icone={<IconGlobe size={20} />}
            selectionnee={filtres.includes("depots")}
            surChangement={() => basculerFiltre("depots")}
          />
          <PuceFiltre
            libelle="Retraits"
            selectionnee={filtres.includes("retraits")}
            surChangement={() => basculerFiltre("retraits")}
          />
        </div>
        <Note>
          La puce est elle-même sa propre cible : 44 de haut, écart de 8 entre
          deux. La bordure est là dans tous les états — sélectionner ne change
          jamais la taille. Elle ne sert plus à FILTRER une liste : sept puces
          demandaient 637 px pour 358. Voir la planche « Filtres » plus bas.
        </Note>
      </section>

      {/* ── 5 · Groupe de segments ───────────────────────────────────────── */}
      <section>
        <Titre>Groupe de segments — la hauteur est au groupe</Titre>
        <div className="grid gap-6 rounded-card border border-line bg-surface-raised p-6 lg:grid-cols-2">
          <Etat nom="Repos et choix">
            <GroupeSegments
              libelle="Langue"
              options={[
                { valeur: "fr", libelle: "Français" },
                { valeur: "en", libelle: "English" },
              ]}
              valeur={langue}
              surChangement={setLangue}
            />
          </Etat>
          <Etat nom="Focus">
            <GroupeSegments
              libelle="Langue"
              options={[
                { valeur: "fr", libelle: "Français" },
                { valeur: "en", libelle: "English" },
              ]}
              valeur="fr"
              surChangement={() => {}}
              classe={ANNEAU_SEGMENT}
            />
          </Etat>
          <Etat nom="Éteint">
            <GroupeSegments
              libelle="Langue"
              options={[
                { valeur: "fr", libelle: "Français" },
                { valeur: "en", libelle: "English" },
              ]}
              valeur="fr"
              eteint
              surChangement={() => {}}
            />
          </Etat>
          <Etat nom="Trois segments, pleine largeur">
            <GroupeSegments
              libelle="Période"
              options={[
                { valeur: "jour", libelle: "Jour" },
                { valeur: "semaine", libelle: "Semaine" },
                { valeur: "mois", libelle: "Mois", eteint: true },
              ]}
              valeur="semaine"
              pleineLargeur
              surChangement={() => {}}
            />
          </Etat>
        </div>
        <Note>
          Le groupe fait 44 et les segments l&apos;occupent : actif ou inactif,
          la hauteur ne bouge pas. C&apos;est la bordure portée par le seul
          segment inactif qui donnait 38 d&apos;un côté et 40 de l&apos;autre.
        </Note>
      </section>

      {/* ── 6 · Filtres ──────────────────────────────────────────────────── */}
      <section>
        <Titre>Filtres — une rangée de 44, quel que soit le nombre de choix</Titre>
        <Note>
          Les sept puces de l&apos;écran des encaissements réclamaient 637 px
          pour 358 disponibles : deux rangées, et « Retrait » seul sur la sienne
          avec 261 px de vide. Les mêmes sept choix tiennent ici dans deux
          déclencheurs, parce que leur largeur ne dépend plus de leur nombre.
          Chaque cadre ci-dessous fait 384 px, soit 352 utiles — plus étroit que
          les 358 d&apos;un téléphone de 390.
        </Note>

        <div className="mt-4 flex flex-col gap-6">
          <Etat nom="Au repos">
            <Telephone>
              <BarreFiltres libelle="Filtres">
                <DeclencheurFiltre libelle="Opérateur" surOuvrir={() => {}} />
                <DeclencheurFiltre libelle="Catégorie" surOuvrir={() => {}} />
              </BarreFiltres>
            </Telephone>
          </Etat>

          <Etat nom="Un filtre actif">
            <Telephone>
              <BarreFiltres
                libelle="Filtres"
                compte={1}
                libelleCompte={(n) => `${n} filtre actif`}
              >
                <DeclencheurFiltre
                  libelle="Opérateur"
                  valeur="MTN MoMo"
                  surOuvrir={() => {}}
                />
                <DeclencheurFiltre libelle="Catégorie" surOuvrir={() => {}} />
              </BarreFiltres>
            </Telephone>
          </Etat>

          <Etat nom="Trois filtres actifs">
            <Telephone>
              <BarreFiltres
                libelle="Filtres"
                compte={3}
                libelleCompte={(n) => `${n} filtres`}
              >
                <DeclencheurFiltre
                  libelle="Opérateur"
                  valeur="MTN"
                  surOuvrir={() => {}}
                />
                <DeclencheurFiltre
                  libelle="Catégorie"
                  valeur="2 choisis"
                  surOuvrir={() => {}}
                />
                <DeclencheurFiltre
                  libelle="Période"
                  valeur="7 jours"
                  surOuvrir={() => {}}
                />
              </BarreFiltres>
            </Telephone>
          </Etat>

          <Etat nom="Éteint et ouvert">
            <Telephone>
              <BarreFiltres libelle="Filtres">
                <DeclencheurFiltre
                  libelle="Opérateur"
                  ouverte
                  surOuvrir={() => {}}
                />
                <DeclencheurFiltre libelle="Catégorie" eteint surOuvrir={() => {}} />
              </BarreFiltres>
            </Telephone>
          </Etat>

          <Etat nom="La feuille — appuyez sur un déclencheur">
            <Telephone>
              <BarreFiltres
                libelle="Filtres"
                compte={compteVivant}
                libelleCompte={(n) => (n > 1 ? `${n} filtres` : `${n} filtre`)}
              >
                <DeclencheurFiltre
                  libelle="Opérateur"
                  valeur={nomDe(OPERATEURS, operateur)}
                  ouverte={feuille === "operateur"}
                  surOuvrir={() => setFeuille("operateur")}
                />
                <DeclencheurFiltre
                  libelle="Catégorie"
                  valeur={nomDe(CATEGORIES, categories)}
                  ouverte={feuille === "categorie"}
                  surOuvrir={() => setFeuille("categorie")}
                />
              </BarreFiltres>
            </Telephone>
          </Etat>
        </div>

        {feuille === "operateur" && (
          <FeuilleFiltres
            titre="Opérateur"
            description="Un seul à la fois."
            options={OPERATEURS}
            valeurs={operateur}
            surChangement={setOperateur}
            etiquetteFermer="Fermer les filtres d'opérateur"
            libelleEffacer="Effacer"
            libelleValider="Voir les résultats"
            onFermer={() => setFeuille(null)}
          />
        )}
        {feuille === "categorie" && (
          <FeuilleFiltres
            titre="Catégorie"
            description="Plusieurs catégories peuvent se cumuler."
            options={CATEGORIES}
            valeurs={categories}
            surChangement={setCategories}
            multiple
            etiquetteFermer="Fermer les filtres de catégorie"
            libelleEffacer="Effacer"
            libelleValider="Voir les résultats"
            onFermer={() => setFeuille(null)}
          />
        )}

        <Note>
          Mesuré sur 390 px : la barre fait 44 de haut et tient sur UNE rangée
          dans tous les cas. Au repos, les deux déclencheurs occupent 242,8 px
          des 358 disponibles — 68 %, contre 178 % pour les sept puces.
          Le déclencheur dessine 32 px et répond sur 44 (<code>.cible</code>) ;
          la gouttière vaut 12 (<code>gap-gouttiere-cible</code>) — à 8, deux
          cibles de 44 se recouvrent de 4 et la norme retire l&apos;aire
          commune, ramenant les deux à 40.
        </Note>
        <Note>
          L&apos;état actif se lit sans la couleur : le texte devient
          « Opérateur : MTN » et la graisse monte d&apos;un cran. Quand la
          rangée se remplit, c&apos;est le déclencheur ACTIF qui rend des
          pixels — celui au repos n&apos;a que son nom, il le garde entier — et
          la coupure se fait par la fin, sur la valeur. Le compte, lui, tient
          en une pastille de 20 : « 2 filtres actifs » écrit en toutes lettres
          coûtait 70 px pris au nom des filtres ; la phrase reste annoncée.
        </Note>
        <Note>
          La feuille est la <code>Fenetre</code> du système : Échap la ferme, le
          focus y est piégé et revient au déclencheur, l&apos;en-tête et le pied
          ne défilent pas. Chaque option est un vrai bouton radio ou une vraie
          case à cocher, en rangées de 44.
        </Note>
      </section>
    </div>
  );
}
