import { redirect } from "next/navigation";
import { langueServeur } from "@/lib/langue-serveur";
import { volumesMontres } from "@/lib/volumes";
import { estGenrePeriode, repereDeLaPeriode } from "@noyau/volumes";
import { EcranVolumes, type DemandeVolumes } from "./ecran";
import { Documents } from "./documents";

export const dynamic = "force-dynamic";

// LES VOLUMES — ce qui est entré et sorti des cartes, sur la période qu'on
// choisit. Le propriétaire a refusé deux versions : la première « trop
// complexe, mal structurée », la seconde « pas assez visuelle ». Celle-ci
// montre d'abord DEUX BARRES (entrées, sorties), puis des dessins ; les mots
// sont des titres.
//
// Le serveur ne rend ici que la PREMIÈRE vue, pour qu'elle s'affiche d'un
// coup. Ensuite, l'écran vit dans le navigateur (`ecran.tsx`) : il garde ce
// qu'il a lu, charge les voisines en silence, et ne recharge plus la page.
//
// Rien n'est calculé ici : `lib/volumes.ts` lit toute la période, le noyau
// compte (`noyau/volumes.ts`), le téléphone reçoit le même calcul.
//
// LES TAILLES D'ÉCRAN : une colonne sur un téléphone et une tablette (le menu
// du site y prend déjà un tiers de la largeur), deux sur un petit
// ordinateur, trois sur un grand — la période et les deux barres en tête.

type Params = { periode?: string; jour?: string; de?: string; a?: string; carte?: string; qui?: string };

export default async function Volumes({ searchParams }: { searchParams: Promise<Params> }) {
  const langue = await langueServeur();
  const q = await searchParams;
  const r = await volumesMontres(langue, {
    genre: q.periode, repere: q.jour, de: q.de, a: q.a, carte: q.carte, correspondant: q.qui,
  });
  // Une adresse qui ne se lit pas (une carte qui n'est pas la sienne, une
  // date dans le futur) ramène au mois en cours, sans rien montrer d'autre.
  if (!r) redirect("/volumes");

  const p = r.volumes.periode;
  const demande: DemandeVolumes = {
    periode: estGenrePeriode(p.genre) ? p.genre : "mois",
    ...(p.genre === "dates" ? { de: p.de, a: p.a } : { jour: repereDeLaPeriode(p) }),
    carte: r.carte,
    qui: r.volumes.fiche !== undefined && q.qui ? q.qui : null,
  };

  return (
    <div className="flex flex-col gap-5">
      <EcranVolumes initial={r} demandeInitiale={demande} langue={langue} />
      {r.cartes.length > 0 && (
        <div className="mt-4 border-t border-line pt-8">
          <Documents langue={langue} aujourdhui={r.aujourdhui}
                     sims={r.cartes.map((c) => ({ iccid: c.iccid, numero: c.numero, libelle: c.libelle, operateur: c.operateur }))} />
        </div>
      )}
    </div>
  );
}
