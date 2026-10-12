import { donneesMontrees } from "@/lib/ce-qu-on-montre";
import { langueServeur } from "@/lib/langue-serveur";
import { FUSEAU_DEFAUT } from "@noyau/types";
import { PageFlux } from "./flux-client";

export const dynamic = "force-dynamic";

// LE MODULE FLUX — ce qui est entré et sorti de chaque carte. Les données
// passent par la même porte que les SMS (`donneesMontrees`) : chacun ne voit
// que ses cartes, et la vitrine reste une vitrine.
export default async function Flux({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; periode?: string; carte?: string; type?: string; t?: string }>;
}) {
  const langue = await langueServeur();
  const [donnees, params] = await Promise.all([donneesMontrees(langue), searchParams]);
  return (
    <PageFlux
      paiements={donnees.paiements}
      sims={donnees.sims}
      fuseau={donnees.fuseau ?? FUSEAU_DEFAUT}
      initial={{
        q: typeof params.q === "string" ? params.q : "",
        periode: typeof params.periode === "string" ? params.periode : "aujourdhui",
        carte: typeof params.carte === "string" ? params.carte : "",
        type: typeof params.type === "string" ? params.type : "",
        t: typeof params.t === "string" ? params.t : "",
      }}
    />
  );
}
