"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@/lib/textes/charpente";
import { Badge } from "./ui/navigation";

// La veille interroge une route minuscule (/api/actualite). Cinq secondes :
// assez vif pour qu'un encaissement « apparaisse tout seul », assez espacé
// pour ne peser sur rien. L'onglet caché ne veille pas — il rattrape tout
// au retour, immédiatement.
const CADENCE_MS = 5000;

/** Dit à la veille de repasser tout de suite (après « marquer lu », etc.). */
export function reveillerLaVeille() {
  window.dispatchEvent(new Event("totem:veille"));
}

/**
 * Le pouls de la plateforme, côté navigateur.
 *
 * Rend le nombre de SMS non lus (la pastille du menu) et rafraîchit l'écran
 * tout seul dès qu'un nouveau SMS entre en base : plus besoin de recharger la
 * page pour voir arriver l'argent.
 */
export function useActualite(): number {
  const router = useRouter();
  const [nonLus, setNonLus] = useState(0);
  // Le dernier SMS connu. `null` tant qu'on n'a pas fait le premier relevé :
  // le premier ne déclenche jamais de rafraîchissement, il pose la référence.
  const dernier = useRef<number | null>(null);

  useEffect(() => {
    let arret = false;

    const relever = async () => {
      if (arret || document.hidden) return;
      try {
        const r = await fetch("/api/actualite", { cache: "no-store" });
        if (!r.ok) return;   // verrou, coupure… : on repassera
        const { dernier: d, nonLus: n } = (await r.json()) as {
          dernier: number; nonLus: number;
        };
        if (arret) return;
        setNonLus(n);
        if (dernier.current !== null && d > dernier.current) {
          router.refresh();   // un SMS vient d'arriver : l'écran suit
        }
        dernier.current = d;
      } catch {
        /* réseau absent : la prochaine veille réessaiera */
      }
    };

    relever();
    const cadence = setInterval(relever, CADENCE_MS);
    const surRetour = () => { if (!document.hidden) relever(); };
    document.addEventListener("visibilitychange", surRetour);
    window.addEventListener("totem:veille", relever);
    return () => {
      arret = true;
      clearInterval(cadence);
      document.removeEventListener("visibilitychange", surRetour);
      window.removeEventListener("totem:veille", relever);
    };
  }, [router]);

  return nonLus;
}

/**
 * La pastille « N nouveaux ».
 *
 * Elle ne se dessine plus ici. Le compteur de non-lus était écrit à la main
 * TROIS fois, à trois tailles ; il n'existe désormais qu'une seule fois, dans
 * `app/ui/navigation.tsx`, à la hauteur du système (`h-badge`, 20 px). Cette
 * fonction ne fait plus que lui donner le compte et la phrase qui le dit — un
 * composant ne traduit pas, c'est le dictionnaire qui parle.
 */
export function Pastille({ n }: { n: number }) {
  const langue = useLangue();
  const t = textesCharpente[langue];
  if (n <= 0) return null;
  return <Badge nombre={n} libelle={t.nonLus(n)} className="ml-auto" />;
}
