// Mettre un message dans une boîte mail. Un fournisseur, une requête, rien de plus.
//
// UN SEUL FOURNISSEUR : RESEND. Ce n'est pas une préférence, c'est une
// décision qu'on ne rouvre pas. Trois fournisseurs, ce sont trois clés à faire
// tourner, trois formats d'erreur, et trois chemins par lesquels un message
// peut partir en double le jour d'un incident. Resend demande UNE clé et UNE
// requête HTTP ; `fetch` suffit, donc AUCUNE dépendance npm ne s'ajoute au
// projet. On y a gagné, et on y a renoncé à quelque chose :
//
//   · SES d'Amazon coûte moins cher au message, et exige de signer chaque
//     requête à la main (SigV4). Une centaine de lignes de cryptographie pour
//     économiser des sommes que TOTEM n'atteindra pas avant longtemps.
//   · Le SMTP direct demande une connexion par socket que l'hébergement ne
//     donne pas simplement, et une bibliothèque de plus.
//
// Changer d'avis coûte la réécriture de CETTE fonction, et d'elle seule : rien
// d'autre dans TOTEM ne sait qu'il existe un fournisseur.
//
// DEUX VARIABLES D'ENVIRONNEMENT (sur Vercel : Settings → Environment
// Variables ; en local : web/.env.local) :
//
//   COURRIER_CLE         la clé du fournisseur — server-only, jamais de
//                        NEXT_PUBLIC_, jamais dans un fichier suivi par git
//   COURRIER_EXPEDITEUR  « TOTEM <bonjour@totem.example> ». Le domaine doit
//                        être vérifié chez le fournisseur, sinon tout est
//                        refusé — et c'est aussi ce qui évite le dossier
//                        « indésirables ».
//
// SANS CLÉ, ON N'INVENTE PAS. La fonction ne prétend jamais avoir envoyé. Elle
// rend un échec nommé, et en développement seulement elle écrit le message
// dans la console pour que le travail continue. En production, jamais : le
// journal d'un hébergeur se lit par bien plus de monde qu'on ne l'imagine, et
// six chiffres qui y traînent ouvrent une boutique.
//
// ELLE N'ENTRAVE RIEN. Aucune exception ne sort d'ici. Un fournisseur en panne
// ne doit pas casser la page de quelqu'un qui essayait d'entrer : l'appelant
// reçoit un échec exploitable et décide, lui, quoi montrer à l'écran.
//
// CE QUI SE NOTE, ET CE QUI NE SE NOTE JAMAIS. Qu'un message soit parti se
// note — sinon personne ne peut répondre à « mon opérateur dit qu'il n'a rien
// reçu ». Le CONTENU ne se note nulle part : ni le code, ni le jeton, ni
// l'objet, ni le corps. La table « courriels » n'a pas de colonne pour cela,
// et c'est délibéré.

import { inserer } from "./base";
import { adresseNormalisee } from "./code-entree";
import type { Genre, Message } from "./textes/courrier";

const POSTE = "https://api.resend.com/emails";

export type Courrier = {
  destinataire: string;
  genre: Genre;
  message: Message;
  /** Quand le compte existe déjà. Nul avant l'acceptation d'une invitation. */
  personne?: number | null;
};

/**
 * Ce qui est arrivé au message. Chaque valeur appelle une conduite différente
 * chez l'appelant, c'est pourquoi elles ne sont pas fondues en un « échec ».
 *
 * · « refusee »        : le fournisseur a répondu non. Réessayer ne servira à
 *                        rien tant que rien n'a changé — adresse invalide,
 *                        domaine non vérifié, quota atteint.
 * · « injoignable »    : le réseau. Réessayer a du sens.
 * · « sans_cle »       : TOTEM n'est pas configuré. Ce n'est pas une panne du
 *                        jour, c'est un déploiement incomplet.
 * · « sans_expediteur »: idem, l'autre moitié de la configuration.
 * · « adresse »        : l'adresse visée n'a pas la forme d'une adresse. On ne
 *                        gaspille ni un appel ni une réputation d'expéditeur.
 */
export type Issue =
  | "partie"
  | "refusee"
  | "injoignable"
  | "sans_cle"
  | "sans_expediteur"
  | "adresse";

export type Envoi =
  | { partie: true; reference: string | null }
  | { partie: false; issue: Exclude<Issue, "partie">; dit: string };

/**
 * L'adresse a-t-elle la forme d'une adresse ?
 *
 * Volontairement grossier. Une expression rationnelle qui prétend valider les
 * adresses selon la norme rejette des adresses vraies, et celle d'une
 * commerçante en fait partie un jour ou l'autre. On vérifie seulement qu'il y
 * a une arobase, quelque chose de chaque côté, un point dans le domaine et
 * aucune espace — le reste, c'est le fournisseur qui le dira.
 */
export function adresseCredible(courriel: string): boolean {
  const a = adresseNormalisee(courriel);
  if (/\s/.test(a)) return false;
  const arobase = a.lastIndexOf("@");
  if (arobase < 1 || arobase === a.length - 1) return false;
  return a.slice(arobase + 1).includes(".");
}

