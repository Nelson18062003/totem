"use client";

import { useEffect, useState } from "react";
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
  // Ce que le terminal va composer sur la vraie SIM (le code du guichet).
  code: string;
};

// Le code secret ne se saisit jamais ici : rien de ce qui passe par le
// navigateur et le cloud ne doit pouvoir rejouer une opération. La demande
// part au terminal, et c'est le pavé sécurisé de Telegram qui conclut.
type Etape = "saisie" | "recap" | "transmis";

export function FluxGuide({ flux, onFermer }: { flux: Flux; onFermer: () => void }) {
  const [etape, setEtape] = useState<Etape>("saisie");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = flux.champs.every((c) => c.facultatif || (valeurs[c.cle] ?? "").trim().length > 0);

  const etapeNum = { saisie: 1, recap: 2, transmis: 3 }[etape];

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
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-small text-ink-soft">Frais</dt>
                <dd className="text-small text-ink-faint">indiqués par {flux.operateur} avant le code secret</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <button onClick={() => setEtape("saisie")} className="flex-1 rounded-btn border border-line py-2.5 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                Modifier
              </button>
              <button onClick={() => setEtape("transmis")} className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
                Envoyer au terminal
              </button>
            </div>
          </div>
        )}

        {etape === "transmis" && <Parcours flux={flux} onFermer={onFermer} />}
      </div>
    </div>
  );
}

/**
 * Le parcours réel d'une demande, étape par étape. La maquette avance seule
 * jusqu'au moment du code secret : là, c'est Telegram qui a la main — le
 * navigateur ne fait qu'attendre le SMS de confirmation.
 */
function Parcours({ flux, onFermer }: { flux: Flux; onFermer: () => void }) {
  const etapes = [
    "La demande part au terminal de Douala",
    `Le terminal compose ${flux.code} sur la carte`,
    "Il répond aux questions du menu avec vos informations",
    "Le code secret se compose sur Telegram — jamais ici",
    "Le SMS de confirmation arrive, avec son reçu",
  ];

  // La frise avance jusqu'à l'étape Telegram, puis attend.
  const [rendue, setRendue] = useState(0);
  useEffect(() => {
    if (rendue >= 3) return;
    const t = setTimeout(() => setRendue((r) => r + 1), 1100);
    return () => clearTimeout(t);
  }, [rendue]);

  return (
    <div className="flex flex-col gap-5 py-1">
      <ol className="flex flex-col gap-3.5">
        {etapes.map((texte, i) => {
          const faite = i < rendue;
          const enCours = i === rendue;
          return (
            <li key={i} className="flex items-start gap-3">
              <span
                className={`mt-1 size-2.5 shrink-0 rounded-full ${
                  faite ? "bg-ink" : enCours ? "animate-pulse bg-ink" : "bg-surface-3"
                }`}
              />
              <span
                className={`text-small leading-relaxed ${
                  faite ? "text-ink" : enCours ? "font-medium text-ink" : "text-ink-faint"
                }`}
              >
                {texte}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-caption leading-relaxed text-ink-faint">
        {rendue >= 3
          ? "Le terminal attend le code secret sur le pavé Telegram. Vous pouvez fermer : la confirmation apparaîtra dans les SMS reçus."
          : "La demande suit son chemin — rien de secret ne passe par le navigateur."}
      </p>
      <button onClick={onFermer} className="rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
        Compris
      </button>
    </div>
  );
}

export const montantFcfa = (v: string) => fcfa(parseInt(v.replace(/\D/g, "") || "0", 10));
