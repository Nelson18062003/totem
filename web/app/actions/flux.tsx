"use client";

import { useEffect, useState } from "react";
import { fcfa } from "@/lib/types";
import { IconClose } from "../icons";
import { PaveSecret } from "../pave-secret";

export type Champ = {
  cle: string;
  label: string;
  type: "numero" | "montant" | "texte";
  aide?: string;
  facultatif?: boolean;
};

export type Flux = {
  titre: string;
  operateur: string;
  champs: Champ[];
  recap: (v: Record<string, string>) => { label: string; valeur: string }[];
  // Ce que le terminal compose sur la vraie SIM (le code du guichet).
  code: string;
  // La session telle que le réseau la déroule : chaque question du menu, et
  // la réponse que le terminal donne à votre place avec vos informations.
  dialogue: (v: Record<string, string>) => { demande: string; reponse: string }[];
  // La question qui appelle le code secret — le pavé s'ouvre à ce moment-là.
  confirmation: (v: Record<string, string>) => string;
  // La réponse finale du réseau, une fois le code validé.
  succes: (v: Record<string, string>) => string;
};

type Etape = "saisie" | "recap" | "session";

export function FluxGuide({ flux, onFermer }: { flux: Flux; onFermer: () => void }) {
  const [etape, setEtape] = useState<Etape>("saisie");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});

  const set = (cle: string, val: string) => setValeurs((v) => ({ ...v, [cle]: val }));
  const complet = flux.champs.every((c) => c.facultatif || (valeurs[c.cle] ?? "").trim().length > 0);

  const etapeNum = { saisie: 1, recap: 2, session: 3 }[etape];

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/25 md:items-center md:p-4" onClick={onFermer}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-card border border-line bg-surface-raised p-6 md:rounded-card"
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
              <button onClick={() => setEtape("session")} className="flex-1 rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
                Lancer l’opération
              </button>
            </div>
          </div>
        )}

        {etape === "session" && <SessionUssd flux={flux} valeurs={valeurs} onFermer={onFermer} />}
      </div>
    </div>
  );
}

type Message = { de: "reseau" | "terminal"; texte: string };

/**
 * La session USSD, visible. Le réseau pose ses questions, le terminal y
 * répond avec les informations déjà saisies, et quand le code secret est
 * demandé, le pavé s'ouvre ici même. Tout se passe sur la plateforme.
 */
function SessionUssd({
  flux, valeurs, onFermer,
}: { flux: Flux; valeurs: Record<string, string>; onFermer: () => void }) {
  // Le fil complet, jusqu'à la question du code secret.
  const fil: Message[] = flux.dialogue(valeurs).flatMap((p) => [
    { de: "reseau" as const, texte: p.demande },
    { de: "terminal" as const, texte: p.reponse },
  ]);
  fil.push({ de: "reseau", texte: flux.confirmation(valeurs) });

  const [visibles, setVisibles] = useState(0);
  const [phase, setPhase] = useState<"deroule" | "pin" | "traitement" | "fait">("deroule");

  useEffect(() => {
    if (phase !== "deroule") return;
    if (visibles >= fil.length) { setPhase("pin"); return; }
    const t = setTimeout(() => setVisibles((n) => n + 1), 750);
    return () => clearTimeout(t);
  }, [visibles, phase, fil.length]);

  const valider = () => {
    setPhase("traitement");
    setTimeout(() => setPhase("fait"), 1400);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-ink-faint">
        Le terminal de Douala compose <span className="tabnums font-medium text-ink-soft">{flux.code}</span> sur la carte
      </p>

      {/* Le fil de la session — les messages du réseau, tels quels */}
      <div className="flex flex-col gap-2">
        {fil.slice(0, visibles).map((m, i) => (
          <p key={i}
            className={`max-w-[85%] rounded-card px-3.5 py-2.5 text-small leading-relaxed ${
              m.de === "reseau"
                ? "self-start bg-surface-2 text-ink"
                : "self-end bg-ink text-white tabnums"
            }`}>
            {m.texte}
          </p>
        ))}
        {phase === "deroule" && (
          <p className="self-start px-1 text-caption text-ink-faint">…</p>
        )}
        {(phase === "traitement" || phase === "fait") && (
          <p className="max-w-[85%] self-end rounded-card bg-ink px-3.5 py-2.5 text-small text-white">••••</p>
        )}
        {phase === "traitement" && (
          <p className="self-start px-1 text-caption text-ink-faint">…</p>
        )}
        {phase === "fait" && (
          <p className="max-w-[85%] self-start rounded-card bg-surface-2 px-3.5 py-2.5 text-small leading-relaxed">
            {flux.succes(valeurs)}
          </p>
        )}
      </div>

      {phase === "pin" && (
        <div className="rounded-card border border-line p-4">
          <PaveSecret onValider={valider} />
        </div>
      )}

      {phase === "fait" && (
        <>
          <p className="text-caption leading-relaxed text-ink-faint">
            Le SMS de confirmation de l’opérateur arrivera dans les SMS reçus,
            avec son reçu PDF.
          </p>
          <button onClick={onFermer} className="rounded-btn bg-ink py-2.5 text-small font-medium text-white transition hover:opacity-90">
            Terminé
          </button>
        </>
      )}
    </div>
  );
}

export const montantFcfa = (v: string) => fcfa(parseInt(v.replace(/\D/g, "") || "0", 10));
export const chiffres = (v: string) => v.replace(/\D/g, "");
