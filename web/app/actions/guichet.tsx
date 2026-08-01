"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import type { Sim } from "@/lib/types";
import {
  IconArrowDown, IconArrowUp, IconChevron, IconHash,
  IconInbox, IconPhone, IconRefresh, IconWallet,
} from "../icons";
import { OperationPopup, type Operation } from "../operation";

/**
 * Le guichet. Chaque geste ouvre son pop-up ici même : le formulaire, puis la
 * vraie session USSD sur la carte de Douala, jusqu'au pavé du code secret.
 * Les codes viennent du catalogue relevé sur le terrain (codes.py).
 */
export function Guichet({ carte }: { carte: Pick<Sim, "libelle" | "operateur"> }) {
  const router = useRouter();
  const [operation, setOperation] = useState<Operation | null>(null);
  const op = carte.operateur;

  const operations = [
    {
      titre: "Dépôt", sous: "Créditer un compte Mobile Money", Icone: IconArrowDown,
      fabrique: (): Operation => ({
        titre: "Dépôt d’argent", code: codeUssd(op, "depot"),
        champs: [
          { cle: "numero", label: "Numéro à créditer", aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: "Montant (FCFA)", aide: "20 000", type: "montant" },
        ],
      }),
    },
    {
      titre: "Retrait", sous: "Chez un agent", Icone: IconWallet,
      fabrique: (): Operation => ({
        titre: "Retrait d’argent", code: codeUssd(op, "retrait"),
        champs: [
          { cle: "point", label: "Numéro de l’agent", aide: "650 00 00 00", type: "numero" },
          { cle: "montant", label: "Montant (FCFA)", aide: "20 000", type: "montant" },
        ],
      }),
    },
    {
      titre: "Transfert", sous: "Envoyer vers un numéro", Icone: IconArrowUp,
      fabrique: (): Operation => ({
        titre: "Transfert d’argent", code: codeUssd(op, "transfert"),
        champs: [
          { cle: "numero", label: "Numéro du bénéficiaire", aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: "Montant (FCFA)", aide: "50 000", type: "montant" },
        ],
      }),
    },
  ].filter((o) => o.fabrique().code);

  const consultations = [
    {
      l: "Consulter le solde", Icone: IconRefresh,
      fabrique: (): Operation => ({ titre: "Consulter le solde", code: codeUssd(op, "solde"), champs: [] }),
    },
    {
      l: "Mon numéro", Icone: IconPhone,
      fabrique: (): Operation => ({ titre: "Mon numéro", code: codeUssd(op, "mon_numero"), champs: [] }),
    },
  ].filter((c) => c.fabrique().code);

  return (
    // Grand écran : les trois opérations à gauche, la consultation à droite.
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-10">
      <header className="flex items-end justify-between lg:col-span-2">
        <div>
          <h1 className="text-title font-semibold tracking-tight">Opérations</h1>
          <p className="mt-1 text-small text-ink-soft">
            Le vrai guichet {op}, ouvert depuis la plateforme.
          </p>
        </div>
        <span className="rounded-btn border border-line bg-surface-raised px-3 py-1.5 text-small text-ink-soft">
          {carte.libelle}
        </span>
      </header>

      {operations.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-small leading-relaxed text-ink-faint lg:col-start-1">
          Aucun code {op} n’a encore été relevé sur le terrain — on ne devine
          pas un chiffre qui déplace de l’argent. Ajoutez-les dans les
          Réglages.
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
            <h2 className="mb-3 text-heading font-semibold">Consultation</h2>
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
            { href: "/encaissements", l: "SMS reçus", Icone: IconInbox },
            { href: "/ussd", l: "Code USSD", Icone: IconHash },
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
        Chaque geste ouvre la session sur la vraie carte, à Douala. Le réseau
        pose ses questions, la plateforme y répond avec vos informations, et le
        code secret se compose sur son pavé — jamais enregistré nulle part.
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
