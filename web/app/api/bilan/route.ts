import { chargerDonnees, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@/lib/textes/api";
import { jourDouala, type Paiement } from "@/lib/types";
import type { Langue } from "@/lib/langue";

export const dynamic = "force-dynamic";

// Le bilan en CSV — le même esprit que l'export du robot (storage.py) :
// chaque SMS compris devient une ligne exploitable dans Excel ou la
// comptabilité, et le message d'origine reste en dernière colonne, c'est lui
// qui fait foi.

// Sept jours par défaut, comme la page Analyse et l'export Telegram ;
// `?jours=30` élargit, plafonné pour rester une lecture de bilan.
const JOURS_DEFAUT = 7;
const JOURS_MAX = 90;

// Un champ CSV : entouré de guillemets dès qu'il contient le séparateur,
// un guillemet ou un saut de ligne — le texte d'un SMS peut tout contenir.
function champ(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ENTETES: Record<Langue, string[]> = {
  en: ["date", "time", "account", "direction", "amount_fcfa",
    "party", "number", "reference", "balance_after", "receipt", "message"],
  fr: ["date", "heure", "compte", "sens", "montant_fcfa",
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
      p.jour, p.heure, p.sim, SENS[langue][p.sens],
      p.montant == null ? "" : String(p.montant),
      p.nom, p.numero, p.reference,
      p.soldeApres == null ? "" : String(p.soldeApres),
      p.recu ?? "", p.smsBrut,
    ]),
  ];
  // Le BOM en tête : sans lui, Excel ouvre l'UTF-8 en dépit du bon sens.
  const csv = "\uFEFF" + rangs.map((r) => r.map(champ).join(";")).join("\r\n") + "\r\n";

  const nom = `bilan-totem-${jourDouala(new Date())}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nom}"`,
      "cache-control": "private, no-store",
    },
  });
}
