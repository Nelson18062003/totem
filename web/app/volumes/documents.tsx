"use client";

import { useState } from "react";
import { textesAnalyse } from "@noyau/textes/analyse";
import { textesReleve } from "@noyau/textes/releve";
import { textesVolumes } from "@noyau/textes/volumes";
import { bornesDuChoix } from "@noyau/releve";
import { nomDesJours, type Bornes } from "@noyau/periodes";
import type { Langue } from "@noyau/langue";
import { IconCalendrier, IconChevron, IconDoc, IconDownload } from "../icons";
import { GrilleDeJours, MenuDeCarte, raccourcisDeDates, type CarteAChoisir } from "./selecteurs";

// LES DOCUMENTS QUI SORTENT DE TOTEM — le relevé de compte (une carte ou
// toutes, deux dates, PDF ou CSV) et le bilan pour le comptable. Ils
// vivaient sur la page Analyse ; ils suivent les Volumes, qui la remplacent.
//
// Le relevé se choisit avec les MÊMES pièces que l'écran au-dessus — le menu
// des cartes, le calendrier —, et non avec la liste et les champs de date du
// navigateur, « les vieux composants ».

export function Documents({ langue, sims, aujourdhui }: { langue: Langue; sims: CarteAChoisir[]; aujourdhui: string }) {
  const t = textesAnalyse[langue];
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ReleveDeCompte langue={langue} sims={sims} aujourdhui={aujourdhui} />
      <section>
        {/* Le bilan en CSV, prêt pour Excel ou la comptabilité — les mêmes
            colonnes que l'export Telegram du robot. La semaine pour le
            quotidien, 30 et 90 jours pour le mois ou le trimestre. */}
        <h2 className="mb-3 flex items-center gap-2 text-heading font-semibold">
          <IconDoc size={16} /> {t.exporterBilan}
        </h2>
        <div className="flex gap-2">
          {[
            { jours: 7, libelle: t.exportSemaine },
            { jours: 30, libelle: t.exportJours(30) },
            { jours: 90, libelle: t.exportJours(90) },
          ].map(({ jours, libelle }) => (
            <a
              key={jours}
              href={`/api/bilan?jours=${jours}`}
              download
              className="flex flex-1 items-center justify-center rounded-btn border border-line bg-surface-raised px-3 py-3 text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink"
            >
              {libelle}
            </a>
          ))}
        </div>
        <p className="mt-2 text-caption text-ink-faint">{t.exportNote}</p>
      </section>
    </div>
  );
}

/**
 * LE RELEVÉ DE COMPTE — une carte (ou toutes), deux dates choisies librement,
 * PDF ou CSV. Le lien va chercher `/api/releve` : le navigateur porte le
 * cookie, et sait télécharger un fichier.
 */
function ReleveDeCompte({ langue, sims, aujourdhui }: { langue: Langue; sims: CarteAChoisir[]; aujourdhui: string }) {
  const r = textesReleve[langue];
  const tv = textesVolumes[langue];
  const [carte, setCarte] = useState(sims.length === 1 ? sims[0].iccid : "tout");
  const [periode, setPeriode] = useState<Bornes>(() => bornesDuChoix("mois", aujourdhui));
  const [premier, setPremier] = useState<string | null>(null);
  const [calendrier, setCalendrier] = useState(false);
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  if (sims.length === 0) return null;
  const toucher = (jour: string) => {
    if (!premier) { setPremier(jour); setPeriode({ de: jour, a: jour }); return; }
    setPeriode(jour < premier ? { de: jour, a: premier } : { de: premier, a: jour });
    setPremier(null);
  };
  const lien = `/api/releve?carte=${encodeURIComponent(carte)}&de=${periode.de}&a=${periode.a}&format=${format}`;
  return (
    <section aria-labelledby="releve-titre">
      <h2 id="releve-titre" className="mb-1 flex items-center gap-2 text-heading font-semibold">
        <IconDoc size={16} /> {r.titre}
      </h2>
      <p className="mb-3 text-small text-ink-soft">{r.explication}</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-small text-ink-soft">
          {r.carte}
          <MenuDeCarte langue={langue} cartes={sims} choisie={carte} onChoisir={setCarte} />
        </div>
        <div className="flex flex-col gap-1 text-small text-ink-soft">
          {tv.periodes.dates}
          <button type="button" aria-expanded={calendrier} onClick={() => setCalendrier((o) => !o)}
                  className="flex w-full items-center justify-between gap-3 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-small text-ink transition hover:border-ink-faint">
            <span className="flex items-center gap-2 font-semibold">
              <IconCalendrier size={16} className="text-ink-soft" /> {nomDesJours(periode, langue)}
            </span>
            <IconChevron size={14} className={`text-ink-faint transition-transform duration-200 ${calendrier ? "-rotate-90" : "rotate-90"}`} />
          </button>
          {calendrier && (
            <div className="surgit mt-1 rounded-card border border-line bg-surface-raised p-3">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {raccourcisDeDates(aujourdhui).map((x) => (
                  <button key={x.cle} type="button" onClick={() => { setPeriode(x.bornes); setPremier(null); }}
                          className={`rounded-full border px-3 py-1.5 text-caption font-medium transition ${
                            periode.de === x.bornes.de && periode.a === x.bornes.a
                              ? "border-accent bg-accent text-white" : "border-line text-ink-soft hover:border-ink-faint"}`}>
                    {tv.raccourcis[x.cle]}
                  </button>
                ))}
              </div>
              <GrilleDeJours langue={langue} aujourdhui={aujourdhui} choix={periode} onToucher={toucher} />
            </div>
          )}
        </div>
        <div role="radiogroup" aria-label={r.format} className="flex gap-1 self-start rounded-full bg-surface-2 p-1 text-small">
          {(["pdf", "csv"] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}
                    className={`rounded-full px-4 py-1.5 font-medium transition ${format === f ? "bg-accent text-white" : "text-ink-soft"}`}>
              {f === "pdf" ? r.pdf : r.csv}
            </button>
          ))}
        </div>
        <a href={lien} download
           className="flex items-center justify-center gap-2 rounded-btn bg-ink py-3 text-small font-medium text-white transition hover:opacity-90">
          <IconDownload size={16} /> {r.telecharger}
        </a>
      </div>
    </section>
  );
}
