"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { etapesGeste } from "@/lib/codes";
import { nombre, type RaccourciAppris, type Sim } from "@/lib/types";
import { textesAccueil } from "@/lib/textes/accueil";
import { useLangue } from "@/app/langue";
import {
  IconArrowDown, IconArrowUp, IconEye, IconEyeOff, IconPhone, IconPuceSim,
  IconRefresh, IconWallet,
} from "./icons";
import { BoutonCopier, Coordonnees, formaterNumero } from "./coordonnees";
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

// Ce que l'accueil doit savoir d'une carte pour la montrer et la piloter.
export type CarteGuichet = Pick<
  Sim,
  "libelle" | "operateur" | "numero" | "nom" | "solde" | "soldeMaj" | "signal"
  | "iccid" | "enPlace" | "derniereVue"
>;

/**
 * UNE carte SIM du guichet — son solde, son numéro, sa marque. Quand
 * plusieurs cartes vivent dans le terminal (Orange ET MTN), chacune a la
 * sienne, et le doigt choisit celle sur laquelle les gestes s'appliquent.
 */
function CarteSim({
  carte, langue, soldeCache, basculerSolde, onSolde,
  choisie, plusieurs, onChoisir,
}: {
  carte: CarteGuichet;
  langue: ReturnType<typeof useLangue>;
  soldeCache: boolean;
  basculerSolde: () => void;
  onSolde: () => void;
  choisie: boolean;
  plusieurs: boolean;
  onChoisir: () => void;
}) {
  const t = textesAccueil[langue];
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
    if (carte.solde != null) em += 1.35;
    return em * 1.07;
  })();
  const corpsMontant = `min(4.25rem, ${(100 / largeurEm).toFixed(2)}cqw)`;

  return (
    // Le CADRE ENTIER porte la couleur de l'opérateur — la carte est sertie
    // dans SA couleur, comme une pièce dans son chaton. Un opérateur sans
    // couleur reste sans cadre. Avec plusieurs cartes, celle qui n'a pas la
    // main s'estompe : le doigt la réveille.
    <section
      role={plusieurs ? "button" : undefined}
      tabIndex={plusieurs ? 0 : undefined}
      aria-pressed={plusieurs ? choisie : undefined}
      aria-label={plusieurs ? t.choisirCarte(carte.libelle) : undefined}
      onClick={plusieurs ? onChoisir : undefined}
      onKeyDown={plusieurs
        ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChoisir(); } }
        : undefined}
      className={`acct-marque relative overflow-hidden rounded-card p-5 [container-type:inline-size] sm:p-6 ${
        plusieurs ? "cursor-pointer transition" : ""
      }`}
      style={{
        border: `2px solid ${
          plusieurs && !choisie
            ? "rgba(255,255,255,0.16)"
            : couleurOperateur(op) ?? "rgba(255,255,255,0.3)"
        }`,
      }}
    >
      {/* La Tresse, en filigrane sur la tranche droite — la carte est
          signée TOTEM comme une carte bancaire est frappée de sa banque. */}
      <Symbole size={210} className="pointer-events-none absolute -right-10 -top-8 text-laterite-clair/20" />
      {/* L'en-tête : le signal et les deux commandes — l'œil et
          l'actualisation — hors du chemin du chiffre. */}
      <div className="flex items-center justify-start gap-3">
        <span className="flex shrink-0 items-center gap-3">
          {carte.signal != null && <BarresSignal niveau={carte.signal} />}
          {carte.solde != null && (
            <button
              onClick={(e) => { e.stopPropagation(); basculerSolde(); }}
              aria-label={soldeCache ? t.montrerSolde : t.masquerSolde}
              title={soldeCache ? t.montrerSolde : t.masquerSolde}
              className="grid size-9 place-items-center rounded-full border border-white/40 text-white transition hover:border-white hover:text-white"
            >
              {soldeCache ? <IconEye size={16} /> : <IconEyeOff size={16} />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSolde(); }}
            aria-label={t.actualiserAria}
            title={t.interrogerReseau}
            className="-ml-1.5 grid size-9 place-items-center rounded-full border border-white/40 text-white transition hover:border-white hover:text-white"
          >
            <IconRefresh size={16} />
          </button>
          {/* Les coordonnées à partager pour être payé : nom, numéro, réseau. */}
          <Coordonnees carte={{
            nom: carte.nom, numero: carte.numero,
            operateur: carte.operateur, libelle: carte.libelle,
          }} />
        </span>
      </div>
      {/* LE chiffre : toute la largeur de la carte, sur UNE ligne — jamais
          cassée. Le corps rétrécit à mesure que le solde grandit. */}
      <p className="mt-5 whitespace-nowrap text-[2rem] font-semibold leading-none tabnums tracking-tight"
        style={{ fontSize: corpsMontant }}>
        {entier}
        {decimales != null && (
          <span className="text-[0.55em] text-white/80">{separateur}{decimales}</span>
        )}
        {carte.solde != null && (
          <span className="ml-[0.3em] text-[0.34em] font-medium tracking-normal text-white/80">FCFA</span>
        )}
      </p>
      <p className="mt-2 text-small text-white/75">
        {!carte.enPlace
          ? t.carteMuette(carte.derniereVue)
          : carte.solde == null
            ? t.aucunSoldeConnu
            : carte.soldeMaj
              ? t.soldeMaj(carte.soldeMaj)
              : t.soldeSansHeure}
      </p>
      {/* Le pied : la puce SIM au trait — la carte à l'écran EST la carte
          posée dans le berceau, à Douala — puis le numéro et le libellé. */}
      <div className="mt-3 flex min-w-0 items-center gap-2">
        <IconPuceSim size={18} className="shrink-0 text-white/60" />
        <span className="truncate text-small tabnums text-white/85">
          {carte.numero ? formaterNumero(carte.numero) : t.carteAnonyme(carte.iccid.slice(-8))}
        </span>
        {/* Le numéro se copie d'un geste, contre lui : c'est ce qu'on donne
            le plus souvent, et le chercher à la main était pénible. */}
        {carte.numero && (
          <BoutonCopier clair valeur={formaterNumero(carte.numero)}
            libelle={t.copierNumero} libelleFait={t.numeroCopie} />
        )}
      </div>
      {/* Le libellé et la marque partagent le pied : la marque était posée
          en absolu dans l'angle et mordait sur le numéro — côte à côte, elles
          tiennent chacune leur place, même à mi-largeur. */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-caption text-white/55">{carte.libelle}</p>
        <span className="flex shrink-0 items-center gap-2"
          title={op === "MTN" ? "MTN Mobile Money" : op === "Orange" ? "Orange Money" : carte.libelle}>
          <span className="sr-only">
            {op === "MTN" ? "MTN Mobile Money" : op === "Orange" ? "Orange Money" : carte.libelle}
          </span>
          <LogoOperateur operateur={op} size={30} />
        </span>
      </div>

    </section>
  );
}

