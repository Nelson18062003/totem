// --- Le RELEVÉ DE COMPTE en CSV ------------------------------------------------
//
// Le même relevé que le PDF — les MÊMES lignes, les MÊMES totaux, calculés
// une fois dans le noyau (`noyau/releve.ts`) — rangé pour un tableur : pour
// chaque carte, un bloc « clé ; valeur » (numéro, réseau, période, soldes,
// totaux), une ligne vide, puis le tableau de ses mouvements.
//
// Comme le PDF, il ne porte QUE l'argent : ni code, ni publicité, ni
// consultation de solde. Un CSV part chez un comptable aussi sûrement qu'un
// PDF ; la règle est la même pour les deux.
//
// Les montants restent des NOMBRES (« 2784137.6 »), pas du texte mis en
// forme : le comptable additionne une colonne, il ne la relit pas.

import { formaterNumero } from "@noyau/numero";
import { genreDuMouvement, type Releve } from "@noyau/releve";
import { textesReleve } from "@noyau/textes/releve";
import { textesSms } from "@noyau/textes/sms";
import { fichierCsv } from "./csv";

const nombre = (v: number | null | undefined) => (v == null ? "" : String(v));

export function csvReleve(r: Releve): string {
  const t = textesReleve[r.langue];
  const k = t.csvCles;
  const rangs: (string | number | null)[][] = [];

  // UN RELEVÉ AMPUTÉ LE DIT EN PREMIÈRE LIGNE — c'est ce que le tableur
  // montre d'abord, et personne ne fait défiler un export jusqu'en bas.
  if (r.sections.some((s) => s.tronque)) rangs.push([t.incomplet]);

  for (const s of r.sections) {
    const numero = formaterNumero(s.carte.numero);
    rangs.push([k.titre, t.titre]);
    rangs.push([k.numero, numero || t.numeroNonRenseigne]);
    rangs.push([k.reseau, s.carte.service]);
    if (s.carte.nom.trim()) rangs.push([k.titulaire, s.carte.nom.trim()]);
    rangs.push([k.libelle, s.carte.libelle]);
    rangs.push([k.iccid, s.carte.iccid]);
    rangs.push([k.de, r.bornes.de]);
    rangs.push([k.a, r.bornes.a]);
    rangs.push([k.edite, r.editeLe]);
    // « non connu », jamais 0 : un zéro serait un solde.
    rangs.push([k.ouverture, s.soldes.ouverture == null ? t.nonConnu : nombre(s.soldes.ouverture)]);
    rangs.push([k.cloture, s.soldes.cloture == null ? t.nonConnu : nombre(s.soldes.cloture)]);
    rangs.push([k.entrees, nombre(s.totaux.entrees)]);
    rangs.push([k.sorties, nombre(s.totaux.sorties)]);
    rangs.push([k.frais, nombre(s.totaux.frais)]);
    rangs.push([k.operations, s.totaux.nombre]);
    rangs.push([k.sensInconnu, s.totaux.inconnus]);
    if (s.tronque) rangs.push([t.incomplet]);
    rangs.push([]);
    rangs.push(t.csvColonnes);
    for (const p of s.lignes) {
      const genre = genreDuMouvement(p);
      rangs.push([
        p.jour, p.heure, numero || s.carte.libelle, s.carte.service, s.carte.iccid,
        genre ? textesSms[r.langue].cat[genre] : "",
        t.sensCsv[p.sens], nombre(p.montant),
        p.sens === "out" ? nombre(p.montant) : "",
        p.sens === "in" ? nombre(p.montant) : "",
        nombre(p.frais), nombre(p.commission),
        p.tiers, p.numero, p.reference, nombre(p.soldeApres),
        // Une ligne de sens inconnu est MONTRÉE (son montant est dans la
        // colonne « montant »), pas comptée : ni au débit, ni au crédit.
        p.sens === "?" ? t.non : t.oui,
        p.smsBrut,
      ]);
    }
    rangs.push([]);
  }
  return fichierCsv(rangs);
}
