"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLangue } from "@/app/langue";
import { textesCharpente } from "@/lib/textes/charpente";

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

/** La pastille « N nouveaux » — sobre, dans le ton de la maison. */
export function Pastille({ n }: { n: number }) {
  const langue = useLangue();
  const t = textesCharpente[langue];
  if (n <= 0) return null;
  return (
    <span aria-label={t.nonLus(n)}
      className="ml-auto grid min-w-5 place-items-center rounded-full bg-ink px-1.5 py-0.5 text-caption font-medium leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
