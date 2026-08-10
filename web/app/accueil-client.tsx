"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import { fcfa, type Paiement, type Sim } from "@/lib/types";
import { textesAccueil } from "@/lib/textes/accueil";
import { textesGens } from "@/lib/textes/gens";
import { textesCharpente } from "@/lib/textes/charpente";
import { useLangue } from "@/app/langue";
import { IconArrowDown, IconArrowUp, IconDoc, IconPhone, IconRefresh, IconWallet } from "./icons";
import { OperationPopup, type Operation } from "./operation";

/**
 * Le guichet de l'accueil. Un seul solde — celui de la carte — et cinq
 * gestes : chacun ouvre son pop-up, la session se joue dedans, du formulaire
 * au code secret. Personne n'est renvoyé vers une autre page.
 *
 * `peutComposer` COMMANDE TOUS LES GESTES, Y COMPRIS LA FLÈCHE DU SOLDE.
 * Chacun d'eux compose un code sur la puce — c'est le genre « ussd », et
 * `lib/roles.ts` le réserve au propriétaire : « même quand le code composé
 * paraît innocent, c'est par là que l'argent sort ». Montrer ces boutons à qui
 * tient le comptoir reviendrait à lui promettre six refus. La carte du solde,
 * elle, reste : lire n'est refusé à personne.
 */
export function AccueilGuichet({
  carte,
  peutComposer,
}: {
  carte: Pick<Sim, "libelle" | "operateur" | "numero" | "solde" | "soldeMaj" | "signal" | "iccid">;
  peutComposer: boolean;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAccueil[langue];
  const tg = textesGens[langue];
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
  ].filter((o) => peutComposer && o.fabrique().code);

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
          {peutComposer && (
            <button
              onClick={() => setOperation(solde())}
              aria-label={t.actualiserAria}
              title={t.interrogerReseau}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
            >
              <IconRefresh size={16} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-small text-white/55">
          {carte.solde == null
            ? peutComposer ? t.aucunSoldeConnu : tg.soldeInconnu
            : carte.soldeMaj
              ? t.soldeMaj(carte.soldeMaj)
              : t.soldeSansHeure}
        </p>
        <p className="mt-3 text-small tabnums text-white/55">
          {carte.numero || t.carteAnonyme(carte.iccid.slice(-8))} · {carte.libelle}
        </p>
      </section>

      {/* Les gestes du guichet — chaque bouton ouvre son pop-up, ici même.
          Absents entièrement pour qui ne compose pas : la carte qui explique
          à qui appartient ce geste prend leur place, sur la page. */}
      {peutComposer && (
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-start-1">
        {operations.map(({ label, Icone, fabrique }) => (
          <button key={label} onClick={() => setOperation(fabrique())}
            className="flex items-center gap-2.5 rounded-card border border-line-control bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
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
      )}

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

/**
 * Les derniers SMS, pour qui n'a que le droit de lire.
 *
 * POURQUOI UNE SECONDE LISTE PLUTÔT QUE LA MÊME
 * `DerniersSms` ouvre la fiche du message, et cette fiche est un plan de
 * travail : elle choisit la nature du SMS, établit le reçu, marque comme lu.
 * Ces trois gestes demandent le comptoir, et ils refuseraient. Un lecteur
 * verrait donc un écran qui l'invite à faire trois choses interdites — la
 * définition même d'une panne déguisée.
 *
 * Ici, la même information et un seul geste : télécharger le reçu, qui lui
 * est parfaitement permis. Une liste, pas un établi.
 */
export function ListeLecture({ paiements }: { paiements: Paiement[] }) {
  const langue = useLangue();
  const t = textesCharpente[langue];

  return (
    <ul className="divide-hair">
      {paiements.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3.5">
          <span aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
            {p.sens === "in" ? <IconArrowDown size={16} />
              : p.sens === "out" ? <IconArrowUp size={16} /> : "·"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium">{p.nom}</span>
            <span className="block truncate text-small text-ink-faint">
              {p.sim} · {p.heure} · {p.smsBrut}
            </span>
          </span>
          {p.montant != null && (
            <span className={`shrink-0 text-body font-medium tabnums ${
              p.sens === "in" ? "text-positive" : p.sens === "out" ? "text-ink" : "text-ink-soft"
            }`}>
              {p.sens === "in" ? "+" : p.sens === "out" ? "−" : ""}{fcfa(p.montant, langue)}
            </span>
          )}
          {p.recu && (
            <a href={`/api/recu/${p.recu}`} target="_blank" rel="noopener"
              title={t.telechargerRecu} aria-label={`${t.telechargerRecu} ${p.recu}`}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition hover:border-ink hover:text-ink">
              <IconDoc size={16} />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
