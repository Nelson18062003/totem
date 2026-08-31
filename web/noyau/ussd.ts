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

// Une ligne de choix numéroté : « 1. Envoyer », « 2) Retirer », « 3 - Solde ».
//
// Le « : » est admis, des opérateurs l'emploient — mais il sépare aussi les
// heures, et « 10:44 » n'est pas un choix de menu. On écarte donc ce qui a la
// forme d'un horodatage.
const RE_OPTION = /^[ \t]*\d{1,2}[ \t]*[.):\-][ \t]*(?!\d{2}(?:\D|$))\S/gm;

// UN MENU A AU MOINS DEUX CHOIX — et c'est tout l'enjeu du code secret.
//
// Une SEULE ligne numérotée ne fait pas un menu. Deux messages d'opérateur
// parfaitement ordinaires désarmaient pourtant la garde :
//
//   « 10:44 \n Entrez votre code secret »        (l'heure en tête)
//   « 1. Entrez votre code PIN pour confirmer »  (une demande numérotée)
//
// Les deux étaient déclarés « menu », donc PAS une demande de code. Le pavé
// ne s'ouvrait pas, le code se tapait dans la zone de texte ordinaire, il
// s'affichait dans le fil de la conversation, et il partait SANS le drapeau
// « secret » — le robot ne l'effaçait donc jamais, et le code secret Mobile
// Money restait EN CLAIR dans le nuage, pour toujours. Exactement ce que
// l'en-tête de ce fichier promet d'empêcher.
const MENU_MINIMUM = 2;

/** Le message est-il une liste de choix ? (au moins deux lignes numérotées) */
function estUnMenu(texte: string): boolean {
  return (texte.match(RE_OPTION) ?? []).length >= MENU_MINIMUM;
}

// « NIP » (Numéro d'Identification Personnel) est le mot COURANT pour le
// code secret Mobile Money en Afrique francophone — plus que « PIN ». Sans
// lui, « Saisir votre NIP » n'ouvrait pas le pavé, et le code partait en
// clair. Même correctif que côté robot.
const RE_SECRET =
  /\bn\.?i\.?p\.?\b|\bpin\b|\bmdp\b|\bcodes?\b|secret|confidentiel|confidential|mot\s+de\s+passe|password|passcode/i;

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
  return !estUnMenu(t) && RE_SECRET.test(t);
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
  // UN MENU N'EST PAS UNE QUESTION. « Transfert d'argent / 1. Vers un numero
  // MTN / 2. Vers un autre reseau » contient le mot « numero » sans rien
  // demander de tel : on y répondait tout seul, et le numéro du bénéficiaire
  // partait COMME CHOIX DE MENU sur la vraie SIM — une branche non voulue
  // s'ouvrait, et le champ étant consommé, la vraie question qui suivait ne
  // pouvait plus être servie. Un menu se lit, il ne se remplit pas.
  if (estUnMenu(texte)) return undefined;

  const correspondants = restants.filter((c) =>
    RECONNAISSANCE.some((r) => r.type === c.type && r.motif.test(texte)));
  // Un SEUL champ reconnu : c'est lui. Plusieurs — une question qui nomme À
  // LA FOIS le montant et le bénéficiaire (« Montant à envoyer au
  // bénéficiaire ») — on ne DEVINE pas : `find` rendait le premier de la
  // liste (le numéro), et le numéro partait là où le réseau attendait un
  // montant. On rend la main au propriétaire, comme pour une question
  // inconnue. Zéro : on rend la main aussi.
  return correspondants.length === 1 ? correspondants[0] : undefined;
}
