// Le frein aux essais de mot de passe.
//
// Il vit ici, et non dans une route, parce qu'il y a MAINTENANT deux portes
// d'entrée : l'écran de connexion du navigateur (`/api/connexion`) et celle
// de l'application du téléphone (`/api/session`). Deux compteurs séparés ne
// freineraient personne : il suffirait d'alterner les deux portes pour
// doubler la cadence des essais. Un seul seau, partagé, ferme cette porte.
//
// Ce n'est pas un verrou distribué — chaque instance du serveur a le sien —
// mais il suffit à casser la cadence d'une attaque par force brute. Le
// propriétaire, qui se trompe une fois ou deux, ne le sent pas.

const essais = new Map<string, { n: number; vu: number }>();

const FENETRE_MS = 15 * 60 * 1000;
const LIBRES = 5;               // essais sans délai
const PALIER_MS = 500;          // délai ajouté par échec au-delà
const PLAFOND_MS = 8000;

/** Le délai à observer avant de juger cette tentative-ci. */
export function freinPour(cle: string): number {
  const maintenant = Date.now();
  const e = essais.get(cle);
  if (!e || maintenant - e.vu > FENETRE_MS) return 0;
  return Math.min(Math.max(0, e.n - LIBRES) * PALIER_MS, PLAFOND_MS);
}

export function noterEchec(cle: string): void {
  const maintenant = Date.now();
  for (const k of [cle, SEAU_COMMUN]) {
    const e = essais.get(k);
    essais.set(k, e && maintenant - e.vu <= FENETRE_MS
      ? { n: e.n + 1, vu: maintenant } : { n: 1, vu: maintenant });
  }
  // Ménage opportuniste : on ne garde pas les vieilles entrées en mémoire.
  if (essais.size > 5000) {
    for (const [k, v] of essais) if (maintenant - v.vu > FENETRE_MS) essais.delete(k);
  }
}

/** Une réussite efface l'ardoise. */
export function oublierEchecs(cle: string): void {
  // On efface l'ardoise de CETTE adresse seulement : une connexion réussie
  // parmi mille essais ne doit pas remettre le seau commun à zéro — c'est
  // même la signature d'une attaque qui a fini par trouver.
  essais.delete(cle);
}

/**
 * L'identité freinée : l'adresse vue par le SERVEUR, jamais celle annoncée
 * par le client.
 *
 * LE FREIN ÉTAIT DÉSARMÉ PAR UN EN-TÊTE QUE L'ATTAQUANT ÉCRIT LUI-MÊME. On
 * prenait le PREMIER élément de « x-forwarded-for » — c'est-à-dire le bout
 * que le client fournit. Il suffisait d'en changer à chaque essai pour
 * repartir d'un seau neuf : mesuré, douze essais depuis la même adresse
 * coûtaient onze secondes, douze essais avec un en-tête différent à chaque
 * fois en coûtaient un demi. Le frein n'existait plus.
 *
 * Trois sources, de la plus sûre à la moins sûre :
 *
 *   1. « x-vercel-forwarded-for » — posé par la plateforme, qui écrase ce que
 *      le client aurait mis ;
 *   2. « x-real-ip » — posé par un proxy de confiance, pour la même raison ;
 *   3. le DERNIER élément de « x-forwarded-for ». Chaque relais AJOUTE
 *      l'adresse qu'il a vue : le dernier est donc celui qu'a écrit le relais
 *      le plus proche de nous, le seul dont on réponde. Le premier, lui,
 *      reste ce que le client a bien voulu raconter.
 */
export function cleDeFrein(req: Request): string {
  const dernier = (v: string | null) => {
    const morceaux = (v ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    return morceaux.length ? morceaux[morceaux.length - 1] : "";
  };
  return dernier(req.headers.get("x-vercel-forwarded-for"))
    || (req.headers.get("x-real-ip") ?? "").trim()
    || dernier(req.headers.get("x-forwarded-for"))
    || "global";
}

// LE SEAU COMMUN, en plus du seau par adresse.
//
// Une attaque sérieuse ne vient pas d'une seule adresse : elle en loue mille.
// Un frein par adresse ne la voit alors jamais. Ce second seau compte TOUS
// les échecs, quelle que soit leur provenance, et le délai retenu est le plus
// grand des deux.
//
// Il ne verrouille rien : au pire, huit secondes d'attente. Le propriétaire
// qui se trompe pendant qu'on l'attaque patiente donc un peu — c'est le prix,
// et il est petit devant une porte qui ne freine personne. On lui laisse
// aussi plus de marge qu'à une adresse seule.
const SEAU_COMMUN = "\u0000tous";
const LIBRES_COMMUN = 40;

/** Le délai du seau commun — plus tolérant, mais il ne se contourne pas. */
function freinCommun(): number {
  const e = essais.get(SEAU_COMMUN);
  if (!e || Date.now() - e.vu > FENETRE_MS) return 0;
  return Math.min(Math.max(0, e.n - LIBRES_COMMUN) * PALIER_MS, PLAFOND_MS);
}

/** Attend le temps dû, s'il y en a un. */
export async function attendreLeFrein(cle: string): Promise<void> {
  const attente = Math.max(freinPour(cle), freinCommun());
  if (attente) await new Promise((r) => setTimeout(r, attente));
}
