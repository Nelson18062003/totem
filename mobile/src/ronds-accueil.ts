// LES RONDS DE L'ACCUEIL CHOISIS ICI — retenus sur ce téléphone.
//
// Le choix vit une fois, comme la carte choisie : l'accueil le lit, les
// Réglages l'écrivent, et l'un voit tout de suite ce que fait l'autre. Ce
// n'est pas un secret (il n'ouvre aucun droit) : il va dans les réglages
// ordinaires, pas dans le coffre. La règle de lecture — connus, sans doublon,
// cinq au plus — est dans le noyau (`rondsChoisis`).

import { useEffect, useSyncExternalStore } from "react";
import * as Reglage from "@/api/reglage";
import { rondsChoisis, RONDS_PAR_DEFAUT, type Rond } from "@noyau/ronds";
import { textesAccueil } from "@noyau/textes/accueil";
import { textesGuichet } from "@noyau/textes/guichet";
import { textesBeneficiaires } from "@noyau/textes/beneficiaires";
import { textesReleve } from "@noyau/textes/releve";
import type { NomIcone } from "@/icones";

const CLE = "totem.accueil.ronds";

let ronds: Rond[] = [...RONDS_PAR_DEFAUT];
let lue = false;
const abonnes = new Set<() => void>();

function prevenir() {
  for (const f of abonnes) f();
}

/** Ranger un nouveau choix (déjà rendu sûr par le noyau). */
export function choisirRonds(liste: Rond[]): void {
  ronds = rondsChoisis(liste);
  prevenir();
  void Reglage.ecrire(CLE, JSON.stringify(ronds));
}

/** Les ronds de l'accueil, dans l'ordre choisi. */
export function useRonds(): Rond[] {
  const valeur = useSyncExternalStore(
    (f) => { abonnes.add(f); return () => abonnes.delete(f); },
    () => ronds,
    () => ronds,
  );
  useEffect(() => {
    if (lue) return;
    lue = true;
    void Reglage.lire(CLE).then((v) => {
      if (v == null) return;          // jamais choisi : l'accueil d'origine
      ronds = rondsChoisis(v);
      prevenir();
    });
  }, []);
  return valeur;
}

// ---------------------------------------------------------------------------
// CE QUE CHAQUE ROND EST : son nom, son icône, ce que dit l'aide vocale.
// Un seul endroit, lu par l'accueil ET par les Réglages — sans quoi un rond
// porterait un nom sur l'accueil et un autre dans la liste où on le choisit.
// ---------------------------------------------------------------------------


export type DescriptionRond = { libelle: string; aide: string; icone: NomIcone };

export function descriptionDesRonds(langue: "en" | "fr"): Record<Rond, DescriptionRond> {
  const t = textesAccueil[langue];
  const tg = textesGuichet[langue];
  const tb = textesBeneficiaires[langue];
  return {
    depot: { libelle: tg.depot, aide: tg.depotSous, icone: "ArrowDown" },
    retrait: { libelle: tg.retrait, aide: tg.retraitSous, icone: "Billet" },
    transfert: { libelle: tg.transfert, aide: tg.transfertSous, icone: "ArrowUp" },
    menu: { libelle: tg.menu, aide: tg.menuSous, icone: "Grid" },
    solde: { libelle: tg.monSolde, aide: tg.soldeSous, icone: "Refresh" },
    mon_numero: { libelle: tg.monNumero, aide: tg.monNumeroSous, icone: "Phone" },
    recevoir: { libelle: t.rondRecevoir, aide: t.recevoirAria, icone: "Identite" },
    ussd: { libelle: t.rondUssd, aide: t.ussdAria, icone: "Hash" },
    beneficiaires: { libelle: tb.titre, aide: tb.sous, icone: "Personnes" },
    releve: { libelle: textesReleve[langue].titre, aide: textesReleve[langue].explication,
              icone: "Doc" },
  };
}
