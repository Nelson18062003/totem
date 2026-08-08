// Les personnes : les retrouver, et en créer une quand il le faut.
//
// LE PROPRIÉTAIRE FONDATEUR
// Tant que les invitations ne sont pas en service, il reste une porte : le
// mot de passe unique de `TOTEM_MOT_DE_PASSE`. Ce fichier lui donne un nom
// réel dans la table « personnes », au lieu du mot « proprietaire » écrit en
// dur dans le jeton.
//
// Ce détail change tout ce qui vient après : dès aujourd'hui, une commande
// porte le numéro de quelqu'un, et le journal peut dire qui a appuyé. Le jour
// où les autres comptes arrivent, ils rejoignent une table déjà peuplée au
// lieu de remplacer une abstraction.
//
// Le nom vient de `TOTEM_PROPRIETAIRE` quand il est posé ; sinon on écrit
// « Le propriétaire », qui est vrai et qui ne prétend pas connaître quelqu'un
// qu'on n'a pas rencontré.

import { inserer, lireUne, relie } from "./base";
import type { Role } from "./session";

export type Personne = {
  id: number;
  nom: string;
  role: Role;
  commerce: string | null;
  langue: "fr" | "en";
};

type LignePersonne = {
  id: number; nom: string; etat: string; langue: "fr" | "en";
};
type LigneAcces = { role: Role; commerce: string };

/** Le rôle et le commerce d'une personne, tels qu'ils sont EN BASE. */
export async function accesDe(personne: number): Promise<LigneAcces | null> {
  return lireUne<LigneAcces>(
    `acces?personne=eq.${personne}&retire_le=is.null&select=role,commerce&limit=1`);
}

/**
 * La personne qui entre avec le mot de passe fondateur.
 *
 * On la retrouve par son nom, et on la crée si elle n'existe pas encore —
 * l'installation d'un TOTEM neuf ne doit pas demander de passer par l'éditeur
 * SQL de Supabase avant la première connexion.
 *
 * Elle n'obtient PAS d'accès à un commerce ici : un accès se donne, il ne se
 * devine pas. Tant qu'aucun commerce n'existe, elle entre en « admin », qui
 * voit et administre — et qui, par construction, ne peut faire sortir aucun
 * argent (voir `lib/roles.ts`).
 */
export async function personneDuMotDePasse(): Promise<Personne | null> {
  if (!relie) return null;
  const nom = process.env.TOTEM_PROPRIETAIRE || "Le propriétaire";

  const existante = await lireUne<LignePersonne>(
    `personnes?nom=eq.${encodeURIComponent(nom)}&select=id,nom,etat,langue&limit=1`);

  const ligne = existante ?? await inserer<LignePersonne>("personnes", {
    nom, langue: process.env.TOTEM_LANGUE === "en" ? "en" : "fr",
  });
  if (!ligne) return null;

  // Une personne suspendue n'entre pas, quel que soit le mot de passe.
  if (ligne.etat !== "actif") return null;

  const acces = await accesDe(ligne.id);
  return {
    id: ligne.id,
    nom: ligne.nom,
    role: acces?.role ?? "admin",
    commerce: acces?.commerce ?? null,
    langue: ligne.langue,
  };
}
