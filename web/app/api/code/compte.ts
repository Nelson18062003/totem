// La naissance d'un compte : une personne, un accès, et une adresse prouvée.
//
// C'est le seul endroit de TOTEM où un compte client apparaît. Il n'y a pas
// d'inscription : une propriétaire donne une clé de SA boutique, et le compte
// naît au moment exact où l'adresse répond.
//
// ON RETROUVE AVANT DE CRÉER, ET C'EST LA DÉCISION QUI COMPTE ICI
// Un employé qui revient six mois plus tard reçoit une nouvelle invitation.
// Si on créait une seconde personne, son historique se couperait en deux et
// deux « J. Eyenga » apparaîtraient dans la liste de la propriétaire — celle
// qui doit un jour dire qui a appuyé sur quoi. On retrouve donc la personne
// par son adresse, on la réactive si elle était partie, et on rouvre son
// accès au lieu d'en ajouter un second. C'est déjà ce qu'on fait pour les SIM
// retirées, qui retrouvent leur journal intact ; les gens méritent au moins
// autant.
//
// Ce que ce fichier ne fait PAS : décider si l'appareil est partagé. La
// question « ce téléphone est-il à vous, ou à la boutique ? » se pose à
// l'écran suivant, et c'est lui qui en tire les conséquences.

import { inserer, lireUne, modifier } from "@/lib/base";
import { adresseNormalisee } from "@/lib/code-entree";
import type { LigneInvitation } from "@/lib/invitations";

export type LignePersonne = {
  id: number;
  nom: string;
  etat: string;
  langue: "en" | "fr";
};

type LigneAcces = { id: number; role: string; retire_le: string | null };

/**
 * La personne de cette invitation : retrouvée, réactivée, ou créée.
 *
 * `courriel_prouve_le` est daté ici et nulle part ailleurs : c'est le seul
 * instant où l'on sait que l'adresse existe et qu'elle est bien à cette
 * personne, sans avoir eu à le demander.
 */
export async function personneDeLInvitation(
  inv: LigneInvitation,
): Promise<LignePersonne | null> {
  const courriel = adresseNormalisee(inv.courriel);
  const maintenant = new Date().toISOString();

  const connue = await lireUne<LignePersonne>(
    `personnes?courriel=eq.${encodeURIComponent(courriel)}`
    + `&select=id,nom,etat,langue&limit=1`);

  if (connue) {
    // « parti » n'est pas une porte fermée : c'est quelqu'un qui n'était plus
    // là. Une nouvelle invitation le fait revenir, avec son histoire.
    // « suspendu » en revanche est une décision prise par quelqu'un, et ce
    // n'est pas à une invitation de la défaire.
    if (connue.etat === "parti") {
      await modifier(`personnes?id=eq.${connue.id}`,
                     { etat: "actif", courriel_prouve_le: maintenant });
      return { ...connue, etat: "actif" };
    }
    await modifier(`personnes?id=eq.${connue.id}`,
                   { courriel_prouve_le: maintenant });
    return connue;
  }

  return inserer<LignePersonne>("personnes", {
    nom: inv.nom,
    courriel,
    courriel_prouve_le: maintenant,
    langue: inv.langue,
  });
}

/**
 * L'accès au commerce, dans le rôle que l'invitation porte.
 *
 * Un accès retiré se ROUVRE — on ne le remplace pas. La table interdit
 * d'ailleurs deux lignes pour la même personne dans le même commerce, et
 * c'est voulu : « qui a accès ici » doit rester une question à une réponse.
 */
export async function donnerLAcces(
  personne: number, inv: LigneInvitation,
): Promise<boolean> {
  const existant = await lireUne<LigneAcces>(
    `acces?personne=eq.${personne}&commerce=eq.${encodeURIComponent(inv.commerce)}`
    + `&select=id,role,retire_le&limit=1`);

  if (existant) {
    return modifier(`acces?id=eq.${existant.id}`, {
      role: inv.role,
      retire_le: null,
      retire_par: null,
      invite_par: inv.creee_par,
    });
  }

  const ligne = await inserer<LigneAcces>("acces", {
    personne,
    commerce: inv.commerce,
    role: inv.role,
    invite_par: inv.creee_par,
  });
  return Boolean(ligne);
}
