"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { etapesGeste } from "@noyau/codes";
import { FUSEAU_DEFAUT, nombre, type RaccourciAppris, type Sim } from "@noyau/types";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesCartes } from "@noyau/textes/cartes";
import { useLangue } from "@/app/langue";
import {
  IconArrowDown, IconArrowUp, IconEye, IconEyeOff, IconPhone, IconPuceSim,
  IconRefresh, IconWallet,
} from "./icons";
import { BoutonCopier, Coordonnees, formaterNumero } from "./coordonnees";
import { numeroACopier } from "@noyau/coordonnees";
import { couleurOperateur, LogoOperateur, operateurReconnu } from "./logos-operateurs";
import { Symbole } from "./marque";
import { OperationPopup, type Operation } from "./operation";
import type { ClientRecent } from "@noyau/recents";
import { jourCourt, jourDuReleve } from "@noyau/periodes";
import { barresDuSignal } from "@noyau/boitier";

/** Le signal en quatre barres — rempli au niveau, lisible sans chiffres.
 *
 *  `null` : INCONNU. Le modem répond « 99 » quand il ne sait pas, et ce 99
 *  dessinait quatre barres pleines sur une carte qui ne captait rien. Un
 *  signal inconnu se dessine vide et se dit « inconnu » ; un relevé figé
 *  (le boîtier se tait) se dessine grisé — il ne dit plus rien de maintenant. */
