// « Ce téléphone n'est plus à moi. »
//
// Retirer une clé, et fermer ce qu'elle avait ouvert. Les deux dans le même
// geste : retirer la clé sans fermer la session laisserait le téléphone
// ouvert jusqu'à ce soir — et « jusqu'à ce soir » est exactement la durée
// pendant laquelle il est dans la poche de quelqu'un d'autre.
//
// AUCUNE PREUVE N'EST DEMANDÉE AU-DELÀ D'ÊTRE ENTRÉ. Fermer une porte n'a
// jamais nui à personne, et la personne qui fait ce geste est souvent en
// train de courir après un téléphone volé.
//
// Retirer la DERNIÈRE clé est permis. Le courriel reste toujours ouvert, et
// une porte qui refuse de se fermer « pour votre bien » est précisément ce
// qu'on ne veut pas ce jour-là.

import { exigerPresence } from "@/lib/garde";
import { clesDe, retirerCle } from "@/lib/cles";
import { fermerToutesLesSessions } from "@/lib/sessions";
import { langueServeur } from "@/lib/langue-serveur";

export const dynamic = "force-dynamic";

const DIT = {
  fr: {
    inconnue: "Cette clé n'existe pas, ou elle a déjà été retirée.",
    faite: "C'est retiré. Ce téléphone n'ouvre plus rien.",
    faiteEtFerme: "C'est retiré, et toutes vos sessions sont fermées. "
      + "Vous pouvez rentrer par mail.",
  },
  en: {
    inconnue: "That key does not exist, or it has already been removed.",
    faite: "Removed. That phone no longer opens anything.",
    faiteEtFerme: "Removed, and every session of yours is closed. "
      + "You can get back in by email.",
  },
} as const;

export async function POST(req: Request) {
  const langue = await langueServeur();
  const dit = DIT[langue];
  const p = await exigerPresence();

  const corps = await req.json().catch(() => null);
  const id = Number(corps?.cle);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ erreur: dit.inconnue }, { status: 400 });
  }
  // « perdu » | « remplace » | « plus_a_moi ». Le motif se relit trois mois
  // plus tard, quand il faut comprendre une entrée de ce jour-là.
  const motif = typeof corps?.motif === "string" ? corps.motif.slice(0, 40) : "plus_a_moi";
  // Un téléphone volé n'attend pas ce soir.
  const toutFermer = corps?.toutFermer === true;

  const fait = await retirerCle(id, p.personne, p.personne, motif);
  if (!fait) return Response.json({ erreur: dit.inconnue }, { status: 404 });

  if (toutFermer) {
    await fermerToutesLesSessions(p.personne, "tout_fermer");
    return Response.json({ ok: true, dit: dit.faiteEtFerme });
  }
  return Response.json({ ok: true, dit: dit.faite, restantes: (await clesDe(p.personne)).length });
}
