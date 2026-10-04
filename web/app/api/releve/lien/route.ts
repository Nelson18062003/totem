import { idDuLienDeReleve, signerLien } from "@/lib/lien-signe";
import { langueDemandee } from "@/lib/langue-serveur";
import { erreurApi } from "@noyau/textes/api";
import { RIEN, porteeDe, quiPourLien, voitLaCarte } from "@/lib/portee";
import { estDemonstration } from "@/lib/demonstration";
import { FUSEAU } from "@/lib/fuseau";
import { jourLocal } from "@noyau/types";
import { periodeDuReleve } from "@noyau/releve";

export const dynamic = "force-dynamic";

/**
 * Fabrique un lien signé vers un RELEVÉ DE COMPTE — pour le téléphone, qui
 * télécharge le fichier sans cookie ni jeton (`mobile/src/partage.ts`).
 *
 * DERRIÈRE le verrou, comme les autres fabriques. La signature couvre la
 * CARTE, la PÉRIODE, le FORMAT et pour QUI le lien a été fait : réécrit pour
 * « tout », pour un autre trimestre ou pour un autre compte, il ne vaut plus
 * rien. Dix minutes, comme les autres liens. La liste des cartes, elle, n'est
 * pas dans le lien : elle est relue au moment où il sert.
 *
 * La vitrine de démonstration reçoit un lien « demo » : il n'ouvre que son
 * jeu inventé, jamais la base — et plus rien du tout quand la vitrine est
 * fermée.
 */
export async function GET(req: Request) {
  const langue = await langueDemandee(req);
  const u = new URL(req.url);
  const carte = u.searchParams.get("carte") ?? "tout";
  const format = u.searchParams.get("format") ?? "pdf";
  const bornes = periodeDuReleve(u.searchParams.get("de"), u.searchParams.get("a"),
    jourLocal(new Date(), FUSEAU));
  if (!/^(?:tout|[A-Za-z0-9]{1,32})$/.test(carte) || (format !== "pdf" && format !== "csv")
      || !bornes) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
  }
  const demonstration = await estDemonstration(req);
  const qui = demonstration ? "demo" : await quiPourLien(req);
  if (!qui) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 401 });
  }
  // On ne signe pas un laissez-passer pour une carte qu'on ne voit pas.
  if (!demonstration && carte !== "tout"
      && !voitLaCarte((await porteeDe(req)) ?? RIEN, carte)) {
    return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 404 });
  }

  const adresse = new URLSearchParams({
    carte, de: bornes.de, a: bornes.a, format, q: qui, langue,
  });
  const secret = process.env.SESSION_SECRET || "";
  // Sans secret, il n'y a ni verrou ni signature (le développement local).
  if (secret) {
    const id = idDuLienDeReleve(adresse);
    if (!id) {
      return Response.json({ erreur: erreurApi(langue, "identifiantInvalide") }, { status: 400 });
    }
    const { expiration, signature } = await signerLien(secret, "releve", id);
    adresse.set("e", String(expiration));
    adresse.set("s", signature);
  }
  return Response.json({ url: `${u.origin}/api/releve?${adresse}` });
}
