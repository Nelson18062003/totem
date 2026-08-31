// LA POLITIQUE DE CONTENU — ce que le navigateur a le droit d'exécuter.
//
// Elle vit ici, et plus dans `next.config.ts`, parce qu'elle porte désormais
// un NONCE : un jeton tiré au hasard à chaque requête, que seuls les scripts
// écrits par la plateforme portent. Un fichier de configuration est lu une
// fois au démarrage ; un nonce doit changer à chaque page. Seul le middleware
// peut le poser.
//
// CE QUE « unsafe-inline » COÛTAIT. Tant que script-src l'autorisait,
// n'importe quel script en ligne s'exécutait — c'est-à-dire que la protection
// principale contre le XSS était éteinte. Elle n'était pas là pour rien : TOTEM
// affiche du texte écrit par des INCONNUS. Le nom d'un expéditeur de SMS, le
// libellé d'un menu USSD, le nom d'un client dans un encaissement : tout cela
// arrive du réseau de l'opérateur, et quiconque connaît le numéro de la SIM
// peut écrire ce qu'il veut dans un SMS. React échappe ce qu'il affiche, et
// l'audit n'a trouvé aucun `dangerouslySetInnerHTML` dans le dépôt — mais une
// politique de contenu sert précisément au jour où l'un des deux cède.
//
// POURQUOI « strict-dynamic ». Next charge ses morceaux de code par des
// balises que son propre script d'amorçage insère. Sans « strict-dynamic »,
// il faudrait autoriser leur origine et l'on retomberait sur une liste
// d'adresses ; avec lui, la confiance se transmet du script noncé à ceux
// qu'il charge, et à eux seuls. Les navigateurs modernes ignorent alors
// « 'self' » dans script-src — on le garde pour les anciens, qui ignorent
// « strict-dynamic » et n'ont que lui.
//
// « unsafe-inline » RESTE dans style-src : Next pose des styles en ligne pour
// le rendu, et un style ne s'exécute pas. Le risque n'est pas comparable.

/** Un nonce neuf : 16 octets de hasard, en base64. */
export function nonceNeuf(): string {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

/**
 * La politique, pour ce nonce-là.
 *
 * En DÉVELOPPEMENT, Next évalue du code pour le rechargement à chaud :
 * « unsafe-eval » y est nécessaire, et seulement là. Le poser en production
 * rouvrirait `eval()` à toute la plateforme.
 */
export function politiqueCsp(nonce: string, developpement = false): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",        // le cadre : la parade au clic détourné
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      + (developpement ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
  ].join("; ");
}
