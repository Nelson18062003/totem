"use client";

import { useState } from "react";
import { IconGlobe } from "@/app/icons";
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

export function GalerieSelecteurs() {
  const [interrupteur, setInterrupteur] = useState(true);
  const [cochee, setCochee] = useState(true);
  const [radio, setRadio] = useState("orange");
  const [filtres, setFiltres] = useState<string[]>(["mtn"]);
  const [langue, setLangue] = useState("fr");

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
          jamais la taille.
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
    </div>
  );
}
