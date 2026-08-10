"use client";

// Les deux seuls gestes de toute la console : « je l'ai vue » et « c'est
// réglé ».
//
// POURQUOI DEUX BOUTONS ET PAS UN
// Parce que ce sont deux faits différents, et que le second n'implique pas le
// premier. « Je l'ai vue » dit que quelqu'un s'en occupe et laisse la ligne à
// l'écran ; « c'est réglé » la fait descendre. Un seul bouton ferait
// disparaître, dès le premier regard, des choses que personne n'a réparées —
// et c'est précisément la façon dont une supervision se met à mentir.
//
// POURQUOI CLORE DEMANDE UNE PHRASE
// Une alerte close sans un mot ne raconte rien à celui qui relira six mois plus
// tard, et c'est toujours quelqu'un d'autre qui relit. La phrase est courte,
// facultative dans son contenu mais demandée dans son geste : on tape ou on
// renonce, jamais un appui distrait.
//
// CE QUI N'EST PAS ICI
// Aucun geste sur l'argent, aucun geste sur un terminal. Ces boutons appellent
// deux routes qui ne savent écrire que dans « alertes », et rien d'autre de la
// console n'écrit nulle part.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesJournal } from "@/lib/textes/journal";

const VUE = "/api/console/alertes/vue";
const CLORE = "/api/console/alertes/clore";

export function GestesDAlerte({ alerte, vue }: { alerte: number; vue: boolean }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesJournal[langue].alertes;

  const [envoi, marquerEnvoi] = useState(false);
  const [message, dire] = useState("");
  const [cloture, ouvrirCloture] = useState(false);
  const [motif, ecrireMotif] = useState("");

  async function envoyer(chemin: string, corps: Record<string, unknown>) {
    marquerEnvoi(true);
    dire("");
    try {
      const r = await fetch(chemin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corps),
      });
      const reponse = await r.json().catch(() => ({}));
      if (!r.ok) {
        dire(reponse?.erreur || t.gesteRate);
        return;
      }
      ouvrirCloture(false);
      ecrireMotif("");
      // La page est un écran serveur : c'est elle qui relit la base, pas nous.
      router.refresh();
    } catch {
      dire(t.gesteRate);
    } finally {
      marquerEnvoi(false);
    }
  }

  if (cloture) {
    return (
      <div className="mt-3 flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3">
        <label className="text-caption leading-relaxed text-ink-soft" htmlFor={`motif-${alerte}`}>
          {t.gesteCloreMotif}
        </label>
        <input
          id={`motif-${alerte}`}
          value={motif}
          onChange={(e) => ecrireMotif(e.target.value)}
          placeholder={t.gesteCloreMotifExemple}
          autoComplete="off"
          className="h-11 w-full rounded-btn border border-line-control bg-surface-raised px-3 text-small"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={envoi}
            onClick={() => envoyer(CLORE, { alerte, motif })}
            className="flex min-h-11 items-center rounded-btn bg-accent px-4 text-small font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {t.gesteCloreConfirmer}
          </button>
          <button
            type="button"
            disabled={envoi}
            onClick={() => { ouvrirCloture(false); dire(""); }}
            className="flex min-h-11 items-center rounded-btn border border-line-control px-4 text-small text-ink-soft transition hover:bg-surface-raised hover:text-ink"
          >
            {t.gesteCloreAnnuler}
          </button>
        </div>
        {message && <p className="text-caption text-negative">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {vue ? (
        <span className="flex min-h-11 items-center text-caption text-ink-faint">
          {t.gesteVueFait}
        </span>
      ) : (
        <button
          type="button"
          disabled={envoi}
          onClick={() => envoyer(VUE, { alerte })}
          className="flex min-h-11 items-center rounded-btn border border-line-control px-4 text-small text-ink transition hover:bg-surface-2 disabled:opacity-60"
        >
          {t.gesteVue}
        </button>
      )}
      <button
        type="button"
        disabled={envoi}
        onClick={() => { ouvrirCloture(true); dire(""); }}
        className="flex min-h-11 items-center rounded-btn border border-line-control px-4 text-small text-ink transition hover:bg-surface-2 disabled:opacity-60"
      >
        {t.gesteClore}
      </button>
      {message && (
        <span className="min-w-0 flex-1 text-caption leading-relaxed text-negative">
          {message}
        </span>
      )}
    </div>
  );
}