function BarresSignal({ niveau, fige, inconnu }: {
  niveau: number | null; fige: boolean; inconnu: string;
}) {
  // Le dessin vient du noyau : c'est sur lui que se règle le point « faible »
  // de l'onglet Comptes — une barre ou moins, et il est orange.
  const pleines = barresDuSignal(niveau);
  const libelle = niveau == null ? inconnu : `Signal ${niveau}/31`;
  return (
    <span className={`flex shrink-0 items-end gap-[3px] pb-1 ${fige ? "opacity-50" : ""}`} role="img"
      aria-label={libelle} title={libelle}>
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
  "libelle" | "operateur" | "numero" | "nom" | "solde" | "soldeMaj" | "soldeLe" | "signal"
  | "iccid" | "enPlace" | "derniereVue" | "presence"
> & {
  /** Le fuseau du TERMINAL : c'est lui qui dit si le relevé était hier. */
  fuseau?: string;
};

/**
 * UNE carte SIM du guichet — son solde, son numéro, sa marque. Quand
 * plusieurs cartes vivent dans le terminal (Orange ET MTN), chacune a la
 * sienne, et le doigt choisit celle sur laquelle les gestes s'appliquent.
 */
/** « Solde relevé hier à 21:54 » : l'heure seule ne disait pas QUEL jour,
 *  et un solde d'hier s'annonçait comme celui de maintenant. Même règle que
 *  le téléphone (`jourDuReleve`). */
function phraseDuReleve(carte: CarteGuichet, h: string, langue: ReturnType<typeof useLangue>) {
  const t = textesAccueil[langue];
  const jour = jourDuReleve(carte.soldeLe, Date.now(), carte.fuseau || FUSEAU_DEFAUT);
  return jour?.genre === "hier" ? t.soldeReleveHier(h)
    : jour?.genre === "avant" ? t.soldeReleveLe(jourCourt(jour.cle, langue), h)
    : t.soldeReleve(h);
}

function CarteSim({
  carte, langue, soldeCache, basculerSolde, onSolde,
}: {
  carte: CarteGuichet;
  langue: ReturnType<typeof useLangue>;
  soldeCache: boolean;
  basculerSolde: () => void;
  onSolde: () => void;
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
  const corpsMontant = `min(5.5rem, ${(100 / largeurEm).toFixed(2)}cqw)`;

  return (
    // Le CADRE ENTIER porte la couleur de l'opérateur — la carte est sertie
    // dans SA couleur, comme une pièce dans son chaton. Un opérateur sans
    // couleur reste sans cadre. UNE seule carte est montrée à la fois : elle
    // prend toute la largeur, et le chiffre avec elle.
    <section
      className="acct-marque relative overflow-hidden rounded-card p-6 [container-type:inline-size] sm:p-8"
      style={{ border: `2px solid ${couleurOperateur(op) ?? "rgba(255,255,255,0.3)"}` }}
    >
      {/* La Tresse, en filigrane sur la tranche droite — la carte est
          signée TOTEM comme une carte bancaire est frappée de sa banque. */}
      <Symbole size={210} className="pointer-events-none absolute -right-10 -top-8 text-laterite-clair/20" />
      {/* L'en-tête : le signal et les deux commandes — l'œil et
          l'actualisation — hors du chemin du chiffre. */}
      <div className="flex items-center justify-start gap-3">
        <span className="flex shrink-0 items-center gap-3">
          <BarresSignal niveau={carte.signal} fige={carte.presence === "inconnue"}
            inconnu={textesCartes[langue].signalInconnu} />
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
          // Le boîtier s'est tu : la carte n'est pas « retirée », on ne sait
          // rien de maintenant — et on le dit, au lieu d'un solde qui
          // paraîtrait frais.
          : carte.presence === "inconnue"
            ? textesCartes[langue].boitierSansNouvelles
          : carte.solde == null
            ? t.aucunSoldeConnu
            : carte.soldeMaj
              ? phraseDuReleve(carte, carte.soldeMaj, langue)
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
          <BoutonCopier clair valeur={numeroACopier(carte.numero)}
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
  aQui = {},
}: {
  cartes: CarteGuichet[];
  // Le carnet de chaque carte, puis les numéros vus dans ses SMS — préparés
  // par le serveur pour l'écran « À qui ? ».
  aQui?: Record<string, (ClientRecent & { enregistre: boolean })[]>;
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
    return { titre: t.monSolde, code: et[0] ?? "", etapes: et,
             champs: [], carte: c.iccid, carteLibelle: c.libelle, operateur: c.operateur };
  };

  const operationDe = (cle: string, titre: string,
                       champs: Operation["champs"]): Operation => {
    const et = active ? geste(active, cle) : [];
    return { titre, code: et[0] ?? "", etapes: et, champs,
             carte: active?.iccid, carteLibelle: active?.libelle,
             operateur: active?.operateur,
             recents: active ? aQui[active.iccid] : undefined };
  };

  const operations: { label: string; Icone: typeof IconWallet; fabrique: () => Operation }[] =
    active == null ? [] : [
    {
      label: t.depot, Icone: IconArrowDown,
      fabrique: (): Operation => operationDe("depot", t.depot, [
        { cle: "numero", label: t.numeroACrediter, aide: "699 12 34 56", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" },
      ]),
    },
    {
      label: t.retrait, Icone: IconWallet,
      fabrique: (): Operation => operationDe("retrait", t.retrait, [
        { cle: "point", label: t.numeroAgent, aide: "650 00 00 00", type: "numero" },
        { cle: "montant", label: t.montantFcfa, aide: "20 000", type: "montant" },
      ]),
    },
    {
      label: t.transfert, Icone: IconArrowUp,
      fabrique: (): Operation => operationDe("transfert", t.transfert, [
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
      {/* LE sélecteur : avec deux SIM, on CHOISIT sa caisse au lieu de
          serrer deux cartes dans une demi-largeur. La carte choisie garde
          alors l'écran entier — c'est là que le chiffre se lit. */}
      {plusieurs && active && (
        <div role="tablist" aria-label={t.choisirCarte(active.libelle)}
          className="flex flex-wrap gap-2 lg:col-start-1">
          {cartes.map((c) => {
            const actif = c.iccid === active.iccid;
            return (
              <button
                key={c.iccid}
                role="tab"
                aria-selected={actif}
                onClick={() => setChoisie(c.iccid)}
                className={`flex items-center gap-2.5 rounded-btn border px-3.5 py-2.5 text-small font-medium transition ${
                  actif
                    ? "border-transparent bg-ink text-white"
                    : "border-line bg-surface-raised text-ink-soft hover:border-ink-faint"
                }`}
              >
                <LogoOperateur operateur={c.operateur} size={20} />
                {c.libelle}
              </button>
            );
          })}
        </div>
      )}

      {/* LA carte : celle qui a la main, sur toute la largeur. */}
      {active && (
        <div className="lg:col-start-1">
          <CarteSim
            carte={active}
            langue={langue}
            soldeCache={soldeCache}
            basculerSolde={basculerSolde}
            onSolde={() => setOperation(solde(active))}
          />
        </div>
      )}

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
