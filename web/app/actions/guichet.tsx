"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { codeUssd } from "@/lib/codes";
import { textesGuichet } from "@/lib/textes/guichet";
import type { Sim } from "@/lib/types";
import {
  IconArrowDown, IconArrowUp, IconHash,
  IconInbox, IconPhone, IconRefresh, IconWallet,
} from "../icons";
import { useLangue } from "../langue";
import { OperationPopup, type Operation } from "../operation";
import { Bouton } from "../ui/bouton";
import { Carte, EnTeteSection } from "../ui/carte";
import { PuceInfo, Vide } from "../ui/etat";
import { Liste, Rangee } from "../ui/rangee";

/**
 * Le guichet. Chaque geste ouvre son pop-up ici même : le formulaire, puis la
 * vraie session USSD sur la carte de Douala, jusqu'au pavé du code secret.
 * Les codes viennent du catalogue relevé sur le terrain (codes.py).
 *
 * L'écran est entièrement recomposé sur les composants du système : les trois
 * opérations sont des rangées de deux lignes (72 px, disque décoratif de 32,
 * chevron de 20), les consultations et les deux raccourcis sont des boutons
 * secondaires de 44. Rien n'y déclare plus sa propre hauteur.
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
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-8">
      <header className="flex items-end justify-between gap-4 lg:col-span-2">
        <div className="min-w-0">
          <h1 className="text-title">{t.titre}</h1>
          <p className="mt-1 text-small text-ink-soft">{t.sousTitre(op)}</p>
        </div>
        {/* La carte en place se dit, elle ne se clique pas : puce d'information. */}
        <PuceInfo>{carte.libelle}</PuceInfo>
      </header>

      {operations.length === 0 ? (
        <div className="lg:col-start-1">
          <Vide titre={t.aucunCodeReleve(op)} />
        </div>
      ) : (
        <Carte bordABord className="lg:col-start-1">
          <Liste>
            {operations.map(({ titre, sous, Icone, fabrique }) => (
              <Rangee
                key={titre}
                lignes={2}
                titre={titre}
                sousTitre={sous}
                pastille={<Icone size={16} />}
                chevron
                onClick={() => setOperation(fabrique())}
              />
            ))}
          </Liste>
        </Carte>
      )}

      <aside className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-2">
        {consultations.length > 0 && (
          <section>
            <EnTeteSection titre={t.consultation} />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {consultations.map(({ l, Icone, fabrique }) => (
                <Bouton
                  key={l}
                  variante="secondaire"
                  pleineLargeur
                  icone={<Icone size={20} />}
                  onClick={() => setOperation(fabrique())}
                >
                  {l}
                </Bouton>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {[
            { href: "/encaissements", l: t.smsRecus, Icone: IconInbox },
            { href: "/ussd", l: t.codeUssd, Icone: IconHash },
          ].map(({ href, l, Icone }) => (
            <Bouton
              key={l}
              href={href}
              variante="secondaire"
              pleineLargeur
              icone={<Icone size={20} />}
            >
              {l}
            </Bouton>
          ))}
        </section>
      </aside>

      <p className="max-w-lecture text-caption text-ink-faint lg:col-start-1">
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
