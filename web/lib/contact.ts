// L'adresse à laquelle on écrit au propriétaire.
//
// Elle vit dans une variable d'environnement, pas dans le dépôt : le
// propriétaire la change sans nous, et une adresse personnelle n'a rien à
// faire dans un dossier public.
//
// Elle rend `null` quand la variable est absente ou ne ressemble pas à une
// adresse. C'est VOULU. Une adresse par défaut inventée serait pire que pas
// d'adresse du tout : les pages afficheraient une boîte qui n'existe pas, et
// la promesse « écrivez-nous » ne mènerait nulle part. Quand il n'y a rien,
// les pages renvoient vers l'adresse du développeur affichée sur la fiche du
// magasin — celle-là, elle, existe toujours.

const FORME = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function courrielDeContact(): string | null {
  const brut = (process.env.CONTACT_COURRIEL || "").trim();
  return FORME.test(brut) ? brut : null;
}
