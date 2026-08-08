// Le registre des sessions : ouvrir, vérifier, fermer.
//
// Toute la raison d'être de ce fichier tient dans la dernière : POUVOIR
// FERMER. Sans registre, « retirer l'accès de quelqu'un » ne ferme rien — le
// jeton déjà signé reste valable jusqu'à son expiration, et le téléphone d'un
// employé licencié à 18 h continue d'ouvrir la boutique. Une case cochée
// n'est pas une sécurité.
//
// C'est aussi ce qui permet à `C9` de tenir sa promesse — « son téléphone se
// ferme dans la seconde, pas à sa prochaine entrée » — et à `C8` d'offrir un
// bouton qui coupe tout sans rien demander : fermer une porte n'a jamais nui
// à personne, donc fermer n'exige aucune preuve.

import { inserer, lire, lireUne, modifier, relie } from "./base";
import { DUREE_MS, DUREE_PARTAGE_MS, nouvelIdentifiant, type Role } from "./session";

export type LigneSession = {
  id: string;
  personne: number;
  commerce: string | null;
  role: Role;
  appareil: string | null;
  lieu: string | null;
  partage: boolean;
  ouverte_le: string;
  vue_le: string;
  expire_le: string;
  revoquee_le: string | null;
  revoquee_motif: string | null;
};

/** Pourquoi une session s'est fermée. Le dernier compte plus qu'il n'y paraît. */
export type Motif =
  | "sortie"          // la personne est partie d'elle-même
  | "retrait_acces"   // le propriétaire a repris la clé
  | "tout_fermer"     // « fermez tout », depuis n'importe où
  | "expiree"
  | "sms_stop";       // un mot envoyé depuis un combiné emprunté

export type Ouverture = {
  personne: number;
  commerce: string | null;
  role: Role;
  appareil?: string | null;
  lieu?: string | null;
  /** Un téléphone de comptoir : la session se ferme le soir même. */
  partage?: boolean;
};

/**
 * Ouvrir une session, et rendre son identifiant.
 *
 * La durée dépend de l'appareil, pas du rôle : douze heures sur un téléphone
 * personnel (SP 800-63B-4 §5.2 au niveau AAL2), dix sur un combiné partagé,
 * pour qu'il se ferme avant la nuit plutôt qu'au milieu de la journée
 * suivante.
 */
export async function ouvrirSession(o: Ouverture): Promise<LigneSession | null> {
  const duree = o.partage ? DUREE_PARTAGE_MS : DUREE_MS;
  return inserer<LigneSession>("sessions", {
    id: nouvelIdentifiant(),
    personne: o.personne,
    commerce: o.commerce,
    role: o.role,
    appareil: o.appareil ?? null,
    lieu: o.lieu ?? null,
    partage: o.partage ?? false,
    expire_le: new Date(Date.now() + duree).toISOString(),
  });
}

/**
 * Cette session vit-elle encore ?
 *
 * C'est la question que la signature du jeton ne peut pas trancher. Un jeton
 * parfaitement authentique peut appartenir à une session révoquée il y a dix
 * secondes — et c'est précisément le cas qu'on veut attraper.
 */
export async function sessionVivante(id: string): Promise<LigneSession | null> {
  if (!relie) return null;
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const ligne = await lireUne<LigneSession>(
    `sessions?id=eq.${id}&revoquee_le=is.null&limit=1`);
  if (!ligne) return null;
  if (new Date(ligne.expire_le).getTime() < Date.now()) return null;
  return ligne;
}

/**
 * Noter qu'on l'a vue.
 *
 * On n'écrit pas à chaque requête : sur un forfait où le gigaoctet coûte une
 * part réelle du revenu mensuel, une écriture par clic est une dépense. Une
 * fois par tranche de cinq minutes suffit à dire « cet appareil sert encore »
 * dans la liste que la propriétaire regarde.
 */
const PAS_DE_VUE_MS = 5 * 60 * 1000;

export async function toucherSession(s: LigneSession): Promise<void> {
  if (Date.now() - new Date(s.vue_le).getTime() < PAS_DE_VUE_MS) return;
  await modifier(`sessions?id=eq.${s.id}`, { vue_le: new Date().toISOString() });
}

/** Fermer une session. Elle reste au registre, datée — rien ne s'efface. */
export async function fermerSession(id: string, motif: Motif): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(id)) return false;
  return modifier(`sessions?id=eq.${id}&revoquee_le=is.null`,
                  { revoquee_le: new Date().toISOString(), revoquee_motif: motif });
}

/**
 * Fermer TOUTES les sessions d'une personne, partout.
 *
 * Deux appelants, et ils n'ont rien à voir : la propriétaire qui reprend une
 * clé, et la personne elle-même dont le téléphone vient d'être arraché. Le
 * second n'a peut-être aucun appareil en main — d'où le motif « sms_stop »,
 * qui arrive par un mot envoyé depuis un combiné emprunté.
 */
export async function fermerToutesLesSessions(
  personne: number, motif: Motif,
): Promise<boolean> {
  return modifier(`sessions?personne=eq.${personne}&revoquee_le=is.null`,
                  { revoquee_le: new Date().toISOString(), revoquee_motif: motif });
}

/** Les appareils où ce compte est ouvert, du plus récemment vu au plus ancien. */
export async function sessionsOuvertes(personne: number): Promise<LigneSession[]> {
  return lire<LigneSession>(
    `sessions?personne=eq.${personne}&revoquee_le=is.null&order=vue_le.desc`);
}

/**
 * Ce que la personne reconnaîtra dans sa liste d'appareils.
 *
 * « Chrome sur Android », pas une empreinte technique : elle doit pouvoir
 * relier la ligne à un objet de sa poche pour décider s'il faut la fermer.
 * On lit donc grossièrement, et on assume : mieux vaut « un navigateur » que
 * soixante caractères que personne ne sait interpréter.
 */
export function nommerAppareil(agent: string | null | undefined): string {
  const a = agent ?? "";
  const systeme =
    /Android/i.test(a) ? "Android"
    : /iPhone|iPad|iOS/i.test(a) ? "iPhone"
    : /Windows/i.test(a) ? "Windows"
    : /Mac OS X|Macintosh/i.test(a) ? "macOS"
    : /Linux/i.test(a) ? "Linux"
    : null;
  const navigateur =
    /Edg\//i.test(a) ? "Edge"
    : /OPR\/|Opera/i.test(a) ? "Opera"
    : /Chrome\//i.test(a) ? "Chrome"
    : /Firefox\//i.test(a) ? "Firefox"
    : /Safari\//i.test(a) ? "Safari"
    : null;
  if (navigateur && systeme) return `${navigateur} sur ${systeme}`;
  if (systeme) return systeme;
  if (navigateur) return navigateur;
  return "un navigateur";
}
