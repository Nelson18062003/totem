import Link from "next/link";
import { chargerDonnees } from "@/lib/serveur";
import { IconChevron, IconLock, IconPhone, IconWallet } from "../icons";
import { Bascule, ReglageNumero, SectionCodes } from "./interactifs";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const { terminal, sims } = await chargerDonnees();
  const carte = sims.find((s) => s.enPlace);

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
          {terminal ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="flex items-center gap-2.5 text-body">
                  <span className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
                  {terminal.enLigne ? "En ligne" : "Muet"}
                </span>
                <span className="text-small tabnums text-ink-faint">
                  mis à jour {terminal.majTexte}
                </span>
              </div>
              <dl className="divide-hair px-4">
                <Ligne t="Nom" v={terminal.nom} />
                {terminal.version && <Ligne t="Version" v={terminal.version} />}
              </dl>
            </>
          ) : (
            <p className="px-4 py-4 text-small leading-relaxed text-ink-soft">
              Aucun terminal ne s’est encore annoncé dans la base. Dès que le
              robot aura du réseau, son état apparaîtra ici.
            </p>
          )}
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
        {sims.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-small text-ink-faint">
            Aucune carte encore vue par le terminal.
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
                      <span>· {s.libelle} · carte {s.iccid.slice(-8)}</span>
                    </p>
                  ) : (
                    <p className="text-small tabnums text-ink-faint">
                      retirée le {s.derniereVue} · journal conservé
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
          Une carte est identifiée par son ICCID, jamais par le réseau capté :
          une puce MTN reste « MTN » même à l’étranger, en itinérance. Changer
          de carte ouvre un compte distinct — les soldes ne se mélangent pas,
          et l’ancienne retrouve son journal si on la remet.
        </p>
        <p className="mt-2 text-caption leading-relaxed text-ink-faint">
          Le <strong className="font-medium text-ink-soft">numéro</strong> ne
          se lit ni sur la puce ni sur le réseau : la plupart des SIM prépayées
          ne le déclarent pas. Touchez-le ci-dessus pour l’inscrire d’ici — ou
          depuis Telegram, <code className="tabnums">/reglages</code>. Sans lui,
          un dépôt ou un transfert s’affiche sans qu’on sache s’il sort ou
          entre : le reçu écrit « Montant net » au lieu de « Montant reçu » ou
          « Montant envoyé ».
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
      {/* Codes USSD — ceux de l'opérateur de la carte en place */}
      <SectionCodes operateur={carte?.operateur ?? "Orange"} />

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
