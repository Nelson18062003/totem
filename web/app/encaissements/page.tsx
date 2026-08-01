"use client";

import { useMemo, useState } from "react";
import { fcfa, fcfaCourt, paiements, type Paiement } from "@/lib/mock";
import { IconArrowDown, IconArrowUp, IconClose, IconCopy, IconDoc, IconDownload, IconSearch } from "../icons";
import { Vide } from "../vide";

export default function Encaissements() {
  const [filtre, setFiltre] = useState<"Tous" | "MTN" | "Orange">("Tous");
  const [recherche, setRecherche] = useState("");
  const [detail, setDetail] = useState<Paiement | null>(null);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase().replace(/\s/g, "");
    return paiements.filter((p) => {
      if (filtre !== "Tous" && p.sim !== filtre) return false;
      if (!q) return true;
      return p.nom.toLowerCase().includes(q) || p.numero.replace(/\s/g, "").includes(q)
        || String(p.montant).includes(q) || p.reference.toLowerCase().includes(q);
    });
  }, [filtre, recherche]);

  const entrees = liste.filter((p) => p.sens === "in");
  const totalIn = entrees.reduce((s, p) => s + p.montant, 0);

  const parDate = liste.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.date] ||= []).push(p); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">Encaissements</h1>
        <p className="mt-1 text-small text-ink-soft">Chaque paiement reçu, horodaté et prouvé.</p>
      </header>

      <section>
        <p className="text-small text-ink-soft">Reçu aujourd’hui</p>
        <p className="mt-1 text-display font-semibold tabnums tracking-tight">{fcfa(totalIn)}</p>
        <p className="mt-1 text-small text-ink-faint">{entrees.length} paiements</p>
      </section>

      {/* Recherche */}
      <div className="flex items-center gap-2.5 rounded-btn border border-line bg-surface-raised px-3.5">
        <IconSearch size={16} className="text-ink-faint" />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, numéro, montant, référence"
          className="flex-1 bg-transparent py-2.5 text-body outline-none placeholder:text-ink-faint" />
        {recherche && (
          <button onClick={() => setRecherche("")} className="text-ink-faint transition hover:text-ink">
            <IconClose size={15} />
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-1.5">
        {(["Tous", "MTN", "Orange"] as const).map((f) => (
          <button key={f} onClick={() => setFiltre(f)}
            className={`rounded-btn border px-3.5 py-1.5 text-small transition ${
              filtre === f
                ? "border-ink bg-ink font-medium text-white"
                : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
            }`}>{f}</button>
        ))}
      </div>

      {/* Liste */}
      {Object.keys(parDate).length === 0 ? (
        recherche || filtre !== "Tous" ? (
          <Vide
            titre="Aucun paiement ne correspond"
            detail="Essayez un autre nom, un autre montant, ou retirez le filtre d’opérateur."
            action={
              <button
                onClick={() => { setRecherche(""); setFiltre("Tous"); }}
                className="rounded-btn border border-line px-4 py-2 text-small font-medium transition hover:border-ink-faint"
              >
                Effacer la recherche
              </button>
            }
          />
        ) : (
          <Vide
            titre="Aucun paiement pour l’instant"
            detail="Les paiements de vos clients apparaîtront ici dès leur réception, horodatés et prouvés."
          />
        )
      ) : (
        Object.entries(parDate).map(([date, items]) => (
          <section key={date}>
            <p className="mb-1 text-caption uppercase tracking-wider text-ink-faint">{date}</p>
            <ul className="divide-hair">
              {items.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setDetail(p)}
                    className="flex w-full items-center gap-3 py-3.5 text-left transition hover:opacity-70">
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
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <button className="flex items-center justify-center gap-2 rounded-btn border border-line bg-surface-raised py-3 text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink">
        <IconDownload size={16} /> Exporter (Excel)
      </button>

      {detail && <Detail p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}

function Detail({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4" onClick={onFermer}>
      <div className="w-full max-w-md rounded-t-card border border-line bg-surface-raised p-6 md:rounded-card"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-small text-ink-soft">{p.sens === "in" ? "Paiement reçu" : "Paiement envoyé"}</p>
            <p className="mt-1 text-display font-semibold tabnums tracking-tight">
              {p.sens === "in" ? "+" : "−"}{fcfa(p.montant)}
            </p>
            <p className="mt-1 text-body text-ink-soft">{p.nom}</p>
          </div>
          <button onClick={onFermer} className="text-ink-faint transition hover:text-ink"><IconClose size={18} /></button>
        </div>

        <dl className="mt-6 divide-hair">
          <L t="Opérateur" v={p.sim} />
          <L t="Numéro" v={p.numero} />
          <L t="Date" v={`${p.date} à ${p.heure}`} />
          <L t="Catégorie" v={p.categorie} />
          <L t="Référence" v={p.reference} />
          <L t="Solde après" v={fcfa(p.soldeApres)} />
        </dl>

        <div className="mt-5">
          <p className="mb-1.5 text-caption uppercase tracking-wider text-ink-faint">Message reçu</p>
          <p className="rounded-card bg-surface-2 p-3.5 text-small leading-relaxed text-ink-soft">{p.smsBrut}</p>
        </div>

        {/* Pas de bouton « Rembourser » : aucun geste qui déplace de l'argent
            ne part d'une fiche de consultation. Les opérations ont leur page. */}
        <div className="mt-5 flex gap-2">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
            <IconCopy size={15} /> Copier le SMS
          </button>
          {/* La maquette du reçu, dessinée sur de vrais SMS (recus/) ; la
              génération à partir de ce paiement-ci viendra avec le branchement. */}
          <a href="/demo/recu-transfert.pdf" target="_blank" rel="noopener"
            className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
            <IconDoc size={15} /> Reçu PDF
          </a>
        </div>
      </div>
    </div>
  );
}

function L({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className="text-small font-medium tabnums">{v}</dd>
    </div>
  );
}
