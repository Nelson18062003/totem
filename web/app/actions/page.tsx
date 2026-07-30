"use client";

import Link from "next/link";
import { useState } from "react";
import { Flux, FluxGuide, montantFcfa } from "./flux";

// Définition des trois opérations guidées (simulation de maquette).
function fluxEnvoyer(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Envoyer de l’argent",
    icone: "💸",
    operateur: op,
    champs: [
      { cle: "numero", label: "Numéro du bénéficiaire", type: "numero", aide: "677 12 34 56" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "50 000" },
      { cle: "motif", label: "Motif (facultatif)", type: "texte", aide: "Ex. remboursement", facultatif: true },
    ],
    recap: (v) => [
      { label: "Bénéficiaire", valeur: v.numero },
      { label: "Montant", valeur: montantFcfa(v.montant) },
      { label: "Frais estimés", valeur: montantFcfa(String(Math.max(100, Math.round((parseInt(v.montant.replace(/\D/g, "") || "0") ) / 100)))) },
    ],
    succes: (v) => `Transfert de ${montantFcfa(v.montant)}\nvers ${v.numero} réussi.`,
  };
}

function fluxRetrait(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Retrait d’argent",
    icone: "🏧",
    operateur: op,
    champs: [
      { cle: "point", label: "Numéro du point de retrait / agent", type: "numero", aide: "650 00 00 00" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "20 000" },
    ],
    recap: (v) => [
      { label: "Agent", valeur: v.point },
      { label: "Montant", valeur: montantFcfa(v.montant) },
    ],
    succes: (v) => `Retrait de ${montantFcfa(v.montant)}\nautorisé chez ${v.point}.`,
  };
}

function fluxCredit(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Acheter du crédit",
    icone: "📱",
    operateur: op,
    champs: [
      { cle: "numero", label: "Numéro à recharger", type: "numero", aide: "677 12 34 56" },
      { cle: "montant", label: "Montant du crédit (FCFA)", type: "montant", aide: "1 000" },
    ],
    recap: (v) => [
      { label: "Numéro", valeur: v.numero },
      { label: "Crédit", valeur: montantFcfa(v.montant) },
    ],
    succes: (v) => `Crédit de ${montantFcfa(v.montant)}\nenvoyé au ${v.numero}.`,
  };
}

export default function Actions() {
  const [op, setOp] = useState<"MTN" | "Orange">("MTN");
  const [flux, setFlux] = useState<Flux | null>(null);

  const cartes = [
    { titre: "Envoyer", sous: "Transférer à un numéro", icone: "💸", f: fluxEnvoyer },
    { titre: "Retrait", sous: "Chez un agent", icone: "🏧", f: fluxRetrait },
    { titre: "Crédit", sous: "Recharge téléphone", icone: "📱", f: fluxCredit },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-title font-bold">Actions</h1>
          <p className="text-small text-ink-soft">Opérations guidées — sans taper les codes.</p>
        </div>
        <div className="flex rounded-pill border border-line p-0.5">
          {(["MTN", "Orange"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOp(o)}
              className={`rounded-pill px-3 py-1 text-small font-semibold transition ${
                op === o ? "bg-brand text-black" : "text-ink-soft"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </header>

      {/* Cartes d'action */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cartes.map((c) => (
          <button
            key={c.titre}
            onClick={() => setFlux(c.f(op))}
            className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4 text-left transition hover:border-brand sm:flex-col sm:items-start"
          >
            <span className="grid size-11 place-items-center rounded-btn bg-brand-soft text-2xl">{c.icone}</span>
            <div>
              <p className="font-bold">{c.titre}</p>
              <p className="text-caption text-ink-soft">{c.sous}</p>
            </div>
          </button>
        ))}
      </section>

      {/* Consultation rapide */}
      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="mb-2 text-heading font-bold">Consultation</h2>
        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-btn border border-line py-3 text-small font-semibold hover:border-brand">
            💰 Consulter le solde
          </button>
          <button className="rounded-btn border border-line py-3 text-small font-semibold hover:border-brand">
            🧾 Dernières transactions
          </button>
        </div>
      </section>

      {/* Repli : console USSD brute */}
      <Link
        href="/console"
        className="rounded-card border border-dashed border-line p-4 text-center text-small text-ink-soft transition hover:border-brand hover:text-ink"
      >
        ⌨️ Besoin d’un code particulier ? Ouvrir la console USSD brute
      </Link>

      {flux && <FluxGuide flux={flux} onFermer={() => setFlux(null)} />}
    </div>
  );
}
