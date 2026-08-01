"use client";

import { useMemo, useState } from "react";
import { smsRecus, type Sms } from "@/lib/mock";
import { Vide } from "../vide";

const NATURES: { cle: "tous" | Sms["nature"]; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "paiement", libelle: "Paiements" },
  { cle: "solde", libelle: "Soldes" },
  { cle: "autre", libelle: "Autres" },
];

const BADGE: Record<Sms["nature"], { libelle: string; classes: string }> = {
  paiement: { libelle: "Paiement", classes: "bg-ink text-white" },
  solde: { libelle: "Solde", classes: "bg-surface-2 text-ink-soft" },
  code: { libelle: "Code masqué", classes: "bg-surface-2 text-ink-soft" },
  autre: { libelle: "Autre", classes: "bg-surface-2 text-ink-faint" },
};

export default function SmsRecus() {
  const [nature, setNature] = useState<(typeof NATURES)[number]["cle"]>("tous");

  const liste = useMemo(
    () => smsRecus.filter((s) => nature === "tous" || s.nature === nature),
    [nature],
  );

  const parDate = liste.reduce<Record<string, Sms[]>>((acc, s) => {
    (acc[s.date] ||= []).push(s); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-title font-semibold tracking-tight">SMS reçus</h1>
        <p className="mt-1 text-small text-ink-soft">
          Tout ce que la carte reçoit, tel quel. C’est le message d’origine qui
          fait foi — les paiements en sont extraits, jamais réécrits.
        </p>
      </header>

      {/* Filtres */}
      <div className="flex gap-1.5">
        {NATURES.map((n) => (
          <button key={n.cle} onClick={() => setNature(n.cle)}
            className={`rounded-btn border px-3.5 py-1.5 text-small transition ${
              nature === n.cle
                ? "border-ink bg-ink font-medium text-white"
                : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
            }`}>{n.libelle}</button>
        ))}
      </div>

      {Object.keys(parDate).length === 0 ? (
        <Vide
          titre="Aucun message de cette nature"
          detail="Changez de filtre pour revoir l’ensemble des SMS reçus par la carte."
        />
      ) : (
        Object.entries(parDate).map(([date, items]) => (
          <section key={date}>
            <p className="mb-1 text-caption uppercase tracking-wider text-ink-faint">{date}</p>
            <ul className="divide-hair">
              {items.map((s) => (
                <li key={s.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-small font-medium">{s.expediteur}</p>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-sm px-1.5 py-0.5 text-caption font-medium ${BADGE[s.nature].classes}`}>
                        {BADGE[s.nature].libelle}
                      </span>
                      <span className="text-small tabnums text-ink-faint">{s.heure}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-small leading-relaxed text-ink-soft">{s.texte}</p>
                  {s.nature === "code" && (
                    <p className="mt-1 text-caption leading-relaxed text-ink-faint">
                      Un code à usage unique ouvre le compte : il n’est jamais
                      montré ni archivé en clair.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
