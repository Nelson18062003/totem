"use client";

import { useState } from "react";
import { IconArrowUp, IconBank, IconChevron, IconList, IconPhone, IconWallet } from "../icons";
import { Flux, FluxGuide, montantFcfa } from "./flux";

function fluxEnvoyer(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Envoyer de l’argent", operateur: op,
    champs: [
      { cle: "numero", label: "Numéro du bénéficiaire", type: "numero", aide: "677 12 34 56" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "50 000" },
      { cle: "motif", label: "Motif", type: "texte", aide: "Facultatif", facultatif: true },
    ],
    recap: (v) => [
      { label: "Bénéficiaire", valeur: v.numero },
      { label: "Montant", valeur: montantFcfa(v.montant) },
      { label: "Frais estimés", valeur: montantFcfa(String(Math.max(100, Math.round(parseInt(v.montant.replace(/\D/g, "") || "0") / 100)))) },
    ],
    succes: (v) => `Transfert de ${montantFcfa(v.montant)} vers ${v.numero} effectué.`,
  };
}
function fluxRetrait(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Retrait d’argent", operateur: op,
    champs: [
      { cle: "point", label: "Numéro de l’agent", type: "numero", aide: "650 00 00 00" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "20 000" },
    ],
    recap: (v) => [
      { label: "Agent", valeur: v.point },
      { label: "Montant", valeur: montantFcfa(v.montant) },
    ],
    succes: (v) => `Retrait de ${montantFcfa(v.montant)} autorisé chez ${v.point}.`,
  };
}
function fluxCredit(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Acheter du crédit", operateur: op,
    champs: [
      { cle: "numero", label: "Numéro à recharger", type: "numero", aide: "677 12 34 56" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "1 000" },
    ],
    recap: (v) => [
      { label: "Numéro", valeur: v.numero },
      { label: "Crédit", valeur: montantFcfa(v.montant) },
    ],
    succes: (v) => `Crédit de ${montantFcfa(v.montant)} envoyé au ${v.numero}.`,
  };
}

export default function Operations() {
  const [op, setOp] = useState<"MTN" | "Orange">("MTN");
  const [flux, setFlux] = useState<Flux | null>(null);

  const operations = [
    { titre: "Envoyer de l’argent", sous: "Vers un numéro Mobile Money", Icone: IconArrowUp, f: fluxEnvoyer },
    { titre: "Retrait", sous: "Chez un agent", Icone: IconWallet, f: fluxRetrait },
    { titre: "Acheter du crédit", sous: "Recharge téléphonique", Icone: IconPhone, f: fluxCredit },
  ];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-title font-semibold tracking-tight">Opérations</h1>
          <p className="mt-1 text-small text-ink-soft">Sans composer de code USSD.</p>
        </div>
        <div className="flex rounded-btn border border-line bg-surface-raised p-0.5">
          {(["MTN", "Orange"] as const).map((o) => (
            <button key={o} onClick={() => setOp(o)}
              className={`rounded-sm px-3 py-1.5 text-small transition ${
                op === o ? "bg-ink font-medium text-white" : "text-ink-soft hover:text-ink"
              }`}>{o}</button>
          ))}
        </div>
      </header>

      {/* Opérations */}
      <section className="overflow-hidden rounded-card border border-line bg-surface-raised">
        <ul className="divide-hair">
          {operations.map(({ titre, sous, Icone, f }) => (
            <li key={titre}>
              <button onClick={() => setFlux(f(op))}
                className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition hover:bg-surface-2/60">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                  <Icone size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-body font-medium">{titre}</p>
                  <p className="text-small text-ink-faint">{sous}</p>
                </div>
                <IconChevron size={16} className="text-ink-faint" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Consultation */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">Consultation</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: "Consulter le solde", Icone: IconBank },
            { l: "Dernières transactions", Icone: IconList },
          ].map(({ l, Icone }) => (
            <button key={l}
              className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
              <Icone size={18} className="text-ink-soft" />
              <span className="text-left leading-snug">{l}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="text-caption leading-relaxed text-ink-faint">
        Le code PIN n’est jamais enregistré : il est saisi à chaque opération, transmis au réseau,
        puis effacé.
      </p>

      {flux && <FluxGuide flux={flux} onFermer={() => setFlux(null)} />}
    </div>
  );
}
