// LE REÇU D'UN SMS, FABRIQUÉ PAR LA PLATEFORME, depuis la ligne du paiement.
//
// Le dessin vit dans `recu-pdf.ts` (la transcription de `totem/recu.py`) ; ici,
// on ne fait que traduire une ligne de `paiements` — et ce que la carte dit
// d'elle-même — dans les arguments que `totem/app.py` passe au reçu du
// boîtier (`_fabriquer_recu`) :
//
//   — le titre suit la NATURE choisie par le propriétaire, sinon la lecture
//     du SMS : un dépôt donne un « Reçu de dépôt », un retrait un « Reçu de
//     retrait », tout le reste un « Reçu de transfert » ;
//   — NOTRE côté de l'opération, c'est le nom et le numéro de la carte ;
//   — l'heure est celle du RÉSEAU (à la seconde) quand le SMS la porte,
//     sinon celle de la réception (à la minute) ;
//   — le réseau, c'est l'opérateur de la carte, écrit comme le boîtier
//     l'écrit (« MTN MoMo », « Orange Money »).
//
// Fabriquer prend une douzaine de millisecondes : le reçu se fait à la
// demande, à chaque ouverture, et n'est stocké nulle part.

import {
  recuSolde, recuTransfert, serviceDeLOperateur, titreDuRecu,
  type Instant, type Langue, type TitreDuRecu,
} from "./recu-pdf";

export type LigneDuRecu = {
  source_id: number | null;
  sens: string | null;
  montant: number | null;
  tiers: string | null;
  numero: string | null;
  reference: string | null;
  frais?: number | null;
  commission?: number | null;
  montant_brut?: number | null;
  solde_apres?: number | null;
  nature?: string | null;
  categorie?: string | null;
  emis_le?: string | null;
  recu_le: string;
};

export type CarteDuRecu = { nom: string | null; numero: string | null; operateur: string | null; libelle: string | null };

/** L'instant, dans le fuseau de la CAISSE : c'est elle qui dit l'heure. */
export function instantLocal(iso: string, fuseau: string): Instant {
  const parties = new Intl.DateTimeFormat("en-GB", {
    timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const n = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? 0);
  return { annee: n("year"), mois: n("month"), jour: n("day"), heure: n("hour"), minute: n("minute"), seconde: n("second") };
}

function natureDuTitre(ligne: LigneDuRecu): TitreDuRecu {
  const n = ligne.nature || ligne.categorie || "";
  return n === "depot" || n === "retrait" ? n : "transfert";
}

/**
 * Le PDF, ou `null` : la ligne ne porte pas de quoi remplir ce reçu (un
 * message sans montant, ou un solde que le SMS n'annonce pas). Comme le
 * boîtier : rien n'est inventé.
 */
export function fabriquerLeRecu(
  genre: "transfert" | "solde", numero: string, ligne: LigneDuRecu, carte: CarteDuRecu | null,
  langue: Langue, fuseau: string,
): Uint8Array | null {
  const operateur = serviceDeLOperateur(carte?.operateur);
  const recuLe = instantLocal(ligne.recu_le, fuseau);
  if (genre === "solde") {
    if (ligne.solde_apres == null) return null;
    return recuSolde(Number(ligne.solde_apres), carte?.nom || carte?.libelle || operateur,
      carte?.numero ?? "", numero, recuLe, operateur, langue).pdf;
  }
  if (ligne.montant == null || !(Number(ligne.montant) > 0)) return null;
  const reseau = Boolean(ligne.emis_le);
  const quand = reseau ? instantLocal(ligne.emis_le!, fuseau) : recuLe;
  return recuTransfert({
    sens: ligne.sens,
    montant: Number(ligne.montant),
    nom: ligne.tiers,
    numero: ligne.numero,
    reference: ligne.reference,
    frais: ligne.frais ?? null,
    commission: ligne.commission ?? null,
    montantBrut: ligne.montant_brut ?? null,
    heureDuReseau: reseau,
  }, numero, quand, operateur, titreDuRecu(natureDuTitre(ligne), langue), langue,
  carte ? [carte.nom, carte.numero] : null).pdf;
}
