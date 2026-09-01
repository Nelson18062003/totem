# La console de la plateforme

> `/console` — la flotte, les cartes SIM, les gens, les versions, le journal,
> les alertes. Tous les boîtiers d'un coup d'œil, pour celui qui administre.

---

## Qui entre

**Le propriétaire, et personne d'autre.** Aujourd'hui TOTEM suit l'argent
d'une seule maison : celui qui l'a installée est celui qui surveille ses
boîtiers. La clé de secours administre aussi — y avoir accès, c'est déjà
tenir les variables du serveur, donc la maison.

La règle vit à UN endroit : `web/lib/garde.ts`. Le jour où la flotte servira
plusieurs commerces, c'est là — et seulement là — qu'elle changera.

Deux portes la font respecter, dans les deux sens :

- **le middleware**, avant le premier octet : un invité qui tape `/console`
  est renvoyé vers l'accueil par un vrai 307 — pas vers la connexion, il est
  déjà entré, et le renvoyer à la porte lui ferait croire que sa session a
  expiré ;
- **chaque écran**, avant toute lecture : si la base ne sait pas dire que le
  compte est propriétaire, l'écran refuse. Le middleware penche vers
  l'ouverture quand la base se tait (on ne met pas le propriétaire dehors
  pour une panne) ; l'écran, lui, refuse ce qu'il ne sait pas. Deux portes
  valent mieux qu'une, dans les deux sens.

`web/scripts/verifier-la-console.mjs` essaie vraiment d'entrer — sans
session, en invité, en propriétaire, avec la clé de secours — et c'est lui
qui a trouvé que le refus d'un écran partait en « meta refresh » dans une
page déjà entamée au lieu d'un vrai renvoi. D'où la porte du middleware.

## Ce que la console montre

| Écran | Ce qu'il dit | D'où ça vient |
|---|---|---|
| La flotte | chaque boîtier, son état de vie, sa santé en toutes lettres, son logiciel | `terminaux` |
| Un terminal | sa fiche : cartes, journal, commandes, gestes interdits | `terminaux`, `cartes`, `evenements`, `commandes` |
| Les cartes SIM | toutes les puces, présentes, retirées ou perdues de vue, leurs soldes | `cartes`, `comptes` |
| Les gens et les appareils | les comptes, les téléphones prévenus, le frein de la porte | `utilisateurs`, `appareils`, `freins` |
| Les versions | qui porte quoi, qui est resté en arrière | `terminaux`, `versions` |
| Commandes et journal | ce qui a été demandé et ce que les boîtiers ont écrit, filtrable par boîtier et par jour | `commandes`, `evenements`, `alertes` |
| Les alertes | ce qui va mal et ce qu'on en a fait — vue n'est pas close | `alertes` |

Trois règles tiennent tous ces écrans, héritées des maquettes d'août
(`maquettes/`, 25 écrans dessinés et mesurés avant d'être construits) :

1. **Trié par ce qui va mal, jamais par ordre alphabétique.** Un boîtier muet
   rangé sous la lettre B n'est pas affiché : il est caché.
2. **Trois états qui ne se confondent jamais** : « tout va bien », « ça va
   mal », « on ne sait pas ». Une carte dont le boîtier s'est tu n'est pas
   retirée — on l'ignore, et c'est ce qui s'écrit. Jamais un zéro à la place
   d'une absence.
3. **L'administrateur regarde, il n'opère pas.** Aucun geste d'argent
   n'existe dans la console — les gestes impossibles sont montrés barrés,
   avec qui les fait vraiment. Ses deux seules écritures : « je l'ai vue »
   et « c'est réglé », sur les alertes.

## Ce qui reste vide, et pourquoi c'est dit

- **Les alertes** : personne n'écrit encore dans la table — le robot calcule
  ce qui ne va pas et n'en fait qu'un message Telegram. L'écran REFUSE de
  lire ce vide comme une bonne nouvelle : il l'écrit, et pose à côté ce que
  la flotte raconte. Le prochain chantier : que `totem/sante.py` dépose ses
  alertes ici (la base tient déjà « une seule ouverte par (terminal, genre) »).
- **Les versions** : le registre est vide tant qu'aucune version n'y est
  déclarée. Sans lui, l'écran regroupe les boîtiers par ce qu'ils portent et
  n'appelle personne « à jour » — comparer les retardataires entre eux
  laisserait passer une flotte entière restée deux mois en arrière.
- **Les commerces** : le rattachement « cette caisse est à ce commerce »
  n'existe pas encore en base. Tant qu'aucun commerce n'est déclaré, les
  colonnes « à qui c'est » portent un tiret calme — pas une alarme sur
  chaque rangée, une alarme partout ne signale plus rien. C'est le chantier
  multi-commerces, décrit dans `docs/PLAN-MISE-EN-OEUVRE.md` de la branche
  d'août.

## À faire de votre côté, une fois

Coller `migrations/20260901_console.sql` dans Supabase (SQL Editor → New
query → Run). Il crée `alertes` et `versions`, ajoute au terminal son lieu et
sa sortie de service, et SE VÉRIFIE : il essaie d'ouvrir deux alertes du même
genre sur le même boîtier et exige le refus. Rejouable sans risque.

Sans cette migration, la console marche quand même — flotte, cartes, gens,
journal — et les écrans d'alertes et de versions disent, en toutes lettres,
que leur registre n'existe pas encore.

## Le mot de passe

Chacun change LE SIEN, dans Réglages → Sécurité, avec la preuve de l'ancien
— une session est un téléphone resté ouvert sur une table, la preuve est ce
qui sépare « s'en servir » de « changer la serrure ». Les essais passent par
le même frein que la porte de connexion. Le propriétaire, lui, recrée un
compte depuis « Qui peut se connecter » quand quelqu'un a perdu le sien.
