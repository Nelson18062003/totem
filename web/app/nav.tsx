"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const liens = [
  { href: "/", label: "Accueil", icone: "🏠" },
  { href: "/actions", label: "Actions", icone: "💸" },
  { href: "/paiements", label: "Paiements", icone: "📥" },
  { href: "/rapports", label: "Rapports", icone: "📊" },
  { href: "/reglages", label: "Réglages", icone: "⚙️" },
];

export function Nav() {
  const path = usePathname();
  const actif = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Rail latéral — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface-raised px-3 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="text-2xl">🗿</span>
          <span className="text-title font-bold tracking-tight">TOTEM</span>
        </div>
        <nav className="flex flex-col gap-1">
          {liens.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-btn px-3 py-2.5 text-body transition ${
                actif(l.href)
                  ? "bg-brand-soft text-brand-strong font-semibold"
                  : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
              }`}
            >
              <span className="text-lg">{l.icone}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-3 text-caption text-ink-soft">Maquette · données de démo</p>
      </aside>

      {/* Barre inférieure — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface-raised/95 backdrop-blur md:hidden">
        {liens.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-caption ${
              actif(l.href) ? "text-brand-strong" : "text-ink-soft"
            }`}
          >
            <span className="text-xl">{l.icone}</span>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
