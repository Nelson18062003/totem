"use client";

import { useState } from "react";
import { simsEnPlace } from "@/lib/mock";
import { IconClose, IconHash } from "../icons";

// Raccourcis proposés : le catalogue relevé sur le terrain (codes.py).
// Aucun code deviné — chacun n'ouvre que le guichet.
const CATALOGUE = [
  { libelle: "Menu", code: "#148#" },
  { libelle: "Solde", code: "#148*5#" },
  { libelle: "Dépôt", code: "#148*2#" },
  { libelle: "Retrait", code: "#148*3#" },
  { libelle: "Transfert", code: "#148*4#" },
  { libelle: "Mon numéro", code: "#148*7*6#" },
];

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
  | { etat: "suite"; code: string; choix: string };

export default function ConsoleUssd() {
  const carte = simsEnPlace[0];
  const [saisie, setSaisie] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  const composer = (code: string) => {
    if (!code.trim()) return;
    setSession({ etat: "menu", code: code.trim() });
    setSaisie("");
  };

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">Code USSD</h1>
        <p className="mt-1 text-small text-ink-soft">
          Composez comme sur le téléphone : le terminal de Douala tape le code
          sur la carte {carte.libelle}, et le menu revient ici.
        </p>
      </header>

      {/* Composer */}
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

      {/* Les codes déjà relevés sur le terrain */}
      <div className="flex flex-wrap gap-1.5">
        {CATALOGUE.map((c) => (
          <button key={c.code} onClick={() => composer(c.code)}
            className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft transition hover:border-ink-faint hover:text-ink">
            {c.libelle} <span className="tabnums text-ink-faint">{c.code}</span>
          </button>
        ))}
      </div>

      {/* La session — une seule carte, qui se met à jour, comme sur Telegram */}
      {session && (
        <section className="rounded-card border border-line bg-surface-raised">
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
                      onClick={() => setSession({ etat: "suite", code: session.code, choix: o })}
                      className="flex w-full items-center gap-3 rounded-btn border border-line px-3.5 py-2.5 text-left text-small transition hover:border-ink-faint"
                    >
                      <span className="tabnums text-ink-faint">{i + 1}</span>
                      {o}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <p className="text-body">{session.choix}</p>
              <p className="text-small leading-relaxed text-ink-soft">
                La suite demande le code secret : le pavé sécurisé de Telegram
                prend le relais, et la confirmation arrivera dans les SMS reçus.
                Rien de secret ne passe par le navigateur.
              </p>
              <button onClick={() => setSession(null)}
                className="mt-1 self-start rounded-btn border border-line px-4 py-2 text-small font-medium text-ink-soft transition hover:border-ink-faint">
                Fermer la session
              </button>
            </div>
          )}
        </section>
      )}

      <p className="text-caption leading-relaxed text-ink-faint">
        Une opération faite ici peut devenir un bouton : refaites-la une fois,
        et le terminal la retient — sans jamais retenir le code secret, ni un
        montant.
      </p>
    </div>
  );
}
