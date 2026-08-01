"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconCard, IconChart, IconGrid, IconHash, IconHome, IconInbox, IconList, IconSettings } from "./icons";
import { Logo } from "./marque";

const liens = [
  { href: "/", label: "Accueil", Icone: IconHome },
  { href: "/cartes", label: "Comptes", Icone: IconCard },
  { href: "/encaissements", label: "Reçus", Icone: IconInbox },
  { href: "/analyse", label: "Analyse", Icone: IconChart },
  { href: "/actions", label: "Opérations", Icone: IconGrid },
];

// Sur grand écran, la place ne manque pas : le guichet complet est à un clic.
// Sur téléphone, ces deux pages se rejoignent depuis l'accueil et Opérations —
// la barre flottante reste à cinq boutons pour rester lisible.
const liensSecondaires = [
  { href: "/sms", label: "SMS reçus", Icone: IconList },
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

export function Nav() {
  const path = usePathname();
  const cachee = useBarreEffacable();
  const actif = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Rail latéral — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface-raised px-3 py-6 md:flex">
        <div className="mb-8 px-3">
          <Logo />
        </div>
        <nav className="flex flex-col gap-0.5">
          {liens.map(({ href, label, Icone }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-btn px-3 py-2 text-body transition ${
                actif(href)
                  ? "bg-surface-2 font-medium text-ink"
                  : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"
              }`}>
              <Icone size={18} />
              {label}
            </Link>
          ))}
          <div className="mx-3 my-3 border-t border-line" />
          {liensSecondaires.map(({ href, label, Icone }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-btn px-3 py-2 text-body transition ${
                actif(href)
                  ? "bg-surface-2 font-medium text-ink"
                  : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"
              }`}>
              <Icone size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Link href="/reglages"
            className={`flex items-center gap-3 rounded-btn px-3 py-2 text-body transition ${
              actif("/reglages")
                ? "bg-surface-2 font-medium text-ink"
                : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"
            }`}>
            <IconSettings size={18} />
            Réglages
          </Link>
          <div className="mt-4 px-3">
            <p className="flex items-center gap-2 text-small text-ink-soft">
              <span className="size-1.5 rounded-full bg-positive" />
              Terminal actif
            </p>
            <p className="mt-1 text-caption text-ink-faint">Douala · Starlink</p>
          </div>
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
                <Icone size={20} />
                {on && <span className="text-small font-medium">{label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
