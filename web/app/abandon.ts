// QUAND L'ÉCRAN RENONCE À ATTENDRE.
//
// Une demande déposée attend que le boîtier de la boutique la prenne. L'écran
// patiente une trentaine de secondes, puis renonce — et il ne retirait rien :
// un boîtier revenu des heures plus tard composait encore la demande, numéro
// et montant compris, pour un écran qui avait abandonné.
//
// Renoncer, c'est donc ANNULER. Ce que l'écran a le droit d'en dire se
// décide dans le noyau (`@noyau/abandon`), une fois pour le site et le
// téléphone : « rien n'est parti » seulement si l'annulation a pris, et une
// demande FINIE entre-temps se relit et se montre.

import { issueDeLAnnulation, type IssueDAbandon } from "@noyau/abandon";

export { phraseDAbandon, type IssueDAbandon } from "@noyau/abandon";

export async function abandonner(id: number): Promise<IssueDAbandon> {
  try {
    const r = await fetch(`/api/commande/${id}/annuler`, {
      method: "POST", cache: "no-store",
    });
    return issueDeLAnnulation(r.ok, await r.json().catch(() => null));
  } catch {
    return "incertain";
  }
}
