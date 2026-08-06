"use client";

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from "react";
import { IconClose, IconSearch } from "../icons";

/**
 * LES CHAMPS — famille 5.2 du système (voir docs/SYSTEME.md).
 *
 * Trois objets : `Champ` (une ligne), `ZoneTexte` (plusieurs lignes),
 * `Recherche` (loupe devant, effacement derrière).
 *
 * Ce qui est posé ici une fois pour toutes :
 *
 *   — La hauteur est POSÉE, jamais subie : `h-controle` (44) et le texte se
 *     centre dedans. Aucun padding vertical ne participe à la hauteur, donc un
 *     champ et le bouton qui le suit sur la même rangée tombent d'aplomb.
 *   — Le contour est PORTEUR : `border-contour` (3,04:1). Le filet décoratif
 *     vaut 1,26:1 et ne dirait à personne qu'il y a là un champ.
 *   — TOUT CHAMP A UN NOM. Le libellé est obligatoire dans le typage : on ne
 *     peut pas écrire un champ anonyme avec ces composants. Masqué à l'œil, il
 *     reste lu à voix haute. Un texte d'invite (`placeholder`) n'est pas un
 *     libellé : il disparaît dès qu'on saisit, et n'a jamais rien annoncé.
 *   — Le focus est GLOBAL (anneau indigo, `:focus-visible` dans globals.css).
 *     On ne le retire pas, on ne le réécrit pas ; on ajoute seulement le
 *     passage du contour à l'indigo.
 *   — Éteint, un champ change de couleur, il ne s'efface pas : jamais
 *     d'opacité, `bg-surface-eteint` + `text-ink-eteint` restent lisibles.
 */

/* ── Le vocabulaire commun aux trois objets ───────────────────────────────── */

type ProprietesCommunes = {
  /** Ce que le champ demande. Obligatoire : sans lui, personne n'entend rien. */
  libelle: string;
  /**
   * Le libellé quitte la page mais pas la lecture d'écran : il reste dans le
   * document, associé au champ, et continue de le nommer. C'est le seul moyen
   * autorisé de « ne pas afficher de libellé ».
   */
  libelleMasque?: boolean;
  /** Précision calme, sous le champ. */
  aide?: string;
  /** Ce qui ne va pas. Remplace l'aide, et est annoncé au lecteur d'écran. */
  erreur?: string;
  /** Mise en page du bloc (largeur, `flex-1`…) — jamais des dimensions du champ. */
  className?: string;
};

export type ProprietesChamp = ProprietesCommunes & {
  /** Icône posée devant le texte. Décorative : elle ne remplace pas le libellé. */
  iconeAvant?: ReactNode;
  /** Contrôle 44×44 posé derrière le texte (effacer, montrer, valider…). */
  actionApres?: ReactNode;
} & Omit<ComponentPropsWithRef<"input">, "className">;

export type ProprietesZoneTexte = ProprietesCommunes &
  Omit<ComponentPropsWithRef<"textarea">, "className">;

export type ProprietesRecherche = ProprietesCommunes & {
  /** Appelé quand on vide le champ. Le composant ne décide pas de la valeur. */
  onEffacer: () => void;
  /** Nom du bouton d'effacement, entendu seul par un lecteur d'écran. */
  libelleEffacement?: string;
} & Omit<ComponentPropsWithRef<"input">, "className" | "type">;

/* ── Les briques partagées ───────────────────────────────────────────────── */

const classes = (...valeurs: Array<string | false | undefined>) =>
  valeurs.filter(Boolean).join(" ");

/**
 * La boîte du champ. La hauteur vient de `h-controle`, le contour de `contour`.
 * Au focus le contour passe à l'indigo — l'anneau global, lui, continue de se
 * dessiner par-dessus.
 *
 * Le fond est BLANC (`surface-raised`), et c'est un calcul, pas un goût : le
 * contour y monte à 3,39:1 (contre 3,04), le texte tertiaire à 5,69:1 (contre
 * 4,27 — la paire qui échouait dans l'audit), et un contrôle discret posé
 * dedans peut encore survoler en `surface-2` sans s'y fondre.
 */
const BOITE =
  "w-full rounded-btn border border-contour bg-surface-raised text-body text-ink " +
  "placeholder:text-ink-faint focus:border-accent " +
  "disabled:bg-surface-eteint disabled:text-ink-eteint";

/** Padding horizontal : `px-4`, élargi du côté où une icône ou un bouton se pose. */
const paddingHorizontal = (avant: boolean, apres: boolean) =>
  classes(avant ? "pl-12" : "pl-4", apres ? "pr-12" : "pr-4");

function identifiants(idChamp: string, aide?: string, erreur?: string) {
  const idErreur = erreur ? `${idChamp}-erreur` : undefined;
  const idAide = !erreur && aide ? `${idChamp}-aide` : undefined;
  return { idAide, idErreur, decritPar: idErreur ?? idAide };
}

function Libelle({
  idChamp,
  libelle,
  masque,
}: {
  idChamp: string;
  libelle: string;
  masque?: boolean;
}) {
  return (
    <label
      htmlFor={idChamp}
      className={
        masque ? "sr-only" : "mb-2 block text-small font-medium text-ink"
      }
    >
      {libelle}
    </label>
  );
}

function Message({
  idAide,
  idErreur,
  aide,
  erreur,
}: {
  idAide?: string;
  idErreur?: string;
  aide?: string;
  erreur?: string;
}) {
  if (erreur) {
    return (
      <p id={idErreur} role="alert" className="mt-2 text-small text-negative">
        {erreur}
      </p>
    );
  }
  if (aide) {
    return (
      <p id={idAide} className="mt-2 text-small text-ink-soft">
        {aide}
      </p>
    );
  }
  return null;
}

