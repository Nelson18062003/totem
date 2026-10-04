import { donneesMontrees } from "@/lib/ce-qu-on-montre";
import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { textesAnalyse } from "@noyau/textes/analyse";
import { resumeSemaine } from "@noyau/analyse";
import { fcfa, jourLocal, nombre, type Sim } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { textesReleve } from "@noyau/textes/releve";
import { formaterNumero } from "@noyau/numero";
import { bornesDuChoix } from "@noyau/releve";
import { FUSEAU } from "@/lib/fuseau";
import { IconDoc } from "../icons";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

// Le calcul lui-même vit dans `noyau/analyse.ts` — le même que celui du
// téléphone, au caractère près. Il l'était déjà « à la virgule près » quand
// il était écrit deux fois : c'est ainsi que les deux copies se sont
// trompées ensemble sur la comparaison des semaines. Cette page ne fait plus
// que MONTRER ; les chiffres, elle les demande.
//
// Les jours se découpent dans le fuseau DU TERMINAL, exactement comme la
// liste des SMS (lib/serveur.ts). Sans cela, un encaissement de minuit au
// terminal tombait, ici, dans le jour de la veille (fuseau du serveur de
// rendu) — et la liste et le graphe montraient deux jours différents.

export default async function Analyse() {
  const langue = await langueServeur();
  const t = textesAnalyse[langue];
  const { paiements, sims } = await donneesMontrees(langue);

  if (paiements.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
        </header>
        <Vide titre={t.rienTitre} detail={t.rienDetail} />
        {/* Une semaine calme n'empêche pas de relever un trimestre passé. */}
        <ReleveDeCompte langue={langue} sims={sims} />
      </div>
    );
  }

  const { jours: septJours, total, moyenne, meilleur, max, evolution,
          clients: topClients } = resumeSemaine(paiements, langue, FUSEAU);

  return (
    // Grand écran : les chiffres et le graphique à gauche, les clients à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Chiffre principal */}
      <section className="lg:col-start-1">
        <p className="text-small text-ink-soft">{t.encaissementsSemaine}</p>
        <p className="mt-1 text-hero font-semibold tabnums tracking-tight">{fcfa(total, langue)}</p>
        {evolution != null && (
          <p className="mt-1.5 text-small text-ink-soft">
            <span className={`font-medium ${evolution >= 0 ? "text-positive" : "text-negative"}`}>
              {evolution >= 0 ? "+" : ""}{evolution} %
            </span>{" "}
            {t.parRapportSemainePrecedente}
          </p>
        )}
      </section>

      {/* Repères */}
      <section className="grid grid-cols-2 divide-x divide-line rounded-card border border-line bg-surface-raised lg:col-start-1">
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">{t.moyenneParJour}</p>
          <p className="mt-1 text-heading font-semibold tabnums">{fcfa(moyenne, langue)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">{t.meilleurJour}</p>
          <p className="mt-1 text-heading font-semibold tabnums">
            {meilleur.jour} · {nombre(meilleur.montant, langue)}
          </p>
        </div>
      </section>

      {/* Graphique — monochrome, montants complets */}
      <section className="lg:col-start-1">
        <h2 className="mb-4 text-heading font-semibold">{t.encaissementsParJour}</h2>
        <div className="flex items-end justify-between gap-1.5 sm:gap-2.5" style={{ height: 160 }}>
          {septJours.map((d, i) => {
            const h = Math.round((d.montant / max) * 118) + 6;
            const best = d.montant === meilleur.montant && d.montant > 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className={`max-w-full truncate text-[0.625rem] tabnums sm:text-caption ${best ? "font-medium text-ink" : "text-ink-faint"}`}>
                  {d.montant > 0 ? nombre(d.montant, langue) : ""}
                </span>
                <div className={`w-full rounded-sm ${best ? "bg-ink" : "bg-surface-3"}`} style={{ height: h }} />
                <span className="text-caption text-ink-faint">{d.jour}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-ink-faint">{t.montantsEnFcfa}</p>
      </section>

      {/* Clients */}
      {topClients.length > 0 && (
        <section className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
          <h2 className="mb-1 text-heading font-semibold">{t.principauxClients}</h2>
          <ul className="divide-hair">
            {topClients.map((c, i) => (
              <li key={c.nom}>
                {/* Chaque client mène à ses paiements : la recherche des
                    encaissements s'ouvre déjà remplie de son nom. */}
                <Link
                  href={`/encaissements?recherche=${encodeURIComponent(c.nom)}`}
                  className="flex items-center gap-3.5 py-3.5 transition hover:opacity-70"
                >
                  <span className="w-4 text-small tabnums text-ink-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{c.nom}</p>
                    <p className="text-small text-ink-faint">{t.nbPaiements(c.nb)}</p>
                  </div>
                  <span className="text-body font-medium tabnums">{fcfa(c.total, langue)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Le bilan en CSV, prêt pour Excel ou la comptabilité — les mêmes
          colonnes que l'export Telegram du robot. La semaine pour le quotidien,
          30 et 90 jours pour le bilan du mois ou du trimestre. */}
      <section className="lg:col-start-1">
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

      <div className="lg:col-start-1">
        <ReleveDeCompte langue={langue} sims={sims} />
      </div>
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
function ReleveDeCompte({ langue, sims }: { langue: Langue; sims: Sim[] }) {
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
