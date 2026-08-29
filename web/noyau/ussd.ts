// Lire ce que le réseau demande — la même lecture des deux côtés.
//
// Pendant une session USSD, l'opérateur pose ses questions en texte libre.
// Deux décisions en découlent, et toutes deux touchent à l'argent :
//
//   1. « Est-ce le CODE SECRET qu'on me demande ? » → si oui, le pavé
//      s'ouvre, et ce qui se compose ne s'affiche jamais ni ne se journalise.
//   2. « Puis-je répondre tout seul avec ce que le propriétaire a saisi ? »
//      → si oui, le numéro ou le montant part sans qu'on redemande.
//
// Ces deux réponses vivent ICI, dans le noyau, et non dans chaque écran. Si
// la plateforme et le téléphone jugeaient différemment, le même message
// d'opérateur ouvrirait le pavé d'un côté et une zone de texte ordinaire de
// l'autre — le code secret partirait alors en clair, visible à l'écran et
// dans l'historique. Une seule lecture, donc.
//
// Ce qu'on lit ici est du TEXTE D'OPÉRATEUR, jamais celui de nos écrans : les
// motifs portent le français ET l'anglais, parce que les opérateurs
// camerounais écrivent dans les deux langues, et parfois mélangent.

/** Ce qu'un champ du formulaire sait remplir. */
export type TypeChamp = "numero" | "montant";

/** La question du réseau ↔ le champ qui peut y répondre tout seul. */
export const RECONNAISSANCE: { motif: RegExp; type: TypeChamp }[] = [
  { motif: /num[ée]ro|beneficiaire|b[ée]n[ée]ficiaire|abonn[ée]|agent|destinataire|t[ée]l[ée]phone|number|recipient|beneficiary|receiver|subscriber|phone/i, type: "numero" },
  { motif: /montant|somme|combien|amount|how\s+much/i, type: "montant" },
];

// Une liste de choix numérotés (« 1. Envoyer  2. Retirer »). Sa présence
// prime : un menu qui contient le mot « code » reste un menu, pas une
// demande de code secret.
const RE_OPTION = /^\s*\d{1,2}\s*[.):\-]\s*\S/m;

const RE_SECRET =
  /\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|confidential|mot\s+de\s+passe|password|passcode/i;

/**
 * Le réseau réclame-t-il le code secret ?
 *
 * Se tromper coûte cher dans les deux sens : dire oui à tort ouvre le pavé
 * sur une question ordinaire (gênant) ; dire non à tort fait taper le code
 * dans une zone de texte ordinaire, où il s'affiche et reste (grave). D'où
 * la garde sur les menus : un message qui liste des options numérotées n'est
 * jamais une demande de code, même s'il contient le mot.
 */
export function demandeUnCode(texte: string): boolean {
  const t = texte || "";
  return !RE_OPTION.test(t) && RE_SECRET.test(t);
}

/**
 * Parmi les champs pas encore consommés, celui qui répond à cette question —
 * ou `undefined` si aucun ne convient, auquel cas on rend la main au
 * propriétaire. On ne devine JAMAIS une réponse qu'on n'a pas.
 */
export function champPourQuestion<T extends { type: TypeChamp }>(
  texte: string,
  restants: readonly T[],
): T | undefined {
  return restants.find((c) =>
    RECONNAISSANCE.some((r) => r.type === c.type && r.motif.test(texte)));
}