/**
 * Noter qu'un message est parti — ou qu'il n'est pas parti.
 *
 * Silencieuse en cas d'échec, comme le journal de la porte : un journal qui
 * empêcherait un message de partir parce qu'il n'a pas pu s'écrire serait pire
 * que pas de journal du tout.
 *
 * L'adresse est notée EN CLAIR, et non sous forme d'empreinte. La base la
 * connaît déjà — « personnes.courriel », « codes_entree.courriel » — donc la
 * hacher ici ne protégerait rien, et rendrait illisible la seule chose que ce
 * journal doit savoir dire : « le 12 à 9 h 04, un message est parti vers cette
 * boîte-là, et le fournisseur l'a accepté ».
 */
async function noter(
  c: Courrier, issue: Issue, detail: string | null, reference: string | null,
): Promise<void> {
  await inserer("courriels", {
    destinataire: adresseNormalisee(c.destinataire),
    personne: c.personne ?? null,
    genre: c.genre,
    issue,
    detail,
    reference,
  });
}

/**
 * Envoyer. Ne jette jamais, ne prétend jamais.
 *
 * L'ordre des contrôles suit le coût : la configuration d'abord (gratuit),
 * l'adresse ensuite (gratuit), l'appel au fournisseur en dernier.
 */
export async function envoyerCourriel(c: Courrier): Promise<Envoi> {
  const cle = process.env.COURRIER_CLE;
  const expediteur = process.env.COURRIER_EXPEDITEUR;

  if (!cle) {
    // Le seul endroit de TOTEM où un message complet peut s'écrire quelque
    // part — et il est fermé à double tour : il faut que la clé soit absente
    // ET qu'on ne soit pas en production. Retirer l'une des deux conditions
    // suffit à faire fuir des codes d'entrée dans le journal d'un hébergeur.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `\n--- courriel non envoyé, COURRIER_CLE absente ---\n`
        + `à       : ${c.destinataire}\n`
        + `objet   : ${c.message.objet}\n\n${c.message.texte}\n`
        + `--- fin ---\n`);
    } else {
      console.error(
        `courrier : COURRIER_CLE absente, aucun message « ${c.genre} » n'est parti`);
    }
    await noter(c, "sans_cle", null, null);
    return {
      partie: false, issue: "sans_cle",
      dit: "TOTEM n'a pas de clé d'envoi : aucun message n'est parti.",
    };
  }

  if (!expediteur) {
    console.error("courrier : COURRIER_EXPEDITEUR absente, aucun message n'est parti");
    await noter(c, "sans_expediteur", null, null);
    return {
      partie: false, issue: "sans_expediteur",
      dit: "TOTEM n'a pas d'adresse d'expéditeur : aucun message n'est parti.",
    };
  }

  if (!adresseCredible(c.destinataire)) {
    await noter(c, "adresse", null, null);
    return {
      partie: false, issue: "adresse",
      dit: "Cette adresse n'a pas la forme d'une adresse mail.",
    };
  }

  try {
    const r = await fetch(POSTE, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cle}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: expediteur,
        to: [adresseNormalisee(c.destinataire)],
        subject: c.message.objet,
        text: c.message.texte,
        html: c.message.html,
      }),
      cache: "no-store",
    });

    if (!r.ok) {
      // On garde le code de réponse et le NOM de l'erreur, jamais le corps
      // renvoyé : rien ne garantit qu'un fournisseur n'y recopie pas un
      // morceau du message qu'on vient de lui donner.
      const detail = `${r.status} ${await nomErreur(r)}`.trim().slice(0, 80);
      console.error(`courrier : le fournisseur refuse (${detail})`);
      await noter(c, "refusee", detail, null);
      return {
        partie: false, issue: "refusee",
        dit: "Le message n'a pas été accepté. Vérifiez l'adresse, puis réessayez.",
      };
    }

    const reference = await referenceDe(r);
    await noter(c, "partie", null, reference);
    return { partie: true, reference };
  } catch (e) {
    // Le réseau. On ne relaie pas `e` à l'appelant : un message d'erreur de la
    // pile réseau se retrouve parfois affiché à l'écran, et il ne dit rien à
    // une commerçante.
    console.error(`courrier : fournisseur injoignable (${String(e).slice(0, 120)})`);
    await noter(c, "injoignable", "reseau", null);
    return {
      partie: false, issue: "injoignable",
      dit: "Le message n'a pas pu partir. La connexion a coupé ; réessayez dans un instant.",
    };
  }
}

/** Le nom de l'erreur du fournisseur, et rien d'autre. */
async function nomErreur(r: Response): Promise<string> {
  try {
    const corps = (await r.json()) as { name?: unknown };
    return typeof corps.name === "string" ? corps.name : "";
  } catch {
    return "";
  }
}

/**
 * L'identifiant que le fournisseur donne au message.
 *
 * Il ne sert qu'à une chose, et elle compte : retrouver CE message-là chez lui
 * le jour où quelqu'un dit « je n'ai rien reçu ». Sans lui, la conversation
 * s'arrête à « pourtant on l'a envoyé ».
 */
async function referenceDe(r: Response): Promise<string | null> {
  try {
    const corps = (await r.json()) as { id?: unknown };
    return typeof corps.id === "string" ? corps.id : null;
  } catch {
    return null;
  }
}
