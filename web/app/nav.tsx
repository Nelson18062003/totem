"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { EtatTerminal } from "@/lib/types";
import { IconCard, IconChart, IconChevron, IconGrid, IconHash, IconHome, IconInbox, IconSettings } from "./icons";
import { Logo, Symbole } from "./marque";
import { Pastille, useActualite } from "./veille";

const liens = [
  { href: "/", label: "Accueil", Icone: IconHome },
  { href: "/cartes", label: "Comptes", Icone: IconCard },
  { href: "/encaissements", label: "SMS reçus", Icone: IconInbox },
  { href: "/analyse", label: "Analyse", Icone: IconChart },
  { href: "/actions", label: "Opérations", Icone: IconGrid },
];

// Sur grand écran, la place ne manque pas : le guichet complet est à un clic.
// Sur téléphone, ces deux pages se rejoignent depuis l'accueil et Opérations —
// la barre flottante reste à cinq boutons pour rester lisible.
const liensSecondaires = [
  { href: "/ussd", label: "Code USSD", Icone: IconHash },
];

/**
 * La barre mobile s'efface pendant qu'on descend dans la page — le contenu
 * reprend toute la hauteur — et revient dès qu'on remonte, ou en haut de page.
 */
function useBarreEffacable() {
  const [cachee, setCachee] = useState(false);

  useEffect(() => {
    let dernierY = window.scrollY;
    const surDefilement = () => {
      const y = window.scrollY;
      if (y < 24) setCachee(false);
      else if (Math.abs(y - dernierY) > 8) setCachee(y > dernierY);
      dernierY = y;
    };
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  return cachee;
}

export function Nav({ terminal }: { terminal: EtatTerminal | null }) {
  const path = usePathname();
  const cachee = useBarreEffacable();
  const actif = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // La veille : rafraîchit l'écran dès qu'un SMS entre en base, et porte la
  // pastille des non-lus. Elle vit ici parce que la barre est sur chaque page.
  const nonLus = useActualite();

  // Le rail se replie d'une flèche (icônes seules) et s'en souvient. La page
  // suit le mouvement : la même variable --rail pilote sa marge gauche.
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    const su = localStorage.getItem("totem-rail") === "replie";
    setReplie(su);
    document.documentElement.dataset.rail = su ? "replie" : "";
  }, []);
  const basculer = () => {
    const apres = !replie;
    setReplie(apres);
    localStorage.setItem("totem-rail", apres ? "replie" : "deplie");
    document.documentElement.dataset.rail = apres ? "replie" : "";
  };

  const classeLien = (on: boolean) =>
    `relative flex items-center gap-3 rounded-btn py-2 text-body transition ${
      replie ? "justify-center px-0" : "px-3"
    } ${on ? "bg-surface-2 font-medium text-ink"
          : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"}`;

  // Replié, la pastille devient un point sur l'icône — le chiffre n'a plus
  // la place, l'information reste.
  const point = (
    <span className="absolute right-2.5 top-1.5 size-2 rounded-full bg-ink" />
  );

  return (
    <>
      {/* Rail latéral — desktop. Sa largeur est la variable --rail. */}
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--rail)] flex-col border-r border-line bg-surface-raised px-3 py-6 transition-[width] duration-300 md:flex">
        <div className={`mb-8 ${replie ? "flex justify-center" : "px-3"}`}>
          {replie ? <Symbole size={22} className="text-laterite" /> : <Logo />}
        </div>
        <nav className="flex flex-col gap-0.5">
          {liens.map(({ href, label, Icone }) => (
            <Link key={href} href={href} title={replie ? label : undefined}
              className={classeLien(actif(href))}>
              <Icone size={18} className="shrink-0" />
              {!replie && label}
              {href === "/encaissements" &&
                (replie ? nonLus > 0 && point : <Pastille n={nonLus} />)}
            </Link>
          ))}
          <div className="mx-3 my-3 border-t border-line" />
          {liensSecondaires.map(({ href, label, Icone }) => (
            <Link key={href} href={href} title={replie ? label : undefined}
              className={classeLien(actif(href))}>
              <Icone size={18} className="shrink-0" />
              {!replie && label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Link href="/reglages" title={replie ? "Réglages" : undefined}
            className={classeLien(actif("/reglages"))}>
            <IconSettings size={18} className="shrink-0" />
            {!replie && "Réglages"}
          </Link>
          <div className={`mt-4 ${replie ? "flex justify-center" : "px-3"}`}>
            {terminal ? (
              replie ? (
                // Replié : l'état du terminal tient dans son point — le
                // survol dit le reste.
                <span title={`${terminal.enLigne ? "Terminal actif" : "Terminal muet"} · ${terminal.nom} · ${terminal.majTexte}`}
                  className={`size-2 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
              ) : (
                <>
                  <p className="flex items-center gap-2 text-small text-ink-soft">
                    <span className={`size-1.5 rounded-full ${terminal.enLigne ? "bg-positive" : "bg-negative"}`} />
                    {terminal.enLigne ? "Terminal actif" : "Terminal muet"}
                  </p>
                  <p className="mt-1 text-caption text-ink-faint">
                    {terminal.nom} · {terminal.majTexte}
                  </p>
                </>
              )
            ) : (
              <p className="flex items-center gap-2 text-small text-ink-faint">
                <span className="size-1.5 rounded-full bg-surface-3" />
                {!replie && "Aucun terminal relié"}
              </p>
            )}
          </div>
          {/* La flèche de repli — un geste, mémorisé. */}
          <button onClick={basculer}
            aria-label={replie ? "Déplier le menu" : "Replier le menu"}
            title={replie ? "Déplier le menu" : "Replier le menu"}
            className={`mt-4 flex w-full items-center gap-3 rounded-btn py-2 text-small text-ink-faint transition hover:bg-surface-2/70 hover:text-ink ${
              replie ? "justify-center px-0" : "px-3"
            }`}>
            <IconChevron size={16}
              className={`shrink-0 transition-transform duration-300 ${replie ? "" : "rotate-180"}`} />
            {!replie && "Replier"}
          </button>
        </div>
      </aside>

      {/* Barre flottante — mobile.
          Repos : icône seule. Actif : pilule pleine avec libellé. */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 md:hidden ${
          cachee ? "translate-y-[130%]" : "translate-y-0"
        }`}>
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-raised p-1.5 shadow-[0_8px_28px_-8px_rgba(22,23,26,0.22)]">
          {liens.map(({ href, label, Icone }) => {
            const on = actif(href);
            return (
              <Link key={href} href={href} aria-label={label} aria-current={on ? "page" : undefined}
                className={`flex items-center justify-center gap-2 rounded-full transition-all duration-200 ${
                  on
                    ? "bg-ink px-4 py-2.5 text-white"
                    : "size-11 text-ink-faint active:bg-surface-2"
                }`}>
                <span className="relative">
                  <Icone size={20} />
                  {/* Le point des nouveaux SMS, version mobile : discret sur
                      l'icône de la boîte quand elle n'est pas la page active. */}
                  {href === "/encaissements" && !on && nonLus > 0 && (
                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-ink" />
                  )}
                </span>
                {on && <span className="text-small font-medium">{label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
