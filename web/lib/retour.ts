// Le chemin de retour : fermer d'abord, rentrer ensuite.
//
// CE QUE CE FICHIER TRANCHE, ET C'EST LA DÉCISION DE L'ÉCRAN C8
//
// Fermer n'exige AUCUNE preuve. Quelqu'un dont le téléphone vient d'être
// arraché n'a ni son appareil, ni sa session, ni le temps de retrouver quoi
// que ce soit — lui demander un mot de passe, c'est lui refuser le seul geste
// utile. Et fermer ne coûte rien : au pire, une reconnexion.
//
// Mais fermer ne peut pas non plus être un bouton anonyme. Un bouton qui
// prend un nom et coupe tout ferait de la déconnexion d'autrui un jeu : il
// suffirait de connaître le nom d'une commerçante pour la sortir de sa caisse
// dix fois par jour, en pleine journée de marché.
//
// LA SORTIE DE CETTE TENSION : LE COURRIEL.
// On demande l'adresse, et le lien qui ferme part SUR cette adresse. Celui qui
// ferme est donc celui qui tient la boîte — sans qu'on lui ait rien demandé
// de plus, sans mot de passe, sans code à retrouver. Fermer par mail est
// acceptable là où ENTRER par mail ne le serait pas, et la raison tient en une
// phrase : une fermeture abusive coûte une reconnexion, une entrée abusive
// coûte une caisse. Les deux gestes n'ont pas le même prix, ils n'ont donc pas
// à demander la même preuve.
//
// ET L'ÉCRAN NE DIT JAMAIS SI LE COMPTE EXISTE. La réponse est la même mot
// pour mot dans les deux cas : sinon ce formulaire deviendrait l'outil le plus
// commode du marché pour savoir qui, dans la rue, tient un TOTEM.
//
// LA BASE NE GARDE QUE L'EMPREINTE du jeton — même règle que les invitations.
// Une copie de la base ne permet de fermer aucun compte.

import { inserer, lireUne, modifier } from "./base";
import { adresseNormalisee } from "./code-entree";
import { adresseCredible, envoyerCourriel, type Courrier } from "./courrier";
import { fermerToutesLesSessions } from "./sessions";
import { textesRetour } from "./textes/retour";
import type { Langue } from "./langue";

/**
 * Une heure. Le temps d'emprunter un téléphone, d'ouvrir sa boîte et de
 * revenir. Au-delà on en redemande un, ce qui ne coûte qu'un geste — alors
 * qu'un lien qui traîne une semaine dans une boîte restée ouverte sur le
 * téléphone volé est exactement ce qu'on cherche à éviter.
 */
export const VALIDITE_MS = 60 * 60 * 1000;

export type LigneDemande = {
  id: number;
  jeton_empreinte: string;
  personne: number;
  appareil: string | null;
  lieu: string | null;
  demande_le: string;
  expire_le: string;
  utilise_le: string | null;
};

/** Un jeton de fermeture : 160 bits, en base 36 pour tenir dans un lien. */
export function nouveauJeton(): string {
  const octets = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(octets, (o) => o.toString(36).padStart(2, "0")).join("");
}

/** L'empreinte du jeton — la seule chose qui touche la base. */
export async function empreinte(jeton: string): Promise<string> {
  const octets = new TextEncoder().encode(`totem:fermeture:${jeton}`);
  const somme = await crypto.subtle.digest("SHA-256", octets as unknown as BufferSource);
  return Array.from(new Uint8Array(somme), (o) => o.toString(16).padStart(2, "0")).join("");
}

/** L'adresse du site, telle que le lien devra la porter. */
export function origineDepuis(
  hote: string | null | undefined, protocole?: string | null,
): string | null {
  if (!hote) return null;
  const schema = protocole?.split(",")[0].trim()
    || (hote.startsWith("localhost") || hote.startsWith("127.") ? "http" : "https");
  return `${schema}://${hote}`;
}

/** Le lien tel qu'il part dans le courriel. Écrit ici, une seule fois. */
export function lienDeFermeture(origine: string, jeton: string): string {
  return `${origine}/retour/fermer/${jeton}`;
}

// --- Le raccord avec l'envoi des courriels ---------------------------------

/**
 * Le genre du message, tel que l'équipe du courrier ne le connaît pas encore.
 *
 * `lib/textes/courrier.ts` déclare cinq genres, et « fermeture » n'en fait pas
 * partie : ce fichier ne m'appartient pas, et la contrainte de la table
 * « courriels » porte la même liste. Le cast est ici, seul, nommé, et il
 * disparaît le jour où « fermeture » rejoint les deux listes — le message
 * viendra alors de `composer()` comme tous les autres. C'est la seule ligne du
 * raccord à changer.
 *
 * Ce qui se passe en attendant est le bon défaut : le message PART, et seule
 * la ligne de journal qui le note est refusée par la contrainte — silencieuse,
 * comme tout ce journal. Un lien de fermeture qui arrive sans être noté vaut
 * mieux qu'un lien noté qui n'arrive pas.
 */
const GENRE_FERMETURE = "fermeture" as unknown as Courrier["genre"];

/**
 * Le message lui-même. Il ne porte aucun code — un lien et un code dans le
 * même message, c'est la forme même de l'arnaque — et il dit ce qu'il faut
 * faire si ce n'était pas vous.
 */
