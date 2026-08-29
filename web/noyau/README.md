# Le noyau

Ce que la plateforme et l'application du téléphone partagent, écrit **une
seule fois**.

| Fichier | Ce qu'il tient |
|---|---|
| `types.ts` | la forme d'une carte SIM, d'un paiement, d'un terminal |
| `natures.ts` | les quatre natures de reçu — le miroir de `totem/declencheur.py` |
| `codes.ts` | le catalogue des codes USSD et les raccourcis appris |
| `langue.ts` | anglais / français |
| `textes/` | le dictionnaire des deux langues, en entier |

Une phrase corrigée ici l'est partout, du même geste. C'est tout l'objet du
dossier.

## Ce qui n'y entre jamais

Rien qui touche au navigateur, au serveur, ou à un secret. Ces quatre-là
restent dans `web/lib/`, et l'application du téléphone n'a aucune raison d'y
aller :

- `serveur.ts` — **il porte la clé de service.** Elle ne doit jamais se
  retrouver dans un fichier que l'application embarque : une application
  installée se démonte, un serveur non.
- `session.ts`, `langue-serveur.ts`, `pdf-rib.ts` — du serveur, du cookie,
  du DOM.

La séparation en deux dossiers n'est pas cosmétique : elle rend visible, d'un
coup d'œil, ce qui peut partir sur un téléphone et ce qui ne le peut pas.

## Pourquoi ce dossier vit sous `web/` et non à la racine

Il aurait sa place à la racine du dépôt. Il n'y est pas, et **ce n'est pas un
oubli**.

Le projet Vercel a son *Root Directory* réglé sur `web`. La documentation de
Vercel est sans ambiguïté sur ce que cela implique :

> « Your app will not be able to access files outside of that directory. You
> also cannot use `..` to move up a level. »

Un `noyau/` à la racine serait donc **invisible depuis la compilation
Vercel** : le site ne compilerait plus, en production, à la première fusion.
Le garder sous `web/` ne demande aucun réglage, ne touche pas au déploiement,
et ne risque rien.

**Si un jour on veut le remonter à la racine** — c'est défendable, le nom
serait plus juste — il faut faire les deux gestes ensemble, jamais l'un sans
l'autre :

1. déplacer le dossier et corriger l'alias `@noyau/*` dans `web/tsconfig.json` ;
2. dans Vercel (Settings → Build and Deployment → Root Directory), remonter la
   racine et déclarer les espaces de travail npm.

Fait à moitié, le site tombe.

## Comment l'application du téléphone le lit

Elle n'en fait pas une copie. Son empaqueteur (Metro) reçoit ce dossier dans
ses `watchFolders`, et le même alias `@noyau/*`. Les deux lisent donc
littéralement les mêmes fichiers sur le disque — pas deux versions qu'il
faudrait tenir d'accord.
