import { variablesInconnues } from "@noyau/codes";
import { estNature } from "@noyau/natures";
import {
  boitierMuet, carteDeLaSession, carteDuSms, creerCommande, demandeDuGeste, relie,
  terminalDeLaCarte, terminalVise,
} from "@/lib/serveur";
import { langueDemandee } from "@/lib/langue-serveur";
import { maniement, sujetDe, TOUT, voitLaCarte } from "@/lib/portee";
import {
  GESTES_DE_DEMONSTRATION, demandeJouee, estDemonstration,
} from "@/lib/demonstration";
import { erreurApi } from "@noyau/textes/api";
import { codeAComposer, texteDeReponse } from "@noyau/deroule";

export const dynamic = "force-dynamic";

// Les seules demandes que le guichet accepte — tout le reste est refusé.
const GENRES = new Set([
  "solde", "ussd", "ussd_reponse", "ussd_fin", "recu", "identite",
  "raccourci",
]);

/**
 * Dépose une demande pour le terminal — sur une carte QU'ON TIENT.
 *
 * Déposer une demande ici, ce n'est pas consulter un écran : c'est faire
 * composer un code sur une vraie carte SIM, avec de vrais francs derrière.
 * Le verrou de la plateforme ne suffit pas — il vérifie qu'une session est
 * valable, pas à QUI elle appartient.
 *
 * Le propriétaire manie toutes les cartes. Celui à qui il en a CONFIÉ une la
 * manie comme si elle était la sienne — elle l'est : composer, répondre au
 * menu, raccrocher, établir un reçu, la renommer. Sur une carte qu'on ne lui
 * a pas confiée, rien. Le carnet des boutons, lui, n'appartient à aucune
 * carte (il sert à toutes celles d'un opérateur) : il reste au propriétaire.
 *
 * Chaque geste de session porte sa carte, réponses et raccrochage compris :
 * sans elle, une réponse d'un titulaire tomberait dans la session qu'un
 * autre a ouverte sur une autre carte. Le robot revérifie de son côté.
 *
 * Le corps n'est JAMAIS journalisé : une réponse peut porter le code secret,
 * qui ne doit laisser aucune trace ici — le robot le masque en base sitôt lu.
 */
