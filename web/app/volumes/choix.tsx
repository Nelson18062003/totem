"use client";

// Les deux choix qui demandent la main : la carte (une liste) et les dates
// (deux jours). Le reste de l'écran est rendu par le serveur — les liens
// suffisent pour les périodes et les flèches.

import { useRouter } from "next/navigation";

type Carte = { iccid: string; nom: string };

export function ChoixDeCarte({ cartes, choisie, toutes, base }: {
  cartes: Carte[]; choisie: string; toutes: string; base: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={toutes}
      value={choisie}
      onChange={(e) => router.push(`${base}&carte=${encodeURIComponent(e.target.value)}`)}
      className="w-full rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-small font-medium"
    >
      {cartes.length > 1 && <option value="tout">{toutes}</option>}
      {cartes.map((c) => <option key={c.iccid} value={c.iccid}>{c.nom}</option>)}
    </select>
  );
}

export function ChoixDeDates({ de, a, max, carte, mots }: {
  de: string; a: string; max: string; carte: string;
  mots: { du: string; au: string; voir: string };
}) {
  const champ = "w-full rounded-btn border border-line bg-surface-raised px-3 py-2 text-small";
  return (
    <form action="/volumes" method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="periode" value="dates" />
      <input type="hidden" name="carte" value={carte} />
      <label className="flex min-w-[8.5rem] flex-1 flex-col gap-1 text-caption text-ink-soft">
        {mots.du}
        <input type="date" name="de" required defaultValue={de} max={max} className={champ} />
      </label>
      <label className="flex min-w-[8.5rem] flex-1 flex-col gap-1 text-caption text-ink-soft">
        {mots.au}
        <input type="date" name="a" required defaultValue={a} max={max} className={champ} />
      </label>
      <button type="submit"
              className="rounded-btn bg-ink px-4 py-2 text-small font-medium text-white transition hover:opacity-90">
        {mots.voir}
      </button>
    </form>
  );
}
