"use client";

import Link from "next/link";
import { useState } from "react";
import { codeUssd, simsEnPlace } from "@/lib/mock";
import {
  IconArrowDown, IconArrowUp, IconChevron, IconHash,
  IconInbox, IconPhone, IconWallet,
} from "../icons";
import { Flux, FluxGuide, montantFcfa } from "./flux";

// Les codes composés viennent du catalogue relevé sur le terrain (codes.py) :
// rien n'est deviné. Chaque code n'ouvre que le guichet — l'opérateur redemande
// ensuite le détail, et le code secret se compose sur Telegram.
function fluxTransfert(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Transfert d’argent", operateur: op, code: codeUssd(op, "transfert"),
    champs: [
      { cle: "numero", label: "Numéro du bénéficiaire", type: "numero", aide: "699 12 34 56" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "50 000" },
    ],
    recap: (v) => [
      { label: "Bénéficiaire", valeur: v.numero },
      { label: "Montant", valeur: montantFcfa(v.montant) },
    ],
  };
}
function fluxDepot(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Dépôt d’argent", operateur: op, code: codeUssd(op, "depot"),
    champs: [
      { cle: "numero", label: "Numéro à créditer", type: "numero", aide: "699 12 34 56" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "20 000" },
    ],
    recap: (v) => [
      { label: "Numéro", valeur: v.numero },
      { label: "Montant", valeur: montantFcfa(v.montant) },
    ],
  };
}
function fluxRetrait(op: "MTN" | "Orange"): Flux {
  return {
    titre: "Retrait d’argent", operateur: op, code: codeUssd(op, "retrait"),
    champs: [
      { cle: "point", label: "Numéro de l’agent", type: "numero", aide: "650 00 00 00" },
      { cle: "montant", label: "Montant (FCFA)", type: "montant", aide: "20 000" },
    ],
    recap: (v) => [
      { label: "Agent", valeur: v.point },
      { label: "Montant", valeur: montantFcfa(v.montant) },
    ],
  };
}

export default function Operations() {
  const carte = simsEnPlace[0];
  const op = carte.operateur;
  const [flux, setFlux] = useState<Flux | null>(null);
  const [demande, setDemande] = useState<string | null>(null);

  const operations = [
    { titre: "Dépôt", sous: "Créditer un compte Mobile Money", Icone: IconArrowDown, f: fluxDepot },
    { titre: "Retrait", sous: "Chez un agent", Icone: IconWallet, f: fluxRetrait },
    { titre: "Transfert", sous: "Envoyer vers un numéro", Icone: IconArrowUp, f: fluxTransfert },
  ];

  // Les consultations n'engagent pas d'argent : un seul geste, le terminal
  // compose le code, la réponse revient ici et sur Telegram.
  const consultations = [
    { l: "Consulter le solde", code: codeUssd(op, "solde"), Icone: IconWallet },
    { l: "Mon numéro", code: codeUssd(op, "mon_numero"), Icone: IconPhone },
  ];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-title font-semibold tracking-tight">Opérations</h1>
          <p className="mt-1 text-small text-ink-soft">Sans composer de code USSD.</p>
        </div>
        <span className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft">
          {carte.libelle}
        </span>
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
          {consultations.map(({ l, code, Icone }) => (
            <button key={l} onClick={() => setDemande(code)}
              className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
              <Icone size={18} className="text-ink-soft" />
              <span className="text-left leading-snug">{l}</span>
            </button>
          ))}
        </div>
        {demande && (
          <p className="mt-3 rounded-card bg-surface-2 px-4 py-3 text-small leading-relaxed text-ink-soft">
            Demande envoyée au terminal : il compose{" "}
            <span className="tabnums font-medium text-ink">{demande}</span> sur la
            carte. La réponse s’affichera ici et sur Telegram.
          </p>
        )}
      </section>

      {/* Le reste du guichet */}
      <section className="grid grid-cols-2 gap-2">
        {[
          { href: "/sms", l: "SMS reçus", Icone: IconInbox },
          { href: "/ussd", l: "Code USSD", Icone: IconHash },
        ].map(({ href, l, Icone }) => (
          <Link key={l} href={href}
            className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
            <Icone size={18} className="text-ink-soft" />
            <span className="text-left leading-snug">{l}</span>
          </Link>
        ))}
      </section>

      <p className="text-caption leading-relaxed text-ink-faint">
        Le code secret ne se saisit jamais dans le navigateur : chaque opération
        se conclut sur le pavé sécurisé de Telegram, et n’est enregistrée nulle
        part.
      </p>

      {flux && <FluxGuide flux={flux} onFermer={() => setFlux(null)} />}
    </div>
  );
}
