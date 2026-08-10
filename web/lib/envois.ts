// Le raccord : ce que les autres écrans appellent pour qu'un message parte.
//
// Trois pièces existaient et ne se parlaient pas — « code-entree.ts » fabrique
// les six chiffres, « textes/courrier.ts » écrit les phrases, « courrier.ts »
// pose le message dans une boîte. Ce fichier est le seul endroit où les trois
// se rencontrent. Aucune page, aucune route n'a besoin de connaître les autres.
//
// POURQUOI DEUX FONCTIONS, ET PAS SIX
// « envoyerCode » et « envoyerInvitation » sont les deux gestes que TOTEM fait
// vraiment : donner une clé, et ouvrir la porte. Tout le reste — la bienvenue,
// l'alerte d'un appareil inconnu, un téléphone retiré — sont des AVIS : ils ne
// créent rien, ils racontent. Ils passent par « envoyerAvis », qui ne fabrique
// aucun secret.
//
// CE QUE CES FONCTIONS PROMETTENT
// Le secret en clair — les six chiffres, le jeton d'invitation — ne sort
// JAMAIS d'ici. Il naît, il entre dans le message, et la variable qui le
// portait est effacée dans la ligne qui suit. Ce qui est rendu à l'appelant ne
// contient que la ligne enregistrée en base, laquelle ne connaît qu'une
// empreinte. Un écran ne peut donc pas afficher le code par mégarde, et un
// journal ne peut pas l'écrire : ils ne l'ont jamais eu.
//
// CE QU'ELLES NE FONT PAS
// Elles ne décident pas de l'écran. Un envoi raté rend une raison nommée ; la
// page choisit quoi montrer, et elle a de quoi le faire — « raison » dit s'il
// faut réessayer, attendre, ou prévenir quelqu'un.

import {
  ecrireCode, emettreCode, VIE_MS,
  type Emis, type LigneCode, type Motif,
} from "./code-entree";
import { envoyerCourriel, type Issue } from "./courrier";
import {
  creerInvitation, VALIDITE_MS,
  type LigneInvitation,
} from "./invitations";
import type { Langue } from "./langue";
import type { Role } from "./session";
import { composer, type Contenu } from "./textes/courrier";

// --- Les six chiffres ------------------------------------------------------

export type DemandeCode = {
  courriel: string;
  motif: Motif;
  /** Le NOM du commerce — « Marché · Bafoussam », pas son identifiant. Il est
   *  dans l'objet du message : quelqu'un qui travaille dans deux boutiques
   *  doit savoir laquelle vient de s'ouvrir. */
  commerce: string;
  langue: Langue;
  /** Nul avant l'acceptation d'une invitation : le compte n'existe pas encore. */
  personne?: number | null;
  invitation?: number | null;
  /** « Chrome sur Android » — pour que la personne reconnaisse SA tentative. */
  appareil?: string | null;
  lieu?: string | null;
};

export type ResultatCode =
  | { envoye: true; ligne: LigneCode }
  /** Trop de demandes pour cette adresse. On protège sa boîte, pas nous. */
  | { envoye: false; raison: "trop"; reessayerDans: number }
  /** La base n'a pas enregistré le code. Rien n'est parti, rien n'existe. */
  | { envoye: false; raison: "base" }
  /** Le code existe, le message n'est pas parti. Il faudra en redemander un. */
  | { envoye: false; raison: "courrier"; issue: Issue; dit: string };

/**
 * Fabriquer six chiffres et les mettre dans la boîte mail de quelqu'un.
 *
 * Une remarque qui compte pour l'écran qui appelle : quand le message ne part
 * pas, le code a tout de même été enregistré, et il a consommé une des cinq
 * demandes autorisées dans la demi-heure. C'est le bon compromis — l'inverse
 * (n'enregistrer qu'après l'envoi) laisserait quelqu'un appuyer cent fois sur
 * « renvoyer » pendant une panne du fournisseur.
 */
export async function envoyerCode(d: DemandeCode): Promise<ResultatCode> {
  let emis: Emis | null = await emettreCode({
    courriel: d.courriel,
    motif: d.motif,
    personne: d.personne,
    invitation: d.invitation,
    appareil: d.appareil,
    lieu: d.lieu,
  });
  if (!emis) return { envoye: false, raison: "base" };
  if ("trop" in emis) {
    return { envoye: false, raison: "trop", reessayerDans: emis.reessayerDans };
  }

  const ligne = emis.ligne;
  const message = composer(d.langue, {
    genre: "code",
    motif: d.motif,
    commerce: d.commerce,
    code: ecrireCode(emis.code),
    minutes: Math.round(VIE_MS / 60000),
    appareil: d.appareil,
    lieu: d.lieu,
  });
  // Ici, et pas une ligne plus bas : le code en clair n'est plus atteignable
  // depuis cette fonction. Il n'existe plus que dans le message qui part.
  emis = null;

  const envoi = await envoyerCourriel({
    destinataire: d.courriel,
    genre: "code",
    message,
    personne: d.personne,
  });
  if (!envoi.partie) {
    return { envoye: false, raison: "courrier", issue: envoi.issue, dit: envoi.dit };
  }
  return { envoye: true, ligne };
}

