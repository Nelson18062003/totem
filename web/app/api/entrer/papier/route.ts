// Entrer avec un code du papier de dix codes.
//
// C'est le dernier chemin, celui qui reste quand le téléphone ET la boîte
// mail sont hors de portée en même temps — un combiné volé avec la session
// mail ouverte dedans. Sans lui, la seule issue serait un coup de fil à une
// seule personne, et une plateforme où l'argent de quelqu'un dépend de la
// disponibilité de Nelson n'est pas une plateforme.
//
// LA PORTE EST OUVERTE, FORCÉMENT. On ne peut pas exiger d'être entré pour
// entrer. Ce qui garde cette route n'est pas une session : c'est un code
// imprimé, à usage unique, que seul celui qui tient le papier connaît — et,
// juste après, la relecture EN BASE de l'état de la personne et de son accès.
// Un papier parfaitement valable dont le compte a été fermé n'ouvre rien.
//
// UNE SEULE PHRASE DE REFUS, ET C'EST LA RÈGLE PRINCIPALE
// Adresse inconnue, code faux, code déjà servi, compte suspendu, accès
// retiré : tout sort par « refuser() », même texte, même code HTTP, même
// forme. Distinguer ces cas transformerait la porte en annuaire — il
// suffirait d'essayer des adresses et de lire laquelle répond autrement pour
// savoir qui est client de TOTEM, et laquelle a un papier encore vierge.
//
// LA SESSION OUVERTE ICI N'EST PAS DÉCLARÉE PARTAGÉE, ET C'EST DÉLIBÉRÉ
// On entre par le papier depuis un appareil inhabituel — souvent emprunté —
// et la tentation est de raccourcir la session en la marquant « partagée ».
// Mais une session partagée ne propose JAMAIS de poser une clé (`cles.ts`),
// or c'est exactement ce que doit faire quelqu'un qui vient de récupérer un
// téléphone neuf : entrer par le papier, puis y remettre son doigt. Fermer
// cette porte-là ferait du papier un chemin sans lendemain.

import { cookies } from "next/headers";
import { COOKIE_SESSION, signerSession } from "@/lib/session";
import { ouvrirSession } from "@/lib/sessions";
import { contexteAppareil } from "@/lib/garde";
import { noterEntree } from "@/lib/entrees";
import { accesDe } from "@/lib/comptes";
import { langueServeur } from "@/lib/langue-serveur";
import { lireUne } from "@/lib/base";
import { adresseNormalisee } from "@/lib/code-entree";
import type { Langue } from "@/lib/langue";
// Le raccord avec l'équipe du papier tient sur cette ligne. `lib/papier.ts`
// travaille par NUMÉRO DE PERSONNE, pas par adresse : c'est cette route qui
// fait la traduction, juste en dessous.
import { consommerCodePapier } from "@/lib/papier";

export const dynamic = "force-dynamic";

const DIT = {
  fr: {
    rate: "Ça n'a pas marché. Revoyez le code, ou prenez-en un autre.",
    indisponible: "L'entrée n'est pas disponible pour l'instant.",
  },
  en: {
    rate: "That did not work. Check the code, or use another one.",
    indisponible: "Signing in is not available right now.",
  },
} as const;

/** Le seul refus de cette route. Il n'y en a pas d'autre, exprès. */
function refuser(langue: Langue) {
  return Response.json({ erreur: DIT[langue].rate }, { status: 401 });
}

export async function POST(req: Request) {
  const langue = await langueServeur();
  const corps = await req.json().catch(() => null);
  const courriel = typeof corps?.courriel === "string" ? corps.courriel.trim() : "";
  // Le code se colle tel qu'il est imprimé, espaces compris. C'est
  // `lib/papier.ts` qui le ramène à sa forme canonique — lui seul sait
  // comment il a été imprimé, et lui seul sait rattraper le « S » qu'une main
  // écrit à la place d'un 5.
  const code = typeof corps?.code === "string" ? corps.code : "";

  const secret = process.env.SESSION_SECRET || "";
  if (!secret) {
    return Response.json({ erreur: DIT[langue].indisponible }, { status: 503 });
  }

  const { appareil, lieu } = await contexteAppareil();

  // Un champ vide n'est pas un essai : on ne salit pas le journal avec, et on
  // répond exactement comme à un code faux.
  if (!courriel || !code) return refuser(langue);

  // L'adresse désigne la personne ; le code appartient à cette personne-là.
  // Un code du papier de quelqu'un d'autre n'ouvre donc rien, même juste.
  const personne = await lireUne<{ id: number; nom: string; etat: string }>(
    `personnes?courriel=eq.${encodeURIComponent(adresseNormalisee(courriel))}`
    + `&select=id,nom,etat&limit=1`);

  // ADRESSE INCONNUE : ON FAIT QUAND MÊME LE TRAVAIL, sur un numéro de
  // personne qui n'existe pas. Partir tout de suite ferait répondre cette
  // route deux fois plus vite pour une adresse sans compte que pour une
  // adresse avec — et la durée dirait au chronomètre ce que la phrase refuse
  // de dire.
  const ouvre = await consommerCodePapier(code, personne?.id ?? 0, appareil, lieu);

  if (!personne || !ouvre) {
    // Un refus se note, même — surtout — quand on ne sait pas qui a essayé :
    // c'est ce journal qui permettra de dire « trois codes du papier ont été
    // essayés hier soir » plutôt que de le laisser dans un fichier que nul ne
    // lit.
    await noterEntree({
      personne: personne?.id ?? null,
      issue: "refusee", moyen: "papier", appareil, lieu,
    });
    return refuser(langue);
  }

  // Le papier prouve qu'on tient le papier. Il ne dit RIEN du droit d'entrer :
  // une personne partie, suspendue, ou dont l'accès a été repris garde une
  // feuille parfaitement imprimée. Le droit se relit en base, à chaque fois.
  //
  // Le code, lui, est DÉJÀ brûlé à cet instant, et c'est volontaire : un code
  // qu'on rendrait à qui n'a plus le droit d'entrer serait un code qu'on peut
  // essayer autant de fois qu'on veut.
  const acces = await accesDe(personne.id);
  if (personne.etat !== "actif" || !acces) {
    await noterEntree({
      personne: personne.id, issue: "refusee", moyen: "papier", appareil, lieu,
    });
    return refuser(langue);
  }

  const session = await ouvrirSession({
    personne: personne.id, commerce: acces.commerce, role: acces.role,
    appareil, lieu, partage: false,
  });
  if (!session) {
    return Response.json({ erreur: DIT[langue].indisponible }, { status: 503 });
  }

  await noterEntree({
    personne: personne.id, commerce: acces.commerce,
    issue: "ouverte", moyen: "papier", appareil, lieu,
  });

  const jeton = await signerSession(
    secret,
    { session: session.id, personne: personne.id, role: acces.role },
    new Date(session.expire_le).getTime() - Date.now(),
  );
  const boite = await cookies();
  boite.set(COOKIE_SESSION, jeton, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    // Le cookie ne survit pas au jeton : un cookie plus vieux que la session
    // qu'il porte ne produit que des refus incompréhensibles.
    maxAge: Math.floor((new Date(session.expire_le).getTime() - Date.now()) / 1000),
  });
  return Response.json({ ok: true, nom: personne.nom });
}
