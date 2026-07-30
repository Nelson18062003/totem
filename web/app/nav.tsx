"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const liens = [
  { href: "/", label: "Accueil", icone: HomeIcon },
  { href: "/cartes", label: "Cartes", icone: CardIcon },
  { href: "/encaissements", label: "Encaisser", icone: InboxIcon },
  { href: "/analyse", label: "Analyse", icone: ChartIcon },
  { href: "/actions", label: "Actions", icone: BoltIcon },
];

export function Nav() {
  const path = usePathname();
  const actif = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Rail latéral — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface-raised px-4 py-7 md:flex">
        <div className="mb-9 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-btn bg-brand text-black">🗿</span>
          <span className="text-title font-bold tracking-tight">TOTEM</span>
        </div>
        <nav className="flex flex-col gap-1">
          {liens.map((l) => {
            const A = l.icone;
            return (
              <Link key={l.href} href={l.href}
                className={`flex items-center gap-3 rounded-btn px-3.5 py-3 text-body transition ${
                  actif(l.href) ? "bg-surface-2 text-ink font-semibold" : "text-ink-soft hover:bg-surface-2/60 hover:text-ink"
                }`}>
                <A active={actif(l.href)} />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-card border border-line bg-surface-2 p-3.5">
          <p className="flex items-center gap-1.5 text-small font-semibold text-success">
            <span className="size-2 rounded-full bg-success" /> TOTEM en ligne
          </p>
          <p className="mt-1 text-caption text-ink-soft">Douala · Starlink · 🔋100%</p>
        </div>
      </aside>

      {/* Barre inférieure — mobile */}
      <nav className="glass fixed inset-x-0 bottom-0 z-20 flex md:hidden">
        {liens.map((l) => {
          const A = l.icone;
          return (
            <Link key={l.href} href={l.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.68rem] ${
                actif(l.href) ? "text-brand-2" : "text-ink-soft"
              }`}>
              <A active={actif(l.href)} />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

type IP = { active?: boolean };
const s = (a?: boolean) => ({ width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: a ? 2.2 : 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });
function HomeIcon({ active }: IP) { return <svg {...s(active)} viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>; }
function CardIcon({ active }: IP) { return <svg {...s(active)} viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 9.5h19" /></svg>; }
function InboxIcon({ active }: IP) { return <svg {...s(active)} viewBox="0 0 24 24"><path d="M3 13l2.5-8h13L21 13" /><path d="M3 13v6h18v-6" /><path d="M3 13h5l1.5 2.5h5L15 13h6" /></svg>; }
function ChartIcon({ active }: IP) { return <svg {...s(active)} viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>; }
function BoltIcon({ active }: IP) { return <svg {...s(active)} viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>; }
