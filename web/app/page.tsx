"use client";

import Link from "next/link";
import { useState } from "react";
import { fcfa, fcfaCourt, paiements, robot, simsEnPlace } from "@/lib/mock";
import {
  IconArrowDown, IconArrowUp, IconChevron, IconHash, IconInbox,
  IconPhone, IconRefresh, IconSettings, IconWallet,
} from "./icons";

export default function Accueil() {
  const carte = simsEnPlace[0];

  // Le solde n'existe pas « en direct » : la carte ne le connaît que par le
  // dernier SMS, ou en interrogeant le réseau. Actualiser = demander au
  // terminal de composer le code du solde sur la vraie SIM.
  const [interrogation, setInterrogation] = useState<"repos" | "en_cours" | "faite">("repos");
  const source =
    interrogation === "faite" ? "l’interrogation du réseau, à l’instant" : carte.soldeSource;

  const actualiser = () => {
    if (interrogation === "en_cours") return;
    setInterrogation("en_cours");
    // Maquette : la vraie demande partira au terminal par la base de données.
    setTimeout(() => setInterrogation("faite"), 1800);
  };

  return (
    // Sur grand écran, la page se déplie en deux colonnes : le flux du
    // quotidien à gauche, la carte et l'état du terminal à droite.
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      {/* En-tête */}
      <header className="flex items-baseline justify-between lg:col-span-2">
        <div>
          <p className="text-small text-ink-soft">Bonjour, Nelson</p>
          <h1 className="mt-0.5 text-title font-semibold tracking-tight">Vue d’ensemble</h1>
        </div>
        <Link href="/reglages" className="text-ink-faint transition hover:text-ink lg:hidden" aria-label="Réglages">
          <IconSettings size={18} />
        </Link>
      </header>

      {/* Solde connu — et de quand il date */}
      <section className="lg:col-start-1">
        <p className="text-small text-ink-soft">
          Solde · {carte.libelle}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <p className="text-hero font-semibold tabnums tracking-tight">{fcfa(carte.solde)}</p>
          <button
            onClick={actualiser}
            aria-label="Actualiser le solde"
            title="Demander le solde au réseau"
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink-faint hover:text-ink"
          >
            <IconRefresh size={16} className={interrogation === "en_cours" ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="mt-1.5 text-small text-ink-soft">
          {interrogation === "en_cours"
            ? "Le terminal interroge le réseau…"
            : `D’après ${source}`}
        </p>
      </section>

      {/* Les gestes du quotidien — les mêmes qu'au guichet */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-start-1">
        {[
          { href: "/actions", label: "Dépôt", Icone: IconArrowDown },
          { href: "/actions", label: "Retrait", Icone: IconWallet },
          { href: "/actions", label: "Transfert", Icone: IconArrowUp },
          { href: "/actions", label: "Mon numéro", Icone: IconPhone },
          { href: "/sms", label: "SMS reçus", Icone: IconInbox },
          { href: "/ussd", label: "Code USSD", Icone: IconHash },
        ].map(({ href, label, Icone }, i) => (
          <Link key={i} href={href}
            className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
            <Icone size={18} className="text-ink-soft" />
            {label}
          </Link>
        ))}
      </section>

      {/* La colonne de droite : la carte, puis l'état du terminal */}
      <aside className="flex flex-col gap-8 lg:col-start-2 lg:row-span-3 lg:row-start-2 lg:gap-5">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-heading font-semibold">Carte en place</h2>
            <Link href="/cartes" className="text-small text-ink-soft transition hover:text-ink">Détails</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {simsEnPlace.map((s) => (
              <Link key={s.id} href="/cartes" className="acct rounded-card p-4 transition">
                <div className="flex items-center justify-between">
                  <span className="text-caption uppercase tracking-wider text-white/60">
                    {s.operateur === "MTN" ? "MTN Mobile Money" : "Orange Money"}
                  </span>
                  <span className="text-caption tabnums text-white/50">{s.signal}/31</span>
                </div>
                <p className="mt-4 text-display font-semibold tabnums tracking-tight">{fcfa(s.solde)}</p>
                <p className="mt-1 text-small tabnums text-white/55">{s.numero}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* L'état du terminal — jusqu'ici réservé au rail, absent du téléphone */}
        <section>
          <h2 className="mb-3 text-heading font-semibold">Terminal</h2>
          <Link href="/reglages"
            className="block rounded-card border border-line bg-surface-raised p-4 transition hover:border-ink-faint">
            <p className="flex items-center gap-2.5 text-body">
              <span className="size-2 rounded-full bg-positive" />
              En ligne
              <span className="ml-auto text-small tabnums text-ink-faint">il y a {robot.majTexte}</span>
            </p>
            <p className="mt-2 text-small text-ink-soft">
              {robot.lieu} · {robot.internet} · {robot.surSecteur ? "sur secteur" : "sur batterie"}
            </p>
          </Link>
        </section>
      </aside>

      {/* Transactions */}
      <section className="lg:col-start-1">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-heading font-semibold">Dernières transactions</h2>
          <Link href="/encaissements" className="flex items-center gap-0.5 text-small text-ink-soft transition hover:text-ink">
            Tout voir <IconChevron size={14} />
          </Link>
        </div>
        <ul className="divide-hair">
          {paiements.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                {p.sens === "in" ? <IconArrowDown size={16} /> : <IconArrowUp size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{p.nom}</p>
                <p className="text-small text-ink-faint">{p.sim} · {p.categorie} · {p.heure}</p>
              </div>
              <span className={`text-body font-medium tabnums ${p.sens === "in" ? "text-positive" : "text-ink"}`}>
                {p.sens === "in" ? "+" : "−"}{fcfaCourt(p.montant)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
