# Pourquoi l'iPhone ne sonne pas — le diagnostic

> Établi le 2 octobre 2026, en lisant tout ce qui laisse une trace : les
> journaux des fabrications sur GitHub, le fichier de l'application iPhone
> réellement installée (ouvert et lu), le code du site et du robot, la
> documentation officielle d'Expo et d'Apple, et l'historique du projet.
> Chaque affirmation porte sa preuve, et dit si elle est **prouvée** ou
> seulement **probable**.

---

## En une phrase

**Apple n'a jamais reçu l'autorisation de livrer nos notifications** : la
« clé de notifications Apple » n'a jamais été ajoutée chez Expo. Et depuis le
8 septembre, **aucune mise à jour n'arrive plus sur aucun téléphone**, parce
que les applications installées n'ont jamais été refabriquées.

---

## Ce qui marche — et ce n'est pas rien

- **L'application iPhone est correcte.** Son fichier (version 1.0.0, n° 4) a
  été ouvert et lu : elle demande la permission, obtient son jeton, s'inscrit
  auprès de la plateforme, et elle est signée pour le serveur de **production**
  d'Apple, celui de TestFlight. *Prouvé.*
- **Votre iPhone est, selon toute vraisemblance, bien inscrit.** Le
  9 septembre, Expo répondait « identifiants invalides » : il ne peut répondre
  cela que s'il a reçu un jeton d'iPhone. *Probable.*
- **Le trajet robot → Expo → téléphone fonctionne.** Android a réellement
  sonné fin août, avec des messages composés par le robot. *Prouvé.*

Le problème n'est donc ni dans votre iPhone, ni dans l'application, ni dans le
robot : il est **chez Expo**, où il manque une pièce.

---

## Problème n°1 — la clé de notifications Apple n'existe pas chez Expo

**Ce que c'est.** Pour qu'une notification arrive sur un iPhone, elle passe
par trois maillons : *le robot → Expo → Apple → l'iPhone*. Apple n'accepte un
message d'Expo que s'il est signé avec une **clé de notifications** (un petit
fichier `.p8` créé sur le compte Apple Developer). Sans elle, Apple refuse
tout, et Expo répond `InvalidCredentials` (« identifiants invalides »).

**Les preuves.**
- La description de la demande de fusion n°88 (9 septembre) le dit : *« la
  page des identifiants dit aujourd'hui « This account doesn't have any Apple
  push keys associated with it » »*. *Prouvé.*
- Aucune trace, depuis, qu'une clé ait été ajoutée. *Probable qu'elle manque
  toujours — se vérifie sur expo.dev.*
- Le code de l'outil d'Expo (`eas-cli`), lu ligne à ligne : une fabrication
  **automatique** (celle de GitHub) ne crée **jamais** cette clé — la fonction
  s'arrête avant même de la chercher. *Prouvé.*

**Pourquoi elle n'a jamais été créée.** Le 8 septembre, vous avez créé la
**signature** de l'application (certificat de distribution et profil). C'est
une autre pièce : elle permet d'**installer** l'application, pas de la faire
**sonner**. Et la documentation du projet vous a induit en erreur : elle disait
à un endroit qu'Expo crée cette clé tout seul — c'est faux pour une
fabrication automatique.

