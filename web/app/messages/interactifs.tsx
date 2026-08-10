"use client";

// Une ligne du catalogue : ce que c'est, quand ça part, et l'interrupteur —
// quand il y en a un.
//
// CE QUI SE JOUE DANS CE FICHIER
// Un genre qui protège n'affiche pas un interrupteur grisé. Il n'affiche PAS
// d'interrupteur du tout, et à sa place une étiquette qui dit « toujours
// envoyé » avec la raison juste en dessous. La différence n'est pas
// cosmétique : un interrupteur grisé se lit comme une permission qui manque,
// et pousse à chercher qui pourrait la donner. Une absence expliquée se lit
// comme une décision, et elle enseigne.
//
// L'écran ne décide de rien : `debrayable` vient de `lib/preferences.ts`, la
// route le revérifie, et la base refuse la ligne. L'interrupteur n'est que le
// dernier des trois à le savoir.

import { useState } from "react";
import { useLangue } from "@/app/langue";
import { textesMessages } from "@/lib/textes/messages";
import type { Genre as GenreDeMessage } from "@/lib/preferences";

export function Genre({
  genre,
  debrayable,
  recevoir,
}: {
  genre: GenreDeMessage;
  debrayable: boolean;
  recevoir: boolean;
}) {
  const langue = useLangue();
  const t = textesMessages[langue];
  const dit = t.genres[genre];
  const [actif, setActif] = useState(recevoir);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function basculer() {
    if (!debrayable || envoi) return;
    const voulu = !actif;
    setEnvoi(true);
    setErreur("");
    // On montre tout de suite, on corrige si la route refuse : sur une
    // connexion qui coupe, un interrupteur qui met deux secondes à bouger se
    // fait appuyer trois fois.
    setActif(voulu);
    try {
      const rep = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ genre, recevoir: voulu }),
      });
      const corps = await rep.json().catch(() => null);
      if (!rep.ok || !corps?.ok) {
        setActif(!voulu);
        setErreur(corps?.protege ? t.changeProtege : t.changeRate);
      }
    } catch {
      setActif(!voulu);
      setErreur(t.changeRate);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold">{dit.nom}</p>
          <p className="mt-1 text-small leading-relaxed text-ink-soft">{dit.quoi}</p>
          <p className="mt-1.5 text-caption leading-relaxed text-ink-faint">
            <span className="font-medium text-ink-soft">{t.quand} : </span>
            {dit.quand}
          </p>
        </div>

        {debrayable ? (
          <button
            onClick={basculer}
            role="switch"
            aria-checked={actif}
            aria-label={`${t.recevoir} — ${dit.nom}`}
            disabled={envoi}
            className={`mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-0.5
                        transition disabled:opacity-50 ${
              actif ? "justify-end bg-ink" : "justify-start bg-surface-3"
            }`}
          >
            <span className="size-6 rounded-full bg-white shadow-sm" />
          </button>
        ) : (
          <span className="mt-0.5 shrink-0 rounded-full bg-sable px-2.5 py-1 text-caption
                           font-medium text-laterite">
            {t.toujours}
          </span>
        )}
      </div>

      {!debrayable && dit.pourquoiToujours && (
        <p className="mt-2 rounded-btn bg-surface-2 px-3 py-2 text-caption leading-relaxed
                      text-ink-soft">
          {dit.pourquoiToujours}
        </p>
      )}

      {erreur && (
        <p className="mt-2 text-caption leading-relaxed text-negative">{erreur}</p>
      )}
    </li>
  );
}
