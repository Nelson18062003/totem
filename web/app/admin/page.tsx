// « totem.app/admin » — l'adresse qu'on tape de mémoire.
//
// Elle ne montre rien : elle mène. Un écran d'accueil de plus, entre la porte
// et les appareils, serait un écran que personne ne lirait jamais deux fois.
//
// OÙ ELLE MÈNE, ET POURQUOI LÀ
// Vers les appareils, pas vers la flotte. Celui qui vient de rentrer doit
// d'abord voir ce qui ouvre son compte — c'est là que se lit une entrée qu'il
// n'a pas faite, et c'est là que se réclame le second appareil. La flotte
// (`/console`) est à un clic, et elle attendra dix secondes.
//
// CE QUI SE PASSE POUR QUI N'EST PAS ENTRÉ
// Le portail (`middleware.ts`) le renvoie avant même d'arriver ici. Il le
// renvoie aujourd'hui vers « /connexion », la porte du commerçant, et non vers
// « /admin/entree » : c'est un raccord d'une ligne dans le portail, signalé
// dans le rapport de la pull request. Tant qu'il n'est pas fait, la porte de
// la console se trouve en tapant son adresse, ce qui est vrai mais maladroit.

import { redirect } from "next/navigation";
import { exigerPouvoir } from "@/lib/garde";

export const dynamic = "force-dynamic";

export default async function Admin() {
  await exigerPouvoir("administrer");
  redirect("/admin/appareils");
}
