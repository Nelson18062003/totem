"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { etapesGeste } from "@/lib/codes";
import { textesGuichet } from "@/lib/textes/guichet";
import type { RaccourciAppris, Sim } from "@/lib/types";
import {
  IconArrowDown, IconArrowUp, IconChart, IconChevron, IconHash,
  IconInbox, IconPhone, IconRefresh, IconWallet,
} from "../icons";
import { useLangue } from "../langue";
import { OperationPopup, type Operation } from "../operation";

type CarteGuichet = Pick<Sim, "libelle" | "operateur" | "iccid">;

/**
 * Le guichet. Chaque geste ouvre son pop-up ici même : le formulaire, puis la
 * vraie session USSD sur la carte de Douala, jusqu'au pavé du code secret.
 * Les codes viennent du catalogue relevé sur le terrain (codes.py) ; un geste
 * sans code direct passe par la porte du menu de l'opérateur. Avec plusieurs
 * cartes en place, le sélecteur en tête dit sur laquelle on compose.
 */
export function Guichet({
  cartes,
  raccourcis,
}: {
  cartes: CarteGuichet[];
  raccourcis: Record<string, RaccourciAppris[]>;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesGuichet[langue];
  const [operation, setOperation] = useState<Operation | null>(null);
  const [choisie, setChoisie] = useState(cartes[0]?.iccid ?? "");
  const carte = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
  const op = carte.operateur;

  // Le bouton défini par le propriétaire d'abord, sinon le catalogue,
  // sinon la porte du menu de l'opérateur.
  const operationDe = (cle: string, titre: string,
                       champs: Operation["champs"]): Operation => {
    const et = etapesGeste(op, cle, raccourcis[op] ?? []);
    return { titre, code: et[0] ?? "", etapes: et, champs, carte: carte.iccid };
  };

  const operations = [
    {
      titre: t.depot, sous: t.depotSous, Icone: IconArrowDown,
      fabrique: (): Operation => operationDe("depot", t.depotTitre, [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      titre: t.retrait, sous: t.retraitSous, Icone: IconWallet,
      fabrique: (): Operation => operationDe("retrait", t.retraitTitre, [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleVingtMille, type: "montant" },
      ]),
    },
    {
      titre: t.transfert, sous: t.transfertSous, Icone: IconArrowUp,
      fabrique: (): Operation => operationDe("transfert", t.transfertTitre, [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: t.exempleCinquanteMille, type: "montant" },
      ]),
    },
  ].filter((o) => o.fabrique().code);

  const consultations = [
    {
      l: t.consulterSolde, Icone: IconRefresh,
      fabrique: (): Operation => operationDe("solde", t.consulterSolde, []),
    },
    {
      l: t.monNumero, Icone: IconPhone,
      fabrique: (): Operation => operationDe("mon_numero", t.monNumero, []),
    },
  ].filter((c) => c.fabrique().code);

  return (
    // Grand écran : les trois opérations à gauche, la consultation à droite.
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      {/* Le titre et la carte visée. Deux cartes en place : le choix se fait
          ici, et tout l'écran suit. */}
      <header className="flex flex-wrap items-end justify-between gap-3 lg:col-span-2">
        <h1 className="text-title font-semibold tracking-tight">{t.titre}</h1>
        {cartes.length > 1 ? (
          <span className="flex flex-wrap gap-1.5" role="group" aria-label={t.carteVisee}>
            {cartes.map((c) => (
              <button
                key={c.iccid}
                onClick={() => setChoisie(c.iccid)}
                aria-pressed={c.iccid === carte.iccid}
                className={`rounded-btn px-3 py-1.5 text-small font-medium transition ${
                  c.iccid === carte.iccid
                    ? "bg-ink text-white"
                    : "border border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
                }`}
              >
                {c.libelle}
              </button>
            ))}
          </span>
        ) : (
          <span className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft">
            {carte.libelle}
          </span>
        )}
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
            { href: "/analyse", l: t.analyse, Icone: IconChart },
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
