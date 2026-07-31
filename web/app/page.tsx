import Link from "next/link";
import { fcfa, fcfaCourt, paiements, simsEnPlace, soldeTotal } from "@/lib/mock";
import { IconArrowDown, IconArrowUp, IconChevron, IconPhone, IconPlus, IconSettings, IconWallet } from "./icons";

export default function Accueil() {
  const entrees = paiements.filter((p) => p.sens === "in" && p.date === "Aujourd’hui");
  const totalJour = entrees.reduce((s, p) => s + p.montant, 0);

  return (
    <div className="flex flex-col gap-8">
      {/* En-tête */}
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-small text-ink-soft">Bonjour, Nelson</p>
          <h1 className="mt-0.5 text-title font-semibold tracking-tight">Vue d’ensemble</h1>
        </div>
        <Link href="/reglages" className="text-ink-faint transition hover:text-ink" aria-label="Réglages">
          <IconSettings size={18} />
        </Link>
      </header>

      {/* Solde */}
      <section>
        <p className="text-small text-ink-soft">Solde disponible</p>
        <p className="mt-1 text-hero font-semibold tabnums tracking-tight">{fcfa(soldeTotal)}</p>
        <p className="mt-1.5 text-small text-ink-soft">
          <span className="font-medium text-positive">+{fcfa(totalJour)}</span> encaissés aujourd’hui
        </p>
      </section>

      {/* Opérations */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { href: "/encaissements", label: "Encaisser", Icone: IconPlus },
          { href: "/actions", label: "Envoyer", Icone: IconArrowUp },
          { href: "/actions", label: "Retirer", Icone: IconWallet },
          { href: "/actions", label: "Crédit", Icone: IconPhone },
        ].map(({ href, label, Icone }, i) => (
          <Link key={i} href={href}
            className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
            <Icone size={18} className="text-ink-soft" />
            {label}
          </Link>
        ))}
      </section>

      {/* Comptes */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-heading font-semibold">Comptes</h2>
          <Link href="/cartes" className="text-small text-ink-soft transition hover:text-ink">Détails</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {simsEnPlace.map((s, i) => (
            <Link key={s.id} href="/cartes"
              className={`rounded-card p-4 transition ${i === 0 ? "acct" : "acct-alt hover:border-ink-faint"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}>
                  {s.operateur === "MTN" ? "MTN Mobile Money" : "Orange Money"}
                </span>
                <span className={`text-caption tabnums ${i === 0 ? "text-white/50" : "text-ink-faint"}`}>
                  {s.signal}/31
                </span>
              </div>
              <p className="mt-4 text-display font-semibold tabnums tracking-tight">{fcfa(s.solde)}</p>
              <p className={`mt-1 text-small tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                •••• {s.numero.slice(-5)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Transactions */}
      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-heading font-semibold">Dernières transactions</h2>
          <Link href="/encaissements" className="flex items-center gap-0.5 text-small text-ink-soft transition hover:text-ink">
            Tout voir <IconChevron size={14} />
          </Link>
        </div>
        <ul className="divide-hair">
          {paiements.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                {p.sens === "in" ? <IconArrowDown size={16} /> : <IconArrowUp size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{p.nom}</p>
                <p className="text-small text-ink-faint">{p.sim} · {p.categorie} · {p.heure}</p>
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
