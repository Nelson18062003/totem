// LE GARDE — la deuxième ligne, celle qui regarde la base.
//
// POURQUOI IL EXISTE. Jusqu'ici, tout ce qui protégeait l'argent tenait dans
// `middleware.ts`. Une seule ligne de défense, et deux façons dont elle
// lâchait :
//
//   1. UN JETON NE SE REPRENAIT PAS. Le verrou du bord ne regarde que la
//      signature et l'échéance — jamais la base. Fermer un compte, ou même le
//      supprimer, ne changeait donc RIEN pour qui était déjà entré : le jeton
//      restait signé, et il vaut un mois. Un invité mis dehors gardait trente
//      jours l'accès à tous les paiements, à tous les reçus, au bilan complet.
//      Et le propriétaire n'avait aucun geste contre un téléphone volé.
//
//   2. AUCUNE PORTE NE REVÉRIFIAIT RIEN. `/api/donnees`, `/api/bilan`,
//      `/api/actualite` servaient ce qu'on leur demandait, en comptant sur le
//      fait que personne n'arrive jusqu'à elles. Si `SESSION_SECRET` venait à
//      manquer d'un réglage d'hébergement, la plateforme servait tout à qui
//      passe, en silence. Et l'avis publié sur le cadre lui-même
//      (CVE-2026-64642) dit mot pour mot ce qu'il faut faire : ne pas s'en
//      remettre au seul middleware.
//
// LE VERROU DU BORD RESTE. Il est rapide, il refuse l'immense majorité des
// requêtes sans réveiller la base. Il cesse simplement d'être le seul juge.
//
// CE QUE LE GARDE COÛTE. Une lecture de la table des comptes, mise en cache
// dix secondes. Une session fermée met donc au plus dix secondes à mourir
// partout — pas trente jours.

import { cookies } from "next/headers";
import { COOKIE_SESSION, compteDuSujet, sujetDeSession } from "@/lib/session";
import { etatDuCompte, type EtatCompte } from "@/lib/serveur";
import { verifierLien, type GenreLien } from "@/lib/lien-signe";
import { erreurApi } from "@noyau/textes/api";
import type { Langue } from "@noyau/langue";

/** Le verdict frais est bon dix secondes. */
const CACHE_MS = 10_000;

/**
 * LE SURSIS, et c'est la décision la plus délicate de ce fichier.
 *
 * Si la base ne répond plus, faut-il mettre tout le monde dehors ? Non : ce
 * serait transformer une panne de Supabase en verrou sur sa propre maison,
 * exactement ce que la clé de secours existe pour éviter. Mais laisser
 * entrer indéfiniment reviendrait à n'avoir rien fait.
 *
 * Alors : on garde le DERNIER VERDICT CONNU pendant cinq minutes. Qui était
 * approuvé il y a une minute passe encore ; qui venait d'être fermé reste
 * dehors, puisque c'est son dernier verdict connu ; et qui n'a jamais été vu
 * n'entre pas. Passé le sursis, plus personne — et le propriétaire garde la
 * clé de secours, qui ne demande rien à la base.
 */
const SURSIS_MS = 5 * 60_000;

type Verdict = { etat: EtatCompte; vu: number };
const connus = new Map<number, Verdict>();

async function etatAvecCache(id: number): Promise<EtatCompte> {
  const maintenant = Date.now();
  const garde = connus.get(id);
  if (garde && maintenant - garde.vu < CACHE_MS) return garde.etat;

  const frais = await etatDuCompte(id);
  if (frais.etat !== "injoignable") {
    connus.set(id, { etat: frais, vu: maintenant });
    // Ménage opportuniste : on ne garde pas les vieux verdicts en mémoire.
    if (connus.size > 1000) {
      for (const [k, v] of connus) {
        if (maintenant - v.vu > SURSIS_MS) connus.delete(k);
      }
    }
    return frais;
  }

  // La base s'est tue. Le dernier verdict connu, s'il n'est pas trop vieux.
  if (garde && maintenant - garde.vu < SURSIS_MS) return garde.etat;
  return { etat: "injoignable" };
}

/** Efface le verdict gardé d'un compte : le propriétaire vient de changer
 *  quelque chose, et l'effet doit être immédiat, pas dans dix secondes. */
export function oublierLeVerdict(id: number): void {
  connus.delete(id);
}

export type Entrant =
  | {
      ok: true;
      /** Le sujet du jeton — `null` quand il n'y a pas de verrou du tout. */
      sujet: string | null;
      /** Le numéro du compte, s'il s'agit d'un compte. */
      compte: number | null;
      /** Le courriel du compte, pour le saluer. Rien d'autre. */
      courriel: string | null;
      /** A-t-il le droit d'administrer ? */
      proprietaire: boolean;
    }
  | { ok: false; statut: 401 | 403 | 503 };

/** Le jeton porté par l'en-tête « Authorization: Bearer … », s'il y en a un. */
function jetonPorte(req?: Request): string | undefined {
  const porte = req?.headers.get("authorization");
  if (!porte) return undefined;
  const [schema, valeur] = porte.split(" ");
  return schema?.toLowerCase() === "bearer" && valeur ? valeur : undefined;
}

/** Le jeton présenté, d'où qu'il vienne : le cookie du navigateur ou
 *  l'en-tête du téléphone. Le même jeton, la même signature. */
async function jetonPresente(req?: Request): Promise<string | undefined> {
  const boite = await cookies();
  return boite.get(COOKIE_SESSION)?.value ?? jetonPorte(req);
}

