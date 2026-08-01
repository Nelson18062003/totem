import Link from "next/link";
import { chargerDonnees } from "@/lib/serveur";
import { fcfa } from "@/lib/types";
import { AccueilGuichet } from "./accueil-client";
import { IconArrowDown, IconArrowUp, IconChevron, IconSettings } from "./icons";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const { terminal, sims, paiements } = await chargerDonnees();
  const carte = sims.find((s) => s.enPlace) ?? null;

  return (
    // Grand écran : le guichet à gauche, le terminal et ses détails à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      {/* En-tête */}
      <header className="flex items-baseline justify-between lg:col-span-2">
        <div>
          <p className="text-small text-ink-soft">Bonjour, Nelson</p>
          <h1 className="mt-0.5 text-title font-semibold tracking-tight">Vue d’ensemble</h1>
        </div>
        <Link href="/reglages" className="text-ink-faint transition hover:text-ink lg:hidden" aria-label="Réglages">
          <IconSettings size={18} />
        </Link>
      </header>

      {/* Le guichet : la carte (seul solde) et les cinq gestes */}
      {carte ? (
        <AccueilGuichet
          carte={{
            libelle: carte.libelle, operateur: carte.operateur,
            numero: carte.numero, solde: carte.solde,
            soldeSource: carte.soldeSource, signal: carte.signal,
            iccid: carte.iccid,
          }}
        />
      ) : (
        <section className="rounded-card border border-dashed border-line px-4 py-10 text-center lg:col-start-1">
          <p className="text-body font-medium">Aucune carte dans le terminal</p>
          <p className="mx-auto mt-1.5 max-w-sm text-small leading-relaxed text-ink-soft">
            Dès qu’une SIM sera vue par le terminal, son solde et le guichet
            apparaîtront ici.
          </p>
        </section>
      )}

      {/* Le terminal, avec ses détails techniques */}
      <aside className="lg:col-start-2 lg:row-span-3 lg:row-start-2">
        <h2 className="mb-3 text-heading font-semibold">Terminal</h2>
        <Link href="/reglages"
          className="block rounded-card border border-line bg-surface-raised transition hover:border-ink-faint">
          {terminal ? (
            <>
              <p className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-body">
                <span className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
                {terminal.enLigne ? "En ligne" : "Muet"}
                <span className="ml-auto text-small tabnums text-ink-faint">{terminal.majTexte}</span>
              </p>
              <dl className="divide-hair px-4 pb-1">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-small text-ink-soft">Emplacement</dt>
                  <dd className="text-small font-medium">{terminal.nom}</dd>
                </div>
                {terminal.version && (
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-small text-ink-soft">Version</dt>
                    <dd className="text-small font-medium tabnums">{terminal.version}</dd>
                  </div>
                )}
                {terminal.sante && (
                  <div className="py-2.5">
                    <dt className="text-small text-ink-soft">Santé du boîtier</dt>
                    <dd className="mt-1 text-small font-medium leading-relaxed tabnums">
                      {terminal.sante}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
              Aucun terminal ne s’est encore annoncé.
            </p>
          )}
        </Link>
      </aside>

      {/* Les derniers SMS — c'est par eux que tout arrive */}
      <section className="lg:col-start-1">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-heading font-semibold">Derniers SMS</h2>
          <Link href="/encaissements" className="flex items-center gap-0.5 text-small text-ink-soft transition hover:text-ink">
            Tout voir <IconChevron size={14} />
          </Link>
        </div>
        {paiements.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-small text-ink-faint">
            Aucun SMS reçu pour l’instant. Si la carte devrait en recevoir,
            vérifiez le terminal — un silence prolongé n’est pas normal.
          </p>
        ) : (
          <ul className="divide-hair">
            {paiements.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                  {p.sens === "in" ? <IconArrowDown size={16} /> : p.sens === "out" ? <IconArrowUp size={16} /> : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{p.nom}</p>
                  <p className="truncate text-small text-ink-faint">{p.sim} · {p.heure} · {p.smsBrut}</p>
                </div>
                {p.montant != null && (
                  <span className={`shrink-0 text-body font-medium tabnums ${p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"}`}>
                    {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
