"use client";

import { useState } from "react";
import { fcfa } from "@/lib/mock";
import { IconClose } from "../icons";

export type Champ = {
  cle: string;
  label: string;
  type: "numero" | "montant" | "texte";
  aide?: string;
  facultatif?: boolean;
};

export type Flux = {
  titre: string;
  operateur: "MTN" | "Orange";
  champs: Champ[];
  recap: (v: Record<string, string>) => { label: string; valeur: string }[];
  succes: (v: Record<string, string>) => string;
};

type Etape = "saisie" | "recap" | "pin" | "fait";

export function FluxGuide({ flux, onFermer }: { flux: Flux; onFermer: () => void }) {
  const [etape, setEtape] = useState<Etape>("saisie");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = flux.champs.every((c) => c.facultatif || (valeurs[c.cle] ?? "").trim().length > 0);

  const etapeNum = { saisie: 1, recap: 2, pin: 3, fait: 3 }[etape];

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4" onClick={onFermer}>
      <div className="w-full max-w-md rounded-t-card border border-line bg-surface-raised p-6 md:rounded-card"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-caption uppercase tracking-wider text-ink-faint">
              {flux.operateur} · Étape {etapeNum} sur 3
            </p>
            <h2 className="mt-1 text-heading font-semibold">{flux.titre}</h2>
          </div>
          <button onClick={onFermer} className="text-ink-faint transition hover:text-ink"><IconClose size={18} /></button>
        </div>

        {etape === "saisie" && (
          <div className="flex flex-col gap-4">
            {flux.champs.map((c) => (
              <label key={c.cle} className="flex flex-col gap-1.5">
                <span className="text-small text-ink-soft">{c.label}</span>
                <input value={valeurs[c.cle] ?? ""} onChange={(e) => set(c.cle, e.target.value)}
                  inputMode={c.type === "texte" ? "text" : "numeric"} placeholder={c.aide}
                  className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-body outline-none transition placeholder:text-ink-faint focus:border-ink" />
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <button onClick={onFermer} className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                Annuler
              </button>
              <button disabled={!complet} onClick={() => setEtape("recap")}
                className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                Continuer
              </button>
            </div>
          </div>
        )}

        {etape === "recap" && (
          <div className="flex flex-col gap-4">
            <dl className="divide-hair">
              {flux.recap(valeurs).map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2.5">
                  <dt className="text-small text-ink-soft">{r.label}</dt>
                  <dd className="text-small font-medium tabnums">{r.valeur}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2">
              <button onClick={() => setEtape("saisie")} className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                Modifier
              </button>
              <button onClick={() => setEtape("pin")} className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
                Confirmer
              </button>
            </div>
          </div>
        )}

        {etape === "pin" && (
          <form onSubmit={(e) => { e.preventDefault(); if (pin.length >= 4) setEtape("fait"); }}
            className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-small text-ink-soft">Code PIN Mobile Money</span>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                type="password" inputMode="numeric" maxLength={5} autoFocus
                className="rounded-btn border border-line bg-surface-raised px-3.5 py-2.5 text-center text-title tracking-[0.4em] outline-none transition focus:border-ink" />
            </label>
            <p className="text-caption leading-relaxed text-ink-faint">
              Le code est transmis au réseau puis effacé. Il n’est jamais enregistré.
            </p>
            <button type="submit" disabled={pin.length < 4}
              className="rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
              Valider
            </button>
          </form>
        )}

        {etape === "fait" && (
          <div className="flex flex-col gap-5 py-2">
            <p className="text-body leading-relaxed">{flux.succes(valeurs)}</p>
            <button onClick={onFermer} className="rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
              Terminé
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const montantFcfa = (v: string) => fcfa(parseInt(v.replace(/\D/g, "") || "0", 10));
