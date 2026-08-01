"use client";

import { useState } from "react";
import { fcfa } from "@/lib/types";
import { IconRefresh } from "./icons";

/**
 * Le solde connu, et de quand il date. Le solde n'existe pas « en direct » :
 * la carte ne le connaît que par le dernier SMS, ou en interrogeant le réseau.
 * Actualiser demandera au terminal de composer le code du solde sur la SIM
 * (canal de commandes — la table est prête, le branchement arrive).
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
  const [interrogation, setInterrogation] = useState<"repos" | "en_cours">("repos");

  const actualiser = () => {
    if (interrogation === "en_cours") return;
    setInterrogation("en_cours");
    // Le canal de commandes n'est pas encore branché : on recharge simplement
    // la page, qui relit la base — sans prétendre avoir interrogé le réseau.
    setTimeout(() => window.location.reload(), 900);
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
          aria-label="Relire le solde"
          title="Relire le solde depuis la base"
          className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink-faint hover:text-ink"
        >
          <IconRefresh size={16} className={interrogation === "en_cours" ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="mt-1.5 text-small text-ink-soft">
        {interrogation === "en_cours"
          ? "Relecture de la base…"
          : solde == null
            ? "Aucun solde connu pour l’instant."
            : `D’après ${source}`}
      </p>
    </section>
  );
}
