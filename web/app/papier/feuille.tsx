"use client";

// La feuille : dix codes, montrés une fois, et les trois façons de les
// emporter hors de cet écran.
//
// LES TROIS GESTES, ET POURQUOI PAS UN QUATRIÈME
// Imprimer, enregistrer, copier. Beaucoup de commerces n'ont pas
// d'imprimante — offrir « imprimer » tout seul reviendrait à ne rien offrir.
// Il n'y a PAS d'envoi par mail : envoyer le secours dans la boîte qu'il
// secourt n'a aucun sens, puisque le jour où ce papier sert, c'est justement
// cette boîte-là qui est hors de portée.
//
// LA CASE QUI BLOQUE LA SORTIE
// Ce n'est pas une formalité juridique. Après cet écran, ces dix codes
// n'existent plus nulle part en clair, chez personne — ni chez nous, ni chez
// la personne si elle n'a rien fait. Le bouton reste donc éteint tant qu'elle
// n'a pas dit qu'elle les a rangés.

import { useState } from "react";
import Link from "next/link";
import { fabriquerMesCodes } from "./actions";
import { textesPapier } from "@/lib/textes/papier";
import { useLangue } from "@/app/langue";
import { IconCopy, IconDoc, IconDownload, IconLock } from "@/app/icons";

type Textes = (typeof textesPapier)["en"];

type Etat = { serie: number; restants: number; fabriqueLe: string };