/**
 * Le guichet de l'accueil. UNE carte par SIM — Orange et MTN côte à côte,
 * chacune avec son solde et son numéro — et cinq gestes qui s'appliquent à
 * la carte choisie : chacun ouvre son pop-up, la session se joue dedans, du
 * formulaire au code secret. Personne n'est renvoyé vers une autre page.
 */
export function AccueilGuichet({
  cartes,
  raccourcis,
}: {
  cartes: CarteGuichet[];
  // Les boutons définis ou appris par le propriétaire, par opérateur : ils
  // l'emportent sur le catalogue — c'est le terrain qui commande.
  raccourcis: Record<string, RaccourciAppris[]>;
}) {
  const router = useRouter();
  const langue = useLangue();
  const t = textesAccueil[langue];
  const [operation, setOperation] = useState<Operation | null>(null);
  // La carte qui a la main : la première en place, à défaut la première.
  const [choisie, setChoisie] = useState(
    () => (cartes.find((c) => c.enPlace) ?? cartes[0])?.iccid ?? "",
  );
  const active = cartes.find((c) => c.iccid === choisie) ?? cartes[0];
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
  const plusieurs = cartes.length > 1;

  // Le parcours d'un geste suit l'opérateur de la carte : le bouton défini
  // par le propriétaire d'abord, sinon le code du catalogue, sinon la porte
  // du menu — la session s'ouvre et le menu de l'opérateur guide, la
  // plateforme répondant seule aux questions qu'elle reconnaît.
  const geste = (c: CarteGuichet, cle: string): string[] =>
    etapesGeste(c.operateur, cle, raccourcis[c.operateur] ?? []);
  const solde = (c: CarteGuichet): Operation => {
    const et = geste(c, "solde");
    return { titre: t.consulterSolde, code: et[0] ?? "", etapes: et,
             champs: [], carte: c.iccid };
  };

  const operationDe = (cle: string, titre: string,
                       champs: Operation["champs"]): Operation => {
    const et = active ? geste(active, cle) : [];
    return { titre, code: et[0] ?? "", etapes: et, champs,
             carte: active?.iccid };
  };

  const operations: { label: string; Icone: typeof IconWallet; fabrique: () => Operation }[] =
    active == null ? [] : [
    {
      label: t.depot, Icone: IconArrowDown,
      fabrique: (): Operation => operationDe("depot", t.depotTitre, [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" },
      ]),
    },
    {
      label: t.retrait, Icone: IconWallet,
      fabrique: (): Operation => operationDe("retrait", t.retraitTitre, [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" },
      ]),
    },
    {
      label: t.transfert, Icone: IconArrowUp,
      fabrique: (): Operation => operationDe("transfert", t.transfertTitre, [
        { cle: "numero", label: t.numeroBeneficiaire, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "50 000", type: "montant" },
      ]),
    },
    { label: t.solde, Icone: IconRefresh, fabrique: (): Operation => solde(active) },
    {
      label: t.monNumero, Icone: IconPhone,
      fabrique: (): Operation => operationDe("mon_numero", t.monNumero, []),
    },
  ].filter((o) => o.fabrique().code);

  return (
    <>
      {/* LES cartes : une par SIM, chacune avec SON solde — côte à côte dès
          que la largeur le permet, comme sur l'écran Comptes ; l'une sous
          l'autre sur téléphone, où la pleine largeur revient au chiffre. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:col-start-1">
        {cartes.map((c) => (
          <CarteSim
            key={c.iccid}
            carte={c}
            langue={langue}
            soldeCache={soldeCache}
            basculerSolde={basculerSolde}
            onSolde={() => { setChoisie(c.iccid); setOperation(solde(c)); }}
            choisie={c.iccid === active?.iccid}
            plusieurs={plusieurs}
            onChoisir={() => setChoisie(c.iccid)}
          />
        ))}
      </div>

      {/* Les gestes du guichet — sur la carte choisie. Chaque bouton ouvre
          son pop-up, ici même. */}
      <section className="flex flex-col gap-2 lg:col-start-1">
        {plusieurs && active && (
          <p className="text-caption uppercase tracking-wider text-ink-faint">
            {t.gestesSur(active.libelle)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {operations.map(({ label, Icone, fabrique }) => (
            <button key={label} onClick={() => setOperation(fabrique())}
              className="flex items-center gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-small font-medium transition hover:border-ink-faint">
              <Icone size={18} className="text-ink-soft" />
              {label}
            </button>
          ))}
          {operations.length === 0 && active && (
            <p className="col-span-full rounded-card border border-dashed border-line px-4 py-5 text-center text-small leading-relaxed text-ink-faint">
              {t.aucunCode(active.operateur)}{" "}
              <Link href="/reglages" className="underline underline-offset-4">{t.aucunCodeLien}</Link>.
            </p>
          )}
        </div>
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
