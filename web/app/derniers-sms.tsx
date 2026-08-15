"use client";

import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import { fcfa, type Paiement } from "@/lib/types";
import { catDe, CatIcone, classeCat, FicheSms, texteSurEcran } from "./fiche-sms";
import { IconDoc } from "./icons";

/**
 * Les derniers SMS de l'accueil — cliquables, comme dans la boîte de
 * réception. Un appui ouvre LA même fiche : le message en entier, sa nature
 * (qui établit le reçu), la copie du texte, le reçu PDF. Pas besoin de
 * passer par « Tout voir » pour agir sur un message qu'on a sous les yeux.
 */
export function DerniersSms({ paiements }: { paiements: Paiement[] }) {
  const langue = useLangue();
  const t = textesCharpente[langue];
  const [detail, setDetail] = useState<Paiement | null>(null);

  return (
    <>
      <ul className="divide-hair">
        {paiements.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3.5">
            <button onClick={() => setDetail(p)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-70">
              {/* L'étiquette de la catégorie, comme dans la boîte : plus
                  jamais de point orphelin quand le sens est inconnu. */}
              <span className={`grid size-9 shrink-0 place-items-center rounded-btn ${classeCat(catDe(p))}`}>
                <CatIcone c={catDe(p)} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-body font-medium">
                  {/* Le point plein = pas encore ouvert, comme dans la boîte. */}
                  {p.nonLu && (
                    <span aria-label={t.nonLu}
                      className="size-1.5 shrink-0 rounded-full bg-ink" />
                  )}
                  <span className="truncate">{p.montant != null ? (p.tiers || p.nom) : p.nom}</span>
                </span>
                <span dir="auto" className="block truncate text-small text-ink-faint">{p.sim} · {p.heure} · {texteSurEcran(p)}</span>
              </span>
              {p.montant != null && (
                <span className={`shrink-0 text-body font-medium tabnums ${p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"}`}>
                  {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
                </span>
              )}
            </button>
            {/* Le reçu PDF, à portée de main quand il existe — comme dans la
                boîte de réception. */}
            {p.recu && (
              <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
                title={t.telechargerRecu}
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