// L'impression, pilotée ici plutôt que dans la charte : ces règles ne servent
// qu'à cette feuille, et une feuille de secours doit sortir en noir sur blanc,
// sur UNE page A4, même depuis une imprimante de quartier. Le reste de l'écran
// disparaît par « visibility » et non par « display » : la feuille garde ainsi
// exactement la mise en page qu'on vient de lui voir.
const IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  #feuille-papier, #feuille-papier * { visibility: visible !important; }
  #feuille-papier {
    position: absolute; left: 0; top: 0; width: 100%;
    border: 1px solid #000 !important; border-radius: 0 !important;
    background: #fff !important; color: #000 !important; box-shadow: none !important;
  }
  #feuille-papier .hors-papier { display: none !important; }
  /* Noir sur blanc, sans exception : une imprimante de quartier rend les gris
     en gris sale, et un code qu'on ne relit pas est un code perdu. */
  #feuille-papier * { color: #000 !important; background: #fff !important; }
  #feuille-papier li { break-inside: avoid; border: 1px solid #000 !important; }
  @page { size: A4; margin: 18mm; }
}
`;

/**
 * LES TEXTES NE TRAVERSENT PAS LA FRONTIÈRE, ILS SONT LUS ICI.
 *
 * Ils descendaient de la page serveur par une propriété. L'objet contient des
 * fonctions — « entete(nom) », « serie(n) », « deja(n) » — et React REFUSE de
 * les faire passer du serveur au navigateur : elles ne se sérialisent pas.
 * L'écran entier plantait, en production seulement, avec un bouton
 * « Reload » pour tout contenu.
 *
 * Rien ne le disait : le fichier compilait, et les contrôles passaient tous.
 * Seul un essai dans un vrai navigateur pouvait le voir.
 *
 * Un composant de navigateur lit donc ses textes lui-même, comme partout
 * ailleurs dans le dépôt. « useLangue » suit le choix de la personne sans
 * qu'aucune donnée n'ait à descendre.
 */
export function Feuille({
  nom, aujourdhui, total, etat,
}: {
  nom: string; aujourdhui: string; total: number; etat: Etat | null;
}) {
  const t: Textes = textesPapier[useLangue()];
  const [codes, poser] = useState<string[] | null>(null);
  const [serie, numeroter] = useState<number | null>(null);
  const [geste, etablir] = useState<"repos" | "attente" | "rate">("repos");
  const [range, ranger] = useState(false);
  const [copie, noterCopie] = useState(false);

  async function fabriquer() {
    etablir("attente");
    const r = await fabriquerMesCodes();
    if (!r.ok) { etablir("rate"); return; }
    etablir("repos");
    numeroter(r.serie);
    poser(r.codes);
  }

  if (!codes) {
    return (
      <Avant t={t} total={total} etat={etat} geste={geste} fabriquer={fabriquer} />
    );
  }

  const texte = enTexte(t, nom, aujourdhui, serie ?? 1, codes);

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      noterCopie(true);
    } catch {
      // Un navigateur qui refuse le presse-papiers n'est pas une panne : la
      // feuille est à l'écran, elle s'imprime et elle s'enregistre.
      noterCopie(false);
    }
  }

  function enregistrer() {
    const lien = document.createElement("a");
    const url = URL.createObjectURL(new Blob([texte], { type: "text/plain;charset=utf-8" }));
    lien.href = url;
    lien.download = t.fichier;
    lien.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <style dangerouslySetInnerHTML={{ __html: IMPRESSION }} />

      <section id="feuille-papier"
               className="overflow-hidden rounded-card border border-line bg-surface-raised">
        <div className="border-b border-line px-4 py-3.5">
          <div className="text-small font-semibold">{t.feuilleTitre}</div>
          <div className="mt-0.5 text-caption text-ink-faint">
            {t.entete(nom, aujourdhui)} · {t.serie(serie ?? 1)}
          </div>
        </div>

        <ol className="grid grid-cols-2 gap-2 p-4">
          {codes.map((code, i) => (
            <li key={code}
                className="flex items-baseline gap-2 rounded-sm border border-line
                           bg-surface-2 px-2.5 py-3">
              <span className="w-4 shrink-0 text-caption tabnums text-ink-faint">{i + 1}</span>
              <span className="font-mono text-small font-bold tracking-wider tabnums">
                {code}
              </span>
            </li>
          ))}
        </ol>

        <p className="border-t border-line px-4 py-3 text-caption leading-relaxed text-ink-faint">
          {t.feuilleDit}
        </p>

        <div className="hors-papier flex gap-2 px-4 pb-4">
          <Geste onClick={copier} Icone={IconCopy} libelle={copie ? t.copie : t.copier} />
          <Geste onClick={enregistrer} Icone={IconDownload} libelle={t.telecharger} />
          <Geste onClick={() => window.print()} Icone={IconDoc} libelle={t.imprimer} />
        </div>
      </section>

      <p className="px-1 text-caption leading-relaxed text-ink-faint print:hidden">
        {t.gestesAide}
      </p>

      <ul className="divide-hair overflow-hidden rounded-card border border-line
                     bg-surface-raised print:hidden">
        <Savoir titre={t.ouLeMettreTitre} dit={t.ouLeMettre} />
        <Savoir titre={t.quandCaBaisseTitre} dit={t.quandCaBaisse} />
        <Savoir titre={t.siPerduTitre} dit={t.siPerdu} />
      </ul>

      <label className="flex items-start gap-3 rounded-card bg-sable px-4 py-4 print:hidden">
        <input
          type="checkbox"
          checked={range}
          onChange={(e) => ranger(e.target.checked)}
          className="mt-0.5 size-6 shrink-0 accent-ink"
        />
        <span className="text-small leading-relaxed">
          {t.promesse} — <strong className="font-semibold">{t.promesseFort}</strong>.
        </span>
      </label>

      <Link
        href="/"
        aria-disabled={!range}
        onClick={(e) => { if (!range) e.preventDefault(); }}
        className={`flex h-12 w-full items-center justify-center rounded-btn bg-accent
                    px-4 text-body font-medium text-white transition print:hidden ${
          range ? "hover:bg-accent-hover" : "pointer-events-none opacity-40"
        }`}
      >
        {t.continuer}
      </Link>
    </div>
  );
}

/** Avant la fabrication — ou au retour, des mois plus tard. */
function Avant({
  t, total, etat, geste, fabriquer,
}: {
  t: Textes; total: number; etat: Etat | null;
  geste: "repos" | "attente" | "rate"; fabriquer: () => void;
}) {
  const presqueFini = etat !== null && etat.restants <= 1;
  return (
    <div className="flex flex-col gap-4">
      {etat && (
        <section className="rounded-card border border-line bg-surface-raised px-4 py-4">
          <div className="flex items-start gap-3">
            <IconLock size={20} className="mt-0.5 shrink-0 text-ink-soft" />
            <div>
              <h2 className="text-body font-semibold">{t.dejaTitre}</h2>
              {/* Le compte, jamais les codes. C'est tout ce que cette page
                  sait dire en revenant, et c'est ce dont on a besoin. */}
              <p className="mt-1 text-small leading-relaxed tabnums text-ink-soft">
                {t.deja(etat.restants, total)}
              </p>
              <p className="mt-1 text-caption text-ink-faint">
                {t.dejaFabriqueLe(etat.fabriqueLe)} · {t.serie(etat.serie)}
              </p>
              <p className="mt-2 text-caption leading-relaxed text-ink-faint">
                {t.dejaJamaisRemontre}
              </p>
            </div>
          </div>
          {presqueFini && (
            <p role="status" className="mt-3 rounded-sm bg-surface-2 px-3 py-2.5
                                        text-small leading-relaxed text-alert">
              {t.presqueFini}
            </p>
          )}
        </section>
      )}

      <div>
        <button
          type="button"
          onClick={fabriquer}
          disabled={geste === "attente"}
          className="flex h-12 w-full items-center justify-center rounded-btn bg-accent
                     px-4 text-body font-medium text-white transition
                     hover:bg-accent-hover disabled:opacity-40"
        >
          {geste === "attente" ? t.fabriquerEnCours : etat ? t.refaire : t.fabriquer}
        </button>
        <p className="mt-2 text-center text-caption leading-relaxed text-ink-faint">
          {etat ? t.refaireAide : t.fabriquerAide}
        </p>
        {geste === "rate" && (
          <p role="alert" className="mt-2 text-small leading-relaxed text-negative">
            {t.fabriquerRate}
          </p>
        )}
      </div>
    </div>
  );
}

function Geste({
  onClick, Icone, libelle,
}: {
  onClick: () => void;
  Icone: (p: { size?: number; className?: string }) => React.ReactElement;
  libelle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn
                 border border-line-control text-small font-medium
                 transition hover:border-ink-faint"
    >
      <Icone size={16} className="shrink-0 text-ink-soft" />
      {libelle}
    </button>
  );
}

function Savoir({ titre, dit }: { titre: string; dit: string }) {
  return (
    <li className="px-4 py-3.5">
      <div className="text-small font-semibold">{titre}</div>
      <p className="mt-1 text-caption leading-relaxed text-ink-faint">{dit}</p>
    </li>
  );
}

/**
 * La feuille en texte pur — c'est ce qui part dans le presse-papiers et dans
 * le fichier enregistré. Les mêmes phrases que l'écran : quelqu'un qui recopie
 * depuis un bloc-notes doit lire où ranger le papier, sans quoi le fichier
 * reste dans le téléphone, à côté de ce qu'il devait secourir.
 */
function enTexte(
  t: Textes, nom: string, aujourdhui: string, serie: number, codes: string[],
): string {
  const lignes = codes.map(
    (c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`);
  return [
    t.feuilleTitre,
    `${t.entete(nom, aujourdhui)} · ${t.serie(serie)}`,
    "",
    ...lignes,
    "",
    t.feuilleDit,
    `${t.ouLeMettreTitre} — ${t.ouLeMettre}`,
    "",
  ].join("\n");
}
