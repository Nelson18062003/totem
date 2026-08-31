import { variablesInconnues } from "@noyau/codes";
import { estNature } from "@noyau/natures";
import { creerCommande, relie } from "@/lib/serveur";
import { langueServeur } from "@/lib/langue-serveur";
import { estProprietaire } from "@/lib/qui";
import { erreurApi } from "@noyau/textes/api";

export const dynamic = "force-dynamic";

// Les seules demandes que le guichet accepte — tout le reste est refusé.
const GENRES = new Set([
  "solde", "ussd", "ussd_reponse", "ussd_fin", "recu", "identite",
  "raccourci",
]);

/**
 * Dépose une demande pour le terminal — RÉSERVÉ AU PROPRIÉTAIRE.
 *
 * Déposer une demande ici, ce n'est pas consulter un écran : c'est faire
 * composer un code sur une vraie carte SIM, avec de vrais francs derrière.
 * Le verrou de la plateforme ne suffisait pas — il vérifie qu'une session
 * est valable, pas à QUI elle appartient. N'importe quel compte approuvé,
 * y compris un invité, pouvait ainsi lancer une opération réelle.
 *
 * Un invité voit les écrans. Il ne touche pas aux cartes.
 *
 * Le corps n'est JAMAIS journalisé : une réponse peut porter le code secret,
 * qui ne doit laisser aucune trace ici — le robot le masque en base sitôt lu.
 */
export async function POST(req: Request) {
  const langue = await langueServeur();

  // Sans SESSION_SECRET, la plateforme n'a AUCUN verrou : le middleware
  // laisse tout passer. Refuser ici donnerait l'illusion d'une porte fermée
  // devant une maison ouverte, et casserait le développement local pour rien.
  if (process.env.SESSION_SECRET && !(await estProprietaire(req))) {
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
  if (typeof brut.code === "string") {
    const code = brut.code.replace(/[^0-9#*]/g, "").slice(0, 32);
    if (!code) return Response.json({ erreur: erreurApi(langue, "codeVide") }, { status: 400 });
    parametres.code = code;
  }
  if (typeof brut.texte === "string") {
    // On retire guillemets, retours à la ligne et caractères de contrôle : en
    // mode GSM, un « " » ou un « \r » dans une réponse USSD refermerait la
    // chaîne de la commande AT et injecterait des ordres au modem (ex. effacer
    // les SMS). Le terminal ré-échappe de son côté ; ici on nettoie à l'entrée.
    // eslint-disable-next-line no-control-regex
    parametres.texte = brut.texte.replace(/["\r\n\x00-\x1f]/g, "").slice(0, 120);
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

  // La langue voyage avec la demande : le terminal répond dans la langue de
  // l'écran qui l'a déposée (les réponses du réseau, elles, restent intactes).
  parametres.langue = langue;

  if (!relie) {
    return Response.json({ erreur: erreurApi(langue, "nonRelieeBase") }, { status: 503 });
  }
  const id = await creerCommande(genre, parametres, terminalCible,
                                 cleIntention);
  if (id == null) {
    return Response.json({ erreur: erreurApi(langue, "depotImpossible") }, { status: 502 });
  }
  return Response.json({ id });
}
