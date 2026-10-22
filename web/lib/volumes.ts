// LES VOLUMES, LUS POUR CELUI QUI REGARDE — la page du site et la route du
// téléphone passent par ici, et nulle part ailleurs.
//
// Le calcul est dans le noyau (`noyau/volumes.ts`) ; ici, on décide QUOI lui
// donner : toute la période, page après page (et non les mille derniers
// SMS), la période précédente pour la comparaison, et les cartes de la
// personne — jamais celles des autres.

import { chargerDonnees, dansLaDemonstration, soldeAnnonceAvant } from "@/lib/serveur";
import { porteeDe, RIEN, type Portee } from "@/lib/portee";
import { estDemonstration } from "@/lib/demonstration";
import { FUSEAU } from "@/lib/fuseau";
import { jourLocal } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { bornesPourLaBase, dernierSoldeAvant, duCompteDesCommissions } from "@noyau/releve";
import {
  calculerVolumes, estGenrePeriode, joursALire, periodeVolumes,
  type CarteVolumes, type ReponseVolumes,
} from "@noyau/volumes";

export type DemandeVolumes = {
  genre?: string | null; repere?: string | null; de?: string | null; a?: string | null;
  carte?: string | null; correspondant?: string | null;
};

/** Ce que l'adresse demande, relu. */
export function demandeDe(q: URLSearchParams): DemandeVolumes {
  return {
    genre: q.get("periode"), repere: q.get("jour"), de: q.get("de"), a: q.get("a"),
    carte: q.get("carte"), correspondant: q.get("qui"),
  };
}

const CARTE = /^(?:tout|[A-Za-z0-9]{1,32})$/;
const CORRESPONDANT = /^(?:\d{8,9}|nom:[^\n]{1,120})$/;

/** Les volumes, pour une portée. `null` : la demande ne se lit pas (période
 *  dans le futur, carte qui n'est pas la sienne). */
export async function volumesPour(
  langue: Langue, portee: Portee, demande: DemandeVolumes, maintenant = Date.now(),
): Promise<ReponseVolumes | null> {
  const aujourdhui = jourLocal(new Date(maintenant), FUSEAU);
  const genre = estGenrePeriode(demande.genre) ? demande.genre : "mois";
  const periode = periodeVolumes(genre, demande.repere, aujourdhui, demande.de, demande.a);
  const carte = demande.carte && CARTE.test(demande.carte) ? demande.carte : "tout";
  const correspondant = demande.correspondant && CORRESPONDANT.test(demande.correspondant)
    ? demande.correspondant : null;
  if (!periode) return null;

  const { depuis, jusqua } = bornesPourLaBase(joursALire(periode));
  const lu = await chargerDonnees(langue, portee, { recus: 0, depuis, jusqua, toutes: true });
  const visees = carte === "tout" ? lu.sims : lu.sims.filter((s) => s.iccid === carte);
  if (carte !== "tout" && visees.length === 0) return null;
  const cartes: CarteVolumes[] = visees.map((s) => ({
    iccid: s.iccid, numero: s.numero, operateur: s.operateur, libelle: s.libelle,
  }));

  // L'ouverture d'une carte dont les lignes lues ne portent aucun solde
  // annoncé avant la période : la base la cherche plus loin. Une lecture
  // coupée ne cherche pas — ses lignes les plus anciennes manquent.
  const ouverturesAilleurs: Record<string, number | null> = {};
  if (!lu.smsTronques) {
    await Promise.all(cartes.map(async (c) => {
      const siennes = lu.paiements.filter((p) => p.carte === c.iccid && !duCompteDesCommissions(p, c.numero));
      if (dernierSoldeAvant(siennes, periode.de) == null) {
        ouverturesAilleurs[c.iccid] = await soldeAnnonceAvant(c.iccid, depuis, c.numero);
      }
    }));
  }

  const volumes = calculerVolumes({
    periode, lignes: lu.paiements, cartes, fuseau: FUSEAU, ouverturesAilleurs, correspondant,
  });
  return {
    volumes,
    cartes: lu.sims.map((s) => ({ iccid: s.iccid, numero: s.numero, operateur: s.operateur, libelle: s.libelle })),
    carte,
    tronque: lu.smsTronques === true,
    // Un boîtier qui se tait MAINTENANT : les dernières opérations de ses
    // cartes peuvent arriver plus tard. Seulement si la période est en cours.
    silencieuses: periode.enCours
      ? visees.filter((s) => s.boitierMuet).map((s) => ({ iccid: s.iccid, depuis: s.boitierVuLe ?? null }))
      : [],
    aujourdhui,
    fuseau: FUSEAU,
  };
}

/** Les volumes pour celui qui regarde : la vitrine compte son jeu inventé
 *  et ne lit jamais la base ; les autres, leur portée. */
export async function volumesMontres(
  langue: Langue, demande: DemandeVolumes, req?: Request,
): Promise<ReponseVolumes | null> {
  if (await estDemonstration(req)) {
    return dansLaDemonstration(() => volumesPour(langue, { tout: true }, demande));
  }
  return volumesPour(langue, (await porteeDe(req)) ?? RIEN, demande);
}
