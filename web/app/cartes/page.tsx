import { fcfa, fcfaCourt, paiements, sims, simsEnPlace, soldeTotal } from "@/lib/mock";
import { IconArrowDown, IconArrowUp, IconList, IconLock, IconWallet } from "../icons";

const retirees = sims.filter((s) => !s.enPlace);

export default function Comptes() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">Comptes</h1>
        <p className="mt-1 text-small text-ink-soft">
          Une carte SIM, un compte. Chacune garde son propre solde et son propre
          historique.
        </p>
      </header>

      {/* Cartes en place */}
      <section className="flex flex-col gap-3">
        {simsEnPlace.map((s, i) => (
          <div key={s.id} className={`rounded-card p-5 ${i === 0 ? "acct" : "acct-alt"}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className={`text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}>
                  {s.operateur === "MTN" ? "MTN Mobile Money" : "Orange Money"}
                </p>
                <p className="mt-3 text-display font-semibold tabnums tracking-tight">{fcfa(s.solde)}</p>
                <p className={`mt-1 text-small tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                  {s.numero || "numéro non provisionné"}
                </p>
                {/* L'ICCID est ce qui distingue deux cartes du même opérateur. */}
                <p className={`mt-2 text-caption tabnums ${i === 0 ? "text-white/45" : "text-ink-faint"}`}>
                  carte {s.iccid.slice(-8)}
                  {s.itinerance && ` · itinérance sur ${s.reseau}`}
                </p>
              </div>
              <span className={`flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-caption tabnums ${
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
            {simsEnPlace.map((s, i) => (
              <div key={s.id} style={{ width: `${(s.solde / soldeTotal) * 100}%` }}
                className={i === 0 ? "bg-ink" : "bg-surface-3"} />
            ))}
          </div>
          <ul className="divide-hair">
            {simsEnPlace.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2.5 text-body">
                  <span className={`size-2.5 rounded-sm ${i === 0 ? "bg-ink" : "bg-surface-3"}`} />
                  {s.libelle}
                </span>
                <span className="text-body tabnums text-ink-soft">
                  {fcfa(s.solde)} · {Math.round((s.solde / soldeTotal) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cartes retirées — l'historique d'une puce absente reste consultable */}
      {retirees.length > 0 && (
        <section>
          <h2 className="mb-1 text-heading font-semibold">Cartes retirées</h2>
          <p className="mb-3 text-small text-ink-soft">
            Elles ne sont plus dans le terminal, mais leur journal est intact.
            Les remettre le fait ressortir tel quel.
          </p>
          <ul className="divide-hair">
            {retirees.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line border-dashed text-ink-faint">
                  <IconWallet size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink-soft">{s.libelle}</p>
                  <p className="text-small text-ink-faint tabnums">
                    {s.nbPaiements} paiements · retirée le {s.derniereVue}
                  </p>
                </div>
                <span className="text-body tabnums text-ink-faint">{fcfaCourt(s.totalRecu)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
