"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import { fcfa, type Sim } from "@/lib/types";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import { IconArrowDown, IconArrowUp, IconPhone, IconRefresh, IconWallet } from "./icons";
import { OperationPopup, type Operation } from "./operation";

/**
 * Le guichet de l'accueil. Un seul solde — celui de la carte — et cinq
 * gestes : chacun ouvre son pop-up, la session se joue dedans, du formulaire
 * au code secret. Personne n'est renvoyé vers une autre page.
 */
export function AccueilGuichet({
  carte,
}: {
  carte: Pick<Sim, "libelle" | "operateur" | "numero" | "solde" | "soldeMaj" | "signal" | "iccid">;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAccueil[langue];
  const [operation, setOperation] = useState<Operation | null>(null);
  const op = carte.operateur;

  const solde = (): Operation =>
    ({ titre: t.consulterSolde, code: codeUssd(op, "solde"), champs: [] });

  const operations: { label: string; Icone: typeof IconWallet; fabrique: () => Operation }[] = [
    {
      label: t.depot, Icone: IconArrowDown,
      fabrique: (): Operation => ({
        titre: t.depotTitre, code: codeUssd(op, "depot"),
        champs: [
          { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" },
        ],
      }),
    },
    {
      label: t.retrait, Icone: IconWallet,
      fabrique: (): Operation => ({
        titre: t.retraitTitre, code: codeUssd(op, "retrait"),
        champs: [
          { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
          { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" },
        ],
      }),
    },
    {
      label: t.transfert, Icone: IconArrowUp,
      fabrique: (): Operation => ({
        titre: t.transfertTitre, code: codeUssd(op, "transfert"),
        champs: [
          { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: t.montantFcfa, aide: "50 000", type: "montant" },
        ],
      }),
    },
    { label: t.solde, Icone: IconRefresh, fabrique: (): Operation => solde() },
    {
      label: t.monNumero, Icone: IconPhone,
      fabrique: (): Operation => ({ titre: t.monNumero, code: codeUssd(op, "mon_numero"), champs: [] }),
    },
  ].filter((o) => o.fabrique().code);

  return (
    <>
      {/* LE solde : un seul, sur la carte. Actualiser interroge le réseau —
          la fenêtre du code s'ouvre, jamais un rechargement de page. */}
      <section className="acct rounded-card p-5 lg:col-start-1">
        <div className="flex items-center justify-between">
          <span className="text-caption uppercase tracking-wider text-white/60">
            {op === "MTN" ? "MTN Mobile Money" : op === "Orange" ? "Orange Money" : carte.libelle}
          </span>
          {carte.signal != null && (
            <span className="text-caption tabnums text-white/50">{carte.signal}/31</span>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <p className="text-hero font-semibold tabnums tracking-tight">
            {carte.solde == null ? "—" : fcfa(carte.solde, langue)}
          </p>
          <button
            onClick={() => setOperation(solde())}
            aria-label={t.actualiserAria}
            title={t.interrogerReseau}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
          >
            <IconRefresh size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-small text-white/55">
          {carte.solde == null
            ? t.aucunSoldeConnu
            : carte.soldeMaj
              ? t.soldeMaj(carte.soldeMaj)
              : t.soldeSansHeure}
        </p>
        <p className="mt-3 text-small tabnums text-white/55">
          {carte.numero || t.carteAnonyme(carte.iccid.slice(-8))} · {carte.libelle}
        </p>
      </section>

      {/* Les gestes du guichet — chaque bouton ouvre son pop-up, ici même */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-start-1">
        {operations.map(({ label, Icone, fabrique }) => (
          <button key={label} onClick={() => setOperation(fabrique())}
            className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
            <Icone size={18} className="text-ink-soft" />
            {label}
          </button>
        ))}
        {operations.length === 0 && (
          <p className="col-span-full rounded-card border border-dashed border-line px-4 py-5 text-center text-small leading-relaxed text-ink-faint">
            {t.aucunCode(op)}{" "}
            <Link href="/reglages" className="underline underline-offset-4">{t.aucunCodeLien}</Link>.
          </p>
        )}
      </section>

      {operation && (
        <OperationPopup
          operation={operation}
          onFermer={() => { setOperation(null); router.refresh(); }}
          onTermine={() => router.refresh()}
        />
      )}
    </>
  );
}