/**
 * QUI FRAPPE, ET A-T-IL ENCORE LE DROIT D'ENTRER ?
 *
 * À appeler en tête de TOUTE porte qui n'est pas ouverte à tous. Ce n'est pas
 * une redite du middleware : le middleware vérifie qu'un jeton tient debout,
 * celui-ci vérifie que le compte derrière le jeton existe encore et n'a pas
 * été fermé.
 *
 * `req` est facultatif : une page rendue au serveur n'a pas d'objet Request
 * sous la main, seulement le cookie. Le téléphone, lui, porte son jeton dans
 * l'en-tête, et il faut alors passer la requête.
 *
 * SANS `SESSION_SECRET`, il n'y a aucun verrou sur cette plateforme — c'est
 * assumé pour le développement local, et le middleware laisse déjà tout
 * passer. Le garde fait pareil plutôt que de faire semblant : une porte
 * fermée devant une maison ouverte ne trompe que celui qui l'a posée. En
 * PRODUCTION, en revanche, cette situation n'est pas une commodité mais une
 * plateforme grande ouverte : voir `middleware.ts`, qui refuse alors de
 * servir quoi que ce soit.
 */
export async function exigerSession(req?: Request): Promise<Entrant> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) {
    return { ok: true, sujet: null, compte: null, courriel: null, proprietaire: true };
  }

  const sujet = await sujetDeSession(secret, await jetonPresente(req));
  if (!sujet) return { ok: false, statut: 401 };

  // LA CLÉ DE SECOURS. Elle ne vit que dans les variables d'environnement de
  // l'hébergement : y avoir accès, c'est déjà être le propriétaire de la
  // plateforme. Elle ne désigne aucun compte, donc rien à relire en base —
  // et c'est bien son intérêt, puisqu'elle sert le jour où la base se tait.
  if (sujet === "secours") {
    return { ok: true, sujet, compte: null, courriel: null, proprietaire: true };
  }

  const compte = compteDuSujet(sujet);
  if (compte === null) {
    // UN JETON D'AVANT LES COMPTES (« proprietaire », « telephone »). Il a été
    // émis quand la plateforme n'avait qu'un mot de passe, sans notion de
    // rôle. Il ouvre les écrans jusqu'à son expiration — on ne met personne
    // dehors en pleine journée — mais pas l'administration.
    return { ok: true, sujet, compte: null, courriel: null, proprietaire: false };
  }

  const etat = await etatAvecCache(compte);
  switch (etat.etat) {
    case "actif":
      return {
        ok: true, sujet, compte,
        courriel: etat.courriel,
        proprietaire: etat.role === "proprietaire",
      };
    // FERMÉ ou SUPPRIMÉ : le jeton est authentique, et il ne vaut plus rien.
    // C'est tout l'objet de ce fichier.
    case "ferme":
    case "inconnu":
      return { ok: false, statut: 401 };
    // La base s'est tue, et le sursis est épuisé. On ne sait pas : on ne
    // laisse pas entrer, et on le dit avec le bon code — ce n'est pas un
    // refus d'identité, c'est une panne.
    case "injoignable":
      return { ok: false, statut: 503 };
  }
}

/** Le même garde, pour les portes réservées au propriétaire.
 *
 *  Déposer une demande, faire sonner un téléphone, classer un paiement,
 *  administrer les comptes : un invité voit les écrans, il ne touche pas aux
 *  cartes.
 *
 *  Deux refus différents, et la nuance compte : 401 « je ne sais pas qui vous
 *  êtes », 403 « je le sais, et ce n'est pas permis ». Un invité approuvé qui
 *  recevrait 401 croirait sa session perdue et se reconnecterait en boucle. */
export async function exigerProprietaire(req?: Request): Promise<Entrant> {
  const entrant = await exigerSession(req);
  if (!entrant.ok) return entrant;
  return entrant.proprietaire ? entrant : { ok: false, statut: 403 };
}

/**
 * Le garde des DOCUMENTS : une session vivante, OU un lien signé pour CE
 * document-là.
 *
 * Le navigateur du téléphone n'a ni cookie ni en-tête — c'est toute la raison
 * d'être des liens signés (voir `lib/lien-signe.ts`). Le middleware les
 * connaît déjà ; il faut que la route les connaisse aussi, sans quoi ajouter
 * le garde fermerait la porte à un usage légitime.
 *
 * Le lien reste ce qu'il était : dix minutes, ce genre, cet identifiant.
 */
export async function exigerSessionOuLien(
  req: Request, genre: GenreLien, id: string,
): Promise<Entrant> {
  const secret = process.env.SESSION_SECRET || "";
  if (secret) {
    const u = new URL(req.url);
    if (await verifierLien(secret, genre, id,
                           u.searchParams.get("e"), u.searchParams.get("s"))) {
      // Un porteur de laissez-passer n'est personne en particulier : il a le
      // droit de voir CE document, et rien d'autre.
      return { ok: true, sujet: null, compte: null, courriel: null, proprietaire: false };
    }
  }
  return exigerSession(req);
}

/** La réponse d'une API à un garde qui refuse. Le texte suit la langue de
 *  l'écran, comme le fait déjà le middleware. */
export function refusApi(statut: 401 | 403 | 503, langue: Langue): Response {
  const cle = statut === 503 ? "plateformeInjoignable"
    : statut === 403 ? "reserveAuProprietaire"
      : "connexionRequise";
  return Response.json({ erreur: erreurApi(langue, cle) }, { status: statut });
}
