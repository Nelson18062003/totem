// LE GABARIT COMMUN DE LA CONSOLE — à réutiliser tel quel.
//
// POUR L'ÉQUIPE QUI CONSTRUIT LES ÉCRANS SUIVANTS (versions, journal, alertes,
// mobile) : tout ce dont vous avez besoin est ici, et il n'y a rien d'autre à
// écrire. Une page de console se réduit à ceci —
//
//     export const dynamic = "force-dynamic";
//
//     export default async function Versions() {
//       await exigerPouvoir("administrer");        // AVANT toute lecture
//       const langue = await langueServeur();
//       const t = textesConsole[langue];
//       const donnees = await chargerQuelqueChose(langue);
//       return (
//         <CadreConsole actif="versions" titre={t.nav.versions} langue={langue}>
//           {donnees.rien
//             ? <RienADire titre={…} detail={…} />
//             : <Panneau titre={…}><TableauQuiDefile>…</TableauQuiDefile></Panneau>}
//         </CadreConsole>
//       );
//     }
//
// L'onglet de votre écran existe déjà dans la liste ONGLETS ci-dessous : il
// suffit de passer sa clé à `actif`. N'ajoutez pas de navigation à vous — deux
// menus qui ne disent pas la même chose, c'est ainsi qu'un écran d'exploitation
// devient faux.
//
// TROIS RÈGLES QUE CE FICHIER FAIT TENIR, ET QU'IL NE FAUT PAS CONTOURNER
//
// 1. AUCUN GESTE QUI DÉPLACE DE L'ARGENT. Il n'existe volontairement aucun
//    composant de bouton d'action ici. Ce que l'administrateur ne peut pas
//    faire se montre avec `GesteInterdit` : présent, désarmé, et nommant à qui
//    le demander — un bouton absent se contourne, un bouton qui explique
//    enseigne (voir CAS-LIMITES B7).
//
// 2. RIEN N'EST INVENTÉ. `RienADire` est la seule façon d'afficher une absence.
//    N'écrivez jamais « 0 » là où la base n'a rien dit : un zéro se lit comme
//    une mesure, et « aucun paiement » ne doit pas ressembler à « je ne sais
//    pas » (CAS-LIMITES C2).
//
// 3. LE TABLEAU DÉFILE DANS SON CADRE, JAMAIS LA PAGE. `TableauQuiDefile` porte
//    ce comportement. Un tableau posé nu dans la page fait déborder les 390 px
//    du téléphone de référence, et c'est la page entière qui se met à glisser.
//
// CE QUE CE FICHIER NE FAIT PAS, ET POURQUOI
// Il ne pose ni `<html>` ni bandeau « non relié » : la coque de l'application
// (`app/layout.tsx` → `app/coquille.tsx`) le fait déjà pour toutes les pages.
// La console vit pour l'instant DANS cette coque. Voir la note de la pull
// request : `/console` doit rejoindre la liste `PLEIN_ECRAN` de `coquille.tsx`
// pour que le menu du commerçant cesse de s'afficher par-dessus le rail de la
// console.

import Link from "next/link";
import { BasculeLangue } from "@/app/langue";
import { Symbole } from "@/app/marque";
import {
  IconCard, IconChevron, IconGrid, IconIdentite, IconInbox, IconList,
  IconRefresh,
} from "@/app/icons";
import type { Langue } from "@noyau/langue";
import type { Vivacite } from "@/lib/console";
import { textesConsole } from "@noyau/textes/console";

export type OngletConsole =
  | "flotte" | "cartes" | "gens" | "versions" | "journal" | "alertes";

// Les six écrans de la console, dans l'ordre où on les regarde : d'abord ce qui
// respire (la flotte), puis ce qui appartient à quelqu'un (les puces, les
// gens), puis ce qu'on a fait (versions, journal), puis ce qui crie.
const ONGLETS: readonly { cle: OngletConsole; href: string; Icone: typeof IconGrid }[] = [
  { cle: "flotte", href: "/console", Icone: IconGrid },
  { cle: "cartes", href: "/console/cartes", Icone: IconCard },
  { cle: "gens", href: "/console/gens", Icone: IconIdentite },
  { cle: "versions", href: "/console/versions", Icone: IconRefresh },
  { cle: "journal", href: "/console/journal", Icone: IconList },
  { cle: "alertes", href: "/console/alertes", Icone: IconInbox },
];

