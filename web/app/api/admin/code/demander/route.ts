// Le code de SECOURS de la console — six chiffres par mail.
//
// CETTE ROUTE EST OUVERTE, ET ELLE NE PEUT PAS ÊTRE AUTREMENT : elle sert
// quelqu'un qui n'est pas entré. Elle n'appelle donc pas la garde, et
// l'exception est à inscrire dans `tests/test_garde_partout.py` — c'est écrit
// dans le rapport de la pull request.
//
// ELLE RÉPOND TOUJOURS LA MÊME CHOSE, ET C'EST SA PRINCIPALE PROPRIÉTÉ
// Adresse inconnue, adresse mal formée, personne suspendue, personne qui n'est
// pas administratrice : même réponse, même code HTTP, même forme. Une porte qui
// distingue devient un annuaire — il suffit d'essayer des adresses et de lire
// laquelle répond autrement pour savoir qui administre TOTEM. L'écran, de son
// côté, ne lit même pas cette réponse.
//
// CE QUI LA GARDE À LA PLACE
// 1. RIEN NE PART VERS QUELQU'UN QUI N'EST PAS ADMINISTRATEUR. Autrement cette
//    route serait un relais à messages : n'importe qui ferait envoyer une
//    lettre TOTEM à n'importe quelle boîte, et notre réputation d'expéditeur
//    irait avec.
// 2. LA LIMITE DE DEMANDES, portée par `emettreCode` : cinq par adresse et par
//    demi-heure. Sans elle, cent appuis sur « renvoyer » noient une boîte.
// 3. LA LETTRE D'AVERTISSEMENT PART EN MÊME TEMPS QUE LE CODE, et le code
//    n'ouvre rien pendant une minute. C'est le « délai et la lettre » de
//    l'arbitrage 1 : sans eux, le mail serait un facteur unique sur la console
//    qui voit toute la flotte (SP 800-63B-4 §3.1.3.1).
//
// Ce que cette route ne rend jamais : le code. Il n'existe que dans le message.

import { contexteAppareil } from "@/lib/garde";
import { adresseCredible } from "@/lib/courrier";
import { envoyerCode } from "@/lib/envois";
import { noterEntree } from "@/lib/entrees";
import {
  estAdministrateur, NOM_CONSOLE, personneParAdresse, prevenirDunSecours,
} from "@/lib/plateforme";

export const dynamic = "force-dynamic";

/** La même réponse dans tous les cas. Voir l'en-tête. */
function pareil() {
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const corps = (await req.json().catch(() => null)) as { courriel?: unknown } | null;
  const courriel = typeof corps?.courriel === "string" ? corps.courriel : "";
  if (!courriel || !adresseCredible(courriel)) return pareil();

  const personne = await personneParAdresse(courriel);
  if (!personne) return pareil();
  if (!(await estAdministrateur(personne))) return pareil();

  const { appareil, lieu } = await contexteAppareil();

  // L'OBJET NOMME L'APPAREIL QUI DEMANDE, jamais le code. Il s'affiche sur un
  // écran verrouillé, dans un train : « Entrer dans TOTEM ADMIN — Chrome sur
  // macOS » se lit avant d'ouvrir, et dit tout de suite si c'était soi.
  // `composer` construit l'objet à partir de ce champ ; c'est le seul endroit
  // où l'on peut y glisser le nom de l'appareil sans réécrire `courrier.ts`.
  const nomme = appareil ? `${NOM_CONSOLE} — ${appareil}` : NOM_CONSOLE;

  const envoi = await envoyerCode({
    courriel,
    motif: "entree",
    commerce: nomme,
    langue: personne.langue,
    personne: personne.id,
    appareil, lieu,
  });

  if (!envoi.envoye) {
    if (envoi.raison === "trop") {
      await noterEntree({
        personne: personne.id, issue: "ralentie", moyen: "courriel", appareil, lieu,
      });
    }
    // On ne le dit pas non plus : « trop de demandes » apprendrait que
    // l'adresse est celle d'un administrateur. Le journal, lui, le sait.
    return pareil();
  }

  // La lettre qui précède le code. Elle part APRÈS lui — si l'envoi du code
  // avait échoué, avertir d'un code qui n'existe pas serait une fausse alerte.
  await prevenirDunSecours({
    personne: personne.id,
    courriel: personne.courriel,
    langue: personne.langue,
    appareil, lieu,
  });

  return pareil();
}
