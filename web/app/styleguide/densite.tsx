"use client";

import { useEffect, useRef, useState } from "react";
import { IconChart, IconDownload } from "@/app/icons";

/*
 * LA GALERIE DE LA DENSITÉ — et de la requête de conteneur.
 *
 * Deux mécanismes qu'on confond tout le temps, et qui ne répondent pas à la
 * même question :
 *
 *   — `data-densite` répond à « combien de respiration cette ZONE mérite ».
 *     C'est une décision, prise par celui qui pose la zone, héritée par tout ce
 *     qu'elle contient. Deux valeurs, jamais cinq.
 *
 *   — `@container` répond à « quelle largeur ai-je RÉELLEMENT ». Ça ne se
 *     décide pas : ça se mesure. Une media query mesure la fenêtre, jamais le
 *     trou où l'on pose le composant.
 *
 * Les deux se composent sans se connaître : la requête choisit la FORME (une
 * ligne ou deux), l'attribut choisit la RESPIRATION.
 *
 * Tous les chiffres annoncés sur cette page sont MESURÉS dans le navigateur,
 * jamais recopiés d'un tableau, et ils passent au rouge s'ils ne valent pas ce
 * que le système annonce. Un chiffre écrit à la main aurait fini par mentir —
 * comme les squelettes d'attente qui annonçaient 48 là où le vrai contrôle
 * faisait 42.
 */

/* Les montants portent l'espace insécable U+00A0 (U+202F est absente de
   DM Sans) et le moins mathématique U+2212, de même chasse que le plus.
   Voir docs/REFONTE-V2.md §5. */
const ESPACE = " ";
const MOINS = "−";

const OPERATIONS = [
  {
    libelle: "Dépôt Orange Money",
    detail: "07 h 42 · 07 88 21 40",
    montant: `+${ESPACE}25${ESPACE}000${ESPACE}F`,
    ton: "text-positive",
  },
  {
    libelle: "Retrait MTN MoMo",
    detail: "07 h 11 · 06 54 09 77",
    montant: `${MOINS}${ESPACE}12${ESPACE}500${ESPACE}F`,
    ton: "text-negative",
  },
  {
    libelle: "Dépôt MTN MoMo",
    detail: "hier · 05 41 62 18",
    montant: `+${ESPACE}8${ESPACE}000${ESPACE}F`,
    ton: "text-positive",
  },
];

/* ─── L'APPAREIL DE MESURE ───────────────────────────────────────────────────
   Cinq relevés, tous exacts — aucun ne dépend du nombre de lignes rendues :

     respiration  padding-block de la zone       16 → 12
     gouttière    gap d'une rangée               16 → 12
     rangée       hauteur rendue                 72 → 68
     interligne   line-height du corps           24 → 20
     cible        hauteur du pseudo-élément      44 → 44   (elle ne bouge pas)

   La cible se lit sur `::after` : c'est lui qui accepte l'appui, pas la boîte
   dessinée. C'est le seul chiffre de ce tableau qui doit rester identique. */

type Releve = {
  respiration: number;
  gouttiere: number;
  rangee: number;
  interligne: number;
  cible: number;
};

const px = (v: string) => Math.round(parseFloat(v) || 0);

function useReleve() {
  const zone = useRef<HTMLDivElement>(null);
  const [releve, setReleve] = useState<Releve | null>(null);

  useEffect(() => {
    const n = zone.current;
    if (!n) return;
    const trouver = (nom: string) => n.querySelector(`[data-mesure="${nom}"]`);
    const mesurer = () => {
      const bloc = trouver("respiration");
      const rangee = trouver("rangee");
      const texte = trouver("interligne");
      const cible = trouver("cible");
      if (!bloc || !rangee || !texte || !cible) return;
      setReleve({
        respiration: px(getComputedStyle(bloc).paddingBlockStart),
        gouttiere: px(getComputedStyle(rangee).columnGap),
        rangee: Math.round(rangee.getBoundingClientRect().height),
        interligne: px(getComputedStyle(texte).lineHeight),
        cible: px(getComputedStyle(cible, "::after").height),
      });
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(n);
    return () => observateur.disconnect();
  }, []);

  return { zone, releve };
}

function Chiffre({
  nom,
  valeur,
  attendu,
  gele,
}: {
  nom: string;
  valeur: number;
  attendu: number;
  gele?: boolean;
}) {
  const juste = valeur === attendu;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-caption uppercase text-ink-faint">
        {nom}
        {gele ? " · gelée" : null}
      </dt>
      <dd
        className={`colonne-montant text-small font-medium ${
          juste ? (gele ? "text-accent" : "text-ink") : "text-negative"
        }`}
      >
        {valeur} px{juste ? "" : ` — attendu ${attendu}`}
      </dd>
    </div>
  );
}

