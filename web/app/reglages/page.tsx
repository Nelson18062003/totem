import Link from "next/link";
import { langueServeur } from "@/lib/langue-serveur";
import { chargerDonnees } from "@/lib/serveur";
import { textesReglages } from "@/lib/textes/reglages";
import { IconChevron, IconLock, IconPhone, IconWallet } from "../icons";
import {
  Bascule,
  BoutonDeconnexion,
  ReglageNumero,
  SectionCodes,
  SectionLangue,
} from "./interactifs";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const langue = await langueServeur();
  const t = textesReglages[langue];
  const { terminal, sims, raccourcis } = await chargerDonnees(langue, { sms: 0, recus: 0 });
  // Une section de codes PAR OPÉRATEUR présent — les cartes en place
  // d'abord. Le repli « Orange » d'autrefois mentait dès qu'une MTN était
  // dans le berceau.
  const enPlaceOps = sims.filter((s) => s.enPlace).map((s) => s.operateur);
  const operateurs = [...new Set([...enPlaceOps, ...sims.map((s) => s.operateur)])]
    .filter((op) => op && op !== "?");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        <p className="mt-1 text-small text-ink-soft">{t.sousTitre}</p>
      </header>

      {/* Compte utilisateur */}
      <section className="flex items-center gap-3.5 rounded-card border border-line bg-surface-raised p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-body font-medium">
          N
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium">Nelson</p>
          <p className="truncate text-small text-ink-faint">{t.proprietaire}</p>
        </div>
      </section>

      {/* Grand écran : deux colonnes de réglages, pas une pile sans fin. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-8">
      {/* État du terminal */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.terminal}</h2>
        <div className="rounded-card border border-line bg-surface-raised">
          {terminal ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="flex items-center gap-2.5 text-body">
                  <span className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive-vif" : "bg-negative"}`} />
                  {terminal.enLigne ? t.enLigne : t.muet}
                </span>
                <span className="text-small tabnums text-ink-faint">
                  {t.misAJour(terminal.majTexte)}
                </span>
              </div>
              <dl className="divide-hair px-4">
                <Ligne t={t.nom} v={terminal.nom} />
                {terminal.version && <Ligne t={t.version} v={terminal.version} />}
              </dl>
            </>
          ) : (
            <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
              {t.aucunTerminal}
            </p>
          )}
          <div className="border-t border-line p-3">
            <button className="w-full rounded-btn border border-line py-2.5 text-small font-medium transition hover:border-ink-faint">
              {t.redemarrer}
            </button>
          </div>
        </div>
      </section>

      {/* Comptes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-heading font-semibold">{t.comptes}</h2>
          <Link href="/cartes" className="text-small text-ink-soft underline-offset-4 hover:underline">
            {t.voirSoldes}
          </Link>
        </div>
        {sims.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-small text-ink-faint">
            {t.aucuneCarte}
          </p>
        ) : (
          <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
            {sims.map((s) => (
              <li key={s.iccid} className="flex items-center gap-3 py-3.5">
                <IconWallet size={18}
                  className={`shrink-0 ${s.enPlace ? "text-ink-soft" : "text-ink-faint"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-body font-medium ${s.enPlace ? "" : "text-ink-soft"}`}>
                    {s.nom || s.libelle}
                  </p>
                  {s.enPlace ? (
                    <p className="flex flex-wrap items-center gap-x-1.5 text-small tabnums text-ink-faint">
                      <ReglageNumero
                        iccid={s.iccid}
                        numeroInitial={s.numero}
                        libelle={s.libelle}
                      />
                      <span>· {s.libelle} · {t.carte(s.iccid.slice(-8))}</span>
                    </p>
                  ) : (
                    <p className="text-small tabnums text-ink-faint">
                      {t.retireeJournal(s.derniereVue)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 self-start pt-0.5 text-small tabnums text-ink-faint">
                  {s.enPlace && s.signal != null ? `${s.signal}/31` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          {t.noteIccid}
        </p>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          {t.noteNumeroAvant}
          <strong className="font-medium text-ink-soft">{t.noteNumeroMot}</strong>
          {t.noteNumeroMilieu}
          {t.noteNumeroFin}
        </p>
      </section>

      {/* Notifications */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.notifications}</h2>
        <div className="divide-hair rounded-card border border-line bg-surface-raised px-4">
          <Bascule t={t.notifPaiement} defaut />
          <Bascule t={t.notifRapport} defaut />
          <Bascule t={t.notifCourant} defaut />
        </div>
      </section>
      </div>

      <div className="flex flex-col gap-8">
      {/* La langue de la plateforme — en tête de colonne : c'est le premier
          réglage qu'un nouvel arrivant cherche. La bascule vit aussi dans la
          navigation, sur chaque écran. */}
      <SectionLangue />

      {/* Codes USSD — une section par opérateur vu par le terminal, avec les
          boutons appris par le robot (💾 sur Telegram) en regard */}
      {operateurs.map((op) => (
        <SectionCodes
          key={op}
          operateur={op}
          enPlace={enPlaceOps.includes(op)}
          appris={raccourcis[op] ?? []}
        />
      ))}

      {/* Sécurité */}
      <section>
        <h2 className="mb-3 text-heading font-semibold">{t.securite}</h2>
        <ul className="divide-hair rounded-card border border-line bg-surface-raised px-4">
          <Rangee t={t.motDePasse} Icone={IconLock} />
          <Rangee t={t.doubleAuth} Icone={IconPhone} valeur={t.activee} />
        </ul>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          {t.notePin}
        </p>
      </section>
      </div>
      </div>

      <BoutonDeconnexion />
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
