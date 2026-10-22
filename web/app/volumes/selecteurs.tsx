"use client";

// LES DEUX CHOIX QUI DEMANDENT LA MAIN : la carte, et les dates.
//
// Dessinés ici, avec les pièces du site, et non avec ceux du navigateur. La
// liste déroulante et le champ de date du navigateur changent d'allure d'un
// téléphone à l'autre (une roue sur iPhone, « 10/22/2026 » à l'américaine
// sur un ordinateur réglé en anglais) : « ce sont les vieux composants, c'est
// horrible », a dit le propriétaire. Une carte s'y lisait par son numéro
// entier, quand l'accueil la nomme « MTN ·6299 » : on la nomme maintenant
// partout comme l'accueil, avec son logo.
//
// Le calendrier fait le geste de celui du téléphone (`mobile/src/calendrier.tsx`) :
// un appui, un jour ; un second, une période ; un troisième recommence.

import { useEffect, useId, useRef, useState } from "react";
import { semainesDuMois, nomDesJours, type Bornes } from "@noyau/periodes";
import { formaterNumero } from "@noyau/numero";
import { raccourcisDeDates } from "@noyau/volumes";
import { textesVolumes } from "@noyau/textes/volumes";
import type { Langue } from "@noyau/langue";
import { LogoOperateur, operateurReconnu } from "../logos-operateurs";
import { IconCalendrier, IconCheck, IconChevron, IconClose, IconPuceSim } from "../icons";

export type CarteAChoisir = { iccid: string; libelle: string; operateur: string; numero: string };

/** Une carte comme l'accueil la nomme : son logo, et « MTN ·6299 ». */
export function NomDeCarte({ carte, taille = 18, numero = false }: {
  carte: CarteAChoisir; taille?: number; numero?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Une boîte de largeur fixe : le logo de MTN est plus large que celui
          d'Orange, et les noms ne s'alignaient plus d'une ligne à l'autre. */}
      {operateurReconnu(carte.operateur)
        ? <span className="flex w-9 shrink-0 justify-center"><LogoOperateur operateur={carte.operateur} size={taille} /></span>
        : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{carte.libelle}</span>
        {numero && carte.numero
          ? <span className="truncate text-caption font-normal text-ink-faint tabnums">{formaterNumero(carte.numero)}</span>
          : null}
      </span>
    </span>
  );
}

/** « Toutes les cartes », et combien : une puce, pas un tas de logos. */
function ToutesLesCartes({ nombre, libelle }: { nombre: number; libelle: string }) {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <IconPuceSim size={18} className="shrink-0 text-ink-soft" />
      {libelle}
      <span className="rounded-full bg-surface-2 px-1.5 text-caption font-semibold text-ink-soft tabnums">{nombre}</span>
    </span>
  );
}

/** Ferme ce qui est ouvert quand on touche ailleurs, ou sur Échap. */
function useFermerAuDehors(ouvert: boolean, fermer: () => void) {
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) fermer();
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") fermer(); };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer]);
  return boite;
}

/**
 * LE CHOIX DE LA CARTE — un bouton qui dit la carte choisie, et sa liste.
 * Au clavier : flèches, Entrée, Échap.
 */
