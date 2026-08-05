import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesCartes } from "@/lib/textes/cartes";
import { fcfa } from "@/lib/types";
import { IconArrowDown, IconArrowUp, IconList, IconLock, IconWallet } from "../icons";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

export default async function Comptes() {
  const langue = await langueServeur();
  const t = textesCartes[langue];
  const { sims, paiements } = await chargerDonnees(langue);
  const enPlace = sims.filter((s) => s.enPlace);
  const retirees = sims.filter((s) => !s.enPlace);
  const soldeTotal = enPlace.reduce((s, x) => s + (x.solde ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Cartes en place — côte à côte dès que la largeur le permet */}
      {enPlace.length === 0 ? (
        <Vide titre={t.videTitre} detail={t.videDetail} />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {enPlace.map((s, i) => (
            <div key={s.iccid} className={`rounded-card p-5 ${i === 0 ? "acct" : "acct-alt"}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className={`text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}>
                    {s.operateur === "MTN" ? "MTN Mobile Money" : s.operateur === "Orange" ? "Orange Money" : s.libelle}
                  </p>
                  <p className="mt-3 text-display font-semibold tabnums tracking-tight">
                    {s.solde == null ? "—" : fcfa(s.solde, langue)}
                  </p>
                  {s.solde != null && s.soldeMaj && (
                    <p className={`mt-0.5 text-caption tabnums ${i === 0 ? "text-white/45" : "text-ink-faint"}`}>
                      {t.soldeLe(s.soldeMaj)}
                    </p>
                  )}
                  <p className={`mt-1 text-small tabnums ${i === 0 ? "text-white/55" : "text-ink-faint"}`}>
                    {s.numero || t.numeroAbsent}
                  </p>
                  {/* L'ICCID est ce qui distingue deux cartes du même opérateur. */}
                  <p className={`mt-2 text-caption tabnums ${i === 0 ? "text-white/45" : "text-ink-faint"}`}>
                    {t.carte(s.iccid.slice(-8))}
                    {s.itinerance && ` · ${t.itinerance(s.reseau)}`}
                  </p>
                </div>
                {s.signal != null && (
                  <span className={`flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-caption tabnums ${
                    i === 0 ? "bg-white/10 text-white/70" : "bg-surface-2 text-ink-soft"
                  }`}>
                    <span className="size-1.5 rounded-full bg-positive" /> {s.signal}/31
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Opérations sur comptes */}
      <section className="grid grid-cols-3 gap-2">
        {[
          { l: t.consulterSolde, Icone: IconWallet },
          { l: t.historique, Icone: IconList },
          { l: t.verrouiller, Icone: IconLock },
        ].map(({ l, Icone }) => (
          <button key={l}
            className="flex flex-col items-start gap-2.5 rounded-card border border-line bg-surface-raised p-3.5 text-left transition hover:border-ink-faint">
            <Icone size={18} className="text-ink-soft" />
            <span className="text-small font-medium leading-snug">{l}</span>
          </button>
        ))}
      </section>

      {/* Répartition — n'a de sens qu'avec plusieurs cartes en place */}
      {enPlace.length > 1 && soldeTotal > 0 && (
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.repartition}</h2>
        <div className="rounded-card border border-line bg-surface-raised p-5">
          <div className="mb-4 flex h-2 overflow-hidden rounded-sm">
            {enPlace.map((s, i) => (
              <div key={s.iccid} style={{ width: `${((s.solde ?? 0) / soldeTotal) * 100}%` }}
                className={i === 0 ? "bg-ink" : "bg-surface-3"} />
            ))}
          </div>
          <ul className="divide-hair">
            {enPlace.map((s, i) => (
              <li key={s.iccid} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2.5 text-body">
                  <span className={`size-2.5 rounded-sm ${i === 0 ? "bg-ink" : "bg-surface-3"}`} />
                  {s.libelle}
                </span>
                <span className="text-body tabnums text-ink-soft">
                  {fcfa(s.solde ?? 0, langue)} · {Math.round(((s.solde ?? 0) / soldeTotal) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      )}

      {/* Cartes retirées — l'historique d'une puce absente reste consultable */}
      {retirees.length > 0 && (
        <section>
          <h2 className="mb-1 text-heading font-semibold">{t.retireesTitre}</h2>
          <p className="mb-3 text-small text-ink-soft">{t.retireesDetail}</p>
          <ul className="divide-hair">
            {retirees.map((s) => (
              <li key={s.iccid} className="flex items-center gap-3 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line border-dashed text-ink-faint">
                  <IconWallet size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink-soft">{s.libelle}</p>
                  <p className="text-small text-ink-faint tabnums">
                    {t.bilanRetiree(s.nbPaiements, s.derniereVue)}
                  </p>
                </div>
                <span className="text-body tabnums text-ink-faint">{fcfa(s.totalRecu, langue)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mouvements */}
      {paiements.length > 0 && (
        <section>
          <h2 className="mb-1 text-heading font-semibold">{t.mouvements}</h2>
          <ul className="divide-hair">
            {paiements.filter((p) => p.montant != null).slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                  {p.sens === "in" ? <IconArrowDown size={16} /> : p.sens === "out" ? <IconArrowUp size={16} /> : "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{p.nom}</p>
                  <p className="text-small text-ink-faint">{p.sim} · {p.date} · {p.heure}</p>
                </div>
                <span className={`text-body font-medium tabnums ${p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"}`}>
                  {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant!, langue)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
