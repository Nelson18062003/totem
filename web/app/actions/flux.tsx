"use client";

import { useState } from "react";
import { fcfa } from "@/lib/mock";

// Un champ d'un flux guidé.
export type Champ = {
  cle: string;
  label: string;
  type: "numero" | "montant" | "texte";
  aide?: string;
  facultatif?: boolean;
};

export type Flux = {
  titre: string;
  icone: string;
  operateur: "MTN" | "Orange";
  champs: Champ[];
  // Construit la ligne de récapitulatif à confirmer avant le PIN.
  recap: (v: Record<string, string>) => { label: string; valeur: string }[];
  // Message de succès simulé.
  succes: (v: Record<string, string>) => string;
};

type Etape = "saisie" | "recap" | "pin" | "fait";

export function FluxGuide({ flux, onFermer }: { flux: Flux; onFermer: () => void }) {
  const [etape, setEtape] = useState<Etape>("saisie");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = flux.champs.every(
    (c) => c.facultatif || (valeurs[c.cle] ?? "").trim().length > 0,
  );

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4">
      <div className="w-full max-w-md rounded-t-card border border-line bg-surface-raised p-5 md:rounded-card">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xl">{flux.icone}</span>
          <h2 className="text-heading font-bold">{flux.titre}</h2>
          <span
            className={`ml-auto rounded-pill px-2.5 py-1 text-caption font-bold ${
              flux.operateur === "MTN" ? "bg-[#ffcc00] text-black" : "bg-[#ff6600] text-white"
            }`}
          >
            {flux.operateur}
          </span>
        </div>

        {etape === "saisie" && (
          <div className="flex flex-col gap-3">
            {flux.champs.map((c) => (
              <label key={c.cle} className="flex flex-col gap-1">
                <span className="text-small text-ink-soft">{c.label}</span>
                <input
                  value={valeurs[c.cle] ?? ""}
                  onChange={(e) => set(c.cle, e.target.value)}
                  inputMode={c.type === "texte" ? "text" : "numeric"}
                  placeholder={c.aide}
                  className="rounded-btn border border-line bg-surface-sunken px-4 py-3 text-body outline-none focus:border-brand"
                />
              </label>
            ))}
            <div className="mt-2 flex gap-2">
              <button onClick={onFermer} className="flex-1 rounded-btn border border-line py-3 font-semibold text-ink-soft">
                Annuler
              </button>
              <button
                disabled={!complet}
                onClick={() => setEtape("recap")}
                className="flex-1 rounded-btn bg-brand py-3 font-bold text-black disabled:opacity-40"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {etape === "recap" && (
          <div className="flex flex-col gap-3">
            <p className="text-small text-ink-soft">Vérifiez avant de confirmer :</p>
            <dl className="divide-y divide-line rounded-card border border-line">
              {flux.recap(valeurs).map((r) => (
                <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                  <dt className="text-small text-ink-soft">{r.label}</dt>
                  <dd className="font-semibold tabular-nums">{r.valeur}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEtape("saisie")} className="flex-1 rounded-btn border border-line py-3 font-semibold text-ink-soft">
                Modifier
              </button>
              <button onClick={() => setEtape("pin")} className="flex-1 rounded-btn bg-brand py-3 font-bold text-black">
                Confirmer
              </button>
            </div>
          </div>
        )}

        {etape === "pin" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pin.length >= 4) setEtape("fait");
            }}
            className="flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-small text-ink-soft">Entrez votre code PIN MoMo</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                type="password"
                inputMode="numeric"
                maxLength={5}
                autoFocus
                className="rounded-btn border border-line bg-surface-sunken px-4 py-3 text-center text-title tracking-[0.5em] outline-none focus:border-brand"
              />
            </label>
            <p className="text-center text-caption text-ink-soft">
              🔒 Le PIN n’est jamais enregistré — effacé aussitôt envoyé.
            </p>
            <button type="submit" disabled={pin.length < 4} className="rounded-btn bg-brand py-3 font-bold text-black disabled:opacity-40">
              Valider l’opération
            </button>
          </form>
        )}

        {etape === "fait" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-success-soft text-3xl">✅</span>
            <p className="whitespace-pre-line font-semibold">{flux.succes(valeurs)}</p>
            <button onClick={onFermer} className="mt-2 w-full rounded-btn bg-brand py-3 font-bold text-black">
              Terminé
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Montant formaté pour les récaps.
export const montantFcfa = (v: string) => fcfa(parseInt(v.replace(/\D/g, "") || "0", 10));
