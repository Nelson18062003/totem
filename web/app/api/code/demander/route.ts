// Demander les six chiffres — la première fois, et à chaque « renvoyer ».
//
// CETTE ROUTE EST OUVERTE, ET ELLE NE PEUT PAS ÊTRE AUTREMENT
// Elle sert quelqu'un qui n'a pas de compte : c'est tout l'objet de
// l'invitation. Exiger une session pour recevoir la clé reviendrait à
// demander d'être déjà entré. Elle n'appelle donc pas la garde, et
// l'exception doit être inscrite dans `tests/test_garde_partout.py`.
//
// CE QUI LA GARDE À LA PLACE, ET C'EST TROIS CHOSES
//
// 1. LE JETON D'INVITATION. L'adresse visée n'est JAMAIS celle qu'on nous
//    envoie : elle est relue en base depuis l'invitation. Quelqu'un qui a le
//    lien ne peut donc pas se faire adresser le code ailleurs — c'est ce qui
//    protège le lien qui traîne dans un groupe WhatsApp de quarante
//    personnes.
// 2. LA LIMITE DE DEMANDES, portée par `emettreCode` : cinq par adresse et
//    par demi-heure. Sans elle, il suffit d'appuyer cent fois sur
//    « renvoyer » pour noyer la boîte de quelqu'un — et pour faire classer
//    tous nos messages comme indésirables, y compris ceux des autres.
// 3. LE DÉLAI ENTRE DEUX ENVOIS, annoncé à l'écran en toutes lettres. Un
//    bouton grisé sans explication se martèle ; un bouton qui dit « dans
//    0:48 » s'attend.
//
// Ce que cette route ne rend jamais : le code. Il n'existe que dans le
// message. Ni la réponse, ni le journal, ni une trace d'exécution ne le
// portent.

import { cookies } from "next/headers";
import { COOKIE_LANGUE } from "@/lib/langue";
import { langueServeur } from "@/lib/langue-serveur";
import { ouvrirInvitation } from "@/lib/invitations";
import { contexteAppareil } from "@/lib/garde";
import { noterEntree } from "@/lib/entrees";
import { lireUne } from "@/lib/base";
import { textesCode, attenteEnMots } from "@/lib/textes/code";
import { envoyerCode } from "@/lib/envois";

export const dynamic = "force-dynamic";

/** Une minute entre deux envois. Le temps qu'un message arrive vraiment sur
 *  une connexion camerounaise un jour de forte charge — redemander plus tôt
 *  ne ferait qu'ajouter un second message à côté du premier. */
export const RENVOI_MS = 60 * 1000;

export async function POST(req: Request) {
  const langue = await langueServeur();
  const t = textesCode[langue];

  const corps = (await req.json().catch(() => null)) as { jeton?: unknown } | null;
  const jeton = typeof corps?.jeton === "string" ? corps.jeton : "";
  if (!jeton) {
    return Response.json(
      { refus: "indisponible", erreur: t.refus.indisponible.titre }, { status: 400 });
  }

  const inv = await ouvrirInvitation(jeton);
  if (typeof inv === "string") {
    // L'invitation elle-même n'ouvre plus. L'écran renvoie alors à la page de
    // l'invitation, qui sait dire laquelle des quatre situations c'est.
    return Response.json({ refus: "invitation", echec: inv }, { status: 409 });
  }

  const { appareil, lieu } = await contexteAppareil();

  // La langue du message suit le choix de la personne quand elle en a fait
  // un ; sinon celle que la propriétaire a indiquée en invitant. Le cookie se
  // lit à la main parce que `langueServeur` ne sait pas dire « rien choisi »,
  // et qu'un défaut n'est pas un choix.
  const choisie = (await cookies()).get(COOKIE_LANGUE)?.value;
  const langueDuMessage = choisie === "en" || choisie === "fr" ? choisie : inv.langue;

  // Le NOM du commerce, pas son identifiant : il part dans l'objet du
  // message, et quelqu'un qui travaille dans deux boutiques doit savoir
  // laquelle vient de lui écrire.
  const commerce = await lireUne<{ nom: string }>(
    `commerces?id=eq.${encodeURIComponent(inv.commerce)}&select=nom&limit=1`);

  const envoi = await envoyerCode({
    courriel: inv.courriel,
    motif: "invitation",
    commerce: commerce?.nom ?? inv.commerce,
    invitation: inv.id,
    appareil, lieu,
    langue: langueDuMessage,
  });

  if (!envoi.envoye) {
    if (envoi.raison === "trop") {
      await noterEntree({
        commerce: inv.commerce, issue: "ralentie", moyen: "courriel",
        appareil, lieu,
      });
      return Response.json({
        refus: "trop",
        attente: envoi.reessayerDans,
        erreur: t.refus.trop.dit(attenteEnMots(envoi.reessayerDans, langue)),
      }, { status: 429 });
    }
    return Response.json({
      refus: "indisponible", erreur: t.refus.indisponible.titre,
    }, { status: 503 });
  }

  return Response.json({ ok: true, avantRenvoi: RENVOI_MS });
}
