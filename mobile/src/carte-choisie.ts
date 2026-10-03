// LA CARTE CHOISIE — une seule pour tout l'écran, et elle se souvient.
//
// L'accueil et l'onglet Opérations gardaient chacun SA carte : on choisissait
// la MTN sur l'accueil, on passait à Opérations, et l'on y trouvait l'Orange
// — sur l'écran où l'on va déplacer de l'argent. Le choix vit maintenant ici,
// une fois, et se retient d'une ouverture à l'autre (comme le solde masqué) :
// on rouvre l'application sur la caisse qu'on regardait.
//
// Un ICCID qui n'est plus là (carte retirée, autre compte) ne gêne rien :
// chaque écran retombe alors sur sa première carte.

import { useEffect, useSyncExternalStore } from "react";
import * as Coffre from "@/api/coffre";

const CLE = "totem.carte.choisie";

let choisie: string | null = null;
let lue = false;
const abonnes = new Set<() => void>();

function prevenir() {
  for (const f of abonnes) f();
}

/** Choisir la carte que montrent l'accueil et Opérations. */
export function choisirCarte(iccid: string): void {
  if (choisie === iccid) return;
  choisie = iccid;
  prevenir();
  void Coffre.ecrire(CLE, iccid).catch(() => { /* rien de grave : on oubliera */ });
}

/** La carte choisie — `null` tant que rien n'a été choisi. */
export function useCarteChoisie(): string | null {
  const valeur = useSyncExternalStore(
    (f) => { abonnes.add(f); return () => abonnes.delete(f); },
    () => choisie,
    () => choisie,
  );
  useEffect(() => {
    if (lue) return;
    lue = true;
    Coffre.lire(CLE)
      .then((v) => { if (v && choisie === null) { choisie = v; prevenir(); } })
      .catch(() => { /* coffre muet : on part de la première carte */ });
  }, []);
  return valeur;
}
