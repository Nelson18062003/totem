"use client";

import { useState } from "react";
import { IconCopy, IconHash, IconLock, IconPhone } from "../icons";
import { Bouton, BoutonIcone } from "../ui/bouton";
import { Champ, Recherche, ZoneTexte } from "../ui/champ";

/**
 * La galerie des champs — famille 5.2 du système.
 *
 * Tout ce que la famille sait faire, posé côte à côte et étiqueté : c'est ici
 * qu'on vérifie à l'œil ce que le vérificateur mesure au fichier. La dernière
 * rangée est la preuve la plus importante : un champ et son bouton, à la même
 * hauteur, d'aplomb.
 */

function Bloc({
  titre,
  note,
  children,
}: {
  titre: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-heading text-ink">{titre}</h3>
        {note && <p className="mt-2 max-w-lecture text-small text-ink-soft">{note}</p>}
      </div>
      <div className="space-y-6 rounded-card border border-line bg-surface-raised p-6">
        {children}
      </div>
    </section>
  );
}

function Etiquette({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-caption text-ink-faint">{children}</p>;
}

export function GalerieChamps() {
  const [recherche, setRecherche] = useState("Awa");
  const [rechercheVide, setRechercheVide] = useState("");
  const [montant, setMontant] = useState("");

  return (
    <div className="space-y-12">
      <header>
        <h2 className="text-title text-ink">Champs et formulaires</h2>
        <p className="mt-2 max-w-lecture text-body text-ink-soft">
          Hauteur posée à 44 px, padding horizontal de 16, fond blanc et contour
          porteur à 3,39:1, libellé au-dessus à 8 px, message en dessous à
          8 px. Aucun champ ne peut être écrit sans libellé : le typage le
          refuse.
        </p>
      </header>

      {/* ── Le champ d'une ligne, dans tous ses états ─────────────────────── */}
      <Bloc
        titre="Champ — les états"
        note="Repos, avec aide, en erreur, éteint. Le focus n'est pas une image :
        posez le curseur dans un champ ou appuyez sur Tab — l'anneau indigo est
        global, le contour passe à l'indigo."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Etiquette>Repos</Etiquette>
            <Champ libelle="Nom du client" placeholder="Awa Ndiaye" />
          </div>

          <div>
            <Etiquette>Focus — appuyer sur Tab pour le voir</Etiquette>
            <Champ libelle="Référence" placeholder="TOT-0042" />
          </div>

          <div>
            <Etiquette>Avec aide</Etiquette>
            <Champ
              libelle="Numéro de téléphone"
              placeholder="6 12 34 56 78"
              aide="Le numéro qui a envoyé le SMS."
            />
          </div>

          <div>
            <Etiquette>En erreur — annoncée, pas seulement rouge</Etiquette>
            <Champ
              libelle="Montant encaissé"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              inputMode="numeric"
              erreur="Ce montant ne correspond à aucun SMS reçu."
            />
          </div>

          <div>
            <Etiquette>Éteint — changé de couleur, jamais effacé</Etiquette>
            <Champ
              libelle="Compte de dépôt"
              defaultValue="MTN — 6 78 90 12 34"
              disabled
              aide="Ce compte est fixé par le propriétaire."
            />
          </div>

          <div>
            <Etiquette>Libellé masqué — toujours lu à voix haute</Etiquette>
            <Champ
              libelle="Code de la boutique"
              libelleMasque
              placeholder="Code de la boutique"
            />
          </div>
        </div>
      </Bloc>

      {/* ── Icône et action ──────────────────────────────────────────────── */}
      <Bloc
        titre="Champ — icône devant, action derrière"
        note="L'icône est décorative : elle n'annonce rien, c'est le libellé qui
        nomme. Le contrôle posé derrière fait 44×44, comme tout ce sur quoi on
        appuie."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Etiquette>Icône devant</Etiquette>
            <Champ
              libelle="Téléphone du terminal"
              iconeAvant={<IconPhone />}
              placeholder="6 12 34 56 78"
            />
          </div>

          <div>
            <Etiquette>Icône devant, en erreur</Etiquette>
            <Champ
              libelle="Téléphone du client"
              iconeAvant={<IconPhone />}
              defaultValue="6 12"
              erreur="Un numéro camerounais compte neuf chiffres."
            />
          </div>

          <div>
            <Etiquette>Icône devant, champ verrouillé</Etiquette>
            <Champ
              libelle="Code secret"
              type="password"
              defaultValue="0000"
              iconeAvant={<IconLock />}
              aide="Le code n'est jamais enregistré ni journalisé."
            />
          </div>

          <div>
            <Etiquette>Action derrière — 44×44</Etiquette>
            <Champ
              libelle="Référence de l'opération"
              defaultValue="TOT-84512336"
              readOnly
              iconeAvant={<IconHash />}
              actionApres={
                <BoutonIcone
                  aria-label="Copier la référence"
                  icone={<IconCopy size={20} />}
                />
              }
            />
          </div>
        </div>
      </Bloc>

      {/* ── La zone de texte ─────────────────────────────────────────────── */}
      <Bloc
        titre="Zone de texte"
        note="Trois rangées visibles sur le jeton « zone de texte » (96 = 12 +
        3 × 24 + 12). Le texte se remplit par le haut, jamais au centre : les
        12 px du haut et du bas sont prévus dans la hauteur, ils placent le
        texte sans la fabriquer."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Etiquette>Repos, avec aide</Etiquette>
            <ZoneTexte
              libelle="Note sur l'encaissement"
              placeholder="Ce que le client a dit…"
              aide="Visible seulement par vous."
            />
          </div>

          <div>
            <Etiquette>En erreur</Etiquette>
            <ZoneTexte
              libelle="Message du SMS"
              defaultValue="Vous avez recu"
              erreur="Ce message est incomplet : le montant manque."
            />
          </div>

          <div>
            <Etiquette>Éteint</Etiquette>
            <ZoneTexte
              libelle="SMS d'origine"
              defaultValue={
                "Vous avez recu 25 000 FCFA de 6 12 34 56 78.\nSolde : 312 500 FCFA.\nRef : 84512336."
              }
              disabled
            />
          </div>
        </div>
      </Bloc>

      {/* ── La recherche ─────────────────────────────────────────────────── */}
      <Bloc
        titre="Recherche"
        note="Loupe devant, effacement derrière. Le bouton d'effacement fait
        44×44 — celui de l'écran des SMS faisait 15×15, la plus petite cible du
        dépôt."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Etiquette>Remplie — l'effacement apparaît</Etiquette>
            <Recherche
              libelle="Rechercher un encaissement"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onEffacer={() => setRecherche("")}
              placeholder="Nom, numéro, montant…"
            />
          </div>

          <div>
            <Etiquette>Vide — rien à effacer, rien à afficher</Etiquette>
            <Recherche
              libelle="Rechercher un SMS"
              value={rechercheVide}
              onChange={(e) => setRechercheVide(e.target.value)}
              onEffacer={() => setRechercheVide("")}
              placeholder="Nom, numéro, montant…"
            />
          </div>

          <div>
            <Etiquette>Libellé masqué — dans une barre</Etiquette>
            <Recherche
              libelle="Rechercher un client"
              libelleMasque
              defaultValue="Ibrahim"
              onEffacer={() => undefined}
              placeholder="Rechercher un client"
            />
          </div>

          <div>
            <Etiquette>Éteinte</Etiquette>
            <Recherche
              libelle="Rechercher dans les archives"
              defaultValue="Décembre"
              onEffacer={() => undefined}
              disabled
              aide="Les archives sont en cours de reconstruction."
            />
          </div>
        </div>
      </Bloc>

      {/* ── La preuve : même hauteur ─────────────────────────────────────── */}
      <Bloc
        titre="Champ + bouton sur la même rangée"
        note="La règle R3 en une image : la hauteur est déclarée des deux côtés,
        donc les deux boîtes font 44 px et tombent d'aplomb. Dans l'app, un
        champ de 32 px était collé à un bouton de 30 px — désalignés parce que
        l'un portait une bordure et l'autre non. Le bouton est ici un
        `secondaire` : le `primaire` fait 48 et n'a rien à faire au bout d'une
        rangée de 44."
      >
        <div className="flex items-end gap-2">
          <Champ
            libelle="Code de retrait"
            placeholder="8 chiffres"
            inputMode="numeric"
            className="flex-1"
          />
          <Bouton variante="secondaire">Valider</Bouton>
        </div>

        <div className="flex items-end gap-2">
          <Recherche
            libelle="Rechercher un client"
            libelleMasque
            value={rechercheVide}
            onChange={(e) => setRechercheVide(e.target.value)}
            onEffacer={() => setRechercheVide("")}
            placeholder="Nom du client"
            className="flex-1"
          />
          <Bouton variante="secondaire">Filtrer</Bouton>
        </div>

        <p className="max-w-lecture text-small text-ink-soft">
          Les deux rangées sont alignées par le bas (le libellé et le message
          vivent au-dessus et en dessous de la boîte, pas dedans).
        </p>
      </Bloc>
    </div>
  );
}