/** Le cadre : le rail, l'en-tête, et la place de l'écran. */
export function CadreConsole({
  titre,
  ariane,
  actif,
  langue,
  nom,
  action,
  children,
}: {
  titre: string;
  /** La ligne sous le titre : « 7 terminaux · 4 commerces ». */
  ariane?: string;
  actif: OngletConsole;
  langue: Langue;
  /** Le nom de la personne connectée, tel qu'il est en base. */
  nom?: string;
  /** Un geste propre à l'écran. Aucun des quatre premiers écrans n'en a. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = textesConsole[langue];
  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[13.75rem_minmax(0,1fr)] md:items-start md:gap-8">
      {/* Le rail. Sur téléphone il devient une bande d'onglets qui défile
          horizontalement DANS son cadre : six entrées ne tiennent pas sur
          390 px, et les empiler mangerait le premier écran. */}
      <aside className="md:sticky md:top-6">
        <div className="mb-4 flex items-center gap-2.5">
          <Symbole size={26} className="text-laterite" />
          <div className="min-w-0">
            <p className="truncate text-small font-medium">{t.console}</p>
            {nom && (
              <p className="truncate text-caption text-ink-faint">
                {t.connecteComme(nom)}
              </p>
            )}
          </div>
        </div>
        <nav
          aria-label={t.console}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0"
        >
          {ONGLETS.map(({ cle, href, Icone }) => {
            const ici = cle === actif;
            return (
              <Link
                key={cle}
                href={href}
                aria-current={ici ? "page" : undefined}
                // « min-h-11 » — 44 px. L'onglet faisait 39 px : sous le minimum
                // tactile, et c'est la barre qu'on vise le plus souvent.
                className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-btn px-3 py-2.5 text-small transition md:w-full ${
                  ici
                    ? "bg-surface-2 font-medium text-ink"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icone size={18} className={ici ? "text-laterite" : "text-ink-faint"} />
                <span className="whitespace-nowrap">{t.nav[cle]}</span>
              </Link>
            );
          })}
        </nav>
        {/* Ce que cette console est, écrit là où on la quitte : elle voit tout
            et ne fait sortir aucun argent. La phrase n'est pas décorative — un
            administrateur qui cherche un bouton de virement doit lire ici
            pourquoi il n'en trouvera nulle part. */}
        <p className="mt-4 hidden border-t border-line pt-4 text-caption leading-relaxed text-ink-faint md:block">
          {t.cePouvoir}
        </p>
        <Link
          href="/"
          className="mt-3 hidden items-center gap-1 text-caption text-ink-soft underline-offset-4 hover:underline md:flex"
        >
          {t.retourApplication}
        </Link>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-title font-semibold tracking-tight">{titre}</h1>
            {ariane && <p className="mt-0.5 text-small tabnums text-ink-soft">{ariane}</p>}
          </div>
          <div className="flex items-center gap-3">
            {action}
            <BasculeLangue />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Une carte : un titre, une note discrète à droite, un corps, un pied. */
export function Panneau({
  titre,
  note,
  pied,
  children,
}: {
  titre?: string;
  note?: React.ReactNode;
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface-raised">
      {(titre || note) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
          {titre && <h2 className="text-heading font-semibold">{titre}</h2>}
          {note && <p className="text-caption text-ink-faint">{note}</p>}
        </div>
      )}
      {children}
      {pied && (
        <p className="border-t border-line px-4 py-2.5 text-caption leading-relaxed text-ink-faint">
          {pied}
        </p>
      )}
    </section>
  );
}

/**
 * Un tableau large qui défile DANS son cadre.
 *
 * Sans ce cadre, c'est la page entière qui glisse sur un téléphone : on perd
 * le menu, l'en-tête, et le lecteur ne retrouve plus la première colonne. Le
 * `min-w` sur la table est ce qui déclenche le défilement au bon moment.
 */
export function TableauQuiDefile({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      {/* 46 rem = 736 px. Sur un téléphone de 390 px, plus de la moitié du
          tableau est hors champ et c'est la PREMIÈRE colonne — le nom — qui
          sort dès qu'on glisse. Le minimum ne s'applique donc qu'à partir de
          « sm: » ; en dessous, le tableau se resserre au lieu de déborder.
          Les écrans qui portent plus de quatre colonnes doivent offrir une
          liste de cartes en dessous de « md: » plutôt que ce tableau. */}
      <table className="w-full border-collapse text-left sm:min-w-[46rem]">{children}</table>
    </div>
  );
}

/** L'en-tête d'une colonne. `nombre` aligne à droite, comme tous les chiffres. */
export function EnTete({
  children,
  nombre,
}: {
  children: React.ReactNode;
  nombre?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-line px-4 py-2.5 text-caption font-medium text-ink-faint ${
        nombre ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

/** Une cellule. Les lignes font 56 px : la rangée entière est une cible. */
export function Cellule({
  children,
  nombre,
  pale,
}: {
  children: React.ReactNode;
  nombre?: boolean;
  pale?: boolean;
}) {
  return (
    <td
      className={`border-b border-line px-4 py-3.5 align-top text-small ${
        nombre ? "text-right tabnums" : "text-left"
      } ${pale ? "text-ink-faint" : ""}`}
    >
      {children}
    </td>
  );
}

/**
 * L'absence, dite en toutes lettres.
 *
 * C'est la SEULE façon d'afficher « il n'y a rien ». Un tableau vide, une
 * rangée de zéros ou un tiret laissent croire à une mesure ; cette boîte dit ce
 * qui manque et ce qui le remplira.
 */
export function RienADire({
  titre,
  detail,
  ton = "calme",
}: {
  titre: string;
  detail?: string;
  /** « alerte » quand l'absence est un problème, pas un état normal. */
  ton?: "calme" | "alerte";
}) {
  return (
    <div
      className={`rounded-card border border-dashed px-4 py-8 text-center ${
        ton === "alerte" ? "border-alert" : "border-line"
      }`}
    >
      <p className="text-body font-medium">{titre}</p>
      {detail && (
        <p className="mx-auto mt-1.5 max-w-md text-small leading-relaxed text-ink-soft">
          {detail}
        </p>
      )}
    </div>
  );
}

type Ton = "positif" | "attention" | "negatif" | "neutre";

const FOND_PASTILLE: Record<Ton, string> = {
  positif: "bg-positive",
  attention: "bg-alert",
  negatif: "bg-negative",
  neutre: "bg-surface-3",
};

/** Le point d'état. Jamais seul : il accompagne un mot, il ne le remplace pas. */
export function Pastille({ ton }: { ton: Ton }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${FOND_PASTILLE[ton]}`} />;
}

const TON_DE_VIE: Record<Vivacite, Ton> = {
  actif: "positif",
  en_retard: "attention",
  muet: "negatif",
  jamais: "negatif",
  retire: "neutre",
};

/**
 * L'état d'un boîtier : la pastille ET le mot ET la durée.
 *
 * Les trois ensemble, toujours. Une pastille verte seule décrit un Pi hors
 * tension pendant l'heure qui suit une coupure d'horloge — c'est exactement le
 * cas C2 des cas limites, et il a coûté à quelqu'un un « c'est bon, c'est
 * arrivé » dit à un client.
 */
export function EtatDeVie({
  vivacite,
  depuis,
  langue,
}: {
  vivacite: Vivacite;
  depuis: string;
  langue: Langue;
}) {
  const t = textesConsole[langue];
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 whitespace-nowrap font-medium">
        <Pastille ton={TON_DE_VIE[vivacite]} />
        {t.etat[vivacite]}
      </span>
      <span className="text-caption tabnums text-ink-faint">{t.entendu(depuis)}</span>
    </span>
  );
}

/** Une pilule de texte : un rôle, une version, un opérateur. */
export function Etiquette({
  children,
  ton = "neutre",
}: {
  children: React.ReactNode;
  ton?: Ton;
}) {
  const habits: Record<Ton, string> = {
    positif: "bg-surface-2 text-positive",
    attention: "bg-surface-2 text-alert",
    negatif: "bg-surface-2 text-negative",
    neutre: "bg-surface-2 text-ink-soft",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-caption ${habits[ton]}`}
    >
      {children}
    </span>
  );
}

/**
 * Un chiffre de tête d'écran.
 *
 * `valeur` accepte une chaîne, pas un nombre, et ce n'est pas un détail : là où
 * la base n'a rien dit, l'écran doit écrire une phrase, pas « 0 ». Le `note`
 * porte cette phrase.
 */
export function Mesure({
  libelle,
  valeur,
  note,
  ton = "neutre",
}: {
  libelle: string;
  valeur: string;
  note?: string;
  ton?: Ton;
}) {
  const encre: Record<Ton, string> = {
    positif: "text-positive",
    attention: "text-alert",
    negatif: "text-negative",
    neutre: "text-ink",
  };
  return (
    <div className="rounded-card border border-line bg-surface-raised px-4 py-3">
      <p className="text-caption text-ink-faint">{libelle}</p>
      <p className={`mt-1 text-heading font-semibold tabnums ${encre[ton]}`}>{valeur}</p>
      {note && <p className="mt-0.5 text-caption leading-snug text-ink-faint">{note}</p>}
    </div>
  );
}

/**
 * À QUI CECI APPARTIENT — et jamais rien d'autre à cette place.
 *
 * Un administrateur regarde quatre boutiques dans le même tableau. Sans ce nom
 * sur chaque ligne, deux caisses se ressemblent, et le jour où l'on rapproche
 * un solde du mauvais commerçant personne ne s'en aperçoit. Quand la base ne
 * rattache rien, on l'écrit — on ne laisse pas la case vide, parce qu'une case
 * vide se lit comme « pas important ».
 */
export function NomDeCommerce({
  noms,
  langue,
  connu = false,
}: {
  noms: string[];
  langue: Langue;
  /**
   * Le registre des commerces est-il en service (au moins un déclaré) ?
   * Tant qu'il ne l'est pas, « aucun commerce » est l'état normal de TOUTES
   * les lignes : on écrit un tiret calme, pas une alarme sur chaque rangée —
   * une alarme partout ne signale plus rien.
   */
  connu?: boolean;
}) {
  const t = textesConsole[langue];
  if (noms.length === 0) {
    if (!connu) return <span className="text-ink-faint">—</span>;
    return <span className="text-alert">{t.sansCommerce}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {noms.map((n) => (
        <span key={n} className="font-medium">{n}</span>
      ))}
    </span>
  );
}

/**
 * Un geste que l'administrateur ne peut pas faire, montré désarmé.
 *
 * Le cacher serait plus simple et bien pire : celui qui ne trouve pas le bouton
 * emprunte le compte du propriétaire. Celui qui lit « c'est le comptoir qui le
 * demande » apprend à qui appartient quoi. C'est la règle B7 des cas limites,
 * et c'est aussi ce que dit `lib/roles.ts` en tête de fichier.
 */
export function GesteInterdit({ quoi, qui }: { quoi: string; qui: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
      <span className="text-small text-ink-faint line-through decoration-ink-faint/50">
        {quoi}
      </span>
      <span className="text-caption leading-snug text-ink-soft">— {qui}</span>
    </div>
  );
}

/** Le chevron d'une ligne qui mène quelque part. */
export function VersLaFiche({ href, libelle }: { href: string; libelle: string }) {
  return (
    <Link
      href={href}
      aria-label={libelle}
      // La flèche vers la fiche faisait 32 px. Elle est rendue à toutes
      // les largeurs, y compris sur téléphone où c'est le doigt qui vise.
      className="inline-flex size-11 items-center justify-center rounded-btn text-ink-faint transition hover:bg-surface-2 hover:text-ink"
    >
      <IconChevron size={16} />
    </Link>
  );
}
