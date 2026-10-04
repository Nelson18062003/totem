import { chargerDonnees, noterIncident, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { jourLocal, type Paiement } from "@noyau/types";
import { debutDeFenetre } from "@noyau/analyse";
import { FUSEAU } from "@/lib/fuseau";
import type { Langue } from "@noyau/langue";
import { porteeDe, porteeDuLienDeBilan } from "@/lib/portee";
import { fichierCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Le bilan en CSV — le même esprit que l'export du robot (storage.py) :
// chaque SMS compris devient une ligne exploitable dans Excel ou la
// comptabilité, et le message d'origine reste en dernière colonne, c'est lui
// qui fait foi.

// Sept jours par défaut, comme la page Analyse et l'export Telegram ;
// `?jours=30` élargit, plafonné pour rester une lecture de bilan.
const JOURS_DEFAUT = 7;
const JOURS_MAX = 90;

// Ce qu'un bilan peut porter au maximum. Ce n'est pas la borne d'AVANT — le
// bilan chargeait les mille derniers SMS toutes périodes confondues, puis
// jetait ce qui dépassait la période : une caisse à vingt encaissements par
// jour rendait cinq semaines quand on lui en demandait treize, et le fichier
// n'en disait rien. Le découpage se fait maintenant dans la base ; ce plafond
// ne borne plus que la taille du fichier, et quand il mord, le bilan le DIT.
const LIGNES_MAX = 20_000;

// Un SMS relevé après une coupure porte une heure de relève bien postérieure
// à son heure d'émission. Le filtre de la base porte sur l'heure de RELÈVE :
// on prend large en amont, puis on coupe exactement sur l'heure qui fait foi.
const MARGE_RELEVE_MS = 7 * 86_400_000;

// Un champ CSV : voir lib/csv.ts (les guillemets, et la formule désamorcée).

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

  // LA MÊME FENÊTRE QUE L'ÉCRAN. « La semaine », sur la page Analyse, ce sont
  // sept JOURS de calendrier dans le fuseau du terminal ; ici, c'étaient
  // 168 heures. À 18 h, le fichier portait six heures d'un jour que le graphe
  // juste au-dessus ne montrait pas — le total du bilan ne tombait pas juste
  // avec le chiffre affiché, dans le même écran, à la même seconde.
  const maintenant = Date.now();
  const depuis = debutDeFenetre(maintenant, FUSEAU, jours);

  // Avec une session, la portée de la personne. Sans session, la main tient
  // un lien signé : il dit pour QUI il a été fait, et c'est cette personne-là
  // — relue maintenant — dont on rend les cartes.
  const adresse = new URL(req.url).searchParams;
  const portee = (await porteeDe(req)) ?? await porteeDuLienDeBilan(
    adresse.get("jours"), adresse.get("q"), adresse.get("e"), adresse.get("s"));
  const { paiements, smsTronques } = await chargerDonnees(langue, portee, {
    sms: LIGNES_MAX,
    depuis: new Date(depuis - MARGE_RELEVE_MS).toISOString(),
    compter: true,
  });
  const lignes = paiements
    .filter((p) => {
      const t = new Date(p.recuLe).getTime();
      return Number.isFinite(t) && t >= depuis && t <= maintenant;
    })
    // Du plus ancien au plus récent : un bilan se lit dans l'ordre des jours.
    .reverse();

  const rangs = [
    ENTETES[langue],
    ...lignes.map((p) => [
      p.jour, p.heure, p.sim, p.carte, SENS[langue][p.sens],
      p.montant == null ? "" : String(p.montant),
      // LA COLONNE « tiers/party », c'est le TIERS — la personne qui a payé
      // (« NKENGAFAC M. ») — pas « nom », l'expéditeur du SMS
      // (« MTNMobileMoney », le même pour tout un opérateur). Le robot
      // exporte déjà « tiers » (storage.py) ; l'app l'affiche partout ainsi
      // (`p.tiers || p.nom`) ; le bilan mettait l'opérateur sur chaque ligne,
      // et le vrai tiers ne sortait jamais.
      p.tiers || p.nom, p.numero, p.reference,
      p.soldeApres == null ? "" : String(p.soldeApres),
      p.recu ?? "", p.smsBrut,
    ]),
  ];

  // UN BILAN AMPUTÉ DOIT LE DIRE. Sans cette ligne, un fichier coupé se lit
  // exactement comme un fichier complet : on additionne une colonne, on
  // rapproche d'un solde, et l'écart se cherche pendant des heures ailleurs.
  // La ligne est en tête, avant les colonnes : c'est la première chose que
  // le tableur montre, et personne ne fait défiler un export jusqu'en bas.
  if (smsTronques) {
    // Au journal, pas seulement dans la sortie de l'hébergeur : c'est un
    // bilan comptable amputé, et le propriétaire doit pouvoir le retrouver
    // le jour où son comptable lui dit que les chiffres ne tombent pas.
    noterIncident(
      `Un bilan de ${jours} jours a été coupé : la caisse porte plus de `
      + `${LIGNES_MAX} messages sur cette période. Le fichier le dit en `
      + "première ligne.");
    rangs.unshift([langue === "en"
      ? `INCOMPLETE REPORT — the till holds more than ${LIGNES_MAX} messages `
        + "over this period; only the most recent ones are listed below."
      : `BILAN INCOMPLET — la caisse porte plus de ${LIGNES_MAX} messages sur `
        + "cette période ; seuls les plus récents figurent ci-dessous."]);
  }

  // Le BOM en tête, comme le relevé (lib/csv.ts).
  const csv = fichierCsv(rangs);

  const nom = `bilan-totem-${jourLocal(new Date(), FUSEAU)}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nom}"`,
      "cache-control": "private, no-store",
    },
  });
}
