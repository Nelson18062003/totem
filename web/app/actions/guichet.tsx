"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import { textesGuichet } from "@/lib/textes/guichet";
import type { Sim } from "@/lib/types";
import {
  IconArrowDown, IconArrowUp, IconChevron, IconHash,
  IconInbox, IconPhone, IconRefresh, IconWallet,
} from "../icons";
import { useLangue } from "../langue";
import { OperationPopup, type Operation } from "../operation";

/**
 * Le guichet. Chaque geste ouvre son pop-up ici même : le formulaire, puis la
 * vraie session USSD sur la carte de Douala, jusqu'au pavé du code secret.
 * Les codes viennent du catalogue relevé sur le terrain (codes.py).
 */
export function Guichet({ carte }: { carte: Pick<Sim, "libelle" | "operateur"> }) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesGuichet[langue];
  const [operation, setOperation] = useState<Operation | null>(null);
  const op = carte.operateur;

  const operations = [
    {
      titre: t.depot, sous: t.depotSous, Icone: IconArrowDown,
      fabrique: (): Operation => ({
        titre: t.depotTitre, code: codeUssd(op, "depot"),
        champs: [
          { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
        ],
      }),
    },
    {
      titre: t.retrait, sous: t.retraitSous, Icone: IconWallet,
      fabrique: (): Operation => ({
        titre: t.retraitTitre, code: codeUssd(op, "retrait"),
        champs: [
          { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
          { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
        ],
      }),
    },
    {
      titre: t.transfert, sous: t.transfertSous, Icone: IconArrowUp,
      fabrique: (): Operation => ({
        titre: t.transfertTitre, code: codeUssd(op, "transfert"),
        champs: [
          { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: t.montantFcfa, aide: t.exempleCinquanteMille, type: "montant" },
        ],
      }),
    },
  ].filter((o) => o.fabrique().code);

  const consultations = [
    {
      l: t.consulterSolde, Icone: IconRefresh,
      fabrique: (): Operation => ({ titre: t.consulterSolde, code: codeUssd(op, "solde"), champs: [] }),
    },
    {
      l: t.monNumero, Icone: IconPhone,
      fabrique: (): Operation => ({ titre: t.monNumero, code: codeUssd(op, "mon_numero"), champs: [] }),
    },
  ].filter((c) => c.fabrique().code);

  return (
    // Grand écran : les trois opérations à gauche, la consultation à droite.
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      <header className="flex items-end justify-between lg:col-span-2">
        <div>
          <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sousTitre(op)}</p>
        </div>
        <span className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft">
          {carte.libelle}
        </span>
      </header>

      {operations.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-small leading-relaxed text-ink-faint lg:col-start-1">
          {t.aucunCodeReleve(op)}
        </p>
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface-raised lg:col-start-1">
          <ul className="divide-hair">
            {operations.map(({ titre, sous, Icone, fabrique }) => (
              <li key={titre}>
                <button onClick={() => setOperation(fabrique())}
                  className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition hover:bg-surface-2/60 lg:py-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
                    <Icone size={18} />
                  </span>
                  <div className="flex-1">
                    <p className="text-body font-medium">{titre}</p>
                    <p className="text-small text-ink-faint">{sous}</p>
                  </div>
                  <IconChevron size={16} className="text-ink-faint" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <aside className="flex flex-col gap-7 lg:col-start-2 lg:row-span-2 lg:row-start-2">
        {consultations.length > 0 && (
          <section>
            <h2 className="mb-3 text-heading font-semibold">{t.consultation}</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {consultations.map(({ l, Icone, fabrique }) => (
                <button key={l} onClick={() => setOperation(fabrique())}
                  className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
                  <Icone size={18} className="text-ink-soft" />
                  <span className="text-left leading-snug">{l}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {[
            { href: "/encaissements", l: t.smsRecus, Icone: IconInbox },
            { href: "/ussd", l: t.codeUssd, Icone: IconHash },
          ].map(({ href, l, Icone }) => (
            <Link key={l} href={href}
              className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
              <Icone size={18} className="text-ink-soft" />
              <span className="text-left leading-snug">{l}</span>
            </Link>
          ))}
        </section>
      </aside>

      <p className="text-caption leading-relaxed text-ink-faint lg:col-start-1">
        {t.basDePage}
      </p>

      {operation && (
        <OperationPopup
          operation={operation}
          onFermer={() => { setOperation(null); router.refresh(); }}
          onTermine={() => router.refresh()}
        />
      )}
    </div>
  );
}
