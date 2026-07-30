import { fcfa, fcfaCourt, septJours, topClients } from "@/lib/mock";

export default function Analyse() {
  const max = Math.max(...septJours.map((d) => d.montant));
  const total = septJours.reduce((s, d) => s + d.montant, 0);
  const moyenne = Math.round(total / septJours.length);
  const meilleur = septJours.reduce((a, b) => (b.montant > a.montant ? b : a));

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-1">
        <h1 className="text-title font-bold">Analyse</h1>
        <p className="text-small text-ink-soft">Votre activité des 7 derniers jours.</p>
      </header>

      {/* Chiffre héros */}
      <section className="halo-hero flex flex-col items-center py-2 text-center">
        <p className="text-small text-ink-soft">Chiffre d’affaires (semaine)</p>
        <p className="mt-1 text-display font-bold tabnums">{fcfa(total)}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-success-soft px-3 py-1 text-small font-semibold text-success">
          ↑ +18% vs semaine passée
        </p>
      </section>

      {/* Tuiles */}
      <section className="grid grid-cols-2 gap-3">
        <Tuile label="Moyenne / jour" valeur={fcfa(moyenne)} />
        <Tuile label="Meilleur jour" valeur={`${meilleur.jour} · ${fcfaCourt(meilleur.montant)}`} />
      </section>

      {/* Graphique — barres, valeurs directes */}
      <section className="rounded-card border border-line bg-surface-raised p-5">
        <h2 className="mb-5 text-heading font-bold">Encaissements par jour</h2>
        <div className="flex items-end justify-between gap-2.5" style={{ height: 170 }}>
          {septJours.map((d) => {
            const h = Math.round((d.montant / max) * 128) + 8;
            const best = d.jour === meilleur.jour;
            return (
              <div key={d.jour} className="flex flex-1 flex-col items-center gap-2">
                <span className={`text-caption tabnums ${best ? "font-bold text-brand-2" : "text-ink-soft"}`}>
                  {fcfaCourt(d.montant)}
                </span>
                <div className="w-full rounded-t-lg" style={{
                  height: h,
                  background: best
                    ? "linear-gradient(180deg,#ffb340,#ff9500)"
                    : "linear-gradient(180deg,#3a3a44,#26262e)",
                }} />
                <span className="text-caption text-ink-faint">{d.jour}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Meilleurs clients */}
      <section>
        <h2 className="mb-3 text-heading font-bold">Meilleurs clients</h2>
        <ul className="overflow-hidden rounded-card border border-line bg-surface-raised">
          {topClients.map((c, i) => (
            <li key={c.nom} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
              <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-caption font-bold text-ink-soft">{i + 1}</span>
              <div className="flex-1">
                <p className="font-semibold">{c.nom}</p>
                <p className="text-caption text-ink-soft">{c.nb} paiements</p>
              </div>
              <span className="font-bold tabnums text-success">{fcfa(c.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <button className="rounded-btn border border-line bg-surface-raised py-3.5 text-small font-semibold text-ink-soft transition hover:border-brand">
        📄 Exporter le bilan (PDF / Excel)
      </button>
    </div>
  );
}

function Tuile({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-card border border-line bg-surface-raised p-4">
      <p className="text-caption text-ink-soft">{label}</p>
      <p className="mt-1 text-heading font-bold tabnums">{valeur}</p>
    </div>
  );
}
