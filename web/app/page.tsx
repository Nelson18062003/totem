import Link from "next/link";
import { fcfa, fcfaCourt, paiements, sims, soldeTotal } from "@/lib/mock";

export default function Accueil() {
  const entrees = paiements.filter((p) => p.sens === "in" && p.date === "Aujourd’hui");
  const totalJour = entrees.reduce((s, p) => s + p.montant, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-lg font-bold">N</span>
          <div>
            <p className="text-caption text-ink-soft">Bonjour</p>
            <p className="text-heading font-bold leading-tight">Nelson</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="glass flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption font-semibold text-success">
            <span className="size-1.5 rounded-full bg-success" /> En ligne
          </span>
          <button className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-soft">⚙️</button>
        </div>
      </header>

      {/* Solde total — le héros */}
      <section className="halo-hero -mt-2 flex flex-col items-center py-3 text-center">
        <p className="text-small text-ink-soft">Solde total disponible</p>
        <p className="mt-1 text-hero font-bold tabnums">{fcfa(soldeTotal)}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-success-soft px-3 py-1 text-small font-semibold text-success">
          ↑ +{fcfaCourt(totalJour)} aujourd’hui
        </p>
      </section>

      {/* Carte principale (façon carte bancaire premium) */}
      <section>
        <div className="card-metal relative overflow-hidden rounded-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-caption uppercase tracking-widest text-ink-soft">Compte principal</p>
              <p className="mt-3 text-title font-bold tabnums">{fcfa(sims[0].solde)}</p>
            </div>
            <span className="rounded-pill bg-[#ffcc00] px-2.5 py-1 text-caption font-bold text-black">MTN MoMo</span>
          </div>
          <div className="mt-6 flex items-end justify-between">
            <div className="card-chip" />
            <p className="tabnums text-body tracking-widest text-ink">•••• {sims[0].numero.slice(-5)}</p>
          </div>
        </div>
      </section>

      {/* Actions rapides */}
      <section className="grid grid-cols-4 gap-2">
        {[
          { href: "/encaissements", label: "Encaisser", ic: "＋", c: "text-green" },
          { href: "/actions", label: "Envoyer", ic: "↑", c: "text-brand-2" },
          { href: "/actions", label: "Retrait", ic: "↓", c: "text-blue" },
          { href: "/actions", label: "Crédit", ic: "▮", c: "text-violet" },
        ].map((a, i) => (
          <Link key={i} href={a.href} className="flex flex-col items-center gap-2">
            <span className={`grid size-14 place-items-center rounded-full bg-surface-2 text-xl font-bold ${a.c}`}>{a.ic}</span>
            <span className="text-caption text-ink-soft">{a.label}</span>
          </Link>
        ))}
      </section>

      {/* Résumé du jour */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <p className="text-caption text-ink-soft">Encaissé aujourd’hui</p>
          <p className="mt-1 text-heading font-bold tabnums text-success">+{fcfa(totalJour)}</p>
          <p className="text-caption text-ink-faint">{entrees.length} paiements</p>
        </div>
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <p className="text-caption text-ink-soft">Comptes actifs</p>
          <p className="mt-1 text-heading font-bold">2 SIM</p>
          <p className="text-caption text-ink-faint">MTN · Orange</p>
        </div>
      </section>

      {/* Transactions récentes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-heading font-bold">Transactions</h2>
          <Link href="/encaissements" className="text-small text-brand-2">Tout voir</Link>
        </div>
        <ul className="flex flex-col gap-1">
          {paiements.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-btn px-2 py-2.5 transition hover:bg-surface-2/50">
              <span className={`grid size-11 place-items-center rounded-full text-body font-bold ${
                p.sens === "in" ? "bg-success-soft text-success" : "bg-surface-2 text-ink-soft"
              }`}>
                {p.sens === "in" ? "↓" : "↑"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.nom}</p>
                <p className="text-caption text-ink-soft">{p.categorie} · {p.heure}</p>
              </div>
              <span className={`font-bold tabnums ${p.sens === "in" ? "text-success" : "text-ink"}`}>
                {p.sens === "in" ? "+" : "−"}{fcfaCourt(p.montant)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
