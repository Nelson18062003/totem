import { textesAnalyse } from "@noyau/textes/analyse";
import { textesReleve } from "@noyau/textes/releve";
import { formaterNumero } from "@noyau/numero";
import { bornesDuChoix } from "@noyau/releve";
import { jourLocal, type Sim } from "@noyau/types";

type CarteDuReleve = Pick<Sim, "iccid" | "numero" | "libelle" | "operateur">;
import type { Langue } from "@noyau/langue";
import { FUSEAU } from "@/lib/fuseau";
import { IconDoc } from "../icons";

// LES DOCUMENTS QUI SORTENT DE TOTEM — le relevé de compte (une carte ou
// toutes, deux dates, PDF ou CSV) et le bilan pour le comptable. Ils
// vivaient sur la page Analyse ; ils suivent les Volumes, qui la remplacent.

export function Documents({ langue, sims }: { langue: Langue; sims: CarteDuReleve[] }) {
  const t = textesAnalyse[langue];
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ReleveDeCompte langue={langue} sims={sims} />
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
 * PDF ou CSV. Un simple formulaire qui va chercher `/api/releve` : le
 * navigateur porte le cookie, et sait télécharger un fichier. Chaque carte
 * se désigne par son NUMÉRO, quel que soit le réseau ; le libellé seulement
 * quand le numéro n'est pas inscrit.
 */
function ReleveDeCompte({ langue, sims }: { langue: Langue; sims: CarteDuReleve[] }) {
  const r = textesReleve[langue];
  if (sims.length === 0) return null;
  const aujourdhui = jourLocal(new Date(), FUSEAU);
  const depart = bornesDuChoix("mois", aujourdhui);
  const champ = "w-full rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-small";
  return (
    <section aria-labelledby="releve-titre">
      <h2 id="releve-titre" className="mb-1 flex items-center gap-2 text-heading font-semibold">
        <IconDoc size={16} /> {r.titre}
      </h2>
      <p className="mb-3 text-small text-ink-soft">{r.explication}</p>
      <form action="/api/releve" method="get" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-small text-ink-soft">
          {r.carte}
          <select name="carte" defaultValue={sims.length === 1 ? sims[0].iccid : "tout"}
                  className={champ}>
            {sims.length > 1 && <option value="tout">{r.toutesLesCartes}</option>}
            {sims.map((s) => (
              <option key={s.iccid} value={s.iccid}>
                {formaterNumero(s.numero) || `${s.libelle} (${r.numeroNonRenseigne})`}
                {" · "}{s.operateur}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-small text-ink-soft">
            {r.du}
            <input type="date" name="de" required defaultValue={depart.de} max={aujourdhui}
                   className={champ} />
          </label>
          <label className="flex flex-col gap-1 text-small text-ink-soft">
            {r.au}
            <input type="date" name="a" required defaultValue={depart.a} max={aujourdhui}
                   className={champ} />
          </label>
        </div>
        <fieldset className="flex gap-4 text-small">
          <legend className="mb-1 text-ink-soft">{r.format}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="format" value="pdf" defaultChecked /> {r.pdf}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="format" value="csv" /> {r.csv}
          </label>
        </fieldset>
        <button type="submit"
                className="flex items-center justify-center gap-2 rounded-btn bg-ink py-3 text-small font-medium text-white transition hover:opacity-90">
          {r.telecharger}
        </button>
      </form>
    </section>
  );
}
