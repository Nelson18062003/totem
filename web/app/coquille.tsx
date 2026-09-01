"use client";

import { usePathname } from "next/navigation";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@noyau/textes/charpente";
import type { EtatTerminal } from "@noyau/types";
import { Nav } from "./nav";

/** Pages qui s'affichent seules, sans navigation ni bandeau.
 *
 *  Elles sont toutes PUBLIQUES, et c'est la même raison : on y arrive sans
 *  compte. Leur montrer la navigation de l'application serait offrir des
 *  liens qui mènent tous au verrou — et sur « /confidentialite », qu'un
 *  examinateur du Play Store ouvre depuis un formulaire, cela donnerait
 *  l'impression d'une application qui se dérobe. */
const PLEIN_ECRAN = ["/connexion", "/inscription", "/confidentialite",
                     "/suppression"];

/** La console a son propre rail (voir app/console/gabarit.tsx) : le menu du
 *  commerçant ne doit pas s'afficher par-dessus. Elle garde la colonne large
 *  de l'application — c'est le rail qu'elle remplace, pas la mise en page. */
const CONSOLE = "/console";

export function Coquille({
  relie,
  terminal,
  children,
}: {
  relie: boolean;
  terminal: EtatTerminal | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const langue = useLangue();
  const t = textesCharpente[langue];
  const nu = PLEIN_ECRAN.some((p) => path.startsWith(p));

  if (nu) {
    return <div className="mx-auto w-full max-w-4xl px-4">{children}</div>;
  }

  if (path === CONSOLE || path.startsWith(CONSOLE + "/")) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-9 lg:max-w-6xl lg:px-10">
        {children}
      </div>
    );
  }

  return (
    // La marge gauche suit la largeur du rail (déplié ou replié) : c'est la
    // même variable --rail que le menu pilote, et la page glisse avec lui.
    <div className="pb-28 transition-[padding] duration-300 md:pb-0 md:pl-[var(--rail)]">
      <Nav terminal={terminal} />
      {/* Sur grand écran, la page respire : colonne plus large, marges plus
          franches. Les pages y déploient leurs deux colonnes. */}
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-9 lg:max-w-5xl lg:px-10">
        {!relie && (
          // Pas de données inventées : tant que la base n'est pas branchée,
          // on le dit, et les écrans restent vides.
          <div className="mb-6 flex items-start gap-3 rounded-card border border-line bg-surface-2 px-4 py-3">
            <span className="mt-0.5 shrink-0 rounded-sm bg-ink px-1.5 py-0.5 text-caption font-medium text-white">
              {t.nonRelie}
            </span>
            <p className="flex-1 text-small leading-relaxed text-ink-soft">
              {t.nonRelieAvant}
              <span className="tabnums">SUPABASE_URL</span>
              {t.nonRelieEt}
              <span className="tabnums">SUPABASE_CLE</span>
              {t.nonRelieApres}
            </p>
          </div>
        )}
        {/* `key={path}` : chaque page rejoue son entrée — le glissement doux
            qui fait la différence entre un écran qui claque et un qui arrive. */}
        <main key={path} className="entree">{children}</main>
      </div>
    </div>
  );
}
