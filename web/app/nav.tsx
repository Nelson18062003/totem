"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCard, IconChart, IconGrid, IconHome, IconInbox } from "./icons";

const liens = [
  { href: "/", label: "Accueil", Icone: IconHome },
  { href: "/cartes", label: "Comptes", Icone: IconCard },
  { href: "/encaissements", label: "Encaissements", Icone: IconInbox },
  { href: "/analyse", label: "Analyse", Icone: IconChart },
  { href: "/actions", label: "Opérations", Icone: IconGrid },
];

export function Nav() {
  const path = usePathname();
  const actif = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Rail latéral — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface-raised px-3 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <span className="grid size-7 place-items-center rounded-sm bg-ink text-[0.7rem] font-bold text-white">T</span>
          <span className="text-body font-semibold tracking-tight">TOTEM</span>
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
        </nav>
        <div className="mt-auto px-3">
          <p className="flex items-center gap-2 text-small text-ink-soft">
            <span className="size-1.5 rounded-full bg-positive" />
            Terminal actif
          </p>
          <p className="mt-1 text-caption text-ink-faint">Douala · Starlink</p>
        </div>
      </aside>

      {/* Barre inférieure — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface-raised md:hidden">
        {liens.map(({ href, label, Icone }) => (
          <Link key={href} href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.68rem] ${
              actif(href) ? "text-ink" : "text-ink-faint"
            }`}>
            <Icone size={20} />
            <span className="truncate px-0.5">{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
