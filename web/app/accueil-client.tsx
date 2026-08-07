"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import { fcfa, type Sim } from "@/lib/types";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import { IconArrowDown, IconArrowUp, IconPhone, IconRefresh, IconWallet } from "./icons";
import { OperationPopup, type Operation } from "./operation";
import { Bouton, BoutonIcone } from "./ui/bouton";
import { Vide } from "./ui/etat";

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
      <section className="acct rounded-card p-4 lg:col-start-1">
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
          {/* Actualiser faisait 36 × 36 : sous le plancher des 44, et sur le
              geste par lequel on va chercher le solde au réseau. C'est un
              bouton d'icône du système, carré, 44 × 44. */}
          <BoutonIcone
            variante="secondaire"
            onClick={() => setOperation(solde())}
            aria-label={t.actualiserAria}
            title={t.interrogerReseau}
            icone={<IconRefresh size={20} />}
          />
        </div>
        <p className="mt-2 text-small text-white/55">
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

      {/* Les gestes du guichet — chaque bouton ouvre son pop-up, ici même.
          Ils faisaient 42 px de haut, avec une icône de 18 : ce sont des
          boutons secondaires du système, 44 px et icône de 20. */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-start-1">
        {operations.map(({ label, Icone, fabrique }) => (
          <Bouton
            key={label}
            variante="secondaire"
            pleineLargeur
            onClick={() => setOperation(fabrique())}
            icone={<Icone size={20} className="text-ink-soft" />}
          >
            {label}
          </Bouton>
        ))}
        {operations.length === 0 && (
          // L'état vide du système : le chemin des réglages y devient un vrai
          // contrôle au lieu d'un mot souligné au fil du texte.
          <div className="col-span-full">
            <Vide
              titre={t.aucunCode(op)}
              action={
                <Bouton variante="secondaire" href="/reglages">
                  {t.aucunCodeLien}
                </Bouton>
              }
            />
          </div>
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
