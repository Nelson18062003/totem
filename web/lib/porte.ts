// La porte : ce qui décide si l'on entre, et sous quelle identité.
//
// Elle vit ici, et pas dans une route, parce qu'il y a DEUX entrées — le
// navigateur (`/api/connexion`, qui repart avec un cookie) et l'application
// du téléphone (`/api/session`, qui repart avec un jeton en clair). Ce qui
// diffère, c'est la façon de RANGER la session. Ce qui décide, non : il ne
// doit y avoir qu'une seule règle, à un seul endroit, sans quoi une des deux
// portes finit un jour plus permissive que l'autre.
//
// DEUX FAÇONS D'ENTRER, et il faut les deux :
//
//   1. UN COMPTE — un courriel, et un CODE à six chiffres envoyé à ce
//      courriel (`/api/code`). Plus de mot de passe : un mot de passe se
//      choisit mal, se réutilise ailleurs, et sa fuite ailleurs ouvrait la
//      porte ici. Le code ne se choisit pas, sert une fois, vit dix minutes,
//      et prouve à chaque entrée qu'on tient la boîte. Le navigateur et le
//      téléphone font exactement le même chemin.
//
//   2. LA CLÉ DE SECOURS — le mot de passe unique posé dans la variable
//      d'environnement `TOTEM_MOT_DE_PASSE`. Elle n'existe que si elle est
//      posée. Pourquoi la garder : les comptes vivent dans Supabase, et les
//      codes partent par un service de courrier. Si l'un des deux se tait,
//      PLUS PERSONNE n'entre — y compris le propriétaire, y compris pour
//      constater la panne. Une panne ne doit pas être un verrou sur sa
//      propre maison.
//
// Tout passe par le MÊME frein : alterner les chemins ne double pas la
// cadence des essais.

import { after } from "next/server";
import {
  compterUtilisateurs, creerUtilisateur, essayerUnCode, noterConnexion,
  noterIncident, poserUnCode, utilisateurParCourriel,
} from "@/lib/serveur";
import {
  DELAI_ENTRE_DEUX_CODES_S, DUREE_DU_CODE_S, ESSAIS_PAR_CODE, codeSaisi,
  courrielAcceptable, empreinteDuCode, normaliserCourriel, tirerUnCode,
} from "@/lib/code";
import { courrierPret, envoyerCode, envoyerInvitation } from "@/lib/courrier";
import { egaliteConstante, signerSession, sujetDuCompte } from "@/lib/session";
import { attendreLeFrein, cleDeFrein, noterEchec, oublierEchecs } from "@/lib/frein";
import { erreurApi } from "@noyau/textes/api";
import type { Langue } from "@noyau/langue";

export type Refus = { ok: false; erreur: string; statut: number };

export type Entree = { ok: true; jeton: string; sujet: string } | Refus;

function refus(langue: Langue, cle: Parameters<typeof erreurApi>[1], statut: number): Refus {
  return { ok: false, erreur: erreurApi(langue, cle), statut };
}

/**
 * Pose un code pour ce compte et l'envoie. Ne rend rien : celui qui demande
 * ne doit RIEN apprendre de ce qui se passe ici — ni si le compte existe, ni
 * si la lettre est partie. Ce qui rate se note au journal, sans courriel et
 * sans code.
 */
async function poserEtEnvoyer(courriel: string, langue: Langue): Promise<void> {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return;
  const compte = await utilisateurParCourriel(courriel);
  // Un compte fermé ne reçoit pas de code : il n'ouvrirait rien, et une
  // lettre qui arrive dirait que la porte est encore là.
  if (!compte || !compte.approuve) return;
  const code = tirerUnCode();
  const pose = await poserUnCode(
    compte.id, await empreinteDuCode(secret, compte.id, code),
    DUREE_DU_CODE_S, DELAI_ENTRE_DEUX_CODES_S);
  // `false` : un code de moins d'une minute existe déjà. On n'en renvoie
  // pas — sinon n'importe qui pourrait remplir une boîte en boucle.
  if (pose !== true) {
    if (pose === null) noterIncident("Un code d'entrée n'a pas pu être posé : la base n'a pas répondu.");
    return;
  }
  if (!(await envoyerCode(courriel, code, langue))) {
    noterIncident(
      "Un code d'entrée n'a pas pu partir : le service de courrier l'a refusé "
      + "ou n'a pas répondu. Vérifier la clé du courrier et le domaine d'envoi.");
  }
}

