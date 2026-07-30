"use client";

import { useMemo, useState } from "react";
import { fcfa, paiements, type Paiement } from "@/lib/mock";

export default function Paiements() {
  const [filtre, setFiltre] = useState<"Tous" | "MTN" | "Orange">("Tous");
  const [recherche, setRecherche] = useState("");
  const [detail, setDetail] = useState<Paiement | null>(null);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase().replace(/\s/g, "");
    return paiements.filter((p) => {
      if (filtre !== "Tous" && p.sim !== filtre) return false;
      if (!q) return true;
      return (
        p.nom.toLowerCase().includes(q) ||
        p.numero.replace(/\s/g, "").includes(q) ||
        String(p.montant).includes(q) ||
        p.reference.toLowerCase().includes(q)
      );
    });
  }, [filtre, recherche]);

  const total = liste.reduce((s, p) => s + p.montant, 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-title font-bold">Paiements reçus</h1>
        <p className="text-small text-ink-soft">Chaque SMS « Vous avez reçu… » apparaît ici, horodaté.</p>
      </header>

      {/* Recherche */}
      <div className="flex items-center gap-2 rounded-btn border border-line bg-surface-raised px-3">
        <span className="text-ink-soft">🔎</span>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un nom, numéro, montant, référence…"
          className="flex-1 bg-transparent py-3 text-body outline-none placeholder:text-ink-soft"
        />
        {recherche && (
          <button onClick={() => setRecherche("")} className="text-ink-soft">✕</button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {(["Tous", "MTN", "Orange"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            className={`rounded-pill px-4 py-1.5 text-small font-semibold transition ${
              filtre === f ? "bg-brand text-black" : "border border-line bg-surface-raised text-ink-soft"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Total filtré */}
      <div className="rounded-card border border-line bg-surface-raised p-4">
        <p className="text-small text-ink-soft">
          Total ({filtre.toLowerCase()}{recherche ? `, « ${recherche} »` : ""}) — {liste.length} résultat(s)
        </p>
        <p className="text-title font-bold tabular-nums">{fcfa(total)}</p>
      </div>

      {/* Liste */}
      {liste.length === 0 ? (
        <p className="rounded-card border border-line bg-surface-raised p-6 text-center text-ink-soft">
          Aucun paiement ne correspond.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
          {liste.map((p) => (
            <li key={p.id}>
              <button onClick={() => setDetail(p)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-sunken">
                <span
                  className={`grid size-10 place-items-center rounded-full text-caption font-bold ${
                    p.sim === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
                  }`}
                >
                  {p.sim === "MTN" ? "M" : "O"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.nom}</p>
                  <p className="text-caption text-ink-soft">{p.numero} · {p.date} {p.heure}</p>
                </div>
                <span className="font-bold tabular-nums text-success">+{fcfa(p.montant)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="rounded-btn border border-line bg-surface-raised py-3 text-small font-semibold text-ink-soft hover:border-brand">
        ⬇️ Exporter en Excel (pour le comptable)
      </button>

      {/* Fiche détail */}
      {detail && <FicheDetail p={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}

function FicheDetail({ p, onFermer }: { p: Paiement; onFermer: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 md:items-center md:p-4" onClick={onFermer}>
      <div
        className="w-full max-w-md rounded-t-card border border-line bg-surface-raised p-5 md:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`grid size-10 place-items-center rounded-full text-caption font-bold ${
              p.sim === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
            }`}
          >
            {p.sim === "MTN" ? "M" : "O"}
          </span>
          <div>
            <h2 className="text-heading font-bold">{p.nom}</h2>
            <p className="text-caption text-ink-soft">{p.sim} Money</p>
          </div>
          <button onClick={onFermer} className="ml-auto text-ink-soft">✕</button>
        </div>

        <p className="text-display font-bold tabular-nums text-success">+{fcfa(p.montant)}</p>

        <dl className="mt-4 divide-y divide-line rounded-card border border-line">
          <Ligne t="Numéro" v={p.numero} />
          <Ligne t="Date & heure" v={`${p.date} à ${p.heure}`} />
          <Ligne t="Référence" v={p.reference} mono />
          <Ligne t="Solde après" v={fcfa(p.soldeApres)} />
        </dl>

        <div className="mt-4">
          <p className="mb-1 text-caption text-ink-soft">SMS reçu (preuve) :</p>
          <p className="rounded-card border border-line bg-surface-sunken p-3 text-small">{p.smsBrut}</p>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-btn border border-line py-2.5 text-small font-semibold hover:border-brand">
            📋 Copier la preuve
          </button>
          <button className="flex-1 rounded-btn border border-line py-2.5 text-small font-semibold hover:border-brand">
            ↩️ Rembourser
          </button>
        </div>
      </div>
    </div>
  );
}

function Ligne({ t, v, mono }: { t: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className={`font-semibold tabular-nums ${mono ? "font-mono text-small" : ""}`}>{v}</dd>
    </div>
  );
}
