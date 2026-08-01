"use client";

import { useState } from "react";
import { fcfa } from "@/lib/types";
import { IconRefresh } from "./icons";

type Etat = "repos" | "envoi" | "lent" | "erreur";

/**
 * Le solde connu, et de quand il date. Un solde n'est jamais « en direct » :
 * il vient du dernier SMS, ou d'une interrogation réseau. Actualiser dépose
 * une vraie demande dans la base ; le terminal de Douala la relève, republie
 * son état, et la page se recharge sur des données fraîches.
 */
export function Solde({
  libelle,
  solde,
  source,
}: {
  libelle: string;
  solde: number | null;
  source: string;
}) {
  const [etat, setEtat] = useState<Etat>("repos");

  const actualiser = async () => {
    if (etat === "envoi") return;
    setEtat("envoi");
    try {
      const r = await fetch("/api/commande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "solde", parametres: {} }),
      });
      if (!r.ok) throw new Error();
      const { id } = (await r.json()) as { id: number };
      for (let i = 0; i < 10; i++) {
        await new Promise((res) => setTimeout(res, 1300));
        const c = await fetch(`/api/commande/${id}`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (c && (c.etat === "faite" || c.etat === "echouee")) {
          window.location.reload();
          return;
        }
      }
      setEtat("lent");
    } catch {
      setEtat("erreur");
    }
  };

  return (
    <section className="lg:col-start-1">
      <p className="text-small text-ink-soft">Solde · {libelle}</p>
      <div className="mt-1 flex items-center gap-3">
        <p className="text-hero font-semibold tabnums tracking-tight">
          {solde == null ? "—" : fcfa(solde)}
        </p>
        <button
          onClick={actualiser}
          aria-label="Actualiser : demander au terminal de republier son état"
          title="Demander au terminal de republier son état"
          className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink-faint hover:text-ink"
        >
          <IconRefresh size={16} className={etat === "envoi" ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="mt-1.5 text-small text-ink-soft">
        {etat === "envoi"
          ? "Demande envoyée au terminal de Douala…"
          : etat === "lent"
            ? "Le terminal n’a pas encore répondu — il relève ses demandes toutes les quelques secondes. Rechargez dans un instant."
            : etat === "erreur"
              ? "La demande n’a pas pu partir. Réessayez."
              : solde == null
                ? "Aucun solde connu pour l’instant : interrogez le réseau depuis Code USSD → Solde."
                : `D’après ${source}`}
      </p>
    </section>
  );
}
