"use client";

import { useState } from "react";
import { fcfa, type Paiement } from "@/lib/types";
import { FicheSms } from "./fiche-sms";
import { IconArrowDown, IconArrowUp, IconDoc } from "./icons";

/**
 * Les derniers SMS de l'accueil — cliquables, comme dans la boîte de
 * réception. Un appui ouvre LA même fiche : le message en entier, sa nature
 * (qui établit le reçu), la copie du texte, le reçu PDF. Pas besoin de
 * passer par « Tout voir » pour agir sur un message qu'on a sous les yeux.
 */
export function DerniersSms({ paiements }: { paiements: Paiement[] }) {
  const [detail, setDetail] = useState<Paiement | null>(null);

  return (
    <>
      <ul className="divide-hair">
        {paiements.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3.5">
            <button onClick={() => setDetail(p)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-70">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                {p.sens === "in" ? <IconArrowDown size={16} /> : p.sens === "out" ? <IconArrowUp size={16} /> : "·"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{p.nom}</span>
                <span className="block truncate text-small text-ink-faint">{p.sim} · {p.heure} · {p.smsBrut}</span>
              </span>
              {p.montant != null && (
                <span className={`shrink-0 text-body font-medium tabnums ${p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"}`}>
                  {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant)}
                </span>
              )}
            </button>
            {/* Le reçu PDF, à portée de main quand il existe — comme dans la
                boîte de réception. */}
            {p.recu && (
              <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
                title="Télécharger le reçu PDF"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink hover:text-ink">
                <IconDoc size={16} />
              </a>
            )}
          </li>
        ))}
      </ul>

      {detail && <FicheSms p={detail} onFermer={() => setDetail(null)} />}
    </>
  );
}