function messageDeFermeture(langue: Langue, lien: string) {
  const t = textesRetour[langue];
  const lignes = [
    t.courrielDit, "", t.courrielGeste, lien, "",
    t.courrielPasVous, "", t.courrielSignature,
  ];
  return {
    objet: t.courrielObjet,
    texte: lignes.join("\n"),
    html: lignes
      .map((l) => (l === lien
        ? `<p><a href="${lien}">${lien}</a></p>`
        : l ? `<p>${l}</p>` : ""))
      .join("\n"),
  };
}

/**
 * Remettre le courriel. TOUT le raccord avec l'envoi tient dans cette fonction.
 *
 * `lib/courrier.ts` ne jette jamais et ne prétend jamais : sans clé
 * d'expédition, il rend un échec nommé au lieu d'inventer un envoi. On lui
 * fait confiance pour cela et on ne double pas son travail ici.
 */
async function remettre(
  destinataire: string, personne: number, langue: Langue, lien: string,
): Promise<boolean> {
  const envoi = await envoyerCourriel({
    destinataire,
    genre: GENRE_FERMETURE,
    message: messageDeFermeture(langue, lien),
    personne,
  });
  return envoi.partie;
}

// --- Demander la fermeture -------------------------------------------------

/**
 * Pas de langue ici, volontairement : le message part dans celle de la
 * PERSONNE, pas dans celle du navigateur qui a fait la demande. L'écran d'où
 * part la demande est souvent le téléphone d'un proche, et rien ne dit qu'il
 * lit la même langue.
 */
export type Demande = {
  courriel: string;
  origine: string | null;
  appareil?: string | null;
  lieu?: string | null;
};

type LignePersonne = { id: number; langue: Langue };

/**
 * Demander le lien qui ferme tout.
 *
 * NE REND RIEN, ET C'EST VOULU. Une fonction qui rendrait « trouvée » ou
 * « inconnue » mettrait l'appelant en position de répondre deux choses
 * différentes — et un jour quelqu'un le ferait, sans mauvaise intention, pour
 * « améliorer le message ». En ne rendant rien, la route n'a pas de branche à
 * écrire : elle ne PEUT pas dire si le compte existe.
 *
 * Reste une fuite qu'on ne prétend pas fermer ici : le temps de réponse est un
 * peu plus long quand le compte existe, parce qu'il y a une écriture et un
 * envoi. C'est une différence de quelques dizaines de millisecondes sur un
 * réseau camerounais qui en fait varier des centaines — et la refermer
 * vraiment demanderait de sortir l'envoi de la requête, ce qui est un autre
 * chantier.
 */
export async function demanderLaFermeture(d: Demande): Promise<void> {
  const adresse = adresseNormalisee(d.courriel);
  if (!adresseCredible(adresse)) return;

  // Le jeton se tire dans tous les cas : c'est le seul travail de cette
  // fonction qui ne dépend pas de l'existence du compte, et il ne coûte rien
  // de le faire même quand il ne servira à personne.
  const jeton = nouveauJeton();

  const personne = await lireUne<LignePersonne>(
    `personnes?courriel=eq.${encodeURIComponent(adresse)}`
    + `&etat=neq.parti&select=id,langue&limit=1`);
  if (!personne || !d.origine) return;

  const ligne = await inserer<LigneDemande>("demandes_fermeture", {
    jeton_empreinte: await empreinte(jeton),
    personne: personne.id,
    appareil: d.appareil ?? null,
    lieu: d.lieu ?? null,
    expire_le: new Date(Date.now() + VALIDITE_MS).toISOString(),
  });
  if (!ligne) return;

  await remettre(adresse, personne.id, personne.langue,
                 lienDeFermeture(d.origine, jeton));
}

// --- Exécuter la fermeture -------------------------------------------------

export type Fermeture =
  | { ok: true; personne: number }
  /** Déjà servi, périmé, ou jamais émis. On ne distingue pas : les trois
   *  appellent le même geste — en redemander un. */
  | { ok: false };

/**
 * Fermer, avec le jeton du lien. Une fois, et une seule.
 *
 * L'usage unique est porté par le filtre « utilise_le is null » de la mise à
 * jour : c'est la BASE qui arbitre, et non nous. Deux onglets qui ouvrent le
 * même lien au même instant ne peuvent pas le consommer deux fois — et un
 * lien retrouvé le lendemain dans une boîte mail n'ouvre plus rien.
 */
export async function fermerAvecLeJeton(jeton: string): Promise<Fermeture> {
  if (!/^[0-9a-z]{40}$/.test(jeton)) return { ok: false };

  const e = await empreinte(jeton);
  const ligne = await lireUne<LigneDemande>(
    `demandes_fermeture?jeton_empreinte=eq.${e}&utilise_le=is.null&limit=1`);
  if (!ligne) return { ok: false };
  if (new Date(ligne.expire_le).getTime() < Date.now()) return { ok: false };

  const consomme = await modifier(
    `demandes_fermeture?id=eq.${ligne.id}&utilise_le=is.null`,
    { utilise_le: new Date().toISOString() });
  if (!consomme) return { ok: false };

  // « tout_fermer » : le motif du geste de C8, celui qu'on fait quand le
  // téléphone est dans d'autres mains. Il restera au registre des sessions,
  // et c'est lui qui expliquera, trois mois plus tard, pourquoi tout s'est
  // fermé un mardi soir.
  await fermerToutesLesSessions(ligne.personne, "tout_fermer");
  return { ok: true, personne: ligne.personne };
}