/* ─── LA LISTE DE DÉMONSTRATION ──────────────────────────────────────────────
   Aucun nombre n'est écrit ici. `hauteur-rangee-2`, `gouttiere`, `respiration`
   et `interligne` lisent le jeu actif ; c'est l'attribut porté par la zone qui
   décide lequel. Le composant, lui, ne sait pas dans quelle densité il tombe —
   et c'est exactement ce qu'on veut. */

function ListeDemo() {
  return (
    <ul className="divide-hair">
      {OPERATIONS.map((op, i) => (
        <li
          key={op.libelle}
          data-mesure={i === 0 ? "rangee" : undefined}
          className="flex hauteur-rangee-2 items-center gouttiere px-4"
        >
          <span
            aria-hidden
            className="flex size-disque shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft"
          >
            <IconChart size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{op.libelle}</span>
            <span className="block truncate text-small text-ink-soft">{op.detail}</span>
          </span>
          <span className={`colonne-montant text-small font-medium ${op.ton}`}>
            {op.montant}
          </span>
          {/* Dessiné à 32, visé à 44 : c'est le pseudo-élément de `.cible` qui
              accepte l'appui, et il ne se densifie pas. */}
          <button
            type="button"
            data-mesure={i === 0 ? "cible" : undefined}
            aria-label={`Reçu — ${op.libelle}`}
            className="cible flex size-8 shrink-0 items-center justify-center rounded-btn border border-contour text-ink transition-teintes hover:bg-surface-2 active:bg-surface-3"
          >
            <IconDownload size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** La zone : c'est elle qui porte l'attribut, et elle seule. */
function Zone({ densite, titre }: { densite: "confort" | "dense"; titre: string }) {
  const { zone, releve } = useReleve();
  const dense = densite === "dense";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-heading">{titre}</h3>
        <p className="mt-1 text-small text-ink-faint">
          <code>data-densite=&quot;{densite}&quot;</code>
        </p>
      </div>

      {/* LA ZONE. Un seul attribut, sur un seul nœud : tout ce qu'elle contient
          en hérite, y compris ce qui n'a jamais entendu parler de densité. */}
      <div
        ref={zone}
        data-densite={densite}
        className="rounded-card border border-line bg-surface-raised"
      >
        <div data-mesure="respiration" className="respiration">
          <ListeDemo />
        </div>
        <div className="respiration border-t border-line px-4">
          <p data-mesure="interligne" className="interligne max-w-lecture text-ink-soft">
            Le corps reste à 16 px dans les deux densités. C&apos;est
            l&apos;interligne qui recule de 4 px, jamais la taille du texte : on
            resserre la mise en page, on ne rétrécit pas ce qu&apos;il y a à
            lire.
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-1 rounded-card border border-line p-4">
        {releve ? (
          <>
            <Chiffre nom="Respiration" valeur={releve.respiration} attendu={dense ? 12 : 16} />
            <Chiffre nom="Gouttière" valeur={releve.gouttiere} attendu={dense ? 12 : 16} />
            <Chiffre nom="Rangée" valeur={releve.rangee} attendu={dense ? 68 : 72} />
            <Chiffre nom="Interligne" valeur={releve.interligne} attendu={dense ? 20 : 24} />
            <Chiffre nom="Cible" valeur={releve.cible} attendu={44} gele />
          </>
        ) : (
          <p className="text-small text-ink-faint">Mesure en cours…</p>
        )}
      </dl>
    </div>
  );
}

/* ─── LA FICHE À REQUÊTE DE CONTENEUR ────────────────────────────────────────
   Le MÊME composant, posé deux fois dans la même fenêtre. Il ne sait rien de
   l'appareil : il lit la largeur du conteneur nommé `fiche` que porte son
   enveloppe.

     < 384 px  →  deux lignes empilées, rangée de deux lignes
     ≥ 384 px  →  une seule ligne, l'heure et le montant à droite

   Aucune media query n'aurait su faire ça : à largeur de fenêtre égale, les
   deux colonnes auraient reçu la même règle. */

function FicheAdaptative({ libelle, detail, montant, ton }: (typeof OPERATIONS)[number]) {
  return (
    <div className="@container/fiche">
      <div className="flex hauteur-rangee-2 flex-col justify-center gap-1 px-4 @sm/fiche:hauteur-rangee @sm/fiche:flex-row @sm/fiche:items-center @sm/fiche:justify-between @sm/fiche:gap-4">
        <span className="min-w-0">
          <span className="block truncate">{libelle}</span>
          <span className="block truncate text-small text-ink-soft @sm/fiche:hidden">
            {detail}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-4">
          <span className="hidden text-small text-ink-soft @sm/fiche:inline">{detail}</span>
          <span className={`colonne-montant text-small font-medium ${ton}`}>{montant}</span>
        </span>
      </div>
    </div>
  );
}

/** Une colonne de largeur imposée, qui annonce la largeur qu'elle mesure. */
function Colonne({
  titre,
  largeur,
  children,
}: {
  titre: string;
  largeur: string;
  children: React.ReactNode;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [mesuree, setMesuree] = useState(0);

  useEffect(() => {
    const n = boite.current;
    if (!n) return;
    const mesurer = () => setMesuree(Math.round(n.getBoundingClientRect().width));
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(n);
    return () => observateur.disconnect();
  }, []);

  return (
    <div className={`w-full shrink-0 ${largeur}`}>
      <p className="mb-2 text-caption uppercase text-ink-faint">
        {titre} — {mesuree} px mesurés
      </p>
      <div
        ref={boite}
        className="overflow-hidden rounded-card border border-line bg-surface-raised"
      >
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-lecture text-small text-ink-soft">{children}</p>;
}

/* ─── LA GARDE BASSE, DESSINÉE ───────────────────────────────────────────────
   La réserve est tracée en pointillés, à la hauteur exacte que le jeton
   annonce — et sa valeur est relue dans le navigateur. Au-dessus de `md`, la
   barre flottante n'existe plus : la réserve tombe à 0 et disparaît d'
   elle-même. Rétrécissez la fenêtre sous 768 px pour la voir apparaître. */

function DemoGardeBasse() {
  const boite = useRef<HTMLDivElement>(null);
  const [reserve, setReserve] = useState<number | null>(null);

  useEffect(() => {
    const n = boite.current;
    if (!n) return;
    const mesurer = () => setReserve(px(getComputedStyle(n).paddingBottom));
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(document.documentElement);
    return () => observateur.disconnect();
  }, []);

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface-raised">
        <div ref={boite} className="garde-basse relative px-4 pt-4">
          <div className="flex hauteur-rangee items-center rounded-btn bg-accent px-4 text-sur-couleur">
            Exporter le bilan
          </div>
          <span
            aria-hidden
            className="reserve-basse pointer-events-none absolute inset-x-4 bottom-0 flex items-center justify-center overflow-hidden rounded-btn border border-dashed border-contour text-caption uppercase text-ink-faint"
          >
            réservé à la barre
          </span>
        </div>
      </div>
      <p className="mt-2 text-small text-ink-faint">
        Réserve mesurée à cette largeur de fenêtre :{" "}
        <span className="font-medium text-ink">{reserve ?? "…"} px</span>
        {reserve === 0 ? " — la barre flottante n’existe pas au-dessus de md." : null}
      </p>
    </>
  );
}

/* ─── LA GALERIE ─────────────────────────────────────────────────────────── */

export function GalerieDensite() {
  return (
    <div className="flex flex-col gap-12">
      {/* ── 1 · Les deux densités, côte à côte ───────────────────────────── */}
      <section>
        <h2 className="text-title">Deux densités, jamais cinq</h2>
        <Note>
          La même liste, le même composant, le même code. Un seul attribut
          change, posé sur la carte : <code>data-densite</code>. Chaque valeur
          recule d&apos;un cran de 4 px — rembourrage vertical, gouttières,
          hauteur de rangée, interligne.
        </Note>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <Zone densite="confort" titre="Confort — le défaut" />
          <Zone densite="dense" titre="Dense — un cran de moins" />
        </div>
        <Note>
          La <strong>cible reste à 44 px dans les deux colonnes</strong>. Le
          bouton de reçu est dessiné à 32 ; c&apos;est le pseudo-élément de{" "}
          <code>.cible</code> qui accepte l&apos;appui. Et les hauteurs de
          rangée passent par <code>max(44, …)</code> : le plancher n&apos;est
          pas une consigne écrite en commentaire, c&apos;est la formule
          elle-même.
        </Note>
      </section>

      {/* ── 2 · Ce qui refuse de se densifier ────────────────────────────── */}
      <section>
        <h2 className="text-title">Ce qui ne se densifie jamais</h2>
        <Note>
          Modèle Cloudscape : tout ce dont la cible est déjà contrainte reste au
          confort, même au milieu d&apos;une zone dense. Alerte, aide, message
          d&apos;erreur, champ, sélecteur — et toute zone qui redéclare{" "}
          <code>confort</code> à l&apos;intérieur. Aucun de ces composants
          n&apos;a rien à déclarer : c&apos;est le système qui les exclut.
        </Note>
        <div
          data-densite="dense"
          className="gouttiere mt-6 flex flex-col rounded-card border border-line bg-surface-raised p-4"
        >
          <p className="text-caption uppercase text-ink-faint">
            Zone dense — la gouttière entre ces blocs vaut 12
          </p>
          <div className="gouttiere flex hauteur-rangee items-center rounded-btn bg-surface-2 px-4">
            Une rangée ordinaire, densifiée
          </div>
          <div
            role="alert"
            className="respiration flex flex-col rounded-btn border border-alert bg-alert-soft px-4"
          >
            <span className="font-medium text-alert">Le terminal ne répond plus</span>
            <span className="interligne text-small text-ink-soft">
              Ce bandeau garde la respiration du confort : on le lit au moment
              précis où quelque chose a échoué.
            </span>
          </div>
          <div
            data-densite="confort"
            className="respiration flex flex-col rounded-btn border border-line px-4"
          >
            <span className="text-caption uppercase text-ink-faint">
              Zone imbriquée qui redéclare le confort
            </span>
            <span className="interligne">C&apos;est la plus proche qui gagne.</span>
          </div>
        </div>
      </section>

      {/* ── 3 · La requête de conteneur ──────────────────────────────────── */}
      <section>
        <h2 className="text-title">La largeur du trou, pas celle de la fenêtre</h2>
        <Note>
          Le même composant, posé dans deux colonnes de largeurs différentes,{" "}
          <strong>dans la même fenêtre</strong>. À gauche il se replie sur deux
          lignes ; à droite il tient sur une, l&apos;heure et le montant à
          droite. Une media query aurait donné la même réponse aux deux : elle
          ne mesure que la fenêtre.
        </Note>
        <div className="mt-6 flex flex-col items-start gap-8 lg:flex-row">
          <Colonne titre="Colonne étroite" largeur="max-w-2xs">
            <div className="divide-hair">
              {OPERATIONS.slice(0, 2).map((op) => (
                <FicheAdaptative key={op.libelle} {...op} />
              ))}
            </div>
          </Colonne>
          <Colonne titre="Colonne large" largeur="max-w-2xl">
            <div className="divide-hair">
              {OPERATIONS.slice(0, 2).map((op) => (
                <FicheAdaptative key={op.libelle} {...op} />
              ))}
            </div>
          </Colonne>
        </div>
        <Note>
          La syntaxe, compilée et vérifiée : <code>@container/fiche</code> pose{" "}
          <code>container-type: inline-size</code> et{" "}
          <code>container-name: fiche</code> ; <code>@sm/fiche:flex-row</code>{" "}
          devient <code>@container fiche (width &gt;= 24rem)</code>. On nomme
          toujours le conteneur : sans nom, la requête s&apos;adresse au plus
          proche, qui n&apos;est pas forcément celui qu&apos;on croit dès
          qu&apos;un composant en contient un autre.
        </Note>
      </section>

      {/* ── 4 · La garde basse ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-title">La garde basse</h2>
        <Note>
          La barre flottante passe devant la page. « Exporter le bilan » se
          retrouvait dessous à défilement 0 : le bouton était là, visible nulle
          part. La barre mesure 62 px au navigateur — 8 + la pilule de 44 + 8,
          plus ses deux filets, qu&apos;un premier compte à 60 avait oubliés —
          et occupe 78 px avec son calage bas. Le jeton{" "}
          <code>--garde-basse</code> prend le cran suivant de la grille (64),
          ajoute <code>max(16, encoche)</code> et un cran de 16 pour que le
          dernier bouton ne rase pas la barre : 96 px au minimum, davantage sur
          un téléphone à encoche. L&apos;utilitaire <code>garde-basse</code> le
          réserve en bas de page, et retombe à zéro au-dessus de{" "}
          <code>md</code>, où la barre n&apos;existe plus.
        </Note>
        <DemoGardeBasse />
      </section>
    </div>
  );
}
