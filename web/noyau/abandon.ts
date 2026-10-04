// QUAND L'ÉCRAN RENONCE À ATTENDRE — ce qu'il a le droit de dire.
//
// Une demande déposée attend que le boîtier de la boutique la prenne. L'écran
// patiente une trentaine de secondes, puis renonce — et il ne retirait rien :
// un boîtier revenu des heures plus tard composait encore la demande, numéro
// et montant compris, pour un écran qui avait abandonné. Renoncer, c'est donc
// ANNULER (`POST /api/commande/{id}/annuler`), et la réponse dit si
// l'annulation a pris.
//
// QUATRE ISSUES, PAS TROIS. Le premier jet rangeait toute annulation qui
// n'avait pas pris sous « elle peut encore aboutir ». Or le boîtier a pu
// FINIR la demande entre le dernier coup d'œil de l'écran et l'annulation :
// réussie, sa réponse existe et l'écran ne la montrait pas ; échouée (par
// exemple refusée parce que trop vieille), elle n'aboutira jamais. Dans les
// deux cas, on poussait la personne à guetter ses SMS au lieu de lui dire ce
// qui s'était passé.
//
// Ici, une fois, pour le site ET le téléphone.

/** L'issue d'un abandon :
 *  — « rien_parti » : annulée avant que le boîtier ne la prenne ;
 *  — « en_cours »   : il l'a prise et ne l'a pas finie — elle peut aboutir ;
 *  — « finie »      : il l'a finie entre-temps, réussie ou échouée — sa
 *                     réponse existe : il faut la relire et la MONTRER ;
 *  — « incertain »  : l'annulation n'a pas pu être confirmée. */
export type IssueDAbandon = "rien_parti" | "en_cours" | "finie" | "incertain";

/** Lit la réponse de la route d'annulation : `ok` (statut HTTP 2xx) et son
 *  corps, tel quel. Dans le doute, « incertain » — jamais « rien n'est
 *  parti » d'une demande dont on ne sait rien. */
export function issueDeLAnnulation(ok: boolean, corps: unknown): IssueDAbandon {
  if (!ok || !corps || typeof corps !== "object") return "incertain";
  const { annulee, etat } = corps as { annulee?: unknown; etat?: unknown };
  if (annulee === true) return "rien_parti";
  if (annulee !== false) return "incertain";
  if (etat === "faite" || etat === "echouee") return "finie";
  if (etat === "en_cours") return "en_cours";
  return "incertain";
}

/** La phrase qui va avec l'issue, prise dans le dictionnaire de l'écran.
 *  « finie » ne se dit que si sa réponse n'a pas pu être relue : sinon,
 *  c'est la réponse elle-même que l'écran montre. */
export function phraseDAbandon(
  issue: IssueDAbandon,
  t: {
    sansReponseRienParti: string; sansReponseEnCours: string;
    sansReponseIncertaine: string; sansReponseFinie: string;
  },
): string {
  return issue === "rien_parti" ? t.sansReponseRienParti
    : issue === "en_cours" ? t.sansReponseEnCours
      : issue === "finie" ? t.sansReponseFinie
        : t.sansReponseIncertaine;
}
