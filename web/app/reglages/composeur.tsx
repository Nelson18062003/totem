"use client";

/**
 * Le composeur : un code USSD qui se construit à la main, bloc par bloc.
 *
 * Écrire « *126*1*{numero}*{montant}# » au clavier, accolades comprises, ce
 * n'est pas un travail pour le propriétaire d'un guichet. Ici le code est
 * une SUITE DE MORCEAUX : les chiffres qu'on tape, et les blocs qu'on pose.
 *
 * Un bloc n'est pas un mot posé au hasard : il a une NATURE. « Numéro du
 * bénéficiaire » réclame un numéro de téléphone, « Montant » une somme. Le
 * bloc le dit sur lui-même, et l'aperçu montre le code tel que le réseau le
 * recevra une fois la case remplie.
 *
 * Deux façons de poser un bloc, parce qu'un guichet se tient aussi bien
 * devant un écran que dans la main :
 *
 *   - **le toucher** — un appui pose le bloc là où est le curseur. C'est la
 *     voie sûre, celle qui marche sur un téléphone ;
 *   - **le glisser** — on attrape le bloc et on le lâche à l'endroit voulu,
 *     entre deux morceaux du code. Les blocs déjà posés se déplacent de la
 *     même façon.
 *
 * Le code lui-même reste la seule vérité : les blocs ne sont qu'une façon de
 * le regarder, recomposée à chaque geste. Et le verdict s'affiche pendant
 * qu'on écrit — le robot revérifiera tout, mais autant dire ce qui cloche
 * avant l'aller-retour.
 */

import { useEffect, useRef, useState } from "react";
import {
  type Bloc,
  EXEMPLES_VARIABLE,
  NATURES_VARIABLE,
  VARIABLES,
  apercuRempli,
  decouperEnBlocs,
  recomposer,
  verdictCode,
} from "@/lib/codes";
import { textesReglages } from "@/lib/textes/reglages";
import { IconBank, IconPhone, IconWallet } from "../icons";
import { useLangue } from "../langue";

const DESSINS: Record<string, typeof IconPhone> = {
  numero: IconPhone,
  montant: IconWallet,
  point: IconBank,
};

// Ce qui voyage pendant un glisser : le nom du trou, et d'où il vient (une
// réserve neuve, ou une place qu'il quitte).
const TYPE_GLISSE = "application/x-totem-bloc";

/**
 * La forme sur laquelle l'écran s'appuie : du texte, un bloc, du texte, un
 * bloc… en commençant et en finissant TOUJOURS par du texte, fût-il vide.
 *
 * Ce n'est pas une coquetterie. Sans cette régularité, taper un chiffre dans
 * un code vide ferait apparaître un morceau — donc une autre case — et le
 * clavier perdrait la main au premier caractère. Avec elle, les cases
 * gardent leur place tant qu'on n'a rien posé ni retiré : on écrit d'une
 * traite, et le curseur reste où on l'a laissé.
 *
 * Chaque case de texte est à un rang PAIR, chaque bloc à un rang IMPAIR.
 */
function regulariser(blocs: Bloc[]): Bloc[] {
  const suite: Bloc[] = [];
  const vide = (): Bloc => ({ sorte: "texte", valeur: "" });
  for (const b of blocs) {
    const dernier = suite[suite.length - 1];
    if (b.sorte === "texte") {
      // Deux textes qui se suivent n'en font qu'un : sinon les rangs se
      // décaleraient et la case sous le curseur changerait sous les doigts.
      if (dernier && dernier.sorte === "texte") {
        suite[suite.length - 1] = { sorte: "texte", valeur: dernier.valeur + b.valeur };
      } else suite.push({ ...b });
    } else {
      if (!dernier || dernier.sorte !== "texte") suite.push(vide());
      suite.push({ ...b });
    }
  }
  const fin = suite[suite.length - 1];
  if (!fin || fin.sorte !== "texte") suite.push(vide());
  return suite;
}

