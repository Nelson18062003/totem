"use client";

import { usePathname } from "next/navigation";
import { BandeauDemo } from "./demo";
import { Nav } from "./nav";

/** Pages qui s'affichent seules, sans navigation ni bandeau. */
const PLEIN_ECRAN = ["/connexion"];

export function Coquille({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const nu = PLEIN_ECRAN.some((p) => path.startsWith(p));

  if (nu) {
    return <div className="mx-auto w-full max-w-4xl px-4">{children}</div>;
  }

  return (
    <div className="pb-28 md:pb-0 md:pl-60">
      <Nav />
      {/* Sur grand écran, la page respire : colonne plus large, marges plus
          franches. Les pages y déploient leurs deux colonnes. */}
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-9 lg:max-w-5xl lg:px-10">
        <BandeauDemo />
        <main>{children}</main>
      </div>
    </div>
  );
}
