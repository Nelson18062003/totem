"use client";

import { useState } from "react";
import { codesUssd } from "@/lib/codes";
import { fcfa, type Sim } from "@/lib/types";
import { IconClose, IconHash } from "../icons";
import { PaveSecret } from "../pave-secret";

// Maquette : menu inventé, du même genre que ce que le réseau renvoie. La
// vraie session traversera le terminal, qui composera le code sur la carte.
const MENU_DEMO = {
  texte: "Orange Money",
  options: [
    "Transfert d’argent", "Dépôt", "Retrait", "Paiement de factures",
    "Consultation de solde", "Crédit d’appel", "Mon compte",
  ],
};

type Session =
  | { etat: "menu"; code: string }
  | { etat: "pin"; code: string; choix: string }
  | { etat: "reponse"; code: string; choix: string };

export function ConsoleUssd({ carte }: { carte: Pick<Sim, "libelle" | "operateur" | "solde"> }) {
  const [saisie, setSaisie] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  const composer = (code: string) => {
    const c = code.trim();
    if (!c) return;
    // Un code qui vise directement une opération saute le menu : le réseau
    // demande aussitôt le code secret — comme sur un vrai téléphone.
    if (c === "#148*5#") setSession({ etat: "pin", code: c, choix: "Consultation de solde" });
    else setSession({ etat: "menu", code: c });
    setSaisie("");
  };

  return (
    // Grand écran : le cadran à gauche, l'écran de session à droite.
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-x-10">
      <header className="lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">Code USSD</h1>
        <p className="mt-1 text-small text-ink-soft">
          Composez comme sur le téléphone : le terminal de Douala tape le code
          sur la carte {carte.libelle}, et le menu revient ici.
        </p>
      </header>

      {/* La colonne du cadran : composer, puis les raccourcis */}
      <div className="flex flex-col gap-5 lg:col-start-1">
        <form
          onSubmit={(e) => { e.preventDefault(); composer(saisie); }}
          className="flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-btn border border-line bg-surface-raised px-3.5">
            <IconHash size={16} className="text-ink-faint" />
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value.replace(/[^0-9#*]/g, ""))}
              inputMode="tel"
              placeholder="#148#"
              className="flex-1 bg-transparent py-2.5 text-body tabnums outline-none placeholder:text-ink-faint"
            />
          </div>
          <button type="submit" disabled={!saisie.trim()}
            className="rounded-btn bg-ink px-4 py-2.5 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
            Composer
          </button>
        </form>

        {/* Les codes déjà relevés sur le terrain — modifiables dans les réglages */}
        <div className="flex flex-wrap gap-1.5">
          {(codesUssd[carte.operateur] ?? []).map((c) => (
            <button key={c.code} onClick={() => composer(c.code)}
              className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft transition hover:border-ink-faint hover:text-ink">
              {c.libelle} <span className="tabnums text-ink-faint">{c.code}</span>
            </button>
          ))}
        </div>

        <p className="hidden text-caption leading-relaxed text-ink-faint lg:block">
          Une opération faite ici peut devenir un bouton : refaites-la une
          fois, et le terminal la retient — sans jamais retenir le code
          secret, ni un montant.
        </p>
      </div>

      {/* Sur grand écran, l'écran du téléphone : la session vit à droite */}
      {!session && (
        <div className="hidden items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center lg:col-start-2 lg:flex">
          <p className="max-w-56 text-small leading-relaxed text-ink-faint">
            Aucune session en cours. Composez un code, la réponse du réseau
            s’affichera ici.
          </p>
        </div>
      )}
      {session && (
        <section className="rounded-card border border-line bg-surface-raised lg:col-start-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-small font-medium tabnums">{session.code}</p>
            <button onClick={() => setSession(null)} aria-label="Fermer la session"
              className="text-ink-faint transition hover:text-ink">
              <IconClose size={16} />
            </button>
          </div>

          {session.etat === "menu" ? (
            <div className="p-4">
              <p className="text-body font-medium">{MENU_DEMO.texte}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {MENU_DEMO.options.map((o, i) => (
                  <li key={o}>
                    <button
                      onClick={() => setSession({ etat: "pin", code: session.code, choix: o })}
                      className="flex w-full items-center gap-3 rounded-btn border border-line px-3.5 py-2.5 text-left text-small transition hover:border-ink-faint"
                    >
                      <span className="tabnums text-ink-faint">{i + 1}</span>
                      {o}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : session.etat === "pin" ? (
            <div className="flex flex-col gap-4 p-4">
              <p className="max-w-[85%] self-start rounded-card bg-surface-2 px-3.5 py-2.5 text-small leading-relaxed">
                {session.choix}. Entrez votre code secret pour continuer :
              </p>
              <PaveSecret
                onValider={() => setSession({ ...session, etat: "reponse" })}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <p className="max-w-[85%] self-end rounded-card bg-ink px-3.5 py-2.5 text-small text-white">••••</p>
              <p className="max-w-[85%] self-start rounded-card bg-surface-2 px-3.5 py-2.5 text-small leading-relaxed">
                {session.choix === "Consultation de solde"
                  ? carte.solde == null
                    ? "Votre demande est en cours de traitement. Vous recevrez un SMS."
                    : `Le solde de votre compte est de ${fcfa(carte.solde)}.`
                  : "Votre demande est en cours de traitement. Vous recevrez un SMS de confirmation."}
              </p>
              <p className="text-caption leading-relaxed text-ink-faint">
                La réponse du réseau arrive aussi dans les SMS reçus, telle
                quelle.
              </p>
              <button onClick={() => setSession(null)}
                className="mt-1 self-start rounded-btn border border-line px-4 py-2 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                Fermer la session
              </button>
            </div>
          )}
        </section>
      )}

      <p className="text-caption leading-relaxed text-ink-faint lg:hidden">
        Une opération faite ici peut devenir un bouton : refaites-la une fois,
        et le terminal la retient — sans jamais retenir le code secret, ni un
        montant.
      </p>
    </div>
  );
}
