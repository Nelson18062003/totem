import { fcfa, fcfaCourt, paiements, sims } from "@/lib/mock";
import { IconArrowDown, IconArrowUp, IconList, IconLock, IconWallet } from "../icons";

export default function Comptes() {
  const total = sims.reduce((s, x) => s + x.solde, 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">Comptes</h1>
        <p className="mt-1 text-small text-ink-soft">Les SIM hébergées par le terminal.</p>
      </header>

      {/* Comptes */}
      <section className="flex flex-col gap-3">
        {sims.map((s, i) => (
          <div key={s.id} className={`rounded-card p-5 ${i === 0 ? "acct" : "acct-alt"}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}>
                  {s.operateur === "MTN" ? "MTN Mobile Money" : "Orange Money"}
                </p>
                <p className="mt-3 text-display font-semibold tabnums tracking-tight">{fcfa(s.solde)}</p>
                <p className={`mt-1 text-small tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                  {s.numero}
                </p>
              </div>
              <span className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-caption tabnums ${
                i === 0 ? "bg-white/10 text-white/70" : "bg-surface-2 text-ink-soft"
              }`}>
                <span className="size-1.5 rounded-full bg-positive" /> {s.signal}/31
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Opérations sur comptes */}
      <section className="grid grid-cols-3 gap-2">
        {[
          { l: "Consulter le solde", Icone: IconWallet },
          { l: "Historique", Icone: IconList },
          { l: "Verrouiller", Icone: IconLock },
        ].map(({ l, Icone }) => (
          <button key={l}
            className="flex flex-col items-start gap-2.5 rounded-card border border-line bg-surface-raised p-3.5 text-left transition hover:border-ink-faint">
            <Icone size={18} className="text-ink-soft" />
            <span className="text-small font-medium leading-snug">{l}</span>
          </button>
        ))}
      </section>

      {/* Répartition */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">Répartition</h2>
        <div className="rounded-card border border-line bg-surface-raised p-5">
          <div className="mb-4 flex h-2 overflow-hidden rounded-sm">
            {sims.map((s, i) => (
              <div key={s.id} style={{ width: `${(s.solde / total) * 100}%` }}
                className={i === 0 ? "bg-ink" : "bg-surface-3"} />
            ))}
          </div>
          <ul className="divide-hair">
            {sims.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2.5 text-body">
                  <span className={`size-2.5 rounded-sm ${i === 0 ? "bg-ink" : "bg-surface-3"}`} />
                  {s.operateur}
                </span>
                <span className="text-body tabnums text-ink-soft">
                  {fcfa(s.solde)} · {Math.round((s.solde / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Mouvements */}
      <section>
        <h2 className="mb-1 text-heading font-semibold">Mouvements récents</h2>
        <ul className="divide-hair">
          {paiements.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                {p.sens === "in" ? <IconArrowDown size={16} /> : <IconArrowUp size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{p.nom}</p>
                <p className="text-small text-ink-faint">{p.sim} · {p.date} · {p.heure}</p>
              </div>
              <span className={`text-body font-medium tabnums ${p.sens === "in" ? "text-positive" : "text-ink"}`}>
                {p.sens === "in" ? "+" : "−"}{fcfaCourt(p.montant)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
