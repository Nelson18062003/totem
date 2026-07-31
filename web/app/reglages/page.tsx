"use client";

import Link from "next/link";
import { useState } from "react";
import { robot, sims } from "@/lib/mock";
import { IconChevron, IconLock, IconPhone, IconWallet } from "../icons";

export default function Reglages() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">Réglages</h1>
        <p className="mt-1 text-small text-ink-soft">Le terminal, les comptes, la sécurité.</p>
      </header>

      {/* Compte utilisateur */}
      <section className="flex items-center gap-3.5 rounded-card border border-line bg-surface-raised p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-body font-medium">
          N
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium">Nelson</p>
          <p className="truncate text-small text-ink-faint">Propriétaire du terminal</p>
        </div>
      </section>

      {/* État du terminal */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">Terminal</h2>
        <div className="rounded-card border border-line bg-surface-raised">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="flex items-center gap-2.5 text-body">
              <span className="size-2 rounded-full bg-positive" />
              En ligne
            </span>
            <span className="text-small tabnums text-ink-faint">
              mis à jour il y a {robot.majTexte}
            </span>
          </div>
          <dl className="divide-hair px-4">
            <Ligne t="Emplacement" v={robot.lieu} />
            <Ligne t="Connexion" v={robot.internet} />
            <Ligne t="Alimentation" v={robot.surSecteur ? "Secteur" : `Batterie ${robot.batterie} %`} />
            <Ligne t="Version" v="TOTEM 1.0" />
          </dl>
          <div className="border-t border-line p-3">
            <button className="w-full rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
              Redémarrer le terminal
            </button>
          </div>
        </div>
      </section>

      {/* Comptes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-heading font-semibold">Comptes</h2>
          <Link href="/cartes" className="text-small text-ink-soft underline-offset-4 hover:underline">
            Voir les soldes
          </Link>
        </div>
        <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
          {sims.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3.5">
              <IconWallet size={18} className="shrink-0 text-ink-soft" />
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium">
                  {s.operateur === "MTN" ? "MTN Mobile Money" : "Orange Money"}
                </p>
                <p className="text-small tabnums text-ink-faint">{s.numero}</p>
              </div>
              <span className="text-small tabnums text-ink-faint">{s.signal}/31</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          Un modem par opérateur. Brancher un second modem fait apparaître un
          second compte au redémarrage du terminal.
        </p>
      </section>

      {/* Notifications */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">Notifications</h2>
        <div className="divide-hair rounded-card border border-line bg-surface-raised px-4">
          <Bascule t="Chaque paiement reçu" defaut />
          <Bascule t="Rapport quotidien (21 h)" defaut />
          <Bascule t="Coupure de courant et sous-tension" defaut />
          <Bascule t="Doubler les alertes sur Telegram" defaut />
        </div>
      </section>

      {/* Sécurité */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">Sécurité</h2>
        <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
          <Rangee t="Changer le mot de passe" Icone={IconLock} />
          <Rangee t="Double authentification" Icone={IconPhone} valeur="Activée" />
        </ul>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          Le code PIN Mobile Money n’est enregistré nulle part : il se saisit à
          chaque opération, puis disparaît.
        </p>
      </section>

      <Link
        href="/connexion"
        className="rounded-btn border border-line bg-surface-raised py-3 text-center text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink"
      >
        Se déconnecter
      </Link>
    </div>
  );
}

function Ligne({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-small text-ink-soft">{t}</dt>
      <dd className="text-small font-medium">{v}</dd>
    </div>
  );
}

function Rangee({
  t,
  Icone,
  valeur,
}: {
  t: string;
  Icone: (p: { size?: number; className?: string }) => React.ReactElement;
  valeur?: string;
}) {
  return (
    <li>
      <button className="flex w-full items-center gap-3 py-3.5 text-left transition hover:opacity-70">
        <Icone size={18} className="shrink-0 text-ink-soft" />
        <span className="flex-1 text-body">{t}</span>
        {valeur && <span className="text-small text-ink-faint">{valeur}</span>}
        <IconChevron size={16} className="text-ink-faint" />
      </button>
    </li>
  );
}

function Bascule({ t, defaut }: { t: string; defaut?: boolean }) {
  const [actif, setActif] = useState(Boolean(defaut));
  return (
    <div className="flex items-center justify-between py-3">
      <span className="pr-4 text-body">{t}</span>
      <button
        onClick={() => setActif((a) => !a)}
        role="switch"
        aria-checked={actif}
        aria-label={t}
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition ${
          actif ? "justify-end bg-ink" : "justify-start bg-surface-3"
        }`}
      >
        <span className="size-5 rounded-full bg-white shadow-sm" />
      </button>
    </div>
  );
}
