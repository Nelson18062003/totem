import { robot, sims } from "@/lib/mock";

export default function Reglages() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-title font-bold">Réglages</h1>
        <p className="text-small text-ink-soft">État du robot et de vos SIM.</p>
      </header>

      {/* État robot */}
      <section className="rounded-card border border-line bg-surface-raised p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">🗿</span>
          <h2 className="text-heading font-bold">{robot.nom}</h2>
          <span className="ml-auto flex items-center gap-1.5 rounded-pill bg-success-soft px-2.5 py-1 text-caption font-semibold text-success">
            <span className="size-1.5 rounded-full bg-success" /> En ligne
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-small">
          <Ligne t="Emplacement" v={robot.lieu} />
          <Ligne t="Internet" v={robot.internet} />
          <Ligne t="Alimentation" v={`${robot.batterie}% ${robot.surSecteur ? "(secteur)" : "(batterie)"}`} />
          <Ligne t="Dernier contact" v={robot.majTexte} />
        </dl>
        <button className="mt-4 w-full rounded-btn border border-line py-2.5 text-small font-semibold hover:border-brand">
          🔄 Redémarrer le robot à distance
        </button>
      </section>

      {/* SIM */}
      <section className="flex flex-col gap-3">
        <h2 className="text-heading font-bold">SIM hébergées</h2>
        {sims.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4">
            <span
              className={`rounded-pill px-2.5 py-1 text-caption font-bold ${
                s.operateur === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
              }`}
            >
              {s.operateur}
            </span>
            <div className="flex-1">
              <p className="font-semibold">{s.numero}</p>
              <p className="text-caption text-ink-soft">Signal {s.signal}/31 · en ligne</p>
            </div>
            <span className="size-2.5 rounded-full bg-success" />
          </div>
        ))}
      </section>

      {/* Notifications */}
      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="mb-3 text-heading font-bold">Notifications</h2>
        <Bascule t="Alerte à chaque paiement reçu" on />
        <Bascule t="Rapport quotidien (21 h)" on />
        <Bascule t="Alerte coupure de courant" on />
        <Bascule t="Doubler l’alerte sur Telegram" />
      </section>

      <p className="text-center text-caption text-ink-soft">
        Maquette de démonstration — les données affichées sont fictives.
      </p>
    </div>
  );
}

function Ligne({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-soft">{t}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function Bascule({ t, on }: { t: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-line py-2.5 first:border-t-0">
      <span className="text-small">{t}</span>
      <span
        className={`flex h-6 w-10 items-center rounded-pill p-0.5 transition ${
          on ? "justify-end bg-brand" : "justify-start bg-line"
        }`}
      >
        <span className="size-5 rounded-full bg-white" />
      </span>
    </div>
  );
}
