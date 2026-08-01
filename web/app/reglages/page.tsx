"use client";

import Link from "next/link";
import { useState } from "react";
import { codesUssd, robot, sims, type CodeUssd } from "@/lib/mock";
import { IconChevron, IconClose, IconHash, IconLock, IconPhone, IconPlus, IconWallet } from "../icons";

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

      {/* Grand écran : deux colonnes de réglages, pas une pile sans fin. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-8">
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
              <IconWallet size={18}
                className={`shrink-0 ${s.enPlace ? "text-ink-soft" : "text-ink-faint"}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-body font-medium ${s.enPlace ? "" : "text-ink-soft"}`}>
                  {s.libelle}
                </p>
                <p className="text-small tabnums text-ink-faint">
                  {s.enPlace
                    ? `${s.numero || "numéro non provisionné"} · carte ${s.iccid.slice(-8)}`
                    : `retirée le ${s.derniereVue} · journal conservé`}
                </p>
              </div>
              <span className="shrink-0 text-small tabnums text-ink-faint">
                {s.enPlace ? `${s.signal}/31` : "—"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          Le nom d’un compte vient de la carte elle-même (son ICCID), jamais du
          réseau capté : une puce MTN reste « MTN » même à l’étranger, en
          itinérance. Changer de carte ouvre un compte distinct — les soldes ne
          se mélangent pas, et l’ancienne retrouve son journal si on la remet.
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
      </div>

      <div className="flex flex-col gap-8">
      {/* Codes USSD */}
      <SectionCodes />

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
      </div>
      </div>

      <Link
        href="/connexion"
        className="rounded-btn border border-line bg-surface-raised py-3 text-center text-small font-medium text-ink-soft transition hover:border-ink-faint hover:text-ink"
      >
        Se déconnecter
      </Link>
    </div>
  );
}

/**
 * Les codes du guichet, par opérateur. Rien n'est deviné : le catalogue de
 * départ a été composé sur un vrai téléphone, et chaque code se corrige ou
 * s'ajoute ici — un opérateur qui change son menu ne casse rien.
 */
function SectionCodes() {
  const [codes, setCodes] = useState<CodeUssd[]>(codesUssd.Orange);
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
          Orange · carte en place
        </p>
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
        Orange et suivront toute carte Orange. Aucun code MTN n’a encore été
        relevé sur le terrain — plutôt que d’en deviner, saisissez ici ceux du
        vrai téléphone, ou faites l’opération une fois dans la console : le
        terminal proposera d’en faire un bouton. Un code n’ouvre que le
        guichet ; le code secret se compose sur son pavé au moment voulu, et
        n’est jamais enregistré.
      </p>
    </section>
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