/**
 * Demande un code d'entrée pour ce courriel.
 *
 * LA RÉPONSE EST LA MÊME POUR TOUT LE MONDE, ET ELLE ARRIVE EN MÊME TEMPS.
 * « Si cette adresse a un accès, un code vient de partir. » Un message
 * différent pour un courriel inconnu dirait à n'importe qui quelles adresses
 * ont un compte ici. Un délai différent le dirait aussi, sans un mot : c'est
 * pourquoi TOUT le travail — chercher le compte, poser le code, l'envoyer —
 * se fait APRÈS la réponse (`after`). La réponse ne dépend que de la forme
 * du courriel.
 */
export async function demanderUnCode(
  req: Request, corps: unknown, langue: Langue,
): Promise<{ ok: true } | Refus> {
  if (!process.env.SESSION_SECRET) return refus(langue, "connexionNonConfiguree", 503);
  // Sans service de courrier, aucun code ne partira : on le dit franchement,
  // et pour tout le monde — c'est un fait de la plateforme, pas du compte.
  if (!courrierPret) return refus(langue, "courrierNonConfigure", 503);

  const cle = cleDeFrein(req);
  if (!(await attendreLeFrein(cle))) return refus(langue, "tropDEssais", 429);

  const courriel = normaliserCourriel((corps as Record<string, unknown> | null)?.courriel);
  if (!courrielAcceptable(courriel)) return refus(langue, "courrielInvalide", 400);

  after(() => poserEtEnvoyer(courriel, langue));
  return { ok: true };
}

/**
 * Décide si l'on entre, et rend le jeton signé le cas échéant.
 *
 * `corps` est ce que la requête portait : `{ courriel, code }` pour un
 * compte, `{ motdepasse }` seul pour la clé de secours.
 */
export async function ouvrirLaPorte(
  req: Request, corps: unknown, langue: Langue,
): Promise<Entree> {
  const secret = process.env.SESSION_SECRET || "";
  const secours = process.env.TOTEM_MOT_DE_PASSE || "";

  // Sans secret de signature, aucune session ne peut être signée : rien ne
  // sert d'aller plus loin, et on le dit franchement.
  if (!secret) return refus(langue, "connexionNonConfiguree", 503);

  const champs = (corps ?? {}) as Record<string, unknown>;
  const courriel = normaliserCourriel(champs.courriel);

  // Le frein, avant tout examen : un seau partagé par les deux portes.
  const cle = cleDeFrein(req);
  if (!(await attendreLeFrein(cle))) {
    return refus(langue, "tropDEssais", 429);
  }

  // --- Chemin 1 : un compte, et son code ----------------------------------
  if (courriel) {
    const code = codeSaisi(champs.code);
    if (!code) return refus(langue, "codeIncorrect", 401);
    const compte = await utilisateurParCourriel(courriel);
    // MÊME TRAVAIL POUR UN COURRIEL INCONNU : on essaie un code sur un compte
    // qui n'existe pas (le numéro 0). Sans cela, un courriel inconnu
    // répondrait un aller-retour plus tôt — et le chronomètre dirait qui a
    // un compte ici.
    const id = compte?.id ?? 0;
    const bon = await essayerUnCode(
      id, await empreinteDuCode(secret, id, code), ESSAIS_PAR_CODE);
    if (!compte || !bon) {
      noterEchec(cle);
      return refus(langue, "codeIncorrect", 401);
    }
    // Le code était bon, mais la porte a pu se refermer entre-temps.
    if (!compte.approuve) return refus(langue, "compteEnAttente", 403);
    oublierEchecs(cle);
    await noterConnexion(compte.id);
    const sujet = sujetDuCompte(compte.id);
    return { ok: true, jeton: await signerSession(secret, sujet), sujet };
  }

  // --- Chemin 2 : la clé de secours ---------------------------------------
  const motdepasse = typeof champs.motdepasse === "string" ? champs.motdepasse : "";
  if (!motdepasse || !secours) return refus(langue, "cleIncorrecte", 401);
  if (!(await egaliteConstante(motdepasse, secours))) {
    noterEchec(cle);
    return refus(langue, "cleIncorrecte", 401);
  }
  oublierEchecs(cle);
  return { ok: true, jeton: await signerSession(secret, "secours"), sujet: "secours" };
}

/**
 * Y a-t-il encore une inscription possible sur cette plateforme ?
 *
 * NON, dès qu'un compte existe. L'inscription ne sert qu'à UNE chose : poser
 * le tout premier compte, celui du propriétaire, sur une plateforme neuve.
 * Cela fait, la porte se referme d'elle-même — les autres comptes, c'est le
 * propriétaire qui les crée.
 *
 * Rend `null` si la base ne répond pas : « je ne sais pas » n'est ni oui ni
 * non, et l'écran doit pouvoir le dire ainsi.
 */
