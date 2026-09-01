// Parler à la base pour la console — deux gestes, une seule fois.
//
// Ce fichier ne connaît aucune table : il sait poser une question à PostgREST
// et rapporter la réponse. Ce qu'on lui demande est décidé dans
// « lib/console.ts » et « lib/journal.ts », et nulle part ailleurs.
//
// LA CLÉ NE QUITTE JAMAIS LE SERVEUR. Les mêmes variables que
// « lib/serveur.ts » : SUPABASE_URL et SUPABASE_CLE (la clé de service,
// jamais de NEXT_PUBLIC_). Cette clé contourne les règles par ligne de la
// base : c'est donc « lib/garde.ts » qui décide au nom de qui on lit.
//
// Rien n'est inventé : sans les variables, tout renvoie vide, et les écrans
// le disent au lieu d'afficher des chiffres qui n'existent pas.

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_CLE;

export const relie = Boolean(url && cle);

/**
 * Le chemin d'une requête, SANS ce qu'elle cherchait — pour le journal du
 * serveur. Un chemin porte parfois une donnée personnelle ; journalisé tel
 * quel, il la répand dans des journaux qui se gardent longtemps et se lisent
 * à plusieurs. La même règle que « lib/serveur.ts », pour la même raison.
 */
function sansValeurs(chemin: string): string {
  return chemin.replace(
    /(=(?:eq|neq|ilike|like|lt|lte|gt|gte|in|is)\.)[^&]*/gi, "$1…");
}

function entetes(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: cle!, authorization: `Bearer ${cle}`, ...extra };
}

/** Une question. Renvoie une liste, vide si quoi que ce soit a échoué. */
export async function lire<T>(chemin: string): Promise<T[]> {
  if (!relie) return [];
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      headers: entetes(), cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : ${sansValeurs(chemin)} → ${r.status}`);
      return [];
    }
    return (await r.json()) as T[];
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return [];
  }
}

/**
 * Modifier. Le chemin porte le filtre — « alertes?id=eq.4&vue_le=is.null ».
 *
 * Rien ne s'efface dans TOTEM : on date. Accuser réception pose « vue_le »,
 * clore pose « close_le ». La seule table que la console modifie est
 * « alertes », et c'est « lib/journal.ts » qui tient cette promesse.
 *
 * `prefer: return=representation` fait dire à PostgREST COMBIEN de lignes le
 * filtre a touchées : zéro ligne, c'est un geste déjà fait (ou une alerte qui
 * n'existe pas), et l'appelant doit le savoir — sans cela, un second appui
 * répondrait « fait » en n'ayant rien fait.
 */
export async function modifier(chemin: string, valeurs: unknown): Promise<boolean> {
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      method: "PATCH",
      headers: entetes({
        "content-type": "application/json",
        prefer: "return=representation",
      }),
      body: JSON.stringify(valeurs),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : patch ${sansValeurs(chemin)} → ${r.status}`);
      return false;
    }
    const lignes = (await r.json().catch(() => [])) as unknown[];
    return lignes.length > 0;
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return false;
  }
}
