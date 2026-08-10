"use client";

import { useLangue } from "@/app/langue";

// La question du comptoir, et ce qu'elle retire.
//
// Deux réponses, aucune cochée d'avance. Ce n'est pas de la neutralité de
// façade : tant que la personne n'a pas répondu, aucune clé n'est proposée.
// Une réponse pré-cochée, quelle qu'elle soit, met une phrase dans la bouche
// de quelqu'un qui n'a rien dit — et si c'est « à moi », elle propose une clé
// sur un combiné de comptoir.
//
// « À la boutique » ne DÉCONSEILLE pas la clé : elle la fait disparaître. Un
// avertissement à côté d'un bouton qu'on peut quand même appuyer est un
// avertissement qu'on appuie quand même.

import { useState } from "react";
import Link from "next/link";
import { PoserUneCle } from "@/app/cle-boutons";
import { textesFacon } from "@/lib/textes/facon";
import { textesCles } from "@/lib/textes/cles";
import { IconPhone } from "@/app/icons";

type Textes = (typeof textesFacon)["en"];
type TextesCles = (typeof textesCles)["en"];

type Reponse = "moi" | "boutique";

/**
 * Les textes sont LUS ICI, jamais reçus de la page serveur.
 *
 * L'écran du papier l'a appris de la pire façon : il recevait les siens par
 * une propriété, ils contenaient des fonctions, et React refuse de faire
 * passer une fonction du serveur au navigateur. La page ne s'affichait pas du
 * tout — en production seulement, et sans qu'aucun contrôle ne le dise.
 *
 * Ici les textes n'avaient pas encore de fonction. Il aurait suffi d'en
 * ajouter une, un jour, pour casser cet écran de la même façon et pour la
 * même raison invisible.
 */
export function ChoixDuTelephone() {
  const langue = useLangue();
  const t: Textes = textesFacon[langue];
  const tCles: TextesCles = textesCles[langue];
  const [aQui, repondre] = useState<Reponse | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {t.questionTitre}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Reponse
            choisi={aQui === "moi"}
            titre={t.aMoi}
            dit={t.aMoiDit}
            onClick={() => repondre("moi")}
          />
          <Reponse
            choisi={aQui === "boutique"}
            titre={t.boutique}
            dit={t.boutiqueDit}
            onClick={() => repondre("boutique")}
          />
        </div>
      </div>

      {aQui === "moi" && (
        <div className="rounded-card border border-line bg-surface-raised px-4 py-4">
          <div className="flex items-start gap-3">
            <IconPhone size={20} className="mt-0.5 shrink-0 text-ink-soft" />
            <div>
              <h3 className="text-body font-semibold">{t.telephoneTitre}</h3>
              <p className="mt-1 text-small leading-relaxed text-ink-soft">
                {t.telephoneDit}
              </p>
            </div>
          </div>
          {/* Le bouton du dépôt, pas un deuxième : il sait déjà se taire quand
              le navigateur ne peut rien faire, et ne pas crier quand la
              personne referme la fenêtre de son téléphone. */}
          <div className="mt-4">
            <PoserUneCle t={tCles} />
          </div>
        </div>
      )}

      {aQui === "boutique" && <SurLeComptoir />}

      {/* « Pas maintenant » est un chemin, pas un renoncement : il est visible
          avant même qu'on ait répondu, il mène quelque part, et il ne
          reproche rien. Quelqu'un qui entre par mail toute sa vie n'a rien
          fait de mal. */}
      {aQui !== "boutique" && (
        <div>
          <Link
            href="/papier"
            className="flex min-h-14 items-center justify-center rounded-btn
                       border border-line-control px-4 text-body font-medium
                       text-ink-soft transition hover:border-ink-faint hover:text-ink"
          >
            {t.plusTard}
          </Link>
          <p className="mt-2 px-1 text-caption leading-relaxed text-ink-faint">
            {t.plusTardDit}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Ce qu'on dit sur un combiné de comptoir.
 *
 * Rendu à deux endroits : quand la personne vient de répondre « à la
 * boutique », et quand la session elle-même est déjà déclarée partagée. Le
 * texte est le même dans les deux cas, et il le doit — il n'y a pas une bonne
 * et une mauvaise façon d'apprendre la même chose.
 */
export function SurLeComptoir() {
  const t: Textes = textesFacon[useLangue()];
  return (
    <section className="rounded-card border border-line bg-surface-2 px-4 py-4">
      <h3 className="text-body font-semibold">{t.comptoirTitre}</h3>
      <p className="mt-1 text-small leading-relaxed text-ink-soft">{t.comptoirDit}</p>
      <p className="mt-2 text-caption leading-relaxed text-ink-faint">
        {t.comptoirSession}
      </p>
    </section>
  );
}

function Reponse({
  choisi, titre, dit, onClick,
}: {
  choisi: boolean; titre: string; dit: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisi}
      className={`flex min-h-14 flex-col justify-center rounded-card px-3.5 py-3
                  text-left transition ${
        choisi
          ? "border-2 border-ink bg-surface-raised"
          : "border border-line-control bg-surface-raised hover:border-ink-faint"
      }`}
    >
      <span className="text-body font-semibold">{titre}</span>
      <span className="mt-0.5 text-caption leading-snug text-ink-faint">{dit}</span>
    </button>
  );
}
