import { fcfa, septJours } from "@/lib/mock";

export default function Rapports() {
  const max = Math.max(...septJours.map((d) => d.montant));
  const total = septJours.reduce((s, d) => s + d.montant, 0);
  const moyenne = Math.round(total / septJours.length);
  const meilleur = septJours.reduce((a, b) => (b.montant > a.montant ? b : a));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-title font-bold">Rapports</h1>
        <p className="text-small text-ink-soft">Vos encaissements des 7 derniers jours.</p>
      </header>

      {/* Tuiles de synthèse */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tuile label="Total semaine" valeur={fcfa(total)} />
        <Tuile label="Moyenne / jour" valeur={fcfa(moyenne)} />
        <Tuile label="Meilleur jour" valeur={`${meilleur.jour} · ${fcfa(meilleur.montant)}`} />
      </section>

      {/* Graphique à barres — une seule série, valeurs affichées directement */}
      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="mb-4 text-heading font-bold">Encaissements par jour</h2>
        <div className="flex items-end justify-between gap-2" style={{ height: 180 }}>
          {septJours.map((d) => {
            const h = Math.round((d.montant / max) * 140) + 8;
            return (
              <div key={d.jour} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-caption tabular-nums text-ink-soft">
                  {Math.round(d.montant / 1000)}k
                </span>
                <div
                  className="w-full rounded-t-[4px] bg-brand-strong"
                  style={{ height: h }}
                  title={`${d.jour} : ${fcfa(d.montant)}`}
                />
                <span className="text-caption font-medium text-ink-soft">{d.jour}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-ink-soft">Montants en milliers de FCFA (k = 1 000).</p>
      </section>

      <button className="rounded-btn border border-line bg-surface-raised py-3 text-small font-semibold text-ink-soft hover:border-brand">
        📄 Télécharger le bilan hebdomadaire (PDF)
      </button>
    </div>
  );
}

function Tuile({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="flex items-center justify-between rounded-card border border-line bg-surface-raised p-4 sm:block">
      <p className="text-caption text-ink-soft">{label}</p>
      <p className="text-heading font-bold tabular-nums leading-tight sm:mt-1">{valeur}</p>
    </div>
  );
}
