import {
  chargerDonnees, dansLaDemonstration, noterIncident, relie, soldeAnnonceAvant,
} from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { jourLocal, type Sim } from "@noyau/types";
import type { Langue } from "@noyau/langue";
import { FUSEAU } from "@/lib/fuseau";
import { porteeDe, porteeDuLienDeReleve, type Portee } from "@/lib/portee";
import { estDemonstration } from "@/lib/demonstration";
import {
  bornesPourLaBase, dernierSoldeAvant, nomDuReleve, periodeDuReleve, sectionDuReleve,
  type CarteDuReleve, type Releve, type SectionReleve,
} from "@noyau/releve";
import type { Bornes } from "@noyau/periodes";
import { serviceMobileMoney } from "@noyau/coordonnees";
import { pdfReleve } from "@/lib/pdf-releve";
import { csvReleve } from "@/lib/releve-csv";

export const dynamic = "force-dynamic";

/**
 * LE RELEVÉ DE COMPTE — tous les mouvements d'argent d'une carte (ou de
 * toutes) sur une période choisie librement, en PDF ou en CSV.
 *
 *     /api/releve?carte=<iccid|tout>&de=2026-01-01&a=2026-03-31&format=pdf
 *
 * Avec une session : la portée de la personne. Sans session : un lien signé
 * (`/api/releve/lien`), qui dit pour QUI, pour quelle carte, quelle période
 * et quel format il a été fait — la portée de cette personne est relue ICI,
 * au moment où le lien sert. La vitrine de démonstration relève son propre
 * jeu inventé, et jamais la base.
 *
 * Ce qu'il contient, et ce qu'il laisse dehors, est décidé une fois dans le
 * noyau (`noyau/releve.ts`).
 */

// Ce qu'une carte peut porter dans un relevé. Comme le bilan : ce plafond ne
// borne que la taille du fichier, et quand il mord, le relevé le DIT. Une
// variable d'essai (`RELEVE_LIGNES_MAX`) peut l'ABAISSER — c'est ainsi que le
// harnais voit la coupe sans semer vingt mille lignes —, jamais le relever.
const LIGNES_MAX = 20_000;
function plafond(): number {
  const v = Number(process.env.RELEVE_LIGNES_MAX);
  return Number.isInteger(v) && v > 0 ? Math.min(v, LIGNES_MAX) : LIGNES_MAX;
}

const carteDuReleve = (s: Sim): CarteDuReleve => ({
  iccid: s.iccid, numero: s.numero, operateur: s.operateur,
  service: serviceMobileMoney(s.operateur), nom: s.nom, libelle: s.libelle,
});

/** Les sections du relevé, pour une portée — ou `null` si la carte demandée
 *  n'y est pas (ou si la personne n'en a aucune). */
async function sections(
  langue: Langue, portee: Portee, carte: string, bornes: Bornes,
): Promise<{ sections: SectionReleve[]; tronque: boolean } | null> {
  const { sims } = await chargerDonnees(langue, portee, { sms: 0, recus: 0 });
  const visees = carte === "tout" ? sims : sims.filter((s) => s.iccid === carte);
  if (visees.length === 0) return null;
  // La base filtre sur l'heure de RELÈVE ; la période se coupe ensuite au
  // JOUR de l'heure qui fait foi. Les deux bornes sont posées : sans celle de
  // fin, une période passée gardait les lignes les plus récentes.
  const { depuis, jusqua } = bornesPourLaBase(bornes);
  const max = plafond();
  const faites: SectionReleve[] = [];
  let tronque = false;
  // UNE CARTE À LA FOIS, chacune sous son propre plafond : la limite ne mord
  // que sur SES lignes, et deux cartes chargées ne se volent pas la place.
  for (const sim of visees) {
    const { paiements, smsTronques: coupe } = await chargerDonnees(
      langue, { tout: false, cartes: [sim.iccid] },
      { sms: max, recus: 0, depuis, jusqua, compter: true });
    const siens = paiements.filter((p) => p.carte === sim.iccid);
    const smsTronques = coupe === true;
    // L'ouverture se lit d'abord dans la marge qui précède la période ; sans
    // annonce là, on demande à la base la dernière d'avant. Une lecture
    // coupée ne cherche pas plus loin : ses lignes les plus anciennes
    // manquent, et la « dernière d'avant » pourrait ne pas l'être.
    const ailleurs = dernierSoldeAvant(siens, bornes.de) == null && !smsTronques
      ? await soldeAnnonceAvant(sim.iccid, depuis) : null;
    faites.push(sectionDuReleve(carteDuReleve(sim), siens, bornes, ailleurs, smsTronques));
    tronque ||= smsTronques;
  }
  return { sections: faites, tronque };
}

export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  const q = new URL(req.url).searchParams;
  const carte = q.get("carte") ?? "tout";
  const format = q.get("format") ?? "pdf";
  const maintenant = Date.now();
  const bornes = periodeDuReleve(q.get("de"), q.get("a"), jourLocal(new Date(maintenant), FUSEAU));
  if (!/^(?:tout|[A-Za-z0-9]{1,32})$/.test(carte) || (format !== "pdf" && format !== "csv")
      || !bornes) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }

  // QUI DEMANDE. La vitrine d'abord : sa session ne désigne personne, et la
  // ligne suivante la prendrait pour une main sans carte. Puis la session ;
  // à défaut, le lien signé — revérifié ici, même si le verrou l'a déjà fait.
  const qui: Portee | "demonstration" = await estDemonstration(req) ? "demonstration"
    : (await porteeDe(req)) ?? await porteeDuLienDeReleve(q);
  if (qui !== "demonstration" && !relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  const fait = qui === "demonstration"
    ? await dansLaDemonstration(() => sections(langue, { tout: true }, carte, bornes))
    : await sections(langue, qui, carte, bornes);
  if (!fait) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 404 });
  }

  if (fait.tronque) {
    // Au journal, sans un numéro ni un nom : le journal se lit à plusieurs.
    noterIncident(
      `Un relevé de compte du ${bornes.de} au ${bornes.a} a été coupé : une carte `
      + `porte plus de ${plafond()} messages sur cette période. Le document le dit.`);
  }

  const releve: Releve = {
    bornes, editeLe: new Date(maintenant).toISOString(), fuseau: FUSEAU, langue,
    tout: carte === "tout", sections: fait.sections,
  };
  const seule = carte === "tout" ? null : fait.sections[0]?.carte;
  const nom = nomDuReleve(seule ? seule.numero || seule.libelle : "TOTEM", bornes, format);
  const entetes = {
    "content-disposition": `attachment; filename="${nom}"`,
    // Un relevé se refait à chaque demande : un solde annoncé depuis, un nom
    // inscrit aux Réglages changent le document.
    "cache-control": "private, no-store",
  };
  if (format === "csv") {
    return new Response(csvReleve(releve), {
      headers: { "content-type": "text/csv; charset=utf-8", ...entetes },
    });
  }
  return new Response(pdfReleve(releve) as unknown as BodyInit, {
    headers: { "content-type": "application/pdf", ...entetes },
  });
}