export async function inscriptionPossible(): Promise<boolean | null> {
  const combien = await compterUtilisateurs();
  return combien === null ? null : combien === 0;
}

/**
 * Crée le compte du propriétaire — le PREMIER.
 *
 * Il n'y a personne pour l'approuver : il est approuvé d'office. Mais il
 * n'entre PAS tout de suite : un code part à son courriel, et c'est ce code
 * qui ouvre. Ainsi la toute première entrée prouve déjà qu'on tient la boîte
 * — un courriel mal tapé à l'installation se voit tout de suite, au lieu de
 * se découvrir le jour où il faudrait recevoir un code.
 *
 * On ne se fie PAS à un compte de zéro obtenu d'une base muette : « je ne
 * sais pas » n'est pas « il n'y a personne ».
 */
export async function inscrire(
  req: Request, courrielBrut: unknown, langue: Langue,
): Promise<{ ok: true } | Refus> {
  const courriel = normaliserCourriel(courrielBrut);
  if (!courrielAcceptable(courriel)) return refus(langue, "courrielInvalide", 400);
  if (!process.env.SESSION_SECRET) return refus(langue, "connexionNonConfiguree", 503);
  if (!courrierPret) return refus(langue, "courrierNonConfigure", 503);

  const combien = await compterUtilisateurs();
  if (combien === null) return refus(langue, "nonRelieeBase", 503);
  // LA PORTE EST FERMÉE dès qu'un compte existe. On refuse AVANT de regarder
  // le courriel : répondre « ce courriel est déjà pris » à l'un et
  // « inscriptions fermées » à l'autre dirait qui a un compte ici.
  if (combien > 0) return refus(langue, "inscriptionsFermees", 403);

  const compte = await creerUtilisateur(courriel, "proprietaire", true);
  // LA BASE A LE DERNIER MOT. Trois inscriptions lancées ensemble donnaient
  // trois propriétaires ; l'index « un seul propriétaire » refuse maintenant
  // la seconde, et on répond ce qu'on répond à toute inscription tardive.
  if (compte === "refuse") return refus(langue, "inscriptionsFermees", 403);
  if (!compte) return refus(langue, "inscriptionImpossible", 502);

  // Le code part par le même chemin que tous les autres, frein compris.
  return demanderUnCode(req, { courriel }, langue);
}

/**
 * Le propriétaire ouvre la plateforme à quelqu'un.
 *
 * Un courriel, et c'est tout : il n'y a plus de mot de passe à choisir, à
 * recopier, à transmettre par WhatsApp. La personne reçoit une lettre qui
 * lui dit qu'elle a accès ; pour entrer, elle tape son courriel et reçoit un
 * code.
 *
 * Le compte naît APPROUVÉ (c'est le propriétaire qui crée, et créer EST
 * décider) et INVITÉ (jamais un second propriétaire). Il ne voit RIEN tant
 * qu'on ne lui a pas confié de carte — voir lib/portee.ts.
 *
 * QUI PEUT APPELER CECI : la route s'en assure. Cette fonction ne vérifie
 * rien de tel — elle n'est appelée que de là.
 */
export async function creerParLeProprietaire(
  courrielBrut: unknown, adresse: string, langue: Langue,
): Promise<{ ok: true; id: number } | Refus> {
  const courriel = normaliserCourriel(courrielBrut);
  if (!courrielAcceptable(courriel)) return refus(langue, "courrielInvalide", 400);

  // Ici on distingue « déjà pris » : celui qui lit est le propriétaire, chez
  // lui. Le secret sur qui a un compte protège des inconnus, pas de lui.
  if (await utilisateurParCourriel(courriel)) {
    return refus(langue, "courrielDejaPris", 409);
  }
  const compte = await creerUtilisateur(courriel, "invite", true);
  if (compte === "refuse") return refus(langue, "courrielDejaPris", 409);
  if (!compte) return refus(langue, "inscriptionImpossible", 502);

  // La lettre d'invitation part APRÈS la réponse : une boîte lente ne doit
  // pas faire attendre l'écran. Si elle ne part pas, rien n'est perdu — la
  // personne entrera de la même façon, en demandant son code.
  after(async () => {
    if (courrierPret && !(await envoyerInvitation(courriel, adresse, langue))) {
      noterIncident("Une lettre d'invitation n'a pas pu partir : le service de courrier l'a refusée.");
    }
  });
  return { ok: true, id: compte.id };
}
