import { relie } from "@/lib/serveur";
import { inscriptionPossible } from "@/lib/porte";

export const dynamic = "force-dynamic";

/**
 * « Y a-t-il un TOTEM à cette adresse ? »
 *
 * POURQUOI CETTE ROUTE EXISTE. L'application du téléphone porte l'adresse de
 * la plateforme dans sa configuration. Si cette adresse est fausse — une
 * faute de frappe, un sous-domaine pris par quelqu'un d'autre — l'application
 * enverrait le MOT DE PASSE DU PROPRIÉTAIRE à un serveur inconnu, et
 * n'afficherait qu'un « connexion impossible » incompréhensible. C'est
 * exactement ce qui est arrivé.
 *
 * Elle demande donc d'abord ici. Un TOTEM répond ; n'importe quoi d'autre
 * rend une page 404, et l'application le dit clairement AVANT que le
 * propriétaire ait tapé quoi que ce soit.
 *
 * Elle est OUVERTE, comme l'écran de connexion, et pour la même raison : il
 * faut bien pouvoir frapper à la porte avant d'avoir la clé.
 *
 * CE QU'ELLE NE DIT PAS. Aucun nom, aucun chiffre, aucune adresse de base,
 * aucune version. Seulement de quoi répondre à deux questions que l'écran de
 * connexion pose déjà à voix haute : « est-ce bien un TOTEM » et « la
 * connexion peut-elle aboutir ». Sans la seconde, un propriétaire dont les
 * variables ne sont pas posées chercherait son mot de passe pendant des
 * heures — le serveur, lui, sait qu'aucun mot de passe ne marchera.
 */
export async function GET() {
  // « Configurée » veut dire : quelqu'un peut se connecter ici. Deux
  // conditions, et la seconde a un OU qui compte.
  //
  //   · SESSION_SECRET, sans quoi aucune session ne peut être signée ;
  //   · ET un chemin d'entrée : soit la base des comptes répond (on peut y
  //     créer un compte et s'en servir), soit la clé de secours est posée.
  //
  // Ce OU n'était pas là au début, et c'était faux : une plateforme reliée à
  // sa base, avec de vrais comptes, se déclarait « non configurée » au seul
  // motif que l'ancienne clé de secours n'existait pas. L'application
  // refusait alors de laisser taper quoi que ce soit, sur une plateforme
  // parfaitement utilisable.
  const configuree = Boolean(process.env.SESSION_SECRET)
    && (relie || Boolean(process.env.TOTEM_MOT_DE_PASSE));

  // Peut-on encore créer un compte ici ? Non, dès qu'il y en a un. L'écran
  // s'en sert pour ne PAS proposer une inscription qui serait refusée : un
  // bouton qui mène toujours à un refus est un bouton de trop.
  //
  // Cela ne révèle rien qu'on ne sache déjà : « cette plateforme a un
  // propriétaire » est vrai de toutes les plateformes en service, et
  // n'apprend à personne qui il est.
  const inscription = (await inscriptionPossible()) === true;

  return Response.json({ totem: true, configuree, relie, inscription });
}
