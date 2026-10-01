// Le courrier — ce qui fait partir un code d'entrée vers une boîte.
//
// LE SERVICE. Resend (resend.com) : une seule requête HTTP, pas de serveur de
// courrier à tenir, et l'adresse d'envoi est celle de NOTRE domaine
// (connexion@totemlabs.app), pas celle d'un tiers — un code qui arrive d'une
// adresse inconnue finit dans les indésirables, ou pire, apprend aux gens à
// faire confiance à n'importe quel expéditeur. Le jour où l'on change de
// service, c'est ce fichier — et lui seul — qui change.
//
// TROIS RÉGLAGES, côté serveur uniquement (jamais NEXT_PUBLIC_) :
//
//   COURRIER_CLE         la clé du service (« re_… »). Sans elle, aucun code
//                        ne part, et la connexion par compte est impossible —
//                        la clé de secours, elle, ouvre toujours.
//   COURRIER_EXPEDITEUR  « TOTEM <connexion@totemlabs.app> » par défaut. Le
//                        domaine doit être vérifié chez le service.
//   COURRIER_URL         l'adresse du service. Ne se règle que pour les
//                        essais : les harnais la pointent sur le faux nuage,
//                        qui garde les lettres au lieu de les envoyer.
//
// CE QUI NE SORT JAMAIS D'ICI : le code, vers un journal. Une panne d'envoi
// se note SANS le courriel et SANS le code — un journal se garde longtemps et
// se lit à plusieurs.

import type { Langue } from "@noyau/langue";
import { textesCourrier } from "@noyau/textes/courrier";

const CLE = process.env.COURRIER_CLE || "";
const ADRESSE = (process.env.COURRIER_URL || "https://api.resend.com").replace(/\/+$/, "");
const EXPEDITEUR = process.env.COURRIER_EXPEDITEUR || "TOTEM <connexion@totemlabs.app>";

/** Le courrier peut-il partir ? Sans clé, non — et l'écran doit le dire. */
export const courrierPret = Boolean(CLE);

async function poster(a: string, sujet: string, texte: string): Promise<boolean> {
  if (!CLE) return false;
  try {
    const r = await fetch(`${ADRESSE}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${CLE}`, "content-type": "application/json" },
      body: JSON.stringify({ from: EXPEDITEUR, to: [a], subject: sujet, text: texte }),
      cache: "no-store",
      // Un service de courrier lent ne doit pas tenir un serveur en otage.
      signal: AbortSignal.timeout(8000),
    });
    // L'ACCUSÉ, PAS LE BILLET — la leçon de la sonnerie. Un 200 de Resend
    // porte l'identifiant de la lettre ; sans lui, on ne sait pas qu'elle
    // est partie.
    if (!r.ok) return false;
    const corps = (await r.json().catch(() => null)) as { id?: unknown } | null;
    return typeof corps?.id === "string" && corps.id.length > 0;
  } catch {
    return false;
  }
}

/** Envoie un code d'entrée. Rend `true` seulement si le service l'a pris. */
export function envoyerCode(a: string, code: string, langue: Langue): Promise<boolean> {
  const t = textesCourrier[langue];
  return poster(a, t.codeSujet(code), t.codeTexte(code));
}

/** Prévient quelqu'un qu'on vient de lui ouvrir la plateforme. */
export function envoyerInvitation(a: string, adresse: string, langue: Langue): Promise<boolean> {
  const t = textesCourrier[langue];
  return poster(a, t.invitationSujet, t.invitationTexte(adresse));
}