export async function POST(req: Request) {
  // LA LANGUE DE L'ÉCRAN : l'adresse d'abord (`?langue=fr`), puis le cookie.
  // Le téléphone n'a pas de cookie : avec le cookie seul, il recevait ses
  // refus en anglais — « The shop's box has stopped checking in » sur un
  // téléphone réglé en français — et le robot lui répondait en anglais.
  const langue = await langueDemandee(req);

  // LA DÉMONSTRATION NE DÉPOSE RIEN. Aucune ligne n'entre dans la table des
  // commandes, aucun robot ne la lit : la « réponse de l'opérateur » est
  // calculée, et voyage dans le numéro rendu (voir lib/demonstration.ts).
  if (await estDemonstration(req)) {
    const corps = await req.json().catch(() => null);
    const genre = typeof corps?.type === "string" ? corps.type : "";
    if (!GESTES_DE_DEMONSTRATION.has(genre)) {
      return Response.json(
        { erreur: erreurApi(langue, genre === "recu" ? "recuPasEnDemonstration"
                                                     : "reserveAuProprietaire") },
        { status: 403 });
    }
    const brut = corps?.parametres ?? {};
    // La vitrine refuse comme la vraie porte : un code coupé n'est pas joué.
    const code = typeof brut.code === "string" ? codeAComposer(brut.code) : { code: "" };
    if ("refus" in code) {
      return Response.json({ erreur: erreurApi(langue, code.refus) }, { status: 400 });
    }
    const texte = typeof brut.texte === "string" ? texteDeReponse(brut.texte) : { texte: "" };
    if ("refus" in texte) {
      return Response.json({ erreur: erreurApi(langue, texte.refus) }, { status: 400 });
    }
    return Response.json({
      id: demandeJouee(genre, {
        code: code.code,
        texte: texte.texte,
        secret: brut.secret === true,
      }),
    });
  }

  // Sans SESSION_SECRET, la plateforme n'a AUCUN verrou : le middleware
  // laisse tout passer. Refuser ici donnerait l'illusion d'une porte fermée
  // devant une maison ouverte, et casserait le développement local pour rien.
  const main = process.env.SESSION_SECRET ? await maniement(req) : TOUT;
  if (!main) {
    return Response.json(
      { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
  }
  const corps = await req.json().catch(() => null);
  const genre = typeof corps?.type === "string" ? corps.type : "";
  if (!GENRES.has(genre)) {
    return Response.json({ erreur: erreurApi(langue, "demandeInconnue") }, { status: 400 });
  }

  const brut = corps?.parametres ?? {};
  // On ne laisse passer que les champs attendus, bornés et nettoyés.
  const parametres: Record<string, unknown> = {};
  // CE QUI PART AU BOÎTIER SE REFUSE, IL NE SE COUPE PAS. Le code était
  // coupé à 32 caractères : un raccourci valide de 34 partait avec 250 000 F
  // devenus 25 000 et sans son « # » final. Voir `@noyau/deroule`.
  if (typeof brut.code === "string") {
    const lu = codeAComposer(brut.code);
    if ("refus" in lu) return Response.json({ erreur: erreurApi(langue, lu.refus) }, { status: 400 });
    parametres.code = lu.code;
  }
  if (typeof brut.texte === "string") {
    // Guillemets, retours à la ligne et caractères de contrôle retirés : en
    // mode GSM, un « " » ou un « \r » refermerait la chaîne de la commande AT
    // et injecterait des ordres au modem. Le terminal ré-échappe de son côté ;
    // ici on nettoie à l'entrée — et une réponse trop longue est refusée.
    const lu = texteDeReponse(brut.texte);
    if ("refus" in lu) return Response.json({ erreur: erreurApi(langue, lu.refus) }, { status: 400 });
    parametres.texte = lu.texte;
  }
  if (brut.secret === true) parametres.secret = true;
  if (typeof brut.compte === "string") parametres.compte = brut.compte.slice(0, 40);
  // La carte visée par une session USSD : l'ICCID, seul nom sans ambiguïté
  // d'une puce. Sans lui, le robot compose sur sa première carte — et avec
  // deux SIM, une opération Orange partirait sur la MTN.
  if (typeof brut.carte === "string") {
    const carte = brut.carte.replace(/\D/g, "").slice(0, 22);
    if (carte) parametres.carte = carte;
  }
  // La nature choisie pour un reçu : une nature connue, rien d'autre ne passe.
  if (estNature(brut.nature)) {
    parametres.nature = brut.nature;
  }
  if (Number.isInteger(brut.source_id) && brut.source_id > 0) {
    parametres.source_id = brut.source_id;
  }
  // Le terminal visé, quand la demande concerne un SMS précis : celui qui l'a
  // reçu. Sans lui, la demande part au dernier terminal qui a donné signe de
  // vie — juste avec deux boîtiers, `source_id` viserait le mauvais journal.
  //
  // Il ne sert QU'AUX DEMANDES SANS CARTE. Le téléphone l'envoie aussi avec
  // un geste sur une carte — le terminal qu'IL croit vivant, « le dernier à
  // avoir parlé » — et ce champ passait avant la carte : dès deux boîtiers,
  // un dépôt sur une carte d'Akwa partait à Douala. Voir plus bas.
  const terminalCible = typeof corps?.terminal === "string"
    ? corps.terminal.replace(/[^\w.-]/g, "").slice(0, 64)
    : null;
  // LA CLÉ D'INTENTION — un geste, une clé. Deux envois de la même clé sont
  // le même geste : la base n'enregistre qu'une demande, et l'écran suit
  // celle-là. C'est ce qui empêche qu'un code complet (bénéficiaire ET
  // montant) soit composé deux fois, donc que l'argent parte deux fois,
  // quand une requête est présentée deux fois sans que personne l'ait voulu.
  // Bornée et nettoyée comme le reste : elle finit dans une requête.
  const cleIntention = typeof corps?.cle === "string"
    ? corps.cle.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64) || null
    : null;
  // Réglage de l'identité d'une carte : l'ICCID vise la puce, le numéro et le
  // nom sont nettoyés ici puis revérifiés par le terminal, qui reste juge.
  if (typeof brut.iccid === "string") {
    parametres.iccid = brut.iccid.replace(/\D/g, "").slice(0, 22);
  }
  if (typeof brut.numero === "string") {
    const num = brut.numero.replace(/\D/g, "").slice(0, 15);
    if (num) parametres.numero = num;
  }
  if (typeof brut.nom === "string") {
    const nom = brut.nom.trim().slice(0, 40);
    if (nom) parametres.nom = nom;
  }

  // Un réglage d'identité doit viser une carte et porter au moins une valeur.
  if (genre === "identite" &&
      (!parametres.iccid || (!parametres.numero && !parametres.nom))) {
    return Response.json(
      { erreur: erreurApi(langue, "carteOuValeurManquante") }, { status: 400 });
  }

  // Un raccourci USSD, créé ou retiré depuis les Réglages : le robot le
  // range dans SON carnet (même chemin que l'apprentissage), puis la base
  // le renvoie à tous les écrans. Le robot revérifie tout — la première
  // étape doit être un code, les suivantes des choix de menu : jamais un
  // montant, un numéro ou le code secret.
  if (genre === "raccourci") {
    if (typeof brut.operateur === "string") {
      const op = brut.operateur.replace(/[^\w .\-]/g, "").trim().slice(0, 24);
      if (op) parametres.operateur = op;
    }
    if (typeof brut.cle === "string") {
      const cle = brut.cle.toLowerCase().replace(/[^a-z0-9_\-]/g, "").slice(0, 24);
      if (cle) parametres.cle = cle;
    }
    if (typeof brut.libelle === "string") {
      const libelle = brut.libelle.trim().slice(0, 32);
      if (libelle) parametres.libelle = libelle;
    }
    parametres.action = brut.action === "supprimer" ? "supprimer" : "definir";
    if (Array.isArray(brut.etapes)) {
      // On BORNE avant de nettoyer : un tableau démesuré ne doit pas faire
      // tourner la regex des centaines de milliers de fois (un parcours
      // n'a jamais plus de huit étapes). On tranche donc d'abord.
      //
      // Les accolades passent : un code peut porter des trous à remplir
      // (« *126*1*{numero}*{montant}# »). Elles n'atteignent jamais le modem
      // — le guichet les remplace par des chiffres avant de composer — et le
      // robot revérifie que chaque trou porte un nom qu'il connaît.
      const etapes = brut.etapes
        .slice(0, 8)
        .filter((e: unknown): e is string => typeof e === "string")
        .map((e: string) => e.replace(/[^0-9#*{}a-zA-Z_]/g, "").slice(0, 64))
        .filter(Boolean);
      if (etapes.length) {
        // Une lettre ou une accolade qui SURVIT au bouchage des trous, c'est
        // un trou mal écrit — « {montan » sans fermeture, « numero} » sans
        // ouverture. Sans ce contrôle, le nettoyage l'avalerait en silence
        // et le carnet garderait un code faux, d'apparence valable.
        if (etapes.some((e: string) => /[A-Za-z_{}]/.test(
              e.replace(/\{[A-Za-z_]+\}/g, "0")))) {
          return Response.json(
            { erreur: erreurApi(langue, "variableMalFormee") }, { status: 400 });
        }
        const inconnues = variablesInconnues(etapes);
        if (inconnues.length) {
          return Response.json(
            { erreur: erreurApi(langue, "variableInconnue") }, { status: 400 });
        }
        parametres.etapes = etapes;
      }
    }
    if (!parametres.operateur || !parametres.cle ||
        (parametres.action === "definir" && !parametres.etapes)) {
      return Response.json(
        { erreur: erreurApi(langue, "raccourciIncomplet") }, { status: 400 });
    }
  }

  // QUI DEMANDE. Le menu USSD d'une carte appartient à une PERSONNE : la
  // carte refuse d'y écrire la réponse de quelqu'un d'autre (voir
  // totem/compte.py). C'est la plateforme qui le dit, d'après la session —
  // jamais l'écran : `par` n'est pas dans les champs recopiés plus haut, un
  // téléphone ne peut donc pas se faire passer pour un autre.
  const par = await sujetDe(req);
  if (par) parametres.par = par;

  // UNE RÉPONSE QUI NE DIT PAS SA CARTE PREND CELLE DE SA SESSION.
  //
  // L'application installée sur les téléphones (la 1.0.0) nomme la carte en
  // OUVRANT la session, mais pas dans ses réponses ni en raccrochant. Le
  // guichet exigeait pourtant la carte de chaque geste : celui à qui une
  // carte est confiée ouvrait sa session, puis se voyait refuser son propre
  // code secret — « cette carte ne vous a pas été confiée ». Sur sa carte.
  //
  // La carte d'une réponse, c'est celle de la session où elle tombe : celle
  // de la dernière ouverture déposée PAR LA MÊME PERSONNE. Pas « la dernière
  // ouverture du terminal » : le robot tient maintenant un menu par carte et
  // par personne, et la dernière ouverture du terminal peut être celle de
  // quelqu'un d'autre, sur une autre carte — la réponse de la première
  // personne serait alors refusée par sa propre carte. Et pas « le dernier
  // terminal vivant » non plus : la session peut être sur un autre boîtier.
  //
  // La portée se vérifie ensuite sur cette carte, comme si l'écran l'avait
  // nommée — et la carte elle-même, au robot, refuse d'écrire une réponse
  // dans un menu qui n'est pas à cette personne.
  if ((genre === "ussd_reponse" || genre === "ussd_fin")
      && typeof parametres.carte !== "string" && relie) {
    const carte = await carteDeLaSession(par, terminalCible);
    if (carte) parametres.carte = carte;
  }

  // LA CARTE DU GESTE, POUR CELUI QUI N'A PAS TOUT. Elle se lit dans ce que
  // la demande vise — et une demande dont on ne retrouve pas la carte est
  // refusée : dans le doute, on ne compose pas.
  if (!main.tout) {
    if (genre === "raccourci") {
      return Response.json(
        { erreur: erreurApi(langue, "reserveAuProprietaire") }, { status: 403 });
    }
    // « Actualiser » ne vise pas une carte (le terminal republie l'état de
    // toutes) : il suffit d'en tenir une. Sans carte, on ne demande rien.
    if (genre === "solde" ? main.cartes.length === 0 : false) {
      return Response.json(
        { erreur: erreurApi(langue, "carteNonConfiee") }, { status: 403 });
    }
    if (genre !== "solde") {
      const carte = genre === "identite" ? parametres.iccid
        : genre === "recu"
          ? (typeof parametres.source_id === "number" && relie
            ? await carteDuSms({ source: parametres.source_id, terminal: terminalCible })
            : null)
          : parametres.carte;
      if (typeof carte !== "string" || !voitLaCarte(main, carte)) {
        return Response.json(
          { erreur: erreurApi(langue, "carteNonConfiee") }, { status: 403 });
      }
    }
  }

  // La langue voyage avec la demande : le terminal répond dans la langue de
  // l'écran qui l'a déposée (les réponses du réseau, elles, restent intactes).
  parametres.langue = langue;

  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }

  // CE GESTE A-T-IL DÉJÀ SA DEMANDE ? On le regarde AVANT de juger le
  // boîtier. Un geste rejoué — la réponse du premier envoi s'est perdue —
  // pendant que le boîtier se tait s'entendait dire « rien n'est parti »,
  // alors que sa demande attendait dans la base et partirait à son retour,
  // sans que l'écran puisse la suivre ni l'annuler. La même clé rend la même
  // demande, quoi qu'il soit arrivé au boîtier depuis. Celle d'un autre ne
  // se rend pas : on continue comme si de rien n'était.
  if (cleIntention) {
    const deja = await demandeDuGeste(cleIntention);
    if (deja
        && (!deja.par || !par || deja.par === par)
        && (main.tout || (deja.carte != null && voitLaCarte(main, deja.carte)))) {
      return Response.json({ id: deja.id });
    }
  }

  // À QUEL TERMINAL. Une demande qui nomme sa carte part au terminal qui la
  // porte — jamais « au dernier qui a donné signe de vie », qui, dès deux
  // boîtiers, composerait chez un autre (ou nulle part). Et jamais au
  // terminal que l'ÉCRAN nomme : une application installée l'envoie avec
  // chaque geste, et c'est la carte qui sait où elle est, pas l'écran.
  //
  // Une demande sans carte (actualiser, raccourci, reçu d'un SMS précis)
  // garde l'ancien chemin : le terminal nommé, à défaut le dernier vivant.
  const carteVisee = genre === "identite" ? parametres.iccid
    : genre.startsWith("ussd") ? parametres.carte : undefined;
  let terminal: string | null;
  if (typeof carteVisee === "string" && carteVisee) {
    const adresse = await terminalDeLaCarte(carteVisee);
    // Son boîtier parle et ne la voit plus, ou il est sorti de la flotte :
    // personne ne la composera.
    if (!adresse || adresse.presence === "retiree") {
      return Response.json(
        { erreur: erreurApi(langue, "carteDansAucunTerminal"), raison: "carte_absente" },
        { status: 409 });
    }
    // Son boîtier se tait : RIEN NE PART. Déposée quand même, la demande
    // attendrait son retour, et il la composerait des heures plus tard pour
    // un écran qui a abandonné.
    if (adresse.muet) {
      return Response.json(
        { erreur: erreurApi(langue, "boitierMuet"), raison: "boitier_muet" },
        { status: 409 });
    }
    // En place — ou « inconnue » d'un boîtier qui parle : il vient de
    // revenir et n'a pas encore republié ses cartes. Elle part chez lui, et
    // c'est lui qui dira si la puce n'y est plus.
    terminal = adresse.terminal;
  } else {
    terminal = terminalCible || (await terminalVise());
    // Même règle sans carte : on ne dépose rien pour un boîtier qui se tait.
    if (terminal && await boitierMuet(terminal)) {
      return Response.json(
        { erreur: erreurApi(langue, "boitierMuet"), raison: "boitier_muet" },
        { status: 409 });
    }
  }
  const id = await creerCommande(genre, parametres, terminal, cleIntention);
  if (id == null) {
    return Response.json({ erreur: erreurApi(langue, "depotImpossible") }, { status: 502 });
  }
  return Response.json({ id });
}
