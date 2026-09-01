// Un jeton valide suffit-il ? Non : le compte doit exister ENCORE.
//
// LA PORTE QUI NE SE REFERMAIT JAMAIS
//
// La signature d'un jeton dit qu'il a été émis par nous ; son échéance, qu'il
// n'est pas périmé. Ni l'une ni l'autre ne dit que le compte existe toujours,
// ni qu'il est toujours approuvé — et un jeton vit TRENTE JOURS.
//
// Fermer ou supprimer un compte n'avait donc aucun effet sur qui détenait
// déjà le sien : il continuait de lire les SMS en clair, les soldes, le bilan
// du trimestre et les reçus, pendant un mois, depuis le téléphone qu'on
// venait de lui retirer. La déconnexion elle-même était cosmétique côté
// téléphone : elle efface un cookie, et le téléphone n'en a jamais eu.
//
// POURQUOI PERSONNE NE L'AVAIT VU. Le harnais des comptes fermait bien le
// compte, puis éprouvait une NOUVELLE connexion — refusée, 403, tout allait
// bien. Il ne présentait jamais le jeton DÉJÀ délivré, c'est-à-dire la seule
// chose que l'intrus possède. Un contrôle qui ne regarde pas la porte qu'il
// prétend garder rassure sans rien mesurer.
//
// POURQUOI CETTE LECTURE VIT ICI, et non dans `serveur.ts` : elle s'exécute
// dans le middleware, donc sur le runtime « edge », à chaque requête. Elle
// n'emploie que `fetch` et ne tire aucune dépendance derrière elle.

/** Une ligne de compte, réduite à ce qui décide de l'entrée. */
type LigneCompte = { approuve?: boolean; role?: string };

export type EtatDuCompte = {
  /** Le compte existe encore et reste approuvé. */
  ouvert: boolean;
  /** Est-il le propriétaire ? `null` quand la base n'a pas répondu :
   *  « je ne sais pas » n'est ni oui ni non, et l'appelant doit choisir. */
  proprietaire: boolean | null;
};

/**
 * Ce que la base dit ENCORE de ce compte : ouvert, et propriétaire ou non.
 *
 * Une seule lecture pour les deux questions — elle s'exécute à CHAQUE
 * requête, dans le middleware, et deux allers-retours coûteraient le double.
 *
 * EN CAS DE PANNE DE LA BASE, `ouvert` répond `true`. C'est délibéré, et
 * c'est le seul endroit où l'on penche vers l'ouverture : une coupure entre
 * Vercel et Supabase mettrait sinon le propriétaire DEHORS de sa propre
 * plateforme, en pleine journée, pour une panne qui ne le concerne pas. On
 * refuse sur une réponse CLAIRE (le compte n'est plus là, ou n'est plus
 * approuvé), jamais sur un silence. `proprietaire`, lui, répond alors
 * `null` : la console, elle, préfère refuser ce qu'elle ne sait pas.
 */
export async function etatDuCompte(id: number): Promise<EtatDuCompte> {
  const base = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_CLE;
  if (!base || !cle || !Number.isInteger(id)) {
    return { ouvert: true, proprietaire: null };
  }

  try {
    const r = await fetch(
      `${base}/rest/v1/utilisateurs?select=approuve,role&id=eq.${id}&limit=1`,
      {
        headers: { apikey: cle, Authorization: `Bearer ${cle}` },
        cache: "no-store",
      },
    );
    // Une base qui bafouille (5xx, guichet coupé) n'est pas un verdict.
    if (!r.ok) return { ouvert: true, proprietaire: null };
    const lignes = (await r.json()) as LigneCompte[];
    // Plus de ligne = compte supprimé. Ligne non approuvée = compte fermé.
    // Les deux se referment ici, tout de suite.
    const ouvert = Array.isArray(lignes) && lignes[0]?.approuve === true;
    return {
      ouvert,
      proprietaire: ouvert ? lignes[0]?.role === "proprietaire" : false,
    };
  } catch {
    // réseau coupé : on ne met personne dehors pour ça
    return { ouvert: true, proprietaire: null };
  }
}

/** Ce compte peut-il encore entrer ? Voir `etatDuCompte`. */
export async function compteEncoreOuvert(id: number): Promise<boolean> {
  return (await etatDuCompte(id)).ouvert;
}
