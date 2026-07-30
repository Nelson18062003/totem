"use client";

import { useMemo, useState } from "react";
import { fcfa, fcfaCourt, paiements, type Paiement } from "@/lib/mock";

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

  // Regroupement par date
  const parDate = liste.reduce<Record<string, Paiement[]>>((acc, p) => {
    (acc[p.date] ||= []).push(p); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-1">
        <h1 className="text-title font-bold">Encaissements</h1>
        <p className="text-small text-ink-soft">Chaque paiement client, prouvé et horodaté.</p>
      </header>

      {/* Bandeau total */}
      <section className="halo-hero rounded-card border border-line bg-surface-raised p-5 text-center">
        <p className="text-small text-ink-soft">Reçu aujourd’hui</p>
        <p className="mt-1 text-display font-bold tabnums text-success">+{fcfa(totalIn)}</p>
        <p className="text-caption text-ink-faint">{entrees.length} paiements clients</p>
      </section>

      {/* Recherche */}
      <div className="glass flex items-center gap-2 rounded-btn px-4">
        <span className="text-ink-soft">🔎</span>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher nom, numéro, montant, réf…"
          className="flex-1 bg-transparent py-3.5 text-body outline-none placeholder:text-ink-faint" />
        {recherche && <button onClick={() => setRecherche("")} className="text-ink-soft">✕</button>}
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {(["Tous", "MTN", "Orange"] as const).map((f) => (
          <button key={f} onClick={() => setFiltre(f)}
            className={`rounded-pill px-4 py-2 text-small font-semibold transition ${
              filtre === f ? "bg-brand text-black" : "bg-surface-2 text-ink-soft"
            }`}>{f}</button>
        ))}
      </div>

      {/* Listes par date */}
      {Object.keys(parDate).length === 0 ? (
        <p className="rounded-card border border-line bg-surface-raised p-8 text-center text-ink-soft">Aucun résultat.</p>
      ) : (
        Object.entries(parDate).map(([date, items]) => (
          <section key={date}>
            <p className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-ink-faint">{date}</p>
            <ul className="flex flex-col gap-1">
              {items.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setDetail(p)}
                    className="flex w-full items-center gap-3 rounded-btn px-2.5 py-3 text-left transition hover:bg-surface-2/60">
                    <span className={`grid size-11 place-items-center rounded-full text-body font-bold ${
                      p.sens === "in" ? "bg-success-soft text-success" : "bg-surface-2 text-ink-soft"
                    }`}>{p.sens === "in" ? "↓" : "↑"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.nom}</p>
                      <p className="text-caption text-ink-soft">
                        <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[0.65rem] font-bold ${
                          p.sim === "MTN" ? "bg-[#ffcc00]/15 text-[#ffcc00]" : "bg-[#ff6600]/15 text-[#ff8a3d]"
                        }`}>{p.sim}</span>
                        {p.categorie} · {p.heure}
                      </p>
                    </div>
                    <span className={`font-bold tabnums ${p.sens === "in" ? "text-success" : "text-ink"}`}>
                      {p.sens === "in" ? "+" : "−"}{fcfaCourt(p.montant)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <button className="rounded-btn border border-line bg-surface-raised py-3.5 text-small font-semibold text-ink-soft transition hover:border-brand">
        ⬇️ Exporter en Excel (comptable)
      </button>

      {detail && <FicheDetail p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}

function FicheDetail({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 md:items-center md:p-4" onClick={onFermer}>
      <div className="w-full max-w-md rounded-t-card border border-line bg-surface-raised p-5 md:rounded-card"
        onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-line md:hidden" />
        <div className="flex flex-col items-center text-center">
          <span className={`grid size-14 place-items-center rounded-full text-2xl ${
            p.sens === "in" ? "bg-success-soft text-success" : "bg-surface-2 text-ink-soft"
          }`}>{p.sens === "in" ? "↓" : "↑"}</span>
          <p className="mt-3 font-semibold">{p.nom}</p>
          <p className={`mt-1 text-display font-bold tabnums ${p.sens === "in" ? "text-success" : "text-ink"}`}>
            {p.sens === "in" ? "+" : "−"}{fcfa(p.montant)}
          </p>
          <p className="text-caption text-ink-soft">{p.sim} · {p.date} à {p.heure}</p>
        </div>

        <dl className="mt-5 divide-y divide-line rounded-card border border-line">
          <L t="Numéro" v={p.numero} />
          <L t="Catégorie" v={p.categorie} />
          <L t="Référence" v={p.reference} mono />
          <L t="Solde après" v={fcfa(p.soldeApres)} />
        </dl>

        <div className="mt-4">
          <p className="mb-1.5 text-caption text-ink-soft">SMS reçu (preuve) :</p>
          <p className="rounded-card border border-line bg-surface-sunken p-3 text-small">{p.smsBrut}</p>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-btn bg-surface-2 py-3 text-small font-semibold">📋 Copier</button>
          <button className="flex-1 rounded-btn bg-brand py-3 text-small font-bold text-black">↩️ Rembourser</button>
        </div>
      </div>
    </div>
  );
}

function L({ t, v, mono }: { t: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className={`font-semibold tabnums ${mono ? "font-mono text-small" : ""}`}>{v}</dd>
    </div>
  );
}