/* ── 1 · Le champ d'une ligne ─────────────────────────────────────────────── */

export function Champ({
  libelle,
  libelleMasque,
  aide,
  erreur,
  iconeAvant,
  actionApres,
  className,
  id,
  ...natifs
}: ProprietesChamp) {
  const auto = useId();
  const idChamp = id ?? auto;
  const { idAide, idErreur, decritPar } = identifiants(idChamp, aide, erreur);

  return (
    <div className={classes("w-full", className)}>
      <Libelle idChamp={idChamp} libelle={libelle} masque={libelleMasque} />
      <div className="relative">
        {iconeAvant && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-faint [&_svg]:size-icone"
          >
            {iconeAvant}
          </span>
        )}
        <input
          id={idChamp}
          aria-describedby={decritPar}
          aria-invalid={erreur ? true : undefined}
          className={classes(
            "h-controle",
            BOITE,
            paddingHorizontal(Boolean(iconeAvant), Boolean(actionApres)),
            erreur && "border-negative",
          )}
          {...natifs}
        />
        {actionApres && (
          <span className="absolute inset-y-0 right-0 flex items-center">
            {actionApres}
          </span>
        )}
      </div>
      <Message
        idAide={idAide}
        idErreur={idErreur}
        aide={aide}
        erreur={erreur}
      />
    </div>
  );
}

/* ── 2 · La zone de plusieurs lignes ──────────────────────────────────────── */

/**
 * Trois rangées de texte visibles d'emblée (`rows`), sur la hauteur déclarée
 * `min-h-zone-texte` (96 = 12 + 3 × 24 + 12).
 *
 * Une zone de texte se remplit par le HAUT : le texte n'y est pas centré, et
 * sans retrait il toucherait le contour (la remise à zéro de Tailwind met le
 * padding natif des champs à 0). Les 12 px du haut et du bas sont DANS le
 * jeton : ils placent le texte, ils ne fabriquent pas la hauteur — R3 tient.
 */
export function ZoneTexte({
  libelle,
  libelleMasque,
  aide,
  erreur,
  className,
  id,
  rows = 3,
  ...natifs
}: ProprietesZoneTexte) {
  const auto = useId();
  const idChamp = id ?? auto;
  const { idAide, idErreur, decritPar } = identifiants(idChamp, aide, erreur);

  return (
    <div className={classes("w-full", className)}>
      <Libelle idChamp={idChamp} libelle={libelle} masque={libelleMasque} />
      <textarea
        id={idChamp}
        rows={rows}
        aria-describedby={decritPar}
        aria-invalid={erreur ? true : undefined}
        className={classes(
          "min-h-zone-texte px-4 py-3",
          BOITE,
          erreur && "border-negative",
        )}
        {...natifs}
      />
      <Message
        idAide={idAide}
        idErreur={idErreur}
        aide={aide}
        erreur={erreur}
      />
    </div>
  );
}

/* ── 3 · La recherche ─────────────────────────────────────────────────────── */

/**
 * Loupe devant, effacement derrière.
 *
 * Le bouton d'effacement fait **44×44**, comme tout ce sur quoi on appuie.
 * Celui de l'écran des SMS faisait 15×15 : la plus petite cible du dépôt,
 * impossible à viser au pouce et presque impossible à la souris.
 */
export function Recherche({
  libelle,
  libelleMasque,
  aide,
  erreur,
  className,
  id,
  onEffacer,
  libelleEffacement = "Effacer la recherche",
  value,
  defaultValue,
  onChange,
  ref,
  ...natifs
}: ProprietesRecherche) {
  const auto = useId();
  const idChamp = id ?? auto;
  const { idAide, idErreur, decritPar } = identifiants(idChamp, aide, erreur);

  const interne = useRef<HTMLInputElement | null>(null);
  const [saisi, setSaisi] = useState(String(defaultValue ?? ""));
  const texte = value !== undefined ? String(value) : saisi;
  const rempli = texte.length > 0 && natifs.disabled !== true;

  const brancher = (noeud: HTMLInputElement | null) => {
    interne.current = noeud;
    const externe = ref as Ref<HTMLInputElement> | undefined;
    if (typeof externe === "function") externe(noeud);
    else if (externe) (externe as { current: HTMLInputElement | null }).current = noeud;
  };

  const changer = (e: ChangeEvent<HTMLInputElement>) => {
    setSaisi(e.target.value);
    onChange?.(e);
  };

  const effacer = () => {
    setSaisi("");
    onEffacer();
    interne.current?.focus();
  };

  return (
    <div className={classes("w-full", className)}>
      <Libelle idChamp={idChamp} libelle={libelle} masque={libelleMasque} />
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-faint"
        >
          <IconSearch size={20} />
        </span>
        <input
          id={idChamp}
          type="search"
          ref={brancher}
          value={value}
          defaultValue={defaultValue}
          onChange={changer}
          aria-describedby={decritPar}
          aria-invalid={erreur ? true : undefined}
          className={classes(
            "h-controle",
            BOITE,
            /* La place du bouton est réservée en permanence : le texte ne
               saute pas au moment où l'effacement apparaît. */
            paddingHorizontal(true, true),
            "[&::-webkit-search-cancel-button]:hidden",
            erreur && "border-negative",
          )}
          {...natifs}
        />
        {rempli && (
          <button
            type="button"
            onClick={effacer}
            aria-label={libelleEffacement}
            className="absolute right-0 top-0 flex size-controle items-center justify-center rounded-btn text-ink-soft hover:bg-surface-3 hover:text-ink"
          >
            <IconClose size={20} />
          </button>
        )}
      </div>
      <Message
        idAide={idAide}
        idErreur={idErreur}
        aide={aide}
        erreur={erreur}
      />
    </div>
  );
}
