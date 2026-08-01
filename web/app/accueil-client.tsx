"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import { fcfa, type Sim } from "@/lib/types";
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
  carte: Pick<Sim, "libelle" | "operateur" | "numero" | "solde" | "soldeSource" | "signal" | "iccid">;
}) {
  const router = useRouter();
  const [operation, setOperation] = useState<Operation | null>(null);
  const op = carte.operateur;

  const solde = (): Operation =>
    ({ titre: "Consulter le solde", code: codeUssd(op, "solde"), champs: [] });

  const operations: { label: string; Icone: typeof IconWallet; fabrique: () => Operation }[] = [
    {
      label: "Dépôt", Icone: IconArrowDown,
      fabrique: (): Operation => ({
        titre: "Dépôt d’argent", code: codeUssd(op, "depot"),
        champs: [
          { cle: "numero", label: "Numéro à créditer", aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: "Montant (FCFA)", aide: "20 000", type: "montant" },
        ],
      }),
    },
    {
      label: "Retrait", Icone: IconWallet,
      fabrique: (): Operation => ({
        titre: "Retrait d’argent", code: codeUssd(op, "retrait"),
        champs: [
          { cle: "point", label: "Numéro de l’agent", aide: "650 00 00 00", type: "numero" },
          { cle: "montant", label: "Montant (FCFA)", aide: "20 000", type: "montant" },
        ],
      }),
    },
    {
      label: "Transfert", Icone: IconArrowUp,
      fabrique: (): Operation => ({
        titre: "Transfert d’argent", code: codeUssd(op, "transfert"),
        champs: [
          { cle: "numero", label: "Numéro du bénéficiaire", aide: "699 12 34 56", type: "numero" },
          { cle: "montant", label: "Montant (FCFA)", aide: "50 000", type: "montant" },
        ],
      }),
    },
    { label: "Solde", Icone: IconRefresh, fabrique: (): Operation => solde() },
    {
      label: "Mon numéro", Icone: IconPhone,
      fabrique: (): Operation => ({ titre: "Mon numéro", code: codeUssd(op, "mon_numero"), champs: [] }),
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
            {carte.solde == null ? "—" : fcfa(carte.solde)}
          </p>
          <button
            onClick={() => setOperation(solde())}
            aria-label="Actualiser le solde : interroger le réseau"
            title="Interroger le réseau"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
          >
            <IconRefresh size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-small text-white/55">
          {carte.solde == null
            ? "Aucun solde connu : appuyez sur la flèche pour interroger le réseau."
            : `D’après ${carte.soldeSource}`}
        </p>
        <p className="mt-3 text-small tabnums text-white/55">
          {carte.numero || `carte ${carte.iccid.slice(-8)}`} · {carte.libelle}
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
            Aucun code {op} relevé sur le terrain : ajoutez-les dans les{" "}
            <Link href="/reglages" className="underline underline-offset-4">Réglages</Link>.
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
