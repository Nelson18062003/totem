// Le cadre commun de la porte du super-administrateur.
//
// POURQUOI IL N'EMPRUNTE PAS `app/console/gabarit.tsx`
// Le gabarit de la console porte le rail des six écrans d'exploitation —
// flotte, puces, clients, versions, journal, alertes. Les écrans de cette
// porte ne sont pas des écrans d'exploitation : ce sont les écrans du COMPTE
// de la personne qui entre. Les glisser dans le rail obligerait à choisir un
// onglet actif qui n'existe pas, et un menu qui ment sur où l'on est est
// exactement ce qui rend un écran d'exploitation faux.
//
// CE QU'IL POSE, ET QUI COMPTE PLUS QUE LA MISE EN PAGE
// · Le badge ADMIN à côté du logo. Une console qui ressemble à l'application
//   du commerçant se confond avec elle, et on finit par chercher un bouton de
//   virement ici.
// · La bascule de langue AVANT tout le reste sur la porte : quelqu'un qui
//   n'est pas encore entré n'a jamais eu l'occasion de choisir sa langue.
// · La phrase qui dit ce que cette console peut et ne peut pas. Elle n'est pas
//   décorative : c'est ce qui évite qu'on emprunte le compte d'une
//   propriétaire faute de trouver le bouton ici.

import Link from "next/link";
import { BasculeLangue } from "@/app/langue";
import { Logo } from "@/app/marque";
import type { Langue } from "@/lib/langue";
import { textesAdminPorte } from "@/lib/textes/admin-porte";

/** Le nom de la console, marqué. Le logo ne se redessine jamais. */
export function MarqueAdmin({ langue }: { langue: Langue }) {
  const t = textesAdminPorte[langue];
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Logo className="h-6 shrink-0" />
      <span
        className="shrink-0 rounded-sm px-1.5 py-0.5 text-caption font-medium tracking-widest
                   text-laterite ring-1 ring-laterite"
      >
        {t.console}
      </span>
    </div>
  );
}

/**
 * Le cadre de la PORTE (A1, A2) : plein écran, une colonne, rien autour.
 *
 * Aucun menu, aucun lien vers l'application : la personne n'est pas entrée.
 * Lui montrer des onglets qui la renverraient tous ici serait lui promettre ce
 * qu'elle n'a pas encore.
 */
export function CadreDeLaPorte({
  langue,
  children,
}: {
  langue: Langue;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-5 py-5">
      <header className="flex items-center gap-3">
        <MarqueAdmin langue={langue} />
        <div className="ml-auto"><BasculeLangue /></div>
      </header>
      {children}
    </main>
  );
}

const PAGES = [
  { href: "/admin/appareils", cle: "appareils" },
  { href: "/admin/courriels", cle: "courriels" },
  { href: "/admin/application", cle: "application" },
] as const;

export type PageDeLaPorte = (typeof PAGES)[number]["cle"];

/**
 * Le cadre des écrans du compte (A3, A5, A6, A7), une fois entré.
 *
 * Les trois pages se répondent : les appareils, ce que la porte écrit, et qui
 * a le droit d'être ici. On passe de l'une à l'autre sans repasser par un
 * menu général, parce qu'on y vient pour une seule raison — vérifier que rien
 * d'anormal n'est arrivé — et que cette vérification traverse les trois.
 */
export function CadreDuCompte({
  langue,
  ici,
  titre,
  sous,
  action,
  /** Faux quand la personne n'est pas administratrice : elle voit la page des
   *  demandes, et rien d'autre. Un menu dont deux entrées sur trois renvoient
   *  ailleurs sans rien dire se lit comme une panne. */
  nav = true,
  children,
}: {
  langue: Langue;
  ici: PageDeLaPorte;
  titre: string;
  sous?: string;
  /** Un geste propre à l'écran, posé à droite du titre. */
  action?: React.ReactNode;
  nav?: boolean;
  children: React.ReactNode;
}) {
  const t = textesAdminPorte[langue];
  const libelle: Record<PageDeLaPorte, string> = {
    appareils: t.appareils.titre,
    courriels: t.courriels.titre,
    application: t.application.titre,
  };
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <MarqueAdmin langue={langue} />
          <div className="ml-auto"><BasculeLangue /></div>
        </div>
        {/* Les trois pages, en bande qui défile DANS son cadre : trois libellés
            longs ne tiennent pas sur 390 px, et les empiler mangerait le
            premier écran. */}
        <nav
          aria-label={t.console}
          className={`-mx-1 gap-1 overflow-x-auto px-1 pb-1 ${nav ? "flex" : "hidden"}`}
        >
          {PAGES.map(({ href, cle }) => {
            const actif = cle === ici;
            return (
              <Link
                key={cle}
                href={href}
                aria-current={actif ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center rounded-btn px-3 text-small transition ${
                  actif
                    ? "bg-surface-2 font-medium text-ink"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="whitespace-nowrap">{libelle[cle]}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-title font-semibold tracking-tight text-balance">{titre}</h1>
            {sous && <p className="mt-1 text-small leading-relaxed text-ink-soft">{sous}</p>}
          </div>
          {action}
        </div>
      </header>
      {children}
      {/* Écrit là où l'on quitte l'écran, pas dans une page d'aide : celui qui
          cherche un bouton de virement doit lire ici pourquoi il n'en trouvera
          nulle part. */}
      <p className="border-t border-line pt-4 text-caption leading-relaxed text-ink-faint">
        {t.application.pouvoir}
      </p>
    </div>
  );
}

/** Une carte : un titre, une note discrète, un corps, un pied. */
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
          {note && <p className="text-caption leading-relaxed text-ink-faint">{note}</p>}
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
 * L'absence, dite en toutes lettres.
 *
 * Un tableau vide ou un « 0 » se lisent comme une mesure. « Aucun appareil »
 * n'est pas « je ne sais pas », et sur cette porte la différence entre les deux
 * décide si quelqu'un va installer un second téléphone ce soir.
 */
export function RienADire({
  titre,
  detail,
  ton = "calme",
}: {
  titre: string;
  detail?: string;
  ton?: "calme" | "alerte";
}) {
  return (
    <div
      className={`rounded-card border border-dashed px-4 py-8 text-center ${
        ton === "alerte" ? "border-negative" : "border-line"
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
