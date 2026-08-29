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
  const e = essais.get(cle);
  essais.set(cle, e && maintenant - e.vu <= FENETRE_MS
    ? { n: e.n + 1, vu: maintenant } : { n: 1, vu: maintenant });
  // Ménage opportuniste : on ne garde pas les vieilles entrées en mémoire.
  if (essais.size > 5000) {
    for (const [k, v] of essais) if (maintenant - v.vu > FENETRE_MS) essais.delete(k);
  }
}

/** Une réussite efface l'ardoise. */
export function oublierEchecs(cle: string): void {
  essais.delete(cle);
}

/** L'identité freinée : l'adresse vue par le serveur, ou un seau commun. */
export function cleDeFrein(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "global";
}

/** Attend le temps dû, s'il y en a un. */
export async function attendreLeFrein(cle: string): Promise<void> {
  const attente = freinPour(cle);
  if (attente) await new Promise((r) => setTimeout(r, attente));
}
