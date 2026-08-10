// Le raccord de la porte : les adresses qu'elle appelle, et les deux nombres
// qu'elle affiche.
//
// POURQUOI CE FICHIER EXISTE
// L'écran de la porte est un composant client : il ne peut pas importer
// `lib/plateforme.ts`, qui parle à la base. Tout ce dont il a besoin du côté
// serveur tient dans quatre adresses et deux nombres — les voici, à un seul
// endroit. Le jour où une route change de nom, il y a une ligne à changer.
//
// LES DEUX NOMBRES SONT RECOPIÉS, ET C'EST SURVEILLÉ
// `CODES_DE_SECOURS` doit valoir `PAR_SERIE` de `lib/papier.ts` — l'équipe qui
// fabrique le papier. `ATTENTE_SECONDES` doit valoir `ATTENTE_SECOURS_MS` de
// `lib/plateforme.ts`. Recopier un nombre est exactement la façon dont un
// écran finit par annoncer « huit codes » quand la feuille en imprime dix, et
// c'est la personne qui compte ses codes restants qui le découvre, un soir où
// elle n'a plus que ça. `tests/test_porte_admin.py` compare les trois fichiers
// et échoue si l'un d'eux s'écarte.

/** Six chiffres par mail — le SECOURS, pas la porte. */
export const ROUTE_DEMANDER = "/api/admin/code/demander";

/** Les six chiffres présentés. C'est elle qui ouvre la session. */
export const ROUTE_VERIFIER = "/api/admin/code/verifier";

/** Un code du papier de secours. Route partagée avec la porte du client. */
export const ROUTE_PAPIER = "/api/entrer/papier";

/** « Je viens d'entrer » : c'est elle qui écrit la lettre à l'intéressé. */
export const ROUTE_ANNONCER = "/api/admin/entree/annoncer";

/** Dix. Le même nombre que `PAR_SERIE` de `lib/papier.ts`. */
export const CODES_DE_SECOURS = 10;

/** Soixante. Le même délai que `ATTENTE_SECOURS_MS` de `lib/plateforme.ts`. */
export const ATTENTE_SECONDES = 60;
