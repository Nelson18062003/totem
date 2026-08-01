import { fcfa, fcfaCourt, septJours, topClients } from "@/lib/mock";
import { IconDoc } from "../icons";

export default function Analyse() {
  const max = Math.max(...septJours.map((d) => d.montant));
  const total = septJours.reduce((s, d) => s + d.montant, 0);
  const moyenne = Math.round(total / septJours.length);
  const meilleur = septJours.reduce((a, b) => (b.montant > a.montant ? b : a));

  return (
    // Grand écran : les chiffres et le graphique à gauche, les clients à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">Analyse</h1>
        <p className="mt-1 text-small text-ink-soft">Sept derniers jours.</p>
      </header>

      {/* Chiffre principal */}
      <section className="lg:col-start-1">
        <p className="text-small text-ink-soft">Encaissements de la semaine</p>
        <p className="mt-1 text-hero font-semibold tabnums tracking-tight">{fcfa(total)}</p>
        <p className="mt-1.5 text-small text-ink-soft">
          <span className="font-medium text-positive">+18 %</span> par rapport à la semaine précédente
        </p>
      </section>

      {/* Repères */}
      <section className="grid grid-cols-2 divide-x divide-line rounded-card border border-line bg-surface-raised lg:col-start-1">
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">Moyenne par jour</p>
          <p className="mt-1 text-heading font-semibold tabnums">{fcfa(moyenne)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-small text-ink-soft">Meilleur jour</p>
          <p className="mt-1 text-heading font-semibold tabnums">{meilleur.jour} · {fcfaCourt(meilleur.montant)}</p>
        </div>
      </section>

      {/* Graphique — monochrome, valeurs directes */}
      <section className="lg:col-start-1">
        <h2 className="mb-4 text-heading font-semibold">Encaissements par jour</h2>
        <div className="flex items-end justify-between gap-2.5" style={{ height: 160 }}>
          {septJours.map((d) => {
            const h = Math.round((d.montant / max) * 118) + 6;
            const best = d.jour === meilleur.jour;
            return (
              <div key={d.jour} className="flex flex-1 flex-col items-center gap-2">
                <span className={`text-caption tabnums ${best ? "font-medium text-ink" : "text-ink-faint"}`}>
                  {fcfaCourt(d.montant)}
                </span>
                <div className={`w-full rounded-sm ${best ? "bg-ink" : "bg-surface-3"}`} style={{ height: h }} />
                <span className="text-caption text-ink-faint">{d.jour}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-ink-faint">Montants en milliers de FCFA.</p>
      </section>

      {/* Clients */}
      <section className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
        <h2 className="mb-1 text-heading font-semibold">Principaux clients</h2>
        <ul className="divide-hair">
          {topClients.map((c, i) => (
            <li key={c.nom} className="flex items-center gap-3.5 py-3.5">
              <span className="w-4 text-small tabnums text-ink-faint">{i + 1}</span>
              <div className="flex-1">
                <p className="text-body font-medium">{c.nom}</p>
                <p className="text-small text-ink-faint">{c.nb} paiements</p>
              </div>
              <span className="text-body font-medium tabnums">{fcfa(c.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <button className="flex items-center justify-center gap-2 rounded-btn border border-line bg-surface-raised py-3 text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink lg:col-start-1">
        <IconDoc size={16} /> Exporter le bilan
      </button>
    </div>
  );
}
