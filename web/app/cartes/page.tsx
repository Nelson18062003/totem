import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesCartes } from "@/lib/textes/cartes";
import { fcfa, nombre } from "@/lib/types";
import { IconWallet } from "../icons";
import { LogoOperateur, operateurReconnu } from "../logos-operateurs";
import { Vide } from "../vide";

export const dynamic = "force-dynamic";

export default async function Comptes() {
  const langue = await langueServeur();
  const t = textesCartes[langue];
  // Les SMS restent chargés : le bilan des cartes retirées se compte dessus.
  const { sims } = await chargerDonnees(langue);
  const enPlace = sims.filter((s) => s.enPlace);
  const retirees = sims.filter((s) => !s.enPlace);
  const soldeTotal = enPlace.reduce((s, x) => s + (x.solde ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {/* Le titre seul : la page se comprend en la regardant. */}
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
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
                  <p className={`flex items-center gap-2 text-caption uppercase tracking-wider ${i === 0 ? "text-white/60" : "text-ink-faint"}`}
                    title={s.operateur === "MTN" ? "MTN Mobile Money" : s.operateur === "Orange" ? "Orange Money" : s.libelle}>
                    <LogoOperateur operateur={s.operateur} size={22} className="shrink-0" />
                    <span className="sr-only">
                      {s.operateur === "MTN" ? "MTN Mobile Money" : s.operateur === "Orange" ? "Orange Money" : s.libelle}
                    </span>
                    {!operateurReconnu(s.operateur) && <span className="truncate">{s.libelle}</span>}
                  </p>
                  <p className={`mt-3 whitespace-nowrap font-semibold tabnums tracking-tight ${
                    s.solde != null && nombre(s.solde, langue).length > 12 ? "text-heading sm:text-title" : "text-display"
                  }`}>
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
                    <span className="size-1.5 rounded-full bg-positive-vif" /> {s.signal}/31
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

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

    </div>
  );
}