// --- L'invitation ----------------------------------------------------------

export type DemandeInvitation = {
  /** L'identifiant du commerce — « marche-bafoussam ». */
  commerce: string;
  /** Son nom lisible — « Marché · Bafoussam ». C'est lui qu'on lit. */
  commerceNom: string;
  role: Role;
  /** Le nom de l'invité, tel que la propriétaire l'a saisi. */
  nom: string;
  courriel: string;
  /** Celle du commerce par défaut : l'invité n'a encore rien choisi. */
  langue: Langue;
  /** Le nom de celle qui invite. Il est dans l'objet — c'est ce qui fait
   *  ouvrir le message, et ce qui permet de reconnaître un faux. */
  invitant: string;
  creeePar: number;
  /** « https://totem.example ». À défaut, TOTEM_ORIGINE. */
  origine?: string;
};

export type ResultatInvitation =
  | { envoyee: true; ligne: LigneInvitation }
  /** La base n'a pas enregistré l'invitation. Rien n'existe. */
  | { envoyee: false; raison: "base" }
  /** On ne sait pas sous quelle adresse TOTEM est servi : le lien serait faux. */
  | { envoyee: false; raison: "sans_origine" }
  /** L'invitation EXISTE et le message n'est pas parti. La ligne est rendue
   *  pour que la propriétaire puisse l'annuler ou la relancer. */
  | {
      envoyee: false; raison: "courrier";
      issue: Issue; dit: string; ligne: LigneInvitation;
    };

/**
 * Créer une invitation et l'envoyer.
 *
 * Le jeton en clair ne quitte pas cette fonction — c'est la raison d'être du
 * raccord. Une page qui appellerait « creerInvitation » puis fabriquerait le
 * lien elle-même finirait par le journaliser, l'afficher, ou le renvoyer dans
 * une réponse JSON. Ici il naît, il entre dans le lien, et il disparaît.
 *
 * Le message ne porte AUCUN code, et le message qui porte le code ne portera
 * aucun lien : cette paire est la forme même de l'hameçonnage.
 */
export async function envoyerInvitation(
  d: DemandeInvitation,
): Promise<ResultatInvitation> {
  const origine = d.origine || process.env.TOTEM_ORIGINE;
  if (!origine) return { envoyee: false, raison: "sans_origine" };

  let creee = await creerInvitation({
    commerce: d.commerce,
    role: d.role,
    nom: d.nom,
    courriel: d.courriel,
    langue: d.langue,
    creeePar: d.creeePar,
  });
  if (!creee) return { envoyee: false, raison: "base" };

  const ligne = creee.ligne;
  const message = composer(d.langue, {
    genre: "invitation",
    invitant: d.invitant,
    commerce: d.commerceNom,
    nom: d.nom,
    lien: `${origine.replace(/\/+$/, "")}/invitation/${creee.jeton}`,
    jours: Math.round(VALIDITE_MS / 86_400_000),
  });
  // Le jeton en clair s'arrête là.
  creee = null;

  const envoi = await envoyerCourriel({
    destinataire: d.courriel,
    genre: "invitation",
    message,
  });
  if (!envoi.partie) {
    return {
      envoyee: false, raison: "courrier",
      issue: envoi.issue, dit: envoi.dit, ligne,
    };
  }
  return { envoyee: true, ligne };
}

// --- Les avis --------------------------------------------------------------

/** Les messages qui ne portent aucun secret : ils racontent, ils n'ouvrent rien. */
export type Avis = Extract<
  Contenu, { genre: "bienvenue" | "alerte_appareil" | "cle_retiree" }
>;

/**
 * Envoyer un avis. Aucun code n'est fabriqué, rien n'est consommé.
 *
 * Un avis raté est moins grave qu'un code raté — personne n'attend devant un
 * écran — mais il se note quand même : « une entrée depuis un appareil
 * inconnu » est précisément le message dont on veut pouvoir dire, trois
 * semaines plus tard, s'il est parti ou non.
 */
export async function envoyerAvis(
  courriel: string, langue: Langue, avis: Avis, personne?: number | null,
) {
  return envoyerCourriel({
    destinataire: courriel,
    genre: avis.genre,
    message: composer(langue, avis),
    personne,
  });
}
