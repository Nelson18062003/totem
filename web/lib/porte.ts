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
  compterUtilisateurs, creerUtilisateur, noterConnexion, supprimerUtilisateur,
  utilisateurAVerifier,
} from "@/lib/serveur";
import { compteConnecte } from "@/lib/qui";
import {
  aRafraichir, courrielAcceptable, empreinter, motDePasseAcceptable,
  normaliserCourriel, verifier,
} from "@/lib/motdepasse";
import { SUJET_DEMONSTRATION, egaliteConstante, signerSession, sujetDuCompte } from "@/lib/session";
import {
  COURRIEL_DEMONSTRATION, MOTDEPASSE_DEMONSTRATION, demonstrationOuverte,
  estDemonstration,
} from "@/lib/demonstration";
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

function refus(
  langue: Langue, cle: Parameters<typeof erreurApi>[1], statut: number,
): Extract<Entree, { ok: false }> {
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
  //
  // LE REFUS ARRIVE AVANT LE CALCUL. Vérifier un mot de passe coûte au
  // serveur 210 000 tours de PBKDF2, volontairement — cher pour qui essaie,
  // cher pour nous aussi. Passé le mur, on répond sans rien calculer : sinon
  // une rafale d'essais devient une rafale de calculs, et la plateforme
  // s'écroule d'elle-même sous les tentatives.
  const cle = cleDeFrein(req);
  if (!(await attendreLeFrein(cle))) {
    return refus(langue, "tropDEssais", 429);
  }

  if (!motdepasse) return refus(langue, "identifiantsIncorrects", 401);

  // --- Chemin 0 : la démonstration ---------------------------------------
  // Son courriel n'est celui d'aucun compte : il n'existe pas en base, et
  // n'y existera jamais. Un mauvais mot de passe compte comme un échec,
  // comme partout — des identifiants publics ne sont pas une raison de
  // laisser essayer à l'infini.
  if (courriel === COURRIEL_DEMONSTRATION && demonstrationOuverte()) {
    if (!(await egaliteConstante(motdepasse, MOTDEPASSE_DEMONSTRATION))) {
      noterEchec(cle);
      return refus(langue, "identifiantsIncorrects", 401);
    }
    oublierEchecs(cle);
    return {
      ok: true, jeton: await signerSession(secret, SUJET_DEMONSTRATION),
      sujet: SUJET_DEMONSTRATION,
    };
  }

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
 * Peut-on créer un compte ici ?
 *
 * OUI, tant que la base des comptes répond. TOTEM est une application grand
 * public : n'importe qui la télécharge, crée son compte et entre. Ce qui
 * protège la maison n'est plus une porte fermée, c'est ce qu'un compte neuf
 * VOIT — rien, tant que TOTEM ne lui a attribué aucune carte (voir
 * lib/portee.ts, et `verifier-les-cartes` qui l'attaque).
 *
 * Rend `null` si la base ne répond pas : « je ne sais pas » n'est ni oui ni
 * non, et l'écran doit pouvoir le dire ainsi.
 */
export async function inscriptionPossible(): Promise<boolean | null> {
  const combien = await compterUtilisateurs();
  return combien === null ? null : true;
}

/** Ce que l'application envoie pour créer un compte. Six champs, rien de
 *  plus : de quoi attribuer une carte à la bonne personne, et la joindre. */
export type DemandeDeCompte = {
  prenom?: unknown; nom?: unknown; adresse?: unknown;
  telephone?: unknown; courriel?: unknown; motdepasse?: unknown;
};

// LES BORNES. Une plateforme ouverte au monde entier reçoit tôt ou tard ce
// que l'écran n'a pas prévu : un nom de dix mille caractères, une adresse
// faite d'espaces, un « numéro » qui est un script. La base refait les mêmes
// contrôles (migrations/20261004_inscription_publique.sql) : une règle qui
// ne vivrait que dans le code tiendrait jusqu'au jour où un autre chemin
// écrit dans la table.
const NOM_MAX = 60;
const ADRESSE_MAX = 200;

/**
 * Un numéro de téléphone plausible, sous UNE forme : un « + » facultatif,
 * puis 8 à 15 chiffres (la longueur maximale d'un numéro international).
 *
 * On accepte ce qu'une personne tape ou colle — « +237 6 77 12 34 56 »,
 * « (677) 12-34-56 » — et on range les seuls chiffres. Une lettre, un second
 * « + », un « + » au milieu : ce n'est pas un numéro, on refuse plutôt que
 * de deviner.
 */
export function telephonePropre(v: unknown): string {
  if (typeof v !== "string") return "";
  const sansSeparateurs = v.trim().replace(/[\s.\-()\u00a0]/g, "");
  return /^\+?[0-9]{8,15}$/.test(sansSeparateurs) ? sansSeparateurs : "";
}

/** Une adresse postale, telle qu'elle s'affichera : sans caractères de
 *  contrôle, sans espaces en trop. Vide si elle ne tient pas dans les
 *  bornes — l'appelant refuse alors. */
function adressePropre(v: unknown): string {
  if (typeof v !== "string") return "";
  const a = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return a.length > 0 && a.length <= ADRESSE_MAX ? a : "";
}

/**
 * Crée un compte — l'inscription PUBLIQUE, celle de l'application.
 *
 * LE COMPTE EST ACTIF TOUT DE SUITE. Il entre, avec sa session, sans
 * attendre personne. Il est « invite » : il ne voit QUE les cartes que TOTEM
 * lui attribue, c'est-à-dire rien du tout au début — ni carte, ni SMS, ni
 * bilan, ni pastille, ni coordonnées. L'application lui montre alors
 * « Ajouter ma carte ».
 *
 * LE TOUT PREMIER COMPTE d'une plateforme neuve reste le propriétaire :
 * c'est celui qui installe la plateforme, et c'est lui qui attribuera les
 * cartes. Trois inscriptions lancées ensemble sur une plateforme neuve
 * voient toutes « zéro compte » : la BASE tranche (index « un seul
 * propriétaire »), et celles qui ont perdu deviennent des comptes
 * ordinaires — sans jamais apprendre qu'il y a eu une course.
 *
 * UN COURRIEL DÉJÀ PRIS NE SE TRAHIT PAS. La réponse est la même que pour
 * toute inscription impossible : « Impossible de créer ce compte. Si vous en
 * avez déjà un, connectez-vous. » Et elle coûte le même temps : l'empreinte
 * du mot de passe est calculée AVANT de savoir si l'adresse est libre — c'est
 * la base qui le dit, au moment d'écrire. Sinon il suffirait de
 * chronométrer pour savoir qui a un compte ici.
 *
 * LE FREIN. Créer un compte coûte au serveur 210 000 tours de PBKDF2 ; une
 * rafale d'inscriptions serait une rafale de calculs, et une façon de
 * sonder les courriels. Elle passe donc par le frein des mots de passe, dans
 * un seau à elle (par adresse) : un passant qui crée son compte ne ralentit
 * pas le propriétaire qui se connecte.
 *
 * On ne se fie PAS à un compte de zéro obtenu d'une base muette : « je ne
 * sais pas » n'est pas « il n'y a personne ». Confondre les deux ferait du
 * prochain inscrit un propriétaire parce que Supabase a hoqueté.
 */
export async function inscrire(
  req: Request, demande: DemandeDeCompte, langue: Langue,
): Promise<Entree & { proprietaire?: boolean }> {
  // 1. LA FORME — avant tout calcul. Un champ PRÉSENT doit être juste ; un
  //    champ ABSENT n'est toléré que pour le tout premier compte (voir 3).
  const present = (v: unknown) => typeof v === "string" && v.trim() !== "";
  const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (texte(demande.prenom).length > NOM_MAX || texte(demande.nom).length > NOM_MAX
      || texte(demande.adresse).length > ADRESSE_MAX) {
    return refus(langue, "champTropLong", 400);
  }
  const prenom = nomPropre(demande.prenom);
  const nom = nomPropre(demande.nom);
  const adresse = adressePropre(demande.adresse);
  const telephone = telephonePropre(demande.telephone);
  if (present(demande.telephone) && !telephone) return refus(langue, "telephoneInvalide", 400);
  if (present(demande.adresse) && !adresse) return refus(langue, "adresseManquante", 400);
  /** Le premier champ qui manque, ou `null` quand l'identité est complète. */
  const manque = (): Parameters<typeof erreurApi>[1] | null =>
    !prenom || !nom ? "nomManquant"
      : !adresse ? "adresseManquante"
        : !telephone ? "telephoneInvalide" : null;

  const courriel = normaliserCourriel(demande.courriel);
  if (!courrielAcceptable(courriel)) return refus(langue, "courrielInvalide", 400);
  const motdepasse = demande.motdepasse;
  if (typeof motdepasse !== "string" || !motDePasseAcceptable(motdepasse)) {
    return refus(langue, "motDePasseTropCourt", 400);
  }

  // Le secret se vérifie AVANT de créer quoi que ce soit : un compte créé
  // sans session à rendre existerait durablement derrière un message
  // d'erreur. Un refus ne doit rien laisser derrière lui.
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return refus(langue, "connexionNonConfiguree", 503);

  // 2. LA BASE RÉPOND-ELLE, et y a-t-il déjà quelqu'un ?
  const combien = await compterUtilisateurs();
  if (combien === null) return refus(langue, "nonRelieeBase", 503);

  // 3. L'IDENTITÉ COMPLÈTE, sauf pour celui qui installe la plateforme.
  //    Le tout premier compte d'une plateforme NEUVE est son propriétaire :
  //    il la pose, souvent depuis un script, avant même que l'application
  //    existe. Pour lui seul les quatre champs d'identité sont facultatifs
  //    (justes s'ils sont donnés). Tous les autres comptes les donnent.
  if (combien > 0 && manque()) return refus(langue, manque()!, 400);

  // 4. LE FREIN — un seau à part, par adresse, et un mur plus bas que celui
  //    de la connexion : personne ne crée vingt comptes en un quart d'heure.
  const cle = `inscription|${cleDeFrein(req)}`;
  if (!(await attendreLeFrein(cle, { commun: false, mur: MUR_INSCRIPTION }))) {
    return refus(langue, "tropDEssais", 429);
  }

  // 5. L'ÉCRITURE. L'empreinte se calcule AVANT de savoir si l'adresse est
  //    libre : c'est la base qui le dit, au moment d'écrire, et la durée de
  //    la réponse ne le trahit pas. Le courriel de la vitrine n'est à
  //    personne : il ne devient pas un compte — même réponse, même prix.
  const empreinte = await empreinter(motdepasse);
  if (courriel === COURRIEL_DEMONSTRATION) {
    return refus(langue, "inscriptionRefusee", 409);
  }

  const identite = { prenom, nom, adresse, telephone };
  let proprietaire = combien === 0;
  let compte = await creerUtilisateur(
    courriel, empreinte, proprietaire ? "proprietaire" : "invite", true, identite);

  // LA BASE A LE DERNIER MOT. Le comptage ci-dessus ne prouve rien : entre
  // lui et l'écriture, il s'est écoulé un aller-retour et le calcul de
  // l'empreinte. Si un autre a été plus rapide, l'index « un seul
  // propriétaire » refuse — et l'on retente en compte ordinaire, qui doit
  // alors avoir son identité complète. Si c'est le COURRIEL qui était pris,
  // le second essai bute de même, et la réponse est la réponse neutre.
  if (compte === "refuse" && proprietaire) {
    proprietaire = false;
    if (manque()) return refus(langue, manque()!, 400);
    compte = await creerUtilisateur(courriel, empreinte, "invite", true, identite);
  }
  if (compte === "refuse") return refus(langue, "inscriptionRefusee", 409);
  if (!compte) return refus(langue, "inscriptionImpossible", 502);

  const sujet = sujetDuCompte(compte.id);
  return {
    ok: true, jeton: await signerSession(secret, sujet), sujet, proprietaire,
  };
}

/** Le mur des inscriptions : combien d'essais depuis UNE adresse dans la
 *  fenêtre du frein (un quart d'heure) avant de refuser sans calculer. */
const MUR_INSCRIPTION = 20;

/**
 * Supprimer SON compte — le sien, et aucun autre.
 *
 * Apple l'exige de toute application où l'on peut créer un compte : la
 * suppression doit se faire DANS l'application, pas par un courriel.
 *
 * LA PREUVE AVANT L'EFFACEMENT, comme pour changer de mot de passe : une
 * session, c'est un téléphone resté ouvert sur une table. Sans le mot de
 * passe, quiconque ramasse l'appareil effacerait le compte de son
 * propriétaire. Le même frein que la connexion : essayer des mots de passe
 * ici doit coûter aussi cher qu'ailleurs.
 *
 * DEUX SUJETS NE SE SUPPRIMENT PAS PAR LÀ :
 *   · le PROPRIÉTAIRE de la plateforme — c'est lui qui attribue les cartes ;
 *     sans lui, plus personne ne pourrait en recevoir. La base le refuserait
 *     de toute façon (déclencheur « un_proprietaire_reste ») ; on le dit
 *     AVANT, avec une phrase, plutôt qu'avec un échec d'écriture ;
 *   · la VITRINE et la clé de secours — elles ne désignent aucun compte :
 *     il n'y a rien à effacer.
 *
 * Ce qui part avec le compte : ses attributions de cartes et ses téléphones
 * (« on delete cascade » en base). Ce qui reste : les SMS des cartes, qui
 * suivent la CARTE et non la personne.
 */
export async function supprimerSonCompte(
  req: Request, motdepasse: unknown, langue: Langue,
): Promise<{ ok: true } | Extract<Entree, { ok: false }>> {
  const moi = await compteConnecte(req);
  if (!moi) {
    // Pas un compte : la vitrine, ou la clé de secours.
    return refus(langue,
      (await estDemonstration(req)) ? "vitrineNeSeSupprimePas" : "aucunCompteASupprimer",
      403);
  }
  if (moi.role === "proprietaire") return refus(langue, "proprietaireNeSeSupprimePas", 403);

  const cle = cleDeFrein(req);
  if (!(await attendreLeFrein(cle))) return refus(langue, "tropDEssais", 429);

  const trouve = await utilisateurAVerifier(moi.courriel);
  const bon = typeof motdepasse === "string" && motdepasse.length > 0
    && await verifier(motdepasse, trouve?.empreinte ?? LEURRE);
  if (!trouve || !bon) {
    noterEchec(cle);
    return refus(langue, "motDePasseIncorrect", 401);
  }
  oublierEchecs(cle);

  if (!(await supprimerUtilisateur(moi.id))) {
    return refus(langue, "suppressionImpossible", 502);
  }
  return { ok: true };
}

/**
 * Le propriétaire crée un compte pour quelqu'un d'autre.
 *
 * L'inscription publique existe (voir `inscrire`) ; ce chemin-ci reste
 * celui du propriétaire qui pose LUI-MÊME quelqu'un — un vendeur à qui il
 * confie une carte, avec le mot de passe qu'il lui transmet.
 *
 * Le compte naît APPROUVÉ. Ailleurs l'approbation sert à ce que le
 * propriétaire décide ; ici, c'est lui qui crée, et créer EST décider. Un
 * compte qu'on vient de poser soi-même et qu'il faudrait ensuite approuver
 * serait une case à cocher pour rien.
 *
 * Il naît « invite », jamais « proprietaire » : il n'y a qu'un propriétaire,
 * et l'écran des comptes ne doit pas pouvoir en fabriquer un second qui
 * pourrait ensuite fermer la porte au premier.
 *
 * LE PROPRIÉTAIRE DONNE LE PRÉNOM, LE NOM, LE COURRIEL ET LE MOT DE PASSE.
 * Le nom sert à reconnaître la personne dans la liste — « vendeur2@gmail.com »
 * ne dit pas qui c'est.
 *
 * Le compte ne voit RIEN tant qu'on ne lui a pas confié de carte — voir
 * lib/portee.ts.
 *
 * QUI PEUT APPELER CECI : la route s'en assure (`estProprietaire`). Cette
 * fonction ne vérifie rien de tel — elle n'est appelée que de là.
 */
export async function creerParLeProprietaire(
  identiteBrute: { prenom?: unknown; nom?: unknown; courriel?: unknown },
  motdepasse: unknown, langue: Langue,
): Promise<{ ok: true; id: number } | Extract<Entree, { ok: false }>> {
  const courriel = normaliserCourriel(identiteBrute.courriel);
  if (!courrielAcceptable(courriel)) return refus(langue, "courrielInvalide", 400);
  const prenom = nomPropre(identiteBrute.prenom);
  const nom = nomPropre(identiteBrute.nom);
  if (!prenom || !nom) return refus(langue, "nomManquant", 400);
  if (typeof motdepasse !== "string" || !motDePasseAcceptable(motdepasse)) {
    return refus(langue, "motDePasseTropCourt", 400);
  }

  // Ici on distingue « déjà pris » de tout le reste, et c'est voulu : celui
  // qui lit est le propriétaire, chez lui. Le secret sur qui a un compte
  // protège des inconnus, pas de la personne qui tient la maison.
  if (await utilisateurAVerifier(courriel)) {
    return refus(langue, "courrielDejaPris", 409);
  }

  const compte = await creerUtilisateur(
    courriel, await empreinter(motdepasse), "invite", true, { prenom, nom });
  // Deux créations lancées ensemble pour la même adresse : la vérification
  // faite plus haut a vu « libre » des deux côtés, la base n'en garde qu'une.
  // Ici le propriétaire parle à sa propre plateforme — on peut lui dire ce
  // qui s'est passé.
  if (compte === "refuse") return refus(langue, "courrielDejaPris", 409);
  if (!compte) return refus(langue, "inscriptionImpossible", 502);

  // Aucune session n'est rendue : le propriétaire crée un compte POUR
  // QUELQU'UN D'AUTRE. Lui ouvrir une session par-dessus la sienne serait
  // un contresens, et le déconnecterait de son propre compte.
  return { ok: true, id: compte.id };
}

/** Un prénom ou un nom, tel qu'il s'affichera : sans espaces en trop, sans
 *  caractères de contrôle, et borné — c'est un libellé, pas un texte. */
function nomPropre(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
