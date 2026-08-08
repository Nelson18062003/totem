// Parler à la base — les quatre gestes, une seule fois.
//
// Ce fichier ne connaît aucune table : il sait poser une question à PostgREST
// et rapporter la réponse. Ce qu'on lui demande est décidé ailleurs.
//
// LA CLÉ NE QUITTE JAMAIS LE SERVEUR. Elle vient de deux variables
// d'environnement (sur Vercel : Settings → Environment Variables ; en local :
// web/.env.local) :
//
//   SUPABASE_URL   https://xxxxxxxxxxxx.supabase.co   (docs/CLOUD.md)
//   SUPABASE_CLE   la clé de service — server-only, jamais de NEXT_PUBLIC_
//
// La clé de service contourne les règles par ligne de la base : c'est donc
// l'application qui doit filtrer, et « lib/garde.ts » qui doit dire au nom de
// qui. Tant que cette clé est là, les politiques de « sql/schema.sql » sont
// une protection en profondeur, pas la protection principale. Le remplacement
// par la clé publique et une vraie session Supabase est un chantier à part,
// écrit dans docs/PLAN-MISE-EN-OEUVRE.md.
//
// Rien n'est inventé : sans les variables, tout renvoie vide, et les écrans
// le disent au lieu d'afficher des chiffres qui n'existent pas.

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_CLE;

export const relie = Boolean(url && cle);

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
      console.error(`Supabase : ${chemin} → ${r.status}`);
      return [];
    }
    return (await r.json()) as T[];
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return [];
  }
}

/** Une ligne, ou rien. Le cas le plus fréquent, écrit une fois. */
export async function lireUne<T>(chemin: string): Promise<T | null> {
  const lignes = await lire<T>(chemin);
  return lignes[0] ?? null;
}

/** Ajouter. Renvoie la ligne créée quand la base la rend, sinon `null`. */
export async function inserer<T>(table: string, valeurs: unknown): Promise<T | null> {
  if (!relie) return null;
  try {
    const r = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: entetes({ "content-type": "application/json", prefer: "return=representation" }),
      body: JSON.stringify(valeurs),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : insert ${table} → ${r.status}`);
      return null;
    }
    const lignes = (await r.json()) as T[];
    return lignes[0] ?? null;
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return null;
  }
}

/**
 * Modifier. Le chemin porte le filtre — « sessions?id=eq.abc ».
 *
 * Rien ne s'efface : on date. Retirer un accès pose « retire_le », fermer une
 * session pose « revoquee_le ». Un employé qui part fâché est exactement le
 * moment où l'historique doit rester entier. La seule exception vit dans
 * « effacer », plus bas, et elle porte sa propre liste blanche.
 */
export async function modifier(chemin: string, valeurs: unknown): Promise<boolean> {
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      method: "PATCH",
      headers: entetes({ "content-type": "application/json" }),
      body: JSON.stringify(valeurs),
      cache: "no-store",
    });
    if (!r.ok) console.error(`Supabase : patch ${chemin} → ${r.status}`);
    return r.ok;
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return false;
  }
}

/**
 * Effacer — et la liste des tables où c'est permis tient en un mot.
 *
 * `defis` : la phrase à signer, valable cinq minutes. Une phrase expirée ne
 * raconte rien sur personne, ne prouve rien et ne se relit jamais ; la garder
 * n'aurait aucun sens et elle s'accumulerait sans fin.
 *
 * Le garde-fou est ici, dans le code, et pas seulement dans une consigne :
 * cette fonction REFUSE toute autre table. Un jour quelqu'un — moi
 * probablement — aura une bonne raison d'effacer ailleurs, et ce jour-là il
 * faudra la modifier exprès plutôt que l'utiliser distraitement.
 */
const EFFACABLES = ["defis"];

export async function effacer(chemin: string): Promise<boolean> {
  const table = chemin.split("?")[0];
  if (!EFFACABLES.includes(table)) {
    console.error(`refus d'effacer « ${table} » : rien ne s'efface dans TOTEM, on date`);
    return false;
  }
  if (!relie) return false;
  try {
    const r = await fetch(`${url}/rest/v1/${chemin}`, {
      method: "DELETE", headers: entetes(), cache: "no-store",
    });
    if (!r.ok) console.error(`Supabase : delete ${chemin} → ${r.status}`);
    return r.ok;
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return false;
  }
}

/** Un objet du compartiment de stockage (les reçus PDF). */
export async function lireObjet(compartiment: string, chemin: string): Promise<ArrayBuffer | null> {
  if (!relie) return null;
  try {
    const r = await fetch(`${url}/storage/v1/object/${compartiment}/${chemin}`, {
      headers: entetes(), cache: "no-store",
    });
    if (!r.ok) {
      console.error(`Supabase : objet ${chemin} → ${r.status}`);
      return null;
    }
    return await r.arrayBuffer();
  } catch (e) {
    console.error(`Supabase injoignable : ${String(e)}`);
    return null;
  }
}
