"use client";

/**
 * LA GALERIE DE LA NAVIGATION — la preuve, pas la démonstration.
 *
 * On y met les pièces côte à côte dans les états où elles se contredisaient :
 * le rail déplié contre le rail replié (les rangées doivent s'aligner, c'est
 * tout l'enjeu des 4 px perdus), l'onglet actif contre l'onglet inactif (la
 * pilule et le bouton doivent avoir la même hauteur), et les deux formes du
 * badge, qui n'est plus qu'un seul composant.
 *
 * Cette page ne s'assemble pas toute seule : `app/styleguide/page.tsx` est
 * écrit ailleurs, ici on n'exporte que la galerie.
 */

import { useState } from "react";
import { IconCard, IconChart, IconGrid, IconHome, IconInbox, IconSettings } from "@/app/icons";
import { Badge, BoutonRail, ElementMenu, PiluleOnglet } from "@/app/ui/navigation";

const menu = [
  { href: "/", libelle: "Accueil", icone: IconHome },
  { href: "/cartes", libelle: "Comptes", icone: IconCard },
  { href: "/encaissements", libelle: "SMS reçus", icone: IconInbox },
  { href: "/analyse", libelle: "Analyse", icone: IconChart },
  { href: "/actions", libelle: "Opérations", icone: IconGrid },
];

const nonLus = { nombre: 3, libelle: "3 messages non lus" };

function Bloc({ titre, note, children }: { titre: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <h3 className="text-heading">{titre}</h3>
      <p className="mt-2 max-w-lecture text-small text-ink-soft">{note}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Etiquette({ texte }: { texte: string }) {
  return <p className="mb-2 text-caption text-ink-faint">{texte}</p>;
}

export function GalerieNavigation() {
  const [replie, setReplie] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h2 className="text-title">Navigation</h2>
        <p className="mt-2 max-w-lecture text-body text-ink-soft">
          Quatre pièces : l’élément de menu du rail, l’onglet de la barre
          flottante, le bouton de repli, le badge de non-lus. Toutes posent
          leur hauteur : 44 px, dans tous les états.
        </p>
      </header>

      <Bloc
        titre="Éléments de menu — déplié et replié"
        note="Les deux colonnes portent la même liste. Les rangées s’alignent une à une : l’élément fait 44 px déplié comme replié. Replié, le libellé n’est plus écrit — il reste dans aria-label et dans title — et le compteur devient un point."
      >
        <div className="flex items-start gap-8">
          <div className="flex-1">
            <Etiquette texte="Déplié — rail 240 px" />
            <div className="flex flex-col gap-1">
              {menu.map((lien) => (
                <ElementMenu
                  key={lien.href}
                  {...lien}
                  actif={lien.href === "/cartes"}
                  badge={lien.href === "/encaissements" ? nonLus : undefined}
                />
              ))}
            </div>
          </div>
          <div className="w-rail">
            <Etiquette texte="Replié — largeur w-rail" />
            <div className="flex flex-col gap-1">
              {menu.map((lien) => (
                <ElementMenu
                  key={lien.href}
                  {...lien}
                  replie
                  actif={lien.href === "/cartes"}
                  badge={lien.href === "/encaissements" ? nonLus : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </Bloc>

      <Bloc
        titre="Onglets — barre flottante mobile"
        note="La pilule active et les boutons inactifs font 44 px tous les six : la rangée ne monte plus et ne descend plus selon la page où l’on se trouve. L’ombre appartient à la barre, qui n’est pas une de ces pièces."
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* La maquette de la barre : elle porte `shadow-barre`, l'unique
              ombre du système, parce qu'elle établit un plan devant la page
              qui défile dessous. Les onglets, eux, n'en portent aucune. */}
          <div className="flex items-center gap-1 rounded-full bg-surface-raised p-1 shadow-barre">
            {menu.map((onglet) => (
              <PiluleOnglet
                key={onglet.href}
                {...onglet}
                actif={onglet.href === "/"}
                badge={onglet.href === "/encaissements" ? nonLus : undefined}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <PiluleOnglet href="/reglages" libelle="Réglages" icone={IconSettings} actif />
            <PiluleOnglet href="/reglages" libelle="Réglages" icone={IconSettings} />
          </div>
        </div>
        <p className="mt-4 text-caption text-ink-faint">
          Actif : icône + libellé, h-controle et px-4. Inactif : icône seule,
          size-controle (44 × 44).
        </p>
      </Bloc>

      <Bloc
        titre="Badge — un composant, deux formes"
        note="Le compteur quand il y a la place, le point quand il n’y en a plus. Zéro non-lu ne rend rien. Le dessin est muet : c’est le libellé qui est annoncé, jamais le chiffre seul."
      >
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <Etiquette texte="Compteur — h-badge (20)" />
            <div className="flex items-center gap-3">
              <Badge nombre={1} libelle="1 message non lu" />
              <Badge nombre={12} libelle="12 messages non lus" />
              <Badge nombre={150} libelle="150 messages non lus" />
            </div>
          </div>
          <div>
            <Etiquette texte="Point — 8 px" />
            <div className="flex items-center gap-3">
              <Badge nombre={3} forme="point" libelle="3 messages non lus" />
            </div>
          </div>
          <div>
            <Etiquette texte="Zéro — rien" />
            <div className="flex h-badge items-center text-caption text-ink-faint">
              <Badge nombre={0} />
              (aucun rendu)
            </div>
          </div>
        </div>
      </Bloc>

      <Bloc
        titre="Bouton de repli"
        note="Appuyez : le rail change d’état, le bouton garde ses 44 px. Il en faisait 34 déplié et 32 replié, parce que sa hauteur venait de son texte."
      >
        <div className="flex items-start gap-8">
          <div className="flex-1">
            <Etiquette texte={replie ? "Replié" : "Déplié"} />
            <BoutonRail replie={replie} surBascule={() => setReplie(!replie)} />
          </div>
          <div className="flex-1">
            <Etiquette texte="Les deux états, côte à côte" />
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <BoutonRail replie={false} surBascule={() => setReplie(true)} />
              </div>
              <div className="w-controle">
                <BoutonRail replie surBascule={() => setReplie(false)} />
              </div>
            </div>
          </div>
        </div>
      </Bloc>
    </div>
  );
}