export function MenuDeCarte({ cartes, choisie, langue, onChoisir, nom = "carte" }: {
  cartes: CarteAChoisir[];
  /** « tout », ou l'ICCID. */
  choisie: string;
  langue: Langue;
  onChoisir: (iccid: string) => void;
  /** Le nom du champ caché, quand le menu vit dans un formulaire. */
  nom?: string;
}) {
  const t = textesVolumes[langue];
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const boite = useFermerAuDehors(ouvert, () => setOuvert(false));
  const id = useId();
  const choix: ({ iccid: "tout" } | CarteAChoisir)[] =
    cartes.length > 1 ? [{ iccid: "tout" }, ...cartes] : cartes;
  const laCarte = cartes.find((c) => c.iccid === choisie);

  const choisir = (iccid: string) => { setOuvert(false); if (iccid !== choisie) onChoisir(iccid); };
  const clavier = (e: React.KeyboardEvent) => {
    if (!ouvert && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault(); setOuvert(true);
      setActif(Math.max(0, choix.findIndex((c) => c.iccid === choisie)));
      return;
    }
    if (!ouvert) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(choix.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); choisir(choix[actif].iccid); }
  };

  return (
    <div ref={boite} className="relative" onKeyDown={clavier}>
      <input type="hidden" name={nom} value={choisie} />
      <button type="button" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={id}
              aria-label={`${t.choisirLaCarte} : ${laCarte?.libelle ?? t.toutesLesCartes}`}
              onClick={() => { setOuvert((o) => !o); setActif(Math.max(0, choix.findIndex((c) => c.iccid === choisie))); }}
              className="flex w-full items-center justify-between gap-3 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-small transition hover:border-ink-faint">
        {laCarte ? <NomDeCarte carte={laCarte} /> : <ToutesLesCartes nombre={cartes.length} libelle={t.toutesLesCartes} />}
        <IconChevron size={14} className={`shrink-0 text-ink-faint transition-transform duration-200 ${ouvert ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {ouvert && (
        <ul id={id} role="listbox" aria-label={t.choisirLaCarte}
            className="surgit absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-auto rounded-card border border-line bg-surface-raised p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          {choix.map((c, i) => {
            const choisi = c.iccid === choisie;
            return (
              <li key={c.iccid} role="option" aria-selected={choisi}
                  onPointerEnter={() => setActif(i)}
                  onClick={() => choisir(c.iccid)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-btn px-3 py-2.5 text-small ${
                    i === actif ? "bg-surface-2" : ""}`}>
                {"libelle" in c ? <NomDeCarte carte={c} numero />
                  : <ToutesLesCartes nombre={cartes.length} libelle={t.toutesLesCartes} />}
                {choisi && <IconCheck size={16} className="shrink-0 text-ink" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Un appui sur un jour : le premier, puis le second, puis on recommence. */
type ChoixDeJours = { de: string; a: string | null } | null;
const toucherLeJour = (choix: ChoixDeJours, jour: string): ChoixDeJours => {
  if (!choix || choix.a !== null) return { de: jour, a: null };
  return jour < choix.de ? { de: jour, a: choix.de } : { de: choix.de, a: jour };
};

export { raccourcisDeDates };

/** Le mois, ses flèches et ses jours. */
export function GrilleDeJours({ langue, aujourdhui, choix, onToucher }: {
  langue: Langue; aujourdhui: string; choix: Bornes | null; onToucher: (jour: string) => void;
}) {
  const t = textesVolumes[langue];
  const repere = (choix?.a ?? aujourdhui).slice(0, 7);
  const [mois, setMois] = useState({ a: Number(repere.slice(0, 4)), m: Number(repere.slice(5, 7)) });
  const decaler = (n: number) => setMois(({ a, m }) => {
    const total = a * 12 + (m - 1) + n;
    return { a: Math.floor(total / 12), m: (total % 12) + 1 };
  });
  const dernierMois = `${mois.a}-${String(mois.m).padStart(2, "0")}` >= aujourdhui.slice(0, 7);
  const titre = new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(mois.a, mois.m - 1, 1)));
  const initiales = langue === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"];
  const fleche = "grid h-9 w-9 place-items-center rounded-full transition hover:bg-surface-2 disabled:opacity-25 disabled:hover:bg-transparent";

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center">
        <button type="button" className={fleche} aria-label={t.moisPrecedent} onClick={() => decaler(-1)}>
          <IconChevron size={16} className="rotate-180" />
        </button>
        <p className="flex-1 text-center text-small font-semibold capitalize">{titre}</p>
        <button type="button" className={fleche} aria-label={t.moisSuivant} disabled={dernierMois}
                onClick={() => decaler(1)}>
          <IconChevron size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 pb-1 text-center text-caption text-ink-faint">
        {initiales.map((l, i) => <span key={i}>{l}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {semainesDuMois(mois.a, mois.m).flat().map((jour, i) => {
          if (!jour) return <span key={`v${i}`} />;
          const futur = jour > aujourdhui;
          const bout = choix && (jour === choix.de || jour === choix.a);
          const dedans = choix && jour > choix.de && jour < choix.a;
          const bandeGauche = choix && choix.de !== choix.a && jour === choix.de;
          const bandeDroite = choix && choix.de !== choix.a && jour === choix.a;
          return (
            // La bande de la période court d'un bout à l'autre ; les bouts
            // sont des ronds pleins posés dessus.
            <div key={jour} className={`relative flex h-10 items-center justify-center ${dedans ? "bg-surface-2" : ""}`}
                 style={bandeGauche ? { background: "linear-gradient(to right, transparent 50%, var(--color-surface-2) 50%)" }
                   : bandeDroite ? { background: "linear-gradient(to left, transparent 50%, var(--color-surface-2) 50%)" }
                   : undefined}>
              <button type="button" disabled={futur} onClick={() => onToucher(jour)}
                      aria-pressed={Boolean(bout || dedans)}
                      aria-label={nomDesJours({ de: jour, a: jour }, langue)}
                      className={`relative grid h-10 w-10 place-items-center rounded-full text-small tabnums transition ${
                        bout ? "bg-accent font-semibold text-white"
                          : futur ? "text-ink-faint/50" : "hover:bg-surface-3"} ${
                        jour === aujourdhui && !bout ? "font-semibold underline underline-offset-4" : ""}`}>
                {Number(jour.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * LE PANNEAU DES DATES — les raccourcis d'un appui, puis le calendrier, puis
 * « Voir ces dates ». Il s'ouvre sous la tête de l'écran, sans recouvrir les
 * chiffres qu'on compare.
 */
export function PanneauDeDates({ langue, aujourdhui, depart, onVoir, onFermer }: {
  langue: Langue; aujourdhui: string; depart: Bornes | null;
  onVoir: (b: Bornes) => void; onFermer: () => void;
}) {
  const t = textesVolumes[langue];
  const [choix, setChoix] = useState<ChoixDeJours>(depart ? { de: depart.de, a: depart.a } : null);
  const bornes: Bornes | null = choix ? { de: choix.de, a: choix.a ?? choix.de } : null;
  const raccourcis = raccourcisDeDates(aujourdhui);
  return (
    <section aria-label={t.choisirLesDates}
             className="surgit rounded-card border border-line bg-surface-raised p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex items-start gap-3">
        <IconCalendrier size={18} className="mt-0.5 shrink-0 text-ink-soft" />
        <div className="flex-1">
          <p className="text-small font-semibold">{t.choisirLesDates}</p>
          <p className="text-caption text-ink-faint">{t.aideDates}</p>
        </div>
        <button type="button" aria-label={t.fermer} onClick={onFermer}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition hover:bg-surface-2">
          <IconClose size={16} />
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {raccourcis.map((r) => {
          const pris = bornes && bornes.de === r.bornes.de && bornes.a === r.bornes.a;
          return (
            <button key={r.cle} type="button" onClick={() => setChoix({ de: r.bornes.de, a: r.bornes.a })}
                    className={`rounded-full border px-3 py-1.5 text-caption font-medium transition ${
                      pris ? "border-accent bg-accent text-white" : "border-line text-ink-soft hover:border-ink-faint"}`}>
              {t.raccourcis[r.cle]}
            </button>
          );
        })}
      </div>
      <div className="mx-auto max-w-sm">
        <GrilleDeJours langue={langue} aujourdhui={aujourdhui} choix={bornes}
                       onToucher={(jour) => setChoix((c) => toucherLeJour(c, jour))} />
      </div>
      <button type="button" disabled={!bornes} onClick={() => bornes && onVoir(bornes)}
              className="mt-3 w-full rounded-btn bg-accent py-3 text-small font-semibold text-white transition hover:opacity-90 disabled:bg-surface-3 disabled:text-ink-faint">
        {bornes ? `${t.voirCesDates} · ${nomDesJours(bornes, langue)}` : t.voirCesDates}
      </button>
    </section>
  );
}