**Attention : deux fichiers `.p8` différents.** Celui que vous avez déjà créé
(« TOTEM Admin », clé d'**API App Store Connect**) sert à **déposer**
l'application chez Apple. Celui des **notifications** est une autre clé, qui
n'existe pas encore.

**Bonne nouvelle.** Cette clé sert à l'**envoi**, pas à la fabrication
(documentation d'Expo : « Used at: Run time »). Une fois ajoutée, **l'iPhone
déjà installé devrait sonner, sans rien refabriquer**. *Probable, fondé sur la
documentation officielle.*

**Un piège à éviter.** Chez Apple, en créant la clé, il faut choisir un
environnement qui **inclut « Production »**. Une clé « Sandbox » seule ne
marche pas avec TestFlight.

---

## Problème n°2 — aucune mise à jour n'arrive sur aucun téléphone

**Ce que c'est.** Une mise à jour rapide (sans passer par les magasins) ne
rejoint que les applications qui ont **la même version** et **le même canal**.

**Les preuves** (journaux GitHub). *Prouvé.*

| Téléphone | Version installée | Canal | Fabriqué le |
|---|---|---|---|
| iPhone (TestFlight) | 1.0.0, n° 4 | `essai` | 8 septembre |
| Android, dernier paquet | 1.0.0, n° 5 | `production` | 2 septembre |

- Le **8 septembre au soir**, la version est passée à **1.1.0** dans le code.
  Depuis, **aucune** application n'a été refabriquée.
- Les mises à jour du **10 septembre** et du **1er octobre** visent la 1.1.0 :
  elles n'atteignent **personne**. Celle du 1er octobre est en plus partie sur
  le canal `production`, que l'iPhone n'écoute pas.
- La dernière mise à jour que l'iPhone a pu recevoir date du **8 septembre à
  18 h 29** (heure UTC).

**Conséquence.** Tout ce qui a été fait depuis sur le téléphone — l'écran qui
dit « la clé Apple manque », le nouveau parcours d'opération, les
bénéficiaires, les droits des titulaires de carte — **n'est sur aucun
téléphone**. Seul ce qui vit sur le **site** et dans le **robot** est en
service.

**Un détail qui a pu vous tromper.** L'écran « Mise à jour » de GitHub décrit
`essai` comme « la piste d'essai interne du Play Store » et `production` comme
« les téléphones du public ». Il ne dit pas que **l'iPhone TestFlight est sur
`essai`**.

---

## Problème n°3 — le dernier Android « production » est resté en brouillon

Les deux paquets Android `production` (30 août et 2 septembre) ont été déposés
sur le Play Store **en brouillon** (« Release status: DRAFT »). Un brouillon
n'atteint personne tant qu'on ne clique pas pour le publier dans la Play
Console. *Prouvé.* Quel paquet tourne réellement sur chaque téléphone Android
ne se voit pas depuis GitHub.

---

## Problème n°4 — un défaut dans le robot (introduit le 1er octobre)

Depuis le 1er octobre, le robot lit, pour chaque téléphone, à qui il
appartient (la colonne `utilisateur`, ajoutée par le fichier SQL du
2 octobre). **Si le robot est mis à jour alors que ce fichier SQL n'a pas été
lancé dans Supabase**, la base répond « cette colonne n'existe pas »
(code `42703`). Le robot ne reconnaît pas cette réponse comme « base pas
encore migrée » : il ne fait alors sonner **aucun** téléphone, Android
compris, **et ne l'écrit nulle part**. Le site, lui, la reconnaît.
*Prouvé par un essai réel sur une vraie base.*

**Corrigé le 2 octobre** (`totem/nuage.py`, `appareils`) : la lecture
reconnaît maintenant aussi cette réponse, et retombe sur l'ancienne lecture —
tous les téléphones sonnent, comme avant la migration. Le test
`BaseSansLaMigrationDuDeuxOctobre` rejoue la réponse exacte d'un vrai
PostgREST ; sur le robot d'avant, il échoue (liste vide).

---

## Ce que la documentation du projet disait de faux

- `docs/MOBILE.md` (section 7) : « Apple Push Keys ← Expo la crée, ne rien
  téléverser ». **Faux** en fabrication automatique. Contredit la section 5 du
  même document, qui dit juste.
- `docs/MOBILE.md` : « restent vides jusqu'à la première compilation qui
  aboutit — c'est Expo qui fabrique ». **Faux** pour la clé de notifications.
- `.github/workflows/application-iphone.yml` (commentaire d'en-tête) : « les
  clés de notification, c'est Expo qui les fabrique ». **Faux**, même raison.
- Les deux fichiers `.p8` (dépôt chez Apple / notifications) ne sont jamais
  distingués.
- `.github/workflows/mise-a-jour.yml` : la description des canaux oublie
  l'iPhone (voir problème n°2).
- `docs/MOBILE.md` et l'écran de GitHub disent qu'une mise à jour s'applique
  « au prochain démarrage » : en réalité, elle se **télécharge** à un
  démarrage et s'**applique** au suivant.

---

## Défauts secondaires (moins graves)

- **Sur l'iPhone installé**, la pastille « Ce téléphone sonnera. » s'affiche
  dès que le téléphone est inscrit — même si Apple refuse ensuite de livrer.
- **Sur l'iPhone installé**, « Envoyer un essai » peut dire « Rien n'a pu être
  envoyé » sans cause quand la réponse d'Apple tarde, et « Envoyé » dès qu'un
  autre téléphone du compte a sonné.
- **Le robot** écrit « les téléphones sonnent à nouveau » quand la liste des
  téléphones devient **vide** — un silence pris pour un succès.
- **Le site** dit « Remis. Votre téléphone a sonné. » quand Apple a accepté le
  message — Apple ne garantit pas que le téléphone l'ait reçu.
- **Le site**, si la base ne répond pas pendant un essai, dit « Aucun
  téléphone n'est inscrit » au lieu de « la base ne répond pas ».
- **L'application** n'a pas de délai maximal autour de la demande de jeton :
  sans réseau, l'inscription peut rester bloquée jusqu'au redémarrage.

---

## Ce que vous seul pouvez vérifier (et ce que chaque réponse tranche)

1. **expo.dev → projet `totem` → Credentials → iOS → `com.bonzinilabs.totem`**
   — y a-t-il une clé de notifications (« Push Key ») ? *Tranche le
   problème n°1.* — **Constaté le 2 octobre : le cadre était VIDE.** La clé
   existait chez Apple depuis le 8 septembre, mais n'avait jamais été déposée
   chez Expo. Déposée le jour même.
2. **Sur le site : Console → Les gens → « Les téléphones que TOTEM fait
   sonner »** — votre iPhone y figure-t-il (une ligne « ios ») ? *Tranche :
   l'iPhone est-il inscrit ?*
3. **Sur le site, connecté avec votre compte (pas la clé de secours) :
   Réglages → « Envoyer un essai »** — quelle phrase s'affiche pour l'iPhone ?
   « la clé Apple manque au projet Expo » confirme le problème n°1.
4. **Sur le site : Réglages → Terminal → « Version »** — quel numéro ?
   `4584704` = robot à jour ; un autre numéro = robot ancien.
5. **Supabase de TOTEM** — le fichier SQL du 2 octobre a-t-il été lancé ?
   *Tranche le problème n°4.*

---

## Le plan de correction, en petites étapes

| Étape | Qui | Quoi |
|---|---|---|
| 2 | vous | Les vérifications ci-dessus. ✅ L'iPhone est inscrit (Console → Les gens) ; le robot est à jour (4584704) ; le Samsung sonne. |
| 3 | Claude | Corriger le défaut du robot (problème n°4), avec son test. ✅ |
| 4 | vous | ~~Créer la clé chez Apple~~ : elle existait déjà depuis le 8 septembre (Key ID `7H5K87B6CG`, Sandbox & Production) ; **déposée chez Expo le 2 octobre** ✅ |
| 5 | vous, après la fusion | Mettre à jour le robot (cette correction). |
| 6 | ensemble | « Envoyer un essai » depuis le site : l'iPhone doit sonner. |
| 7 | Claude | Corriger la documentation et les descriptions de GitHub. |
| 8 | vous, guidé | Refabriquer l'iPhone et Android en 1.1.0, puis publier la mise à jour sur le bon canal. |
| 9 | vous | Décider du paquet Android resté en brouillon. |
| 10 | Claude | Les défauts secondaires. |

---

## Annexe — les preuves

- Compilation iPhone : GitHub Actions, exécution 34232385905 (journal du
  travail 102081504390), build Expo `adc4d700-055a-4691-864b-83d5a66c4b0d`,
  version 1.0.0, n° 4, profil `essai`, commit `3d2694a`.
- Dépôt TestFlight : exécution 34236227290 (travail 102094524352).
- Fichier de l'application iPhone (lu) : `Expo.plist` →
  `EXUpdatesRuntimeVersion = 1.0.0`, `expo-channel-name = essai` ;
  droit `aps-environment = production`.
- Dernière compilation Android : exécution 33678826292, 1.0.0, n° 5,
  `production`, « Release status: DRAFT ».
- Mises à jour : 34263339471 (8 sept., `essai`, 1.0.0 — la dernière qui
  atteint l'iPhone), 34479875564 (10 sept., `essai`, 1.1.0),
  36942510966 (1er oct., `production`, 1.1.0).
- Montée de version 1.0.0 → 1.1.0 : commit `435a1b9`, aucune compilation
  ensuite.
- Clé absente : description de la demande de fusion n°88 (9 septembre).
- Code d'Expo (`eas-cli`) : `IosCredentialsProvider.getPushKeyAsync` rend
  `null` en mode non interactif ; `displayProjectCredentials` n'affiche jamais
  la clé de notifications.
- Documentation d'Expo : clé de notifications « Used at: Run time »
  (docs.expo.dev/app-signing/app-credentials) ; erreur `InvalidCredentials`
  (docs.expo.dev/push-notifications/sending-notifications).
- Défaut du robot : `totem/nuage.py`, fonction `_defaut_de_schema`, qui ne
  reconnaît ni `42703` ni « does not exist ».
