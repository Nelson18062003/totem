// Le raccord avec le chemin « code par mail ».
//
// POURQUOI CE FICHIER EXISTE
// L'envoi du message et la vérification des six chiffres sont écrits par une
// autre équipe (`lib/envois.ts`, `app/api/code/*`). Deux écrans les appellent :
// l'entrée quotidienne (`/connexion`) et la saisie des six chiffres
// (`/entrer`). Si chacun tenait son adresse et sa forme d'appel, une signature
// qui bouge demanderait deux corrections — donc une oubliée. Tout passe ici :
// le jour où leur route s'appelle autrement, il y a une ligne à changer.
//
// ON NE LIT JAMAIS LA RÉPONSE DE LA DEMANDE, ET C'EST LA RÈGLE PRINCIPALE
// Une adresse inconnue doit produire exactement ce que produit une adresse
// connue. Si l'écran regardait le code de réponse — « 404 », « pas de
// compte », « trop de demandes » — il suffirait de taper des adresses pour
// apprendre lesquelles sont clientes de TOTEM. On envoie, et on affiche la
// même phrase dans tous les cas. Seule une panne de réseau se distingue,
// parce qu'alors le serveur n'a rien dit du tout : `fetch` lève, et la
// personne doit savoir que rien n'est parti.

// CE QUI MANQUE ENCORE EN FACE, ET IL FAUT LE DIRE ICI PLUTÔT QUE LE
// DÉCOUVRIR EN PRODUCTION
// `app/api/code/demander` et `app/api/code/verifier` existent, mais elles
// n'acceptent aujourd'hui QU'UN JETON D'INVITATION : elles relisent l'adresse
// depuis l'invitation, ce qui est la bonne règle pour la première fois — le
// lien qui traîne dans un groupe WhatsApp ne doit pas pouvoir se faire
// adresser le code ailleurs. L'entrée de tous les jours, elle, n'a pas
// d'invitation : elle n'a qu'une adresse et le motif « entree ».
// C'est le seul raccord qui reste à faire, et il tient en une branche dans
// leurs deux routes : quand `jeton` est absent et que `motif` vaut « entree »,
// prendre l'adresse du corps, retrouver la personne, et appeler
// `envoyerCode` / `verifierCode` sur cette adresse. Tant que cette branche
// n'existe pas, la demande repart en 400 — et, conformément à la règle
// ci-dessus, l'écran affiche quand même la même phrase : il n'a pas le droit
// de lire cette réponse.

/** La route qui fabrique les six chiffres et les envoie sur l'adresse. */
export const ROUTE_DEMANDER = "/api/code/demander";

/** La route qui les vérifie et ouvre la session. */
export const ROUTE_VERIFIER = "/api/code/verifier";

/** Le motif porté par le code : c'est une entrée, pas une invitation. */
export const MOTIF = "entree";

/**
 * L'adresse, passée d'un écran à l'autre sans la mettre dans l'URL.
 *
 * Une adresse mail dans une adresse de page finit dans l'historique du
 * téléphone, dans le référent envoyé aux autres serveurs, et dans les
 * journaux de l'hébergeur. Le stockage de session, lui, meurt avec l'onglet
 * et survit à un rechargement — exactement ce qu'il faut à quelqu'un qui va
 * ouvrir sa boîte mail et revenir.
 */
export const CLE_ADRESSE = "totem.entree.adresse";

/**
 * Demander six chiffres. Ne rend rien : il n'y a rien à savoir.
 *
 * Lève seulement si la requête n'a pas pu partir (pas de réseau). Toute
 * réponse du serveur, quelle qu'elle soit, est traitée comme un envoi.
 */
export async function demanderUnCode(courriel: string): Promise<void> {
  await fetch(ROUTE_DEMANDER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel, motif: MOTIF }),
  });
}

export type Verdict = { ok: boolean; erreur?: string };

/**
 * Présenter les six chiffres. Ici, en revanche, la réponse compte : c'est
 * cette route qui ouvre la session, et son refus doit s'afficher tel quel —
 * elle répond déjà dans la langue de l'écran.
 */
export async function verifierUnCode(courriel: string, code: string): Promise<Verdict> {
  const r = await fetch(ROUTE_VERIFIER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courriel, code, motif: MOTIF }),
  });
  if (r.ok) return { ok: true };
  const { erreur } = await r.json().catch(() => ({ erreur: "" }));
  return { ok: false, erreur: typeof erreur === "string" ? erreur : "" };
}
