// Retirer un appareil de la console — et le dire à l'intéressé.
//
// ON DATE, ON N'EFFACE PAS. `retirerCle` pose « retiree_le », « retiree_par »
// et le motif. La ligne reste : c'est elle qui explique, trois mois plus tard,
// pourquoi une entrée a eu lieu ce jour-là et plus le lendemain.
//
// LE FILTRE PORTE LA PERSONNE, ET C'EST LA SÉCURITÉ DE CETTE ROUTE. On ne
// retire jamais l'appareil de quelqu'un d'autre par ce chemin, même en
// devinant un numéro de ligne : `retirerCle` exige que la clé appartienne à la
// personne qui demande.
//
// RETIRER LE DERNIER EST PERMIS, ET C'EST VOULU. Une porte qui refuse de se
// fermer « pour votre bien » est exactement ce qu'on ne veut pas le jour où le
// téléphone vient d'être arraché. L'écran RÉCLAME le second appareil ; il ne
// séquestre pas le premier.
//
// LA LETTRE PART, PARCE QUE RETIRER UN APPAREIL EST EXACTEMENT CE QUE FERAIT
// quelqu'un qui vient de prendre le compte.

import { garder, estRefus } from "@/lib/garde";
import { retirerCle } from "@/lib/cles";
import { envoyerAvis } from "@/lib/envois";
import { lireUne } from "@/lib/base";
import { langueServeur } from "@/lib/langue-serveur";
import { textesAdminPorte, deuxHorloges } from "@/lib/textes/admin-porte";
import { NOM_CONSOLE } from "@/lib/plateforme";
import type { Langue } from "@/lib/langue";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await garder("administrer");
  if (estRefus(g)) return g.refus;

  const langue = await langueServeur();
  const t = textesAdminPorte[langue];

  const corps = (await req.json().catch(() => null)) as
    { id?: unknown; motif?: unknown } | null;
  const id = Number(corps?.id);
  const motif = typeof corps?.motif === "string" ? corps.motif.trim().slice(0, 500) : "";
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 400 });
  }

  const cle = await lireUne<{ appareil: string | null }>(
    `cles?id=eq.${id}&personne=eq.${g.personne}&retiree_le=is.null&select=appareil&limit=1`);

  if (!await retirerCle(id, g.personne, g.personne, motif)) {
    return Response.json({ erreur: t.refus.indisponible }, { status: 409 });
  }

  const compte = await lireUne<{ courriel: string | null; langue: Langue }>(
    `personnes?id=eq.${g.personne}&select=courriel,langue&limit=1`);
  if (compte?.courriel) {
    await envoyerAvis(compte.courriel, compte.langue, {
      genre: "cle_retiree",
      // La console n'a pas de commerce : c'est elle qu'on nomme, et c'est vrai.
      commerce: NOM_CONSOLE,
      quand: deuxHorloges(new Date(), compte.langue),
      appareil: cle?.appareil ?? null,
    }, g.personne);
  }

  return Response.json({ ok: true });
}
