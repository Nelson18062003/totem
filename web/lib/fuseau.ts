// Le fuseau horaire du TERMINAL — celui qui découpe les journées.
//
// POURQUOI CE N'EST PAS UN DÉTAIL. Un bilan quotidien, un rapport, un nom de
// fichier CSV : tous demandent « quel jour sommes-nous ». La réponse dépend
// d'où est la caisse, pas d'où est le serveur ni d'où est la personne qui
// regarde. Le propriétaire peut être à Paris et sa caisse à Lagos.
//
// Il était écrit en dur — « Africa/Douala » — à trois endroits. Cela revenait
// à décider que TOTEM ne servirait qu'au Cameroun. À Abidjan (UTC+0), les
// encaissements de 23 h seraient tombés dans le bilan du lendemain ; à
// Nairobi (UTC+3), ceux de 2 h du matin dans celui de la veille. Un chiffre
// juste, rangé le mauvais jour, reste un chiffre faux.
//
// Il se règle sur Vercel : Settings → Environment Variables → FUSEAU.
// La valeur est un nom de la base IANA — « Africa/Lagos », « Africa/Abidjan »,
// « Africa/Nairobi », « Africa/Douala »…

import { FUSEAU_DEFAUT } from "@noyau/types";

/** Un nom de fuseau que le système reconnaît vraiment. */
function utilisable(nom: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-CA", { timeZone: nom });
    return true;
  } catch {
    return false;
  }
}

/**
 * Le fuseau en service.
 *
 * Une valeur inconnue — faute de frappe, « GMT+1 » au lieu d'un nom IANA —
 * ne fait PAS tomber la plateforme : on retombe sur le défaut et on le dit
 * dans le journal du serveur. Un bilan décalé d'une heure vaut mieux qu'un
 * site qui ne s'ouvre plus, et le message dit quoi corriger.
 */
export const FUSEAU: string = (() => {
  const demande = (process.env.FUSEAU || "").trim();
  if (!demande) return FUSEAU_DEFAUT;
  if (utilisable(demande)) return demande;
  console.error(
    `FUSEAU « ${demande} » inconnu : on garde ${FUSEAU_DEFAUT}. ` +
    "Attendu : un nom IANA, par exemple « Africa/Lagos ».");
  return FUSEAU_DEFAUT;
})();
