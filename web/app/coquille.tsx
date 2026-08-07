"use client";

import { usePathname } from "next/navigation";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import type { EtatTerminal } from "@/lib/types";
import { IconAlert } from "./icons";
import { Nav } from "./nav";
import { Bandeau } from "./ui/etat";

/** Pages qui s'affichent seules, sans navigation ni bandeau. */
const PLEIN_ECRAN = ["/connexion"];

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

  return (
    // La marge gauche suit la largeur du rail (déplié ou replié) : c'est la
    // même variable --rail que le menu pilote, et la page glisse avec lui.
    // `pb-16` (64) laisse la barre flottante passer devant la page sans manger
    // la dernière ligne : la barre en fait 62 (44 de pilule et 8 de retrait de
    // part et d'autre), et les 16 px du bas de la colonne s'y ajoutent.
    <div className="pb-16 transition-[padding] duration-300 md:pb-0 md:pl-[var(--rail)]">
      <Nav terminal={terminal} />
      {/* Sur grand écran, la page respire : colonne plus large, marges plus
          franches. Les pages y déploient leurs deux colonnes. */}
      <div className="mx-auto w-full max-w-4xl px-4 py-4 md:px-8 md:py-8 lg:max-w-5xl lg:px-12">
        {!relie && (
          // Pas de données inventées : tant que la base n'est pas branchée,
          // on le dit, et les écrans restent vides. C'est un bandeau du
          // système : l'étiquette écrite à la main était un badge de 16 px.
          <div className="mb-6">
            <Bandeau ton="alert" icone={<IconAlert size={20} />} titre={t.nonRelie}>
              {t.nonRelieAvant}
              <span className="tabnums">SUPABASE_URL</span>
              {t.nonRelieEt}
              <span className="tabnums">SUPABASE_CLE</span>
              {t.nonRelieApres}
            </Bandeau>
          </div>
        )}
        {/* `key={path}` : chaque page rejoue son entrée — le glissement doux
            qui fait la différence entre un écran qui claque et un qui arrive. */}
        <main key={path} className="entree">{children}</main>
      </div>
    </div>
  );
}
