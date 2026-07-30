import { fcfa, paiements, sims } from "@/lib/mock";

export default function Cartes() {
  return (
    <div className="flex flex-col gap-6">
      <header className="pt-1">
        <h1 className="text-title font-bold">Mes cartes</h1>
        <p className="text-small text-ink-soft">Chaque SIM Mobile Money, comme une carte.</p>
      </header>

      {/* Cartes bancaires */}
      <section className="flex flex-col gap-4">
        {sims.map((sim) => (
          <div key={sim.id}
            className={`relative overflow-hidden rounded-card p-5 ${sim.operateur === "MTN" ? "card-mtn" : "card-orange"}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-caption font-semibold uppercase tracking-widest opacity-80">
                  {sim.operateur === "MTN" ? "MTN Mobile Money" : "Orange Money"}
                </p>
                <p className="mt-4 text-caption uppercase tracking-widest opacity-70">Solde</p>
                <p className="text-display font-bold tabnums">{fcfa(sim.solde)}</p>
              </div>
              <span className="flex items-center gap-1 rounded-pill bg-black/15 px-2.5 py-1 text-caption font-semibold">
                <span className="size-1.5 rounded-full bg-current" /> 📶 {sim.signal}/31
              </span>
            </div>
            <div className="mt-8 flex items-end justify-between">
              <div className="card-chip" />
              <p className="tabnums text-body font-medium tracking-[0.2em]">•••• •••• {sim.numero.slice(-5)}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Actions sur cartes */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { l: "Consulter solde", i: "💰" },
          { l: "Historique", i: "🧾" },
          { l: "Bloquer / débloquer", i: "🔒" },
        ].map((a) => (
          <button key={a.l} className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface-raised p-4 text-center transition hover:border-brand">
            <span className="text-2xl">{a.i}</span>
            <span className="text-caption text-ink-soft">{a.l}</span>
          </button>
        ))}
      </section>

      {/* Répartition */}
      <section className="rounded-card border border-line bg-surface-raised p-5">
        <h2 className="mb-4 text-heading font-bold">Répartition des soldes</h2>
        {sims.map((sim) => {
          const total = sims.reduce((s, x) => s + x.solde, 0);
          const pct = Math.round((sim.solde / total) * 100);
          return (
            <div key={sim.id} className="mb-4 last:mb-0">
              <div className="mb-1.5 flex items-center justify-between text-small">
                <span className="font-semibold">{sim.operateur}</span>
                <span className="tabnums text-ink-soft">{fcfa(sim.solde)} · {pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-pill bg-surface-2">
                <div className={`h-full rounded-pill ${sim.operateur === "MTN" ? "bg-[#f5a800]" : "bg-[#ff5a1f]"}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      {/* Dernier mouvement par carte */}
      <section>
        <h2 className="mb-3 text-heading font-bold">Derniers mouvements</h2>
        <ul className="flex flex-col gap-1">
          {paiements.slice(0, 4).map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-btn px-2 py-2.5">
              <span className={`grid size-9 place-items-center rounded-full text-caption font-bold ${
                p.sim === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
              }`}>{p.sim === "MTN" ? "M" : "O"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.nom}</p>
                <p className="text-caption text-ink-soft">{p.date} · {p.heure}</p>
              </div>
              <span className={`font-bold tabnums ${p.sens === "in" ? "text-success" : "text-ink"}`}>
                {p.sens === "in" ? "+" : "−"}{fcfa(p.montant).replace(" FCFA", "")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
