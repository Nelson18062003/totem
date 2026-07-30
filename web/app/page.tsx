import Link from "next/link";
import { fcfa, paiements, robot, sims } from "@/lib/mock";

export default function Accueil() {
  const totalJour = paiements.reduce((s, p) => s + p.montant, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête + état du robot */}
      <header className="halo -mx-4 -mt-5 px-4 pb-5 pt-6 md:mx-0 md:mt-0 md:rounded-card md:pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display font-bold tracking-tight">
              <span className="md:hidden">🗿 </span>Bonjour 👋
            </h1>
            <p className="text-small text-ink-soft">Voici l’état de votre argent, en direct.</p>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-small font-semibold ${
              robot.enLigne ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            <span className={`size-2 rounded-full ${robot.enLigne ? "bg-success" : "bg-danger"}`} />
            {robot.enLigne ? "En ligne" : "Hors ligne"}
          </span>
        </div>
      </header>

      {/* Total encaissé aujourd'hui — le chiffre héros */}
      <section className="rounded-card border border-line bg-surface-raised p-5">
        <p className="text-small text-ink-soft">Encaissé aujourd’hui</p>
        <p className="mt-1 text-display font-bold tabular-nums">{fcfa(totalJour)}</p>
        <p className="mt-1 text-small text-ink-soft">{paiements.length} paiements reçus</p>
      </section>

      {/* Soldes par SIM */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sims.map((s) => (
          <div key={s.id} className="rounded-card border border-line bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-pill px-2.5 py-1 text-caption font-bold ${
                  s.operateur === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
                }`}
              >
                {s.operateur} Money
              </span>
              <span className="text-caption text-ink-soft">📶 {s.signal}/31</span>
            </div>
            <p className="mt-3 text-title font-bold tabular-nums">{fcfa(s.solde)}</p>
            <p className="text-small text-ink-soft">{s.numero}</p>
          </div>
        ))}
      </section>

      {/* Actions rapides */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/actions"
          className="rounded-card bg-brand p-4 text-center font-bold text-black transition hover:opacity-90"
        >
          💸 Envoyer de l’argent
          <span className="mt-0.5 block text-caption font-normal text-black/70">
            Retrait, crédit, transfert…
          </span>
        </Link>
        <Link
          href="/paiements"
          className="rounded-card border border-line bg-surface-raised p-4 text-center font-bold transition hover:border-brand"
        >
          📥 Voir les paiements
          <span className="mt-0.5 block text-caption font-normal text-ink-soft">
            Journal des encaissements
          </span>
        </Link>
      </section>

      {/* Derniers paiements */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading font-bold">Derniers paiements</h2>
          <Link href="/paiements" className="text-small text-brand-strong">
            Tout voir
          </Link>
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
          {paiements.slice(0, 4).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`grid size-9 place-items-center rounded-full text-caption font-bold ${
                  p.sim === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
                }`}
              >
                {p.sim === "MTN" ? "M" : "O"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.nom}</p>
                <p className="text-caption text-ink-soft">
                  {p.numero} · {p.heure}
                </p>
              </div>
              <span className="font-bold tabular-nums text-success">+{fcfa(p.montant)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Bandeau santé du robot */}
      <section className="rounded-card border border-line bg-surface-raised p-4 text-small">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-ink-soft">
          <span>📍 {robot.lieu}</span>
          <span>🔋 {robot.batterie}% {robot.surSecteur ? "(secteur)" : "(batterie)"}</span>
          <span>🌐 {robot.internet}</span>
          <span>🔄 mis à jour {robot.majTexte}</span>
        </div>
      </section>
    </div>
  );
}
