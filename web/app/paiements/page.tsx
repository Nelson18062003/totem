"use client";

import { useState } from "react";
import { fcfa, paiements } from "@/lib/mock";

export default function Paiements() {
  const [filtre, setFiltre] = useState<"Tous" | "MTN" | "Orange">("Tous");
  const liste = paiements.filter((p) => filtre === "Tous" || p.sim === filtre);
  const total = liste.reduce((s, p) => s + p.montant, 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-title font-bold">Paiements reçus</h1>
        <p className="text-small text-ink-soft">
          Chaque SMS « Vous avez reçu… » apparaît ici, horodaté.
        </p>
      </header>

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
        <p className="text-small text-ink-soft">Total ({filtre.toLowerCase()})</p>
        <p className="text-title font-bold tabular-nums">{fcfa(total)}</p>
      </div>

      {/* Liste */}
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
        {liste.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3.5">
            <span
              className={`grid size-10 place-items-center rounded-full text-caption font-bold ${
                p.sim === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
              }`}
            >
              {p.sim === "MTN" ? "M" : "O"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.nom}</p>
              <p className="text-caption text-ink-soft">
                {p.numero} · aujourd’hui {p.heure}
              </p>
            </div>
            <span className="font-bold tabular-nums text-success">+{fcfa(p.montant)}</span>
          </li>
        ))}
      </ul>

      <button className="rounded-btn border border-line bg-surface-raised py-3 text-small font-semibold text-ink-soft hover:border-brand">
        ⬇️ Exporter en Excel (pour le comptable)
      </button>
    </div>
  );
}
