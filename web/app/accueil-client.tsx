"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { codeUssd } from "@/lib/codes";
import { nombre, type Sim } from "@/lib/types";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import {
  IconArrowDown, IconArrowUp, IconEye, IconEyeOff, IconPhone, IconRefresh,
  IconWallet,
} from "./icons";
import { LogoOperateur } from "./logos-operateurs";
import { OperationPopup, type Operation } from "./operation";

// Le solde peut se cacher d'un geste — un écran ouvert devant quelqu'un ne
// dit pas ce que contient la caisse. Le choix tient à l'appareil (et non au
// compte) : c'est un réglage d'écran, il se garde dans le navigateur.
const CLE_SOLDE_CACHE = "totem_solde_cache";

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
  // Masqué par défaut tant que le choix n'est pas lu : le solde ne doit
  // jamais APPARAÎTRE puis se cacher — dans ce sens-là, c'est trop tard.
  const [soldeCache, setSoldeCache] = useState(true);
  useEffect(() => {
    setSoldeCache(localStorage.getItem(CLE_SOLDE_CACHE) === "1");
  }, []);
  const basculerSolde = () => {
    setSoldeCache((c) => {
      localStorage.setItem(CLE_SOLDE_CACHE, c ? "0" : "1");
      return !c;
    });
  };
  const op = carte.operateur;

  // Le chiffre affiché, et son corps : plus le solde est long, plus le corps
  // se resserre — la ligne ne casse JAMAIS, de cent mille à un milliard.
  const montantTexte = carte.solde == null ? "—" : nombre(carte.solde, langue);
  const affiche = carte.solde == null ? "—" : soldeCache ? "••••••" : montantTexte;
  const classeMontant =
    affiche.length <= 10
      ? "text-hero"
      : affiche.length <= 13
        ? "text-[1.7rem] sm:text-[2.25rem]"
        : "text-[1.35rem] sm:text-[1.9rem]";

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
        {/* L'en-tête de la carte : LA marque de la caisse (le logo suit
            l'opérateur de la carte en place), et les deux commandes — l'œil
            et l'actualisation — hors du chemin du chiffre. */}
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <LogoOperateur operateur={op} size={18} className="shrink-0" />
            <span className="truncate text-caption uppercase tracking-wider text-white/60">
              {op === "MTN" ? "MTN Mobile Money" : op === "Orange" ? "Orange Money" : carte.libelle}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {/* L'œil : cacher le solde d'un geste — un écran ouvert devant
                quelqu'un ne dit pas ce que contient la caisse. Le choix est
                retenu sur cet appareil. */}
            {carte.solde != null && (
              <button
                onClick={basculerSolde}
                aria-label={soldeCache ? t.montrerSolde : t.masquerSolde}
                title={soldeCache ? t.montrerSolde : t.masquerSolde}
                className="grid size-9 place-items-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
              >
                {soldeCache ? <IconEye size={16} /> : <IconEyeOff size={16} />}
              </button>
            )}
            <button
              onClick={() => setOperation(solde())}
              aria-label={t.actualiserAria}
              title={t.interrogerReseau}
              className="grid size-9 place-items-center rounded-full border border-white/25 text-white/80 transition hover:border-white/60 hover:text-white"
            >
              <IconRefresh size={16} />
            </button>
          </span>
        </div>
        {/* LE chiffre : toute la largeur de la carte, sur UNE ligne — jamais
            cassée. Le corps rétrécit à mesure que le solde grandit : un
            milliard tient aussi bien que cent mille. La devise reste plus
            discrète : c'est le nombre qu'on vient lire. */}
        <p className={`mt-4 whitespace-nowrap font-semibold tabnums tracking-tight ${classeMontant}`}>
          {affiche}
          {carte.solde != null && (
            <span className="ml-2 text-heading font-medium text-white/60">FCFA</span>
          )}
        </p>
        <p className="mt-1.5 text-small text-white/55">
          {carte.solde == null
            ? t.aucunSoldeConnu
            : carte.soldeMaj
              ? t.soldeMaj(carte.soldeMaj)
              : t.soldeSansHeure}
        </p>
        <p className="mt-3 text-small tabnums text-white/55">
          {carte.numero || t.carteAnonyme(carte.iccid.slice(-8))} · {carte.libelle}
          {carte.signal != null && <> · {carte.signal}/31</>}
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
