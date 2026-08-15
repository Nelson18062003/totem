"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { codeUssd } from "@/lib/codes";
import { nombre, type Sim } from "@/lib/types";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import {
  IconArrowDown, IconArrowUp, IconEye, IconEyeOff, IconPhone, IconPuceSim,
  IconRefresh, IconWallet,
} from "./icons";
import { couleurOperateur, LogoOperateur, operateurReconnu } from "./logos-operateurs";
import { Symbole } from "./marque";
import { OperationPopup, type Operation } from "./operation";

/** Le signal en quatre barres — rempli au niveau, lisible sans chiffres. */
function BarresSignal({ niveau }: { niveau: number }) {
  const pleines = Math.max(0, Math.min(4, Math.round((niveau / 31) * 4)));
  return (
    <span className="flex shrink-0 items-end gap-[3px] pb-1" role="img"
      aria-label={`Signal ${niveau}/31`} title={`Signal ${niveau}/31`}>
      {[5, 8, 11, 14].map((h, i) => (
        <span key={h} style={{ height: h }}
          className={`w-[3px] rounded-full ${i < pleines ? "bg-white/90" : "bg-white/30"}`} />
      ))}
    </span>
  );
}

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

  // LE chiffre : le PLUS GRAND corps qui tienne dans la carte, toujours.
  // On découpe le montant (l'entier domine, les décimales s'effacent, la
  // devise se retire) ; on estime sa largeur en « em » ; et le corps se
  // calcule depuis la largeur RÉELLE de la carte (unités de conteneur) —
  // cinq millions s'affiche immense, un milliard reste grand, et la ligne
  // ne casse jamais, quel que soit l'écran.
  const montantTexte = carte.solde == null ? "—" : nombre(carte.solde, langue);
  const affiche = carte.solde == null ? "—" : soldeCache ? "••••••" : montantTexte;
  const separateur = langue === "en" ? "." : ",";
  const [entier, decimales] = (() => {
    if (carte.solde == null || soldeCache) return [affiche, null] as const;
    const i = montantTexte.lastIndexOf(separateur);
    return i === -1
      ? ([montantTexte, null] as const)
      : ([montantTexte.slice(0, i), montantTexte.slice(i + 1)] as const);
  })();
  // Largeur estimée, en em : chiffre tabulaire ≈ 0,62 ; séparateur ≈ 0,26 ;
  // décimales à 55 % ; 7 % de marge. La devise vit sur la ligne d'info :
  // toute la largeur de la carte appartient au nombre.
  const largeurEm = (() => {
    const chiffres = entier.replace(/[^0-9•—]/g, "").length;
    const seps = entier.length - chiffres;
    let em = chiffres * 0.62 + seps * 0.26;
    if (decimales) em += (decimales.length + 1) * 0.62 * 0.55;
    return em * 1.07;
  })();
  const corpsMontant = `min(4.25rem, ${(100 / largeurEm).toFixed(2)}cqw)`;

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
      {/* Le CADRE ENTIER porte la couleur de l'opérateur — la carte est
          sertie dans SA couleur, comme une pièce dans son chaton. Un
          opérateur sans couleur reste sans cadre. */}
      <section className="acct-marque relative overflow-hidden rounded-card p-5 [container-type:inline-size] sm:p-6 lg:col-start-1"
        style={{ border: `2px solid ${couleurOperateur(op) ?? "rgba(255,255,255,0.3)"}` }}>
        {/* La Tresse, en filigrane sur la tranche droite — la carte est
            signée TOTEM comme une carte bancaire est frappée de sa banque.
            Jamais sous le chiffre : le filigrane vit au bord, le nombre à
            gauche. */}
        <Symbole size={210} className="pointer-events-none absolute -right-10 -top-8 text-laterite-clair/20" />
        {/* L'en-tête de la carte : LA marque de la caisse (le logo suit
            l'opérateur de la carte en place), et les deux commandes — l'œil
            et l'actualisation — hors du chemin du chiffre. */}
        <div className="flex items-center justify-end gap-3">
          <span className="flex shrink-0 items-center gap-3">
            {carte.signal != null && <BarresSignal niveau={carte.signal} />}
            {/* L'œil : cacher le solde d'un geste — un écran ouvert devant
                quelqu'un ne dit pas ce que contient la caisse. Le choix est
                retenu sur cet appareil. */}
            {carte.solde != null && (
              <button
                onClick={basculerSolde}
                aria-label={soldeCache ? t.montrerSolde : t.masquerSolde}
                title={soldeCache ? t.montrerSolde : t.masquerSolde}
                className="grid size-9 place-items-center rounded-full border border-white/40 text-white transition hover:border-white hover:text-white"
              >
                {soldeCache ? <IconEye size={16} /> : <IconEyeOff size={16} />}
              </button>
            )}
            <button
              onClick={() => setOperation(solde())}
              aria-label={t.actualiserAria}
              title={t.interrogerReseau}
              className="-ml-1.5 grid size-9 place-items-center rounded-full border border-white/40 text-white transition hover:border-white hover:text-white"
            >
              <IconRefresh size={16} />
            </button>
          </span>
        </div>
        {/* LE chiffre : toute la largeur de la carte, sur UNE ligne — jamais
            cassée. Le corps rétrécit à mesure que le solde grandit : un
            milliard tient aussi bien que cent mille. La devise reste plus
            discrète : c'est le nombre qu'on vient lire. */}
        <p className="mt-3 whitespace-nowrap text-[2rem] font-semibold leading-none tabnums tracking-tight"
          style={{ fontSize: corpsMontant }}>
          {entier}
          {decimales != null && (
            <span className="text-[0.55em] text-white/80">{separateur}{decimales}</span>
          )}
        </p>
        <p className="mt-2 text-small text-white/75">
          {carte.solde == null ? (
            t.aucunSoldeConnu
          ) : (
            <>
              <span className="font-semibold text-white/90">FCFA</span>
              {" · "}
              {carte.soldeMaj ? t.soldeMaj(carte.soldeMaj) : t.soldeSansHeure}
            </>
          )}
        </p>
        {/* Le pied de la carte : la puce SIM au trait — la carte à l'écran
            EST la carte posée dans le berceau, à Douala — et le signal en
            barres, qui se lit sans se déchiffrer. */}
        <div className="mt-6 flex items-end justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2.5 text-small tabnums text-white/80">
            <IconPuceSim size={20} className="shrink-0 text-white/60" />
            <span className="truncate">
              {carte.numero || t.carteAnonyme(carte.iccid.slice(-8))} · {carte.libelle}
            </span>
          </p>
          {/* Le logo dit la caisse — en bas à droite, dans la colonne de La
              Tresse, comme la marque du réseau au coin d'une carte bancaire.
              Un opérateur sans marque garde son libellé écrit. */}
          <span className="flex shrink-0 items-center gap-2"
            title={op === "MTN" ? "MTN Mobile Money" : op === "Orange" ? "Orange Money" : carte.libelle}>
            <span className="sr-only">
              {op === "MTN" ? "MTN Mobile Money" : op === "Orange" ? "Orange Money" : carte.libelle}
            </span>
            {!operateurReconnu(op) && (
              <span className="text-caption uppercase tracking-wider text-white/85">
                {carte.libelle}
              </span>
            )}
            <LogoOperateur operateur={op} size={30} />
          </span>
        </div>
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