/** Le bloc tel qu'on le prend en main : son dessin, son nom, sa nature. */
function Pastille({
  nom,
  compacte,
  onRetirer,
  ...reste
}: {
  nom: string;
  compacte?: boolean;
  onRetirer?: () => void;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const langue = useLangue();
  const t = textesReglages[langue];
  const Dessin = DESSINS[nom] ?? IconPhone;
  const nature = t.blocNature[NATURES_VARIABLE[nom as keyof typeof NATURES_VARIABLE]];
  return (
    <span
      {...reste}
      className={`inline-flex select-none items-center gap-1.5 rounded-btn bg-ink px-2 py-1 text-white ${
        compacte ? "text-caption" : "text-small"
      } ${reste.className ?? ""}`}
    >
      <Dessin size={compacte ? 12 : 14} className="shrink-0 opacity-80" />
      <span className="font-medium">{t.blocNom[nom] ?? nom}</span>
      {!compacte && nature && (
        <span className="rounded-btn bg-white/20 px-1 text-caption">{nature}</span>
      )}
      {onRetirer && (
        <button
          type="button"
          onClick={onRetirer}
          title={t.retirerBloc}
          className="-mr-0.5 rounded-btn px-1 leading-none opacity-70 transition hover:opacity-100"
        >
          ✕
        </button>
      )}
    </span>
  );
}

/**
 * À quel caractère un bloc lâché sur des chiffres veut-il se poser ?
 *
 * Les fentes entre les morceaux ne suffisent pas : quand tout le code tient
 * en une seule suite de chiffres, il n'y a rien « entre ». On mesure donc où
 * le doigt a lâché, et on coupe au caractère le plus proche — « *126*4*#»
 * lâché juste avant le dièse donne « *126*4* [bloc] # ».
 */
function placeDuPoint(champ: HTMLInputElement, x: number): number {
  const texte = champ.value;
  const dessin = document.createElement("canvas").getContext("2d");
  if (!dessin) return texte.length;
  const style = getComputedStyle(champ);
  dessin.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const gauche = champ.getBoundingClientRect().left +
    parseFloat(style.paddingLeft || "0") + parseFloat(style.borderLeftWidth || "0");
  const vise = x - gauche;
  let meilleur = 0;
  let ecart = Infinity;
  for (let i = 0; i <= texte.length; i++) {
    const d = Math.abs(dessin.measureText(texte.slice(0, i)).width - vise);
    if (d < ecart) { ecart = d; meilleur = i; }
  }
  return meilleur;
}

/** L'interstice où un bloc vient se poser, entre deux morceaux du code. */
function Fente({
  actif,
  onEntrer,
  onSortir,
  onPoser,
}: {
  actif: boolean;
  onEntrer: () => void;
  onSortir: () => void;
  onPoser: (e: React.DragEvent) => void;
}) {
  return (
    <span
      onDragOver={(e) => { e.preventDefault(); onEntrer(); }}
      onDragLeave={onSortir}
      onDrop={onPoser}
      aria-hidden
      className={`my-0.5 w-1 self-stretch rounded-full transition-all ${
        actif ? "w-2 bg-ink" : "bg-transparent"
      }`}
    />
  );
}

export function Composeur({
  valeur,
  onChanger,
  onValider,
  desactive,
  placeholder,
}: {
  valeur: string;
  onChanger: (v: string) => void;
  onValider?: () => void;
  desactive?: boolean;
  placeholder?: string;
}) {
  const langue = useLangue();
  const t = textesReglages[langue];
  const blocs = regulariser(decouperEnBlocs(valeur));
  // Où poserait un appui : la case de texte où l'on écrivait, et l'endroit
  // du curseur dedans. Sans rien de visé, le bloc va à la fin.
  const curseur = useRef<{ rang: number; place: number } | null>(null);
  // La case à reprendre après un geste : on rend la main au clavier là où le
  // regard vient de s'arrêter — juste après le bloc qu'on vient de poser.
  const aReprendre = useRef<number | null>(null);
  const cases = useRef<(HTMLInputElement | null)[]>([]);
  const [fenteVisee, setFenteVisee] = useState<number | null>(null);
  // La case de chiffres survolée pendant un glisser : elle s'éclaire, pour
  // qu'on voie où le bloc va tomber.
  const [survolee, setSurvolee] = useState<number | null>(null);

  useEffect(() => {
    const rang = aReprendre.current;
    if (rang == null) return;
    aReprendre.current = null;
    const champ = cases.current[rang];
    if (!champ) return;
    champ.focus();
    champ.setSelectionRange(0, 0);
    curseur.current = { rang, place: 0 };
  });

  // Toute modification repasse par là : la structure se régularise, le code
  // se recompose, et l'on retient la case où reprendre.
  const appliquer = (suite: Bloc[], reprendre?: number) => {
    const propre = regulariser(suite);
    if (reprendre != null) aReprendre.current = reprendre;
    onChanger(recomposer(propre));
  };

  /** Poser un bloc entre deux morceaux — c'est le geste du glisser. */
  const poserAuRang = (liste: Bloc[], rang: number, nom: string) => {
    const suite = [...liste];
    suite.splice(rang, 0, { sorte: "trou", nom });
    // Après régularisation, le bloc posé occupe le premier rang impair à
    // partir de là ; la case qui le suit est deux crans plus loin.
    appliquer(suite, rang % 2 === 0 ? rang + 2 : rang + 1);
  };

  /**
   * L'appui : le bloc se pose là où était le curseur, en coupant la case en
   * deux — « *126*1*| » puis « # » devient « *126*1* [numéro] # ».
   */
  const poserAuCurseur = (nom: string) => {
    const vise = curseur.current;
    const rang = vise && blocs[vise.rang]?.sorte === "texte"
      ? vise.rang : blocs.length - 1;
    const morceau = blocs[rang];
    if (!morceau || morceau.sorte !== "texte") {
      appliquer([...blocs, { sorte: "trou", nom }], blocs.length + 1);
      return;
    }
    const coupe = vise && vise.rang === rang
      ? Math.min(Math.max(vise.place, 0), morceau.valeur.length)
      : morceau.valeur.length;
    const suite: Bloc[] = [
      ...blocs.slice(0, rang),
      { sorte: "texte", valeur: morceau.valeur.slice(0, coupe) },
      { sorte: "trou", nom },
      { sorte: "texte", valeur: morceau.valeur.slice(coupe) },
      ...blocs.slice(rang + 1),
    ];
    appliquer(suite, rang + 2);
  };

  /**
   * Le lâcher, décidé à un seul endroit : la boîte regarde ce qui se trouve
   * SOUS LE DOIGT. Une case de chiffres reçoit le bloc au caractère visé ;
   * une fente le reçoit entre deux morceaux ; le vide, à la fin.
   *
   * Un seul juge, parce que les cases de chiffres ne voient pas passer le
   * lâcher elles-mêmes : c'est la boîte qui l'attrape, et elle seule sait où
   * il est tombé.
   */
  const lacher = (rangParDefaut: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setFenteVisee(null);
    setSurvolee(null);
    const charge = e.dataTransfer.getData(TYPE_GLISSE);
    if (!charge) return;
    const [nom, depuis] = charge.split(":");
    if (!nom) return;
    const ancien = depuis ? Number(depuis) : null;
    // Un bloc DÉPLACÉ quitte d'abord sa place : sans quoi il se dédoublerait.
    const liste = ancien == null ? blocs : blocs.filter((_b, i) => i !== ancien);
    const recule = (rang: number) =>
      ancien != null && ancien < rang ? rang - 1 : rang;

    const sous = document.elementFromPoint(e.clientX, e.clientY);
    const surCase = cases.current.findIndex((c) => c && c === sous);
    if (surCase >= 0 && blocs[surCase]?.sorte === "texte") {
      const champ = cases.current[surCase]!;
      poserDansTexte(liste, recule(surCase), placeDuPoint(champ, e.clientX), nom);
      return;
    }
    const rang = recule(rangParDefaut);
    if (ancien != null && (ancien === rangParDefaut || ancien === rangParDefaut - 1)) {
      return;                                   // reposé où il était déjà
    }
    poserAuRang(liste, rang, nom);
  };

  /**
   * Poser un bloc AU MILIEU des chiffres, au caractère visé — c'est le geste
   * qu'on attend le plus : « *126*4*#» reçoit son bloc juste avant le dièse.
   */
  const poserDansTexte = (
    liste: Bloc[], rang: number, coupe: number, nom: string,
  ) => {
    const cible = liste[rang];
    if (!cible || cible.sorte !== "texte") return;
    appliquer([
      ...liste.slice(0, rang),
      { sorte: "texte", valeur: cible.valeur.slice(0, coupe) },
      { sorte: "trou", nom },
      { sorte: "texte", valeur: cible.valeur.slice(coupe) },
      ...liste.slice(rang + 1),
    ], rang + 2);
  };

  const ecrire = (rang: number, texte: string) => {
    const suite = [...blocs];
    suite[rang] = { sorte: "texte", valeur: texte };
    // Pas de reprise ici : la structure ne bouge pas, le clavier garde la
    // main tout seul. Lui rendre la main la lui retirerait.
    onChanger(recomposer(regulariser(suite)));
  };

  const retirer = (rang: number) =>
    appliquer(blocs.filter((_b, i) => i !== rang), Math.max(0, rang - 1));

  const etapes = valeur.split(",").map((p) => p.trim()).filter(Boolean);
  const verdict = verdictCode(etapes);
  const apercu = verdict.ok ? apercuRempli(etapes).join(" → ") : "";
  const vide = valeur.trim() === "";

  return (
    <div className="flex w-full flex-col gap-2">
      {/* LE CODE, en morceaux. Les chiffres se tapent, les blocs se posent. */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={lacher(blocs.length)}
        onClick={(e) => {
          // Un clic dans le vide de la boîte rend la main à la dernière case,
          // plutôt que de ne rien faire.
          if (e.target === e.currentTarget) {
            cases.current[blocs.length - 1]?.focus();
          }
        }}
        className={`flex min-h-11 w-full cursor-text flex-wrap items-center gap-x-0.5 gap-y-1 rounded-btn border bg-surface-raised px-2 py-1.5 transition ${
          desactive ? "border-line opacity-50" : "border-ink"
        }`}
      >
        {blocs.map((b, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && (
              <Fente
                actif={fenteVisee === i}
                onEntrer={() => setFenteVisee(i)}
                onSortir={() => setFenteVisee((f) => (f === i ? null : f))}
                onPoser={lacher(i)}
              />
            )}
            {b.sorte === "texte" ? (
              <input
                ref={(n) => { cases.current[i] = n; }}
                value={b.valeur}
                autoFocus={i === 0 && vide}
                disabled={desactive}
                inputMode="tel"
                size={Math.max(i === 0 && vide ? 18 : 1, b.valeur.length)}
                onChange={(e) => ecrire(i, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onValider?.()}
                onSelect={(e) => {
                  curseur.current = {
                    rang: i,
                    place: (e.target as HTMLInputElement).selectionStart ?? 0,
                  };
                }}
                onDragOver={(e) => { e.preventDefault(); setSurvolee(i); }}
                onDragLeave={() => setSurvolee((c) => (c === i ? null : c))}
                placeholder={i === 0 && vide ? placeholder : undefined}
                className={`appearance-none border-0 bg-transparent p-0 text-body tabnums outline-none placeholder:text-ink-faint ${
                  survolee === i ? "rounded-btn bg-ink/10" : ""
                }`}
              />
            ) : (
              <span
                draggable={!desactive}
                onDragStart={(e) =>
                  e.dataTransfer.setData(TYPE_GLISSE, `${b.nom}:${i}`)}
                onDragEnd={() => { setFenteVisee(null); setSurvolee(null); }}
                className="cursor-grab active:cursor-grabbing"
              >
                <Pastille nom={b.nom} compacte onRetirer={() => retirer(i)} />
              </span>
            )}
          </span>
        ))}
        <Fente
          actif={fenteVisee === blocs.length}
          onEntrer={() => setFenteVisee(blocs.length)}
          onSortir={() =>
            setFenteVisee((f) => (f === blocs.length ? null : f))}
          onPoser={lacher(blocs.length)}
        />
      </div>

      {/* LA RÉSERVE : les trois blocs, à poser d'un appui ou d'un glisser. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            draggable={!desactive}
            disabled={desactive}
            onDragStart={(e) => e.dataTransfer.setData(TYPE_GLISSE, `${v}:`)}
            onDragEnd={() => { setFenteVisee(null); setSurvolee(null); }}
            onClick={() => poserAuCurseur(v)}
            title={t.variableAide[v]}
            className="cursor-grab rounded-btn border border-dashed border-line p-0.5 transition hover:border-ink active:cursor-grabbing disabled:opacity-40"
          >
            <Pastille nom={v} />
          </button>
        ))}
      </div>

      <p className="text-caption leading-relaxed text-ink-faint">
        {t.aideComposeur}
      </p>

      {/* LE VERDICT, pendant qu'on écrit. Le robot revérifiera : ceci ne
          remplace pas son contrôle, ça évite d'aller le déranger pour rien. */}
      {!vide && (
        verdict.ok ? (
          <p className="text-caption leading-relaxed text-ink-faint">
            <span className="font-medium text-ink">{t.codePret}</span>
            {apercu && (
              <>
                {" · "}{t.reseauRecevra}{" "}
                <span className="tabnums text-ink">{apercu}</span>
              </>
            )}
          </p>
        ) : (
          <p className="text-caption leading-relaxed text-negative">
            {verdict.motif === "inconnue"
              ? t.verdict.inconnue(verdict.detail ?? "")
              : verdict.motif === "etape"
                ? t.verdict.etape(verdict.detail ?? "")
                : t.verdict[verdict.motif]}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Un code AU REPOS, tel qu'il se lit dans la liste : les chiffres en clair,
 * les trous en blocs. Les accolades sont une écriture, pas une chose à
 * montrer — le propriétaire a posé « le numéro du bénéficiaire », c'est cela
 * qu'il doit relire.
 */
export function ApercuCode({ etapes }: { etapes: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {etapes.map((e, n) => (
        <span key={n} className="inline-flex flex-wrap items-center gap-0.5">
          {n > 0 && <span className="px-0.5 text-ink-faint">→</span>}
          {decouperEnBlocs(e).map((b, i) =>
            b.sorte === "texte" ? (
              <span key={i} className="tabnums">{b.valeur}</span>
            ) : (
              <Pastille key={i} nom={b.nom} compacte />
            ))}
        </span>
      ))}
    </span>
  );
}

/** Les valeurs d'exemple, exposées pour l'aperçu des autres écrans. */
export { EXEMPLES_VARIABLE };
