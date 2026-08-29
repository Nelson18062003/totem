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
//   1. UN COMPTE — un courriel et un mot de passe, rangés en base. C'est le
//      chemin normal, celui qui sait qui est entré et permet d'ouvrir ou de
//      fermer à quelqu'un sans toucher aux autres.
//
//   2. LA CLÉ DE SECOURS — l'ancien mot de passe unique, dans la variable
//      d'environnement `TOTEM_MOT_DE_PASSE`. Elle n'existe que si elle est
//      posée. Pourquoi la garder : les comptes vivent dans Supabase, et si
//      Supabase ne répond pas, PLUS PERSONNE n'entre — y compris le
//      propriétaire, y compris pour constater la panne. Une base de données
//      injoignable ne doit pas être un verrou sur sa propre maison.
//
// Les deux passent par le MÊME frein : alterner l'une et l'autre ne double
// pas la cadence des essais.

import {
  compterUtilisateurs, creerUtilisateur, noterConnexion, utilisateurAVerifier,
} from "@/lib/serveur";
import {
  aRafraichir, courrielAcceptable, empreinter, motDePasseAcceptable,
  normaliserCourriel, verifier,
} from "@/lib/motdepasse";
import { egaliteConstante, signerSession, sujetDuCompte } from "@/lib/session";
import { attendreLeFrein, cleDeFrein, noterEchec, oublierEchecs } from "@/lib/frein";
import { erreurApi } from "@noyau/textes/api";
import type { Langue } from "@noyau/langue";

/**
 * Une empreinte factice, sur laquelle on fait travailler PBKDF2 quand le
 * courriel n'existe pas.
 *
 * Sans elle, un courriel inconnu répondrait tout de suite et un courriel
 * connu répondrait un cinquième de seconde plus tard : il suffirait de
 * chronométrer pour savoir qui a un compte ici. On paie donc le même prix
 * dans les deux cas. Le mot de passe qui l'a produite n'existe pas.
 */
const LEURRE =
  "pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export type Entree =
  | { ok: true; jeton: string; sujet: string }
  | { ok: false; erreur: string; statut: number };

function refus(langue: Langue, cle: Parameters<typeof erreurApi>[1], statut: number): Entree {
  return { ok: false, erreur: erreurApi(langue, cle), statut };
}

/**
 * Décide si l'on entre, et rend le jeton signé le cas échéant.
 *
 * `corps` est ce que la requête portait : `{ courriel, motdepasse }` pour un
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
  const motdepasse = typeof champs.motdepasse === "string" ? champs.motdepasse : "";

  // Le frein, avant tout examen : un seau partagé par les deux portes.
  const cle = cleDeFrein(req);
  await attendreLeFrein(cle);

  if (!motdepasse) return refus(langue, "identifiantsIncorrects", 401);

  // --- Chemin 1 : un compte ------------------------------------------------
  if (courriel) {
    const trouve = await utilisateurAVerifier(courriel);
    // Même quand le compte n'existe pas, on fait tourner PBKDF2 : voir LEURRE.
    const bon = await verifier(motdepasse, trouve?.empreinte ?? LEURRE);

    if (!trouve || !bon) {
      noterEchec(cle);
      return refus(langue, "identifiantsIncorrects", 401);
    }
    if (!trouve.compte.approuve) {
      // Le mot de passe était bon : ce n'est pas une tentative d'intrusion,
      // on ne freine pas. Mais la porte ne s'ouvre pas pour autant.
      return refus(langue, "compteEnAttente", 403);
    }
    oublierEchecs(cle);
    // On profite d'avoir le mot de passe en main pour refaire l'empreinte si
    // le nombre de tours a été augmenté depuis. Un échec ici n'empêche pas
    // d'entrer : c'est un entretien, pas une condition.
    const rafraichie = aRafraichir(trouve.empreinte)
      ? await empreinter(motdepasse) : undefined;
    await noterConnexion(trouve.compte.id, rafraichie);

    const sujet = sujetDuCompte(trouve.compte.id);
    return { ok: true, jeton: await signerSession(secret, sujet), sujet };
  }

  // --- Chemin 2 : la clé de secours ---------------------------------------
  if (!secours) return refus(langue, "identifiantsIncorrects", 401);
  if (!(await egaliteConstante(motdepasse, secours))) {
    noterEchec(cle);
    return refus(langue, "identifiantsIncorrects", 401);
  }
  oublierEchecs(cle);
  return { ok: true, jeton: await signerSession(secret, "secours"), sujet: "secours" };
}

/**
 * Crée un compte.
 *
 * LE PREMIER COMPTE EST CELUI DU PROPRIÉTAIRE. Il n'y a personne pour
 * l'approuver, et c'est celui qui installe la plateforme : il est approuvé
 * d'office. Tous les suivants attendent que le propriétaire ouvre.
 *
 * On ne se fie PAS à un compte de zéro obtenu d'une base muette : « je ne
 * sais pas » n'est pas « il n'y a personne ». Confondre les deux ferait du
 * prochain inscrit un propriétaire parce que Supabase a hoqueté.
 */
export async function inscrire(
  courrielBrut: unknown, motdepasse: unknown, langue: Langue,
): Promise<Entree> {
  const courriel = normaliserCourriel(courrielBrut);
  if (!courrielAcceptable(courriel)) return refus(langue, "courrielInvalide", 400);
  if (typeof motdepasse !== "string" || !motDePasseAcceptable(motdepasse)) {
    return refus(langue, "motDePasseTropCourt", 400);
  }

  const combien = await compterUtilisateurs();
  if (combien === null) return refus(langue, "nonRelieeBase", 503);

  if (await utilisateurAVerifier(courriel)) {
    return refus(langue, "courrielDejaPris", 409);
  }

  const premier = combien === 0;
  const compte = await creerUtilisateur(
    courriel, await empreinter(motdepasse),
    premier ? "proprietaire" : "invite", premier);
  if (!compte) return refus(langue, "inscriptionImpossible", 502);

  const secret = process.env.SESSION_SECRET || "";
  // Le propriétaire entre tout de suite : il vient de créer la maison.
  // Un invité repart avec un compte et sans session — il attend.
  if (premier && secret) {
    const sujet = sujetDuCompte(compte.id);
    return { ok: true, jeton: await signerSession(secret, sujet), sujet };
  }
  return refus(langue, "compteEnAttente", 202);
}
