"use client";

import { useState } from "react";
import { codesUssd, type CodeUssd } from "@/lib/codes";
import { IconClose, IconHash, IconPlus } from "../icons";

/**
 * Les codes du guichet, par opérateur. Rien n'est deviné : le catalogue de
 * départ a été composé sur un vrai téléphone, et chaque code se corrige ou
 * s'ajoute ici — un opérateur qui change son menu ne casse rien.
 */
export function SectionCodes({ operateur }: { operateur: string }) {
  const [codes, setCodes] = useState<CodeUssd[]>(codesUssd[operateur] ?? []);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [ajout, setAjout] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauCode, setNouveauCode] = useState("");

  const proprer = (v: string) => v.replace(/[^0-9#*]/g, "");

  const enregistrer = (cle: string) => {
    if (brouillon.trim()) {
      setCodes((cs) => cs.map((c) => (c.cle === cle ? { ...c, code: brouillon.trim() } : c)));
    }
    setEnEdition(null);
  };

  const ajouter = () => {
    if (!nouveauNom.trim() || !nouveauCode.trim()) return;
    setCodes((cs) => [...cs, {
      cle: `perso-${cs.length}`, libelle: nouveauNom.trim(), code: nouveauCode.trim(),
    }]);
    setNouveauNom(""); setNouveauCode(""); setAjout(false);
  };

  return (
    <section>
      <h2 className="mb-3 text-heading font-semibold">Codes USSD</h2>
      <div className="rounded-card border border-line bg-surface-raised">
        <p className="border-b border-line px-4 py-3 text-caption uppercase tracking-wider text-ink-faint">
          {operateur} · carte en place
        </p>
        {codes.length === 0 && !ajout && (
          <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
            Aucun code {operateur} n’a encore été relevé sur le terrain — et on
            ne devine pas un chiffre qui déplace de l’argent. Saisissez ceux du
            vrai téléphone ci-dessous.
          </p>
        )}
        <ul className="divide-hair px-4">
          {codes.map((c) => (
            <li key={c.cle} className="flex items-center gap-3 py-3">
              <IconHash size={16} className="shrink-0 text-ink-faint" />
              <span className="flex-1 text-body">{c.libelle}</span>
              {enEdition === c.cle ? (
                <span className="flex items-center gap-1.5">
                  <input
                    value={brouillon} autoFocus
                    onChange={(e) => setBrouillon(proprer(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && enregistrer(c.cle)}
                    className="w-32 rounded-btn border border-ink bg-surface-raised px-2.5 py-1.5 text-right text-small tabnums outline-none"
                  />
                  <button onClick={() => enregistrer(c.cle)}
                    className="rounded-btn bg-ink px-2.5 py-1.5 text-small font-medium text-white transition hover:opacity-90">
                    OK
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => { setEnEdition(c.cle); setBrouillon(c.code); }}
                  title="Modifier ce code"
                  className="rounded-btn border border-transparent px-2 py-1 text-small tabnums text-ink-soft transition hover:border-line hover:text-ink"
                >
                  {c.code}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          {ajout ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)}
                placeholder="Nom (« Factures »)" autoFocus
                className="flex-1 rounded-btn border border-line bg-surface-raised px-3 py-2 text-small outline-none transition focus:border-ink" />
              <input value={nouveauCode} onChange={(e) => setNouveauCode(proprer(e.target.value))}
                placeholder="#148*6#" inputMode="tel"
                className="w-full rounded-btn border border-line bg-surface-raised px-3 py-2 text-small tabnums outline-none transition focus:border-ink sm:w-32" />
              <span className="flex gap-2">
                <button onClick={ajouter} disabled={!nouveauNom.trim() || !nouveauCode.trim()}
                  className="flex-1 rounded-btn bg-ink px-4 py-2 text-small font-medium text-white transition hover:opacity-90 disabled:opacity-30">
                  Ajouter
                </button>
                <button onClick={() => setAjout(false)} aria-label="Annuler l’ajout"
                  className="grid size-9 place-items-center rounded-btn border border-line text-ink-faint transition hover:text-ink">
                  <IconClose size={15} />
                </button>
              </span>
            </div>
          ) : (
            <button onClick={() => setAjout(true)}
              className="flex w-full items-center justify-center gap-2 rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
              <IconPlus size={15} /> Ajouter un raccourci
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-faint">
        Chaque opérateur a ses propres codes ; ceux-ci appartiennent au réseau
        et suivront toute carte du même opérateur. Un code n’ouvre que le
        guichet ; le code secret se compose sur son pavé au moment voulu, et
        n’est jamais enregistré.
      </p>
    </section>
  );
}

export function Bascule({ t, defaut }: { t: string; defaut?: boolean }) {
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
