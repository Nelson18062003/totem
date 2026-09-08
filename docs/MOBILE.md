# L'application du téléphone

> Résultat visé : une icône TOTEM sur l'écran d'accueil, qui s'ouvre sur les
> caisses en trois dixièmes de seconde, et qui **sonne** quand un paiement
> arrive à Douala. Android d'abord, iPhone le jour où Apple ouvre la porte —
> sans réécrire quoi que ce soit.

Ce document dit **pourquoi** ces choix, pas seulement lesquels. Il se lit
avant d'écrire la première ligne.

---

## 1. Pourquoi une vraie application, et pas le site

Le site fait déjà tout. Il s'ajoute même à l'écran d'accueil (voir
[`MISE-EN-LIGNE.md`](MISE-EN-LIGNE.md)). Trois choses lui manquent, et elles
comptent :

| Ce qui manque | Ce que ça coûte aujourd'hui |
|---|---|
| **La sonnerie** | Un paiement arrive à Douala ; le propriétaire l'apprend quand il pense à ouvrir le site. La plateforme guette en boucle (`/api/actualite`), mais seulement **pendant** qu'elle est ouverte. Fermée, elle ne guette plus. |
| **L'ouverture immédiate** | Une adresse à taper, un navigateur à réveiller, une session à revérifier. Le propriétaire le dit lui-même : c'est fastidieux. |
| **Le secret bien rangé** | Le mot de passe vit dans un cookie de navigateur. Sur téléphone, il a sa place dans le coffre du système — celui que le doigt ou le visage ouvre. |

La sonnerie est la vraie raison. Le reste est du confort — précieux, mais du
confort. Sur iPhone, une page ajoutée à l'écran d'accueil ne sonne pas de
façon fiable ; c'est une limite d'Apple, pas un défaut de notre code.

---

## 2. Un seul dépôt, pas deux

**Ne pas créer un nouveau projet.** L'application du téléphone rejoint ce
dépôt, à côté du robot et du site :

```
totem/
├── totem/     le robot de Douala          (Python)
├── web/       la plateforme               (Next.js)
├── mobile/    l'application du téléphone  (Expo)   ← nouveau
└── noyau/     ce que les deux partagent   (TypeScript) ← nouveau
```

La raison est celle que le propriétaire a formulée : *« si je modifie quelque
chose sur le téléphone, je veux le modifier aussi sur le site. »* Deux dépôts,
c'est la promesse de deux vérités qui divergent — un montant arrondi ici et pas
là, une nature de reçu ajoutée d'un côté seulement.

### Ce qui entre dans `noyau/`

Ce sont les fichiers de `web/lib/` qui **ne touchent ni au navigateur ni au
DOM**. Ils se déplacent tels quels, sans une ligne modifiée :

| Fichier | Ce qu'il tient |
|---|---|
| `types.ts` | la forme d'une carte, d'un paiement, d'un terminal |
| `natures.ts` | les quatre natures de reçu — le miroir de `declencheur.py` |
| `codes.ts` | le catalogue des codes USSD et les raccourcis appris |
| `langue.ts` | anglais / français |
| `textes/` | **tout le dictionnaire des deux langues** (≈ 1 000 lignes) |

Le dictionnaire est le morceau qui justifie à lui seul le partage. Une phrase
corrigée en français doit l'être partout, du même geste. Le site importe
`@totem/noyau`, l'application aussi. Personne ne recopie.

Restent dans `web/` : `serveur.ts` (il porte la clé de service, qui ne quitte
jamais le serveur), `session.ts`, `langue-serveur.ts`, `pdf-rib.ts`.

---

## 3. Quelle langue de programmation

**React Native, avec Expo.** Le code s'écrit en **TypeScript** — la même langue
que le site.

Ce n'est pas un choix de mode, c'est une conséquence de ce qui existe déjà.

### Ce qui a été pesé

| Chemin | Ce qu'on y gagne | Ce qu'on y perd |
|---|---|---|
| **React Native + Expo** *(retenu)* | Le noyau TypeScript se partage **sans traduction**. Android et iPhone sortent du même code. Les compilations se font dans le nuage — pas besoin de Mac, même pour l'iPhone. | Quelques animations très fines demandent un peu plus de soin qu'ailleurs. |
| **Flutter** | Rendu très fluide, belle boîte à outils graphique. | Tout se réécrit en **Dart** : les 1 000 lignes du dictionnaire, les types, le catalogue des codes. Trois endroits où la liste des natures peut diverger au lieu de deux. |
| **Kotlin natif (+ Swift plus tard)** | Ce qu'Android fait de mieux. | **Zéro partage**, et l'iPhone serait un second projet, écrit une seconde fois, dans une troisième langue. |

Flutter n'est pas un mauvais outil — c'en est un très bon. Il est simplement le
mauvais outil *pour ce dépôt-ci*, parce que ce dépôt est déjà en TypeScript et
que sa valeur tient dans des règles écrites une fois.

### « Beau et puissant », concrètement

La beauté ne vient pas du cadre technique, elle vient de la charte
([`IDENTITE.md`](IDENTITE.md)) et de sa discipline. Elle se transporte :

- les jetons de `globals.css` (latérite, sable, encre, les rayons de 8 px,
  l'absence assumée d'ombre) deviennent un fichier de constantes ;
- Inter et DM Sans s'embarquent dans l'application — mêmes lettres qu'à
  l'écran et sur les reçus ;
- le symbole reste décrit **une seule fois**, dans `brand/generer.py`. Les
  icônes du téléphone en sortent, comme celles du site. On ne le redessine pas.

La puissance, elle, vient de deux choses que le site ne peut pas offrir : la
sonnerie, et l'ouverture instantanée avec le doigt.

---

## 4. Le point difficile : à qui l'application parle

C'est **la** décision d'architecture, et elle n'est pas évidente.

Aujourd'hui, la plateforme lit Supabase avec la **clé de service** — celle qui
contourne toutes les règles d'accès. Elle ne quitte jamais le serveur de
Vercel (voir le commentaire en tête de `web/lib/serveur.ts`).

Une application de téléphone est **entre les mains de qui la tient**. Son
contenu s'extrait. **Aucun secret ne peut y vivre.** Mettre la clé de service
dans l'application reviendrait à publier la clé du coffre.

### La réponse : la plateforme devient le guichet

```
[Application]  ──HTTPS + jeton──▶  [Vercel]  ──clé de service──▶  [Supabase]
                                      ▲
                                      └── la clé ne bouge pas d'ici
```

L'application ne connaît **que** l'adresse de la plateforme et son propre
jeton de session. Elle ne connaît ni Supabase, ni la clé.

Ce chemin a un mérite qui dépasse la sécurité : **les règles restent écrites
une seule fois**. Le nettoyage des réponses USSD dans
`web/app/api/commande/route.ts` — celui qui retire les guillemets et les
retours à la ligne pour qu'une réponse ne puisse pas injecter d'ordres au
modem — ne se réécrit pas dans l'application. Elle passe par la même porte.

### Ce qu'il faut ajouter côté plateforme

Peu de chose, et rien qui casse l'existant :

1. **Le jeton au lieu du cookie.** `lib/session.ts` signe déjà un jeton en
   HMAC, vérifiable dans le middleware. Il suffit que `middleware.ts` accepte
   aussi un en-tête `Authorization: Bearer <jeton>` en plus du cookie. Le
   navigateur garde le cookie, le téléphone porte le jeton. Même signature,
   même durée, même verrou.
2. **Une route qui rend les données en JSON.** Les écrans du site calculent
   aujourd'hui leurs données côté serveur, dans le rendu de la page. Une route
   `/api/donnees` rend le même objet `Donnees` à l'application.
3. **L'enregistrement du téléphone**, pour la sonnerie (paragraphe suivant).

Le jeton se range dans le coffre du système (`expo-secure-store`), pas dans un
fichier ordinaire. Il s'ouvre au doigt ou au visage.

### Et Supabase Auth ?

C'est la destination finale déjà annoncée dans `serveur.ts` : clé publique,
session Supabase, règles d'accès qui font le tri. Elle permettrait à
l'application de lire la base en direct — donc de fonctionner hors ligne, et
de recevoir les nouveautés sans interroger en boucle.

**Ce n'est pas pour maintenant.** Elle demande de reprendre toutes les règles
d'accès de `sql/schema.sql`, et de déplacer le verrou du mot de passe vers des
comptes. On y va quand l'application existe et qu'on sait ce qu'elle demande
vraiment, pas avant.

---

## 5. La sonnerie

C'est la fonction qui justifie tout le reste.

### Le chemin, en vrai

```
SMS reçu à Douala
   → le robot le lit, le comprend (ou pas), l'annonce sur Telegram
   → il demande à la plateforme la liste des téléphones inscrits
   → il appelle le guichet d'Expo, qui appelle Google (FCM)
   → le téléphone sonne : « MTN ·8901 — +20 000 FCFA de NGONO Marie »
```

**C'est le robot qui envoie, pas le nuage.** On avait d'abord imaginé une
fonction posée dans Supabase, déclenchée à l'écriture. C'était une mauvaise
idée, pour une raison qui tranche : le robot tient le SMS **exactement tel
qu'il est arrivé**, à l'octet près, et c'est cela que la notification montre.
Il a aussi déjà sa file d'attente (une coupure Internet ne perd rien), et
c'est une pièce mobile de moins. Une fonction du nuage, elle, arriverait après
coup, sur une ligne relue en base.

Les fichiers : `totem/notification.py` compose le texte, `totem/nuage.py`
(`appareils()`) va lire à qui, `totem/app.py` (`_faire_sonner`) déclenche —
dans un fil à part, pour qu'un guichet lent ne retarde jamais la lecture du
SMS suivant.

### Ce que la notification montre

- **Le message reçu, en aperçu.** Comme WhatsApp ou l'application SMS du
  téléphone : le propriétaire lit son message depuis le volet des
  notifications, tel qu'il est arrivé — **code compris** —, sans ouvrir
  l'application. On avait un temps résumé le SMS et masqué ses codes « pour
  l'écran verrouillé » ; personne ne l'avait demandé, c'était une faute,
  retirée. Ce qui s'affiche sur l'écran verrouillé est le choix du
  propriétaire, dans les réglages de SON téléphone.
- **On n'invente rien.** On montre le texte reçu ; on ne calcule pas un
  montant ni un sens qu'on présenterait comme certains. Ce que le propriétaire
  lit, ce sont les mots de l'opérateur.
- **C'est un aperçu, pas le journal.** Un SMS très long est coupé
  (`APERCU_MAX`, 200 caractères) ; la liste des SMS garde le message entier et
  reste la vérité — une notification peut d'ailleurs se perdre (réseau,
  batterie, système).

Le code secret que le propriétaire tape pendant une opération n'entre jamais
dans une notification — mais il n'arrive pas non plus par SMS : il vit dans les
sessions USSD, pas dans les messages reçus. Ces règles sont gardées par
`tests/test_notification.py`.

### Vérifier que ça sonne, sans attendre un vrai paiement

**Réglages → « Est-ce que mon téléphone sonne ? » → Envoyer un essai.**

Le téléphone doit sonner dans les secondes qui suivent.

Sans ce bouton, il faudrait attendre qu'un vrai client envoie de l'argent
pour savoir si la chaîne fonctionne — et si elle ne fonctionne pas, chercher
à l'aveugle : Firebase ? le jeton ? le canal Android ? la permission refusée
au premier lancement ?

**Ce que l'essai prouve** — le dernier kilomètre, celui qui casse le plus
souvent :

| | |
|---|---|
| ✓ | le jeton de l'appareil est enregistré |
| ✓ | Expo l'accepte |
| ✓ | Firebase le relaie |
| ✓ | Android l'affiche, sur le bon canal, avec le bon son |
| ✗ | **pas** le robot de Douala : ni le modem, ni la lecture du SMS, ni l'analyse |

**Le ménage au passage.** Expo rend un billet par appareil. Un téléphone
désinstallé répond « DeviceNotRegistered » : son jeton est alors retiré de la
base. Sans cette lecture, il y resterait pour toujours, et le compte des
appareils servis mentirait.

Aucun contenu de SMS ne traverse cet essai — le message ne parle que de
lui-même. Ce qu'une vraie notification montre — le message reçu, en aperçu —
se décide chez le robot, à un seul endroit.

### L'inscription d'un téléphone

L'application ne peut pas s'inscrire toute seule dans la base : elle n'a
aucune clé, par construction. Elle passe donc par la plateforme.

```
l'application s'ouvre, la session est valable
   → src/sonnerie.tsx déclare le canal Android, demande la permission
   → Expo rend le jeton de CET appareil : « ExpoPushToken[…] »
   → POST /api/appareil (derrière le verrou) → table « appareils »
```

La route est **derrière le verrou** à dessein : sans cela, n'importe qui
pourrait inscrire son propre téléphone et recevoir les encaissements du
propriétaire sur son écran. Le jeton, lui, n'est pas un secret — il ne dit
rien de la personne, ne localise personne et n'ouvre l'accès à rien : il
autorise seulement à faire sonner ce téléphone-là.

La table s’installe avec `migrations/20260829_consolidation.sql` — la même
migration installe aussi les comptes (voir [`COMPTES.md`](COMPTES.md)).

### Firebase : pourquoi, et ce qu'il faut faire

**Pourquoi.** Sur Android il n'existe qu'un seul chemin pour faire sonner un
téléphone : les serveurs de Google, appelés FCM. Ce n'est pas un choix
d'outil, c'est la plomberie du système — Google possède Android et possède le
tuyau. Expo ne remplace pas FCM, il l'emballe : le guichet d'Expo prend le
message et le remet à Google. Les autres services (OneSignal et compagnie)
font exactement pareil. Il n'y a donc rien à comparer : c'est FCM ou pas de
notification.

Firebase est la console où l'on crée le projet FCM. On y crée **un projet, une
fois**, et on n'y retourne plus.

**Les étapes**, dans l'ordre :

1. [console.firebase.google.com](https://console.firebase.google.com) →
   *Créer un projet* → nom `TOTEM`. Google Analytics : **non**, on n'en a
   aucun usage.
2. Dans le projet → *Ajouter une application* → **Android**.
3. *Nom du package* : `com.bonzinilabs.totem`, **exactement**. C'est la clé
   qui relie l'application au projet ; une faute de frappe ici donne des
   notifications qui n'arrivent jamais, sans message d'erreur.
   Le surnom et l'empreinte SHA-1 : à laisser vides.
4. Télécharger **`google-services.json`**. C'est le seul fichier qui compte.
5. Le déposer dans EAS, **pas dans le dépôt** :
   [expo.dev](https://expo.dev) → le projet `totem` → *Environment variables*
   → *Create variable* → type **File**, nom `GOOGLE_SERVICES_JSON`, visibilité
   *Secret*, et l'envoyer pour les profils de compilation.
6. Relancer une compilation. `mobile/app.config.js` détecte le fichier tout
   seul et le branche.

**Tant que ce n'est pas fait**, rien ne casse : l'application se compile,
s'installe et fonctionne entièrement — seules les notifications restent
muettes. C'est voulu (voir le commentaire en tête de `app.config.js`) : une
ligne fixe dans `app.json` aurait au contraire fait échouer la compilation
sur un fichier absent.

**Pour l'iPhone**, ce sera un autre tuyau (APNs, chez Apple) et une clé à
téléverser chez Expo. Rien à faire tant que l'inscription développeur Apple
n'est pas terminée.

---

## 5 bis. L'adresse de la plateforme — la panne qu'on n'a pas vue venir

Ce paragraphe raconte une vraie erreur, parce qu'elle est instructive.

L'application portait une adresse écrite en dur : `https://totem.vercel.app`.
Elle venait d'une phrase de documentation qui disait « une adresse **comme**
`totem.vercel.app` » — un exemple, pas une adresse. Or ce sous-domaine
existe : il appartient à quelqu'un d'autre, qui y héberge un tout autre
service.

Conséquences, dans l'ordre où on les a vécues :

1. L'application envoyait le mot de passe du propriétaire à un serveur
   inconnu. Il répondait 404, donc rien n'était traité — mais le mot de passe
   avait bien voyagé jusque chez un tiers.
2. À l'écran, cela ressemblait à un refus de connexion. On a cherché
   longtemps du côté du mot de passe. Le mot de passe n'avait rien à voir.

**Ce qui a changé, pour que cela ne se reproduise pas :**

- **Plus d'adresse par défaut.** `app.json` la laisse vide. Une adresse fausse
  est pire que pas d'adresse : sans adresse, l'application la demande ; avec
  une fausse, elle se trompe en silence.
- **L'application vérifie avant de parler.** Elle appelle `/api/plateforme`,
  qui ne répond que « oui, un TOTEM habite ici ». Tant que la réponse n'est
  pas oui, le champ du mot de passe reste fermé. Un mot de passe ne part plus
  vers une adresse qui n'a pas montré patte blanche.
- **Le propriétaire peut corriger l'adresse depuis l'écran de connexion**,
  sans attendre une nouvelle compilation.
- **`https` obligatoire**, sauf pour la machine locale (un `127.0.0.1` ne
  quitte pas l'appareil). En `http`, le mot de passe voyagerait en clair.
- Le verrou vérifie que `/api/plateforme` ne dit rien d'autre que ces trois
  mots (`verifier-le-verrou.mjs`).

> ⚠️ **Si un mot de passe a été tapé pendant cette période**, il est parti
> vers un domaine tiers. Changez-le sur Vercel, et ne le réutilisez nulle
> part ailleurs.

---

## 6. Publier sur Google Play

### Le formulaire de création

| Champ | Ce qu'on met | Pourquoi |
|---|---|---|
| Nom de l'application | `TOTEM` | 30 caractères au plus. Le nom se change plus tard, lui. |
| **Nom du package** | `com.bonzinilabs.totem` | ⚠️ **Définitif.** Ne se change **jamais**, ni maintenant ni dans dix ans. Le changer voudrait dire publier une autre application et perdre les installations. À décider posément. |
| Langue par défaut | Anglais (États-Unis) | Le dépôt a tranché : l'anglais d'abord ([`LANGUES.md`](LANGUES.md)). Le français s'ajoute ensuite comme traduction de la fiche — et il compte, pour le Cameroun. |
| Application ou jeu | **Appli** | — |
| Gratuite ou payante | **Sans frais** | ⚠️ Une application publiée gratuite ne peut **plus jamais** devenir payante. |
| Les trois cases | à cocher | Règlement, signature Play, lois d'exportation. |

### Ce qui compte plus que le formulaire

**Le compte d'organisation change tout.** BONZINILABS est un compte
d'organisation vérifié : il est **dispensé** de l'épreuve des 12 testeurs
pendant 14 jours qu'un compte personnel doit subir avant de publier. On va
directement en production. C'est plusieurs semaines gagnées — et c'est déjà
gagné.

**L'application ne demande jamais l'accès aux SMS du téléphone.** À écrire une
fois pour toutes, ici : les SMS sont lus **par le modem de Douala**, pas par le
téléphone. `READ_SMS` et `RECEIVE_SMS` sont des autorisations dites restreintes ;
les demander déclenche un formulaire de justification et, presque toujours, un
refus. Notre architecture nous en dispense naturellement. **Ne jamais les
ajouter au manifeste**, même « pour essayer ».

**La déclaration des fonctionnalités financières** est obligatoire pour toute
nouvelle application qui en contient. À remplir honnêtement : TOTEM ne rend
aucun service financier à des tiers — c'est une **télécommande** pour des SIM
que le propriétaire possède, et l'argent reste chez MTN et Orange. Ranger
l'application dans **Business**, pas dans Finance.

**Le niveau d'API.** Depuis le 31 août 2026, une nouvelle application doit
viser Android 16 (API 36). La première compilation le vise donc dès le premier
jour — pas de rattrapage plus tard.

**Une adresse de politique de confidentialité** est exigée. Une page
`/confidentialite` sur la plateforme fera l'affaire ; elle doit dire ce qui est
gardé (les SMS des opérateurs, les soldes) et ce qui ne l'est jamais (le code
secret).

---

## 5 ter. Ne plus jamais taper l'adresse

Le propriétaire ne devrait **jamais** avoir à taper l'adresse de son serveur.
On ouvre l'application, on met son courriel et son mot de passe, on entre.
C'est tout.

Le champ « Changer l'adresse » existe parce que l'adresse livrée était fausse
(§ 5 bis), et qu'on l'a retirée plutôt que d'en deviner une seconde. Mais un
champ vide reporte le travail sur la personne, à chaque installation. C'était
la mauvaise réponse.

### Le réglage, posé une fois

**GitHub → le dépôt → Settings → Secrets and variables → Actions → onglet
« Variables » → New repository variable**

| Champ | Valeur |
|---|---|
| Name | `ADRESSE_PLATEFORME` |
| Value | `https://totemlabs.app` |

Toutes les compilations suivantes portent l'adresse dans le paquet. Le champ
ne s'affiche plus, sur aucun téléphone.

### Une variable, pas un secret

Une adresse web est publique par nature — elle est dans la barre du
navigateur de quiconque ouvre la plateforme. La ranger parmi les secrets
laisserait croire qu'elle en est un, et un jour quelqu'un traiterait un vrai
secret avec la même désinvolture.

### Les deux workflows la posent

`scripts/poser-l-adresse.mjs` est appelé par **les deux** :

- **Application Android**, avant de compiler ;
- **Mise à jour**, avant de publier — et c'est le piège. Une mise à jour
  remplace le code JavaScript de l'application. Publiée sans l'adresse, elle
  **effacerait** celle que la compilation avait posée, et l'écran la
  redemanderait sur tous les téléphones à la fois, sans que personne
  comprenne pourquoi.

Le script exige `https`. Le mot de passe du propriétaire passe par cette
adresse ; en clair, il voyagerait à la vue de tout le réseau traversé. Mieux
vaut refuser une compilation que livrer une application qui fuit.

Sans réglage posé, rien n'échoue : l'application demande l'adresse à l'écran,
comme avant. Moins bien, pas cassé.

---

## 6 bis. Mettre à jour, ensuite

Deux chemins, et ils ne servent pas à la même chose.

### Le chemin court : la mise à jour à distance (une minute)

Actions → **« Mise à jour »** → Run workflow → canal `apercu`.

Le nouveau code part chez Expo. Les téléphones déjà installés le prennent
**au prochain démarrage de l'application**. Rien à réinstaller, rien à
télécharger à la main, personne à prévenir.

C'est le chemin de tous les jours : les écrans, les textes, les couleurs,
les calculs, les corrections de bugs. L'écrasante majorité du travail.

### Le chemin long : une nouvelle compilation (vingt minutes)

Actions → **« Application Android »** → Run workflow → profil `apercu`.

Obligatoire dès qu'une brique **native** bouge :

- une permission Android ajoutée ou retirée ;
- une bibliothèque nouvelle (`expo-notifications`, `expo-updates`…) ;
- le fichier `google-services.json` de Firebase ;
- la version d'Android visée.

### La règle à tenir soi-même

`app.json` porte `runtimeVersion: { policy: "appVersion" }` : **une mise à
jour ne rejoint que les applications qui portent le même numéro de
`version`.**

> **Dès qu'une brique native change, montez `version` dans `app.json` et
> recompilez** — avant de publier quoi que ce soit par le chemin court.

Sans cela, une mise à jour écrite pour une bibliothèque absente de
l'application installée la ferait planter au démarrage. Et une application qui
plante au démarrage **ne peut plus recevoir la correction** : il faudrait
désinstaller et réinstaller à la main, sur chaque téléphone.

### Pourquoi pas l'empreinte automatique

On avait d'abord réglé `runtimeVersion` sur `fingerprint` : Expo calcule alors
une empreinte de tout ce qui est natif, et refuse tout seul les mises à jour
incompatibles. C'est mieux — quand ça marche.

Ici, ça ne marchait pas, et la compilation le disait :

```
Runtime version mismatch:
- Runtime version calculated on local machine: 9479e01c...
- Runtime version calculated on EAS:           a6b1e178...
```

L'empreinte est calculée à **deux endroits**, et les deux ne voient pas le
même projet :

| | machine GitHub | serveur Expo |
|---|---|---|
| `google-services.json` | absent | présent (écrit depuis le secret) |
| dossier `android/` | absent | présent (généré par le prebuild) |

Deux mondes qui ne peuvent pas se ressembler, donc deux empreintes, donc un
refus — à chaque compilation. Le fingerprint est un bon garde-fou quand on
compile à un seul endroit ; il ne l'est pas ici.

C'est la première compilation avec Firebase qui l'a révélé : celle d'avant,
sans le fichier, passait — les deux côtés étaient également démunis.

### Le premier paquet ne reçoit rien

Un détail qui se paie cher si on l'ignore : `expo-updates` est une brique
native. **L'APK compilé avant son installation ne sait pas qu'il existe** et
ne recevra jamais aucune mise à jour à distance.

Il faut donc **une compilation complète** après ce changement. Celle-là, et
toutes celles d'après, savent écouter.

---

## 7. L'iPhone

### Ce qui s'est passé

Dossier d'organisation déposé le **15 août 2026**. Le 8 septembre — **vingt-
quatre jours** — il était toujours « en cours de traitement », sans un
courriel, sans un appel, sans une demande de document. Une relance a été
déposée le 3 septembre : dossier **102952763167**, identifiant d'inscription
**UTRBGQJKX9**.

Ce qui bloque le plus souvent une inscription d'organisation, dans l'ordre :

1. **Le nom ou l'adresse ne correspondent pas au dossier D&B**, au caractère
   près. Apple ne peut alors pas relier les deux dossiers, et le nôtre attend.
2. **Le téléphone ne répond pas.** Apple appelle le numéro déclaré chez D&B
   pour vérifier l'autorité de signature. Un appel manqué, et le dossier dort
   sans que personne ne prévienne. C'est la cause la mieux documentée des
   blocages muets — et elle ne se répare pas chez Apple, elle se répare chez
   [D&B](https://support.dnb.com/?CUST=APPLEDEV).

### La décision : publier sous le compte individuel, transférer ensuite

Attendre indéfiniment n'était pas tenable. Un compte **individuel** a donc été
ouvert, et c'est lui qui publie. Le jour où l'organisation s'ouvre,
l'application se **transfère** — Apple le prévoit.

**Ce que le transfert conserve** : les avis, les notes, les installations,
l'identifiant du paquet, et la continuité des mises à jour pour les gens déjà
installés. L'application reste disponible pendant l'opération.

**Ce qu'il ne conserve PAS, et qui compte ici** :

- **Les clés de notification.** Le compte qui reçoit doit en générer de
  nouvelles. Pour TOTEM, dont la notification est *le* canal temps réel — un
  SMS arrive, le téléphone sonne, l'écran se met à jour —, c'est l'étape à ne
  pas oublier le jour du basculement. Une application qui ne sonne plus a
  perdu ce qui la rend utile.
- **TestFlight.** Il faut retirer les versions et les testeurs avant de
  transférer.

**Ce qu'il faut savoir avant de publier** : sur un compte individuel, l'App
Store affiche le **nom légal de la personne**, pas celui de la société. La
fiche portera donc « Nelson Soh » et non « BONZINILABS LTD ». Sur une
application qui montre des soldes Mobile Money, un examinateur peut le
relever. Ce n'est pas un refus annoncé — c'est une friction connue, et la
réponse est que la personne et la société sont la même.

### Ce qui diffère d'Android, et qu'il faut savoir avant de cliquer

**Il n'y a pas de profil « apercu ».** Sur Android, un APK s'installe
directement sur le téléphone, sans magasin — c'est ainsi qu'on éprouve une
compilation avant de la publier. Sur iPhone, rien ne s'installe hors du
magasin sans enregistrer l'appareil un par un chez Apple. Le chemin d'essai de
l'iPhone, c'est **TestFlight**, donc le profil « essai ».

**Tout passe par TestFlight, « production » compris.** `eas submit` dépose
dans App Store Connect ; la version y est aussitôt distribuable aux testeurs.
La mettre sur l'App Store **public** reste un geste séparé, chez Apple. Il n'y
a pas d'équivalent iPhone du « brouillon sur la piste publique » d'Android.

### Ce qu'il faut poser une seule fois

1. Un compte Apple Developer en règle.
2. App Store Connect → Mes apps → « + » → créer la fiche, avec l'identifiant
   **`com.bonzinilabs.totem`** (celui d'`app.json`, qui ne se change jamais).
3. App Store Connect → Utilisateurs et accès → Intégrations → Clés d'API →
   « + » → rôle **Admin**. Noter l'ID de la clé et l'ID de l'émetteur,
   télécharger le fichier `.p8`. **Apple ne le donne qu'une fois.**

   **Le rôle n'est pas un détail, et ce document a d'abord dit « App
   Manager ».** Ce rôle suffit à déposer une version ; il ne suffit pas à
   demander à Apple un certificat de signature. Le guide d'Expo dit
   « Admin ». Une clé de rôle trop faible ne se plaint pas au moment où on
   la crée : elle échoue bien plus tard, sur une étape qui n'a pas l'air
   d'y être pour quelque chose. Une clé se recrée en deux minutes — s'il y
   a un doute sur le rôle de la sienne, en refaire une coûte moins cher que
   de chercher.
4. GitHub → Settings → Secrets and variables → Actions → trois secrets :
   `ASC_CLE_P8` (le contenu entier du `.p8`), `ASC_CLE_ID`, `ASC_EMETTEUR_ID`.
5. **La signature de l'application**, créée une fois à la main :

   ```sh
   npx eas-cli login
   npx eas-cli credentials --platform ios
   ```

6. Deux **variables** — onglet « Variables », **pas « Secrets »** :
   `APPLE_EQUIPE_ID` et `APPLE_EQUIPE_TYPE` (`INDIVIDUAL` ici). Voir plus bas.

**Une clé, et non l'identifiant Apple avec son mot de passe** : un compte Apple
porte une double authentification, et en intégration continue personne n'est
là pour taper le code reçu sur le téléphone. La clé s'en passe — c'est le
pendant du compte de service côté Google.

Ensuite : onglet Actions → **« Application iPhone »** → Run workflow → profil
`essai`. Le reste est écrit dans l'en-tête du workflow.

### La signature ne se fabrique pas toute seule, et c'est voulu

Le premier lancement s'est arrêté au bout d'**une minute vingt-cinq**, sur une
ligne d'anglais au milieu de cinquante autres :

```
✓ Using remote iOS credentials (Expo server)
Distribution Certificate is not validated for non-interactive builds.
Failed to set up credentials.
Credentials are not set up. Run this command again in interactive mode.
```

Tout ce qui précédait était vert — les types, les règles partagées, ce que le
paquet emporte, la clé d'Apple. Les trois secrets étaient bien posés : l'étape
« Poser la clé d'Apple » ne les aurait pas laissés passer.

**Ce qui manquait, ce sont deux pièces que ce dépôt ne peut pas contenir.**
Apple exige, pour reconnaître un paquet iPhone comme le nôtre, un **certificat
de distribution** et un **profil de provisionnement**. Ils vivent chez Expo, ils
se demandent à Apple, et **personne ne les avait jamais demandés** — l'iPhone
n'avait encore rien fabriqué.

**Expo REFUSE de les créer en `--non-interactive`.** Ce n'est pas une lacune de
l'outil, c'est la bonne décision : une signature est ce qui prouve qu'un paquet
vient de nous. Elle ne se fabrique pas toute seule, dans un travail lancé par
un robot, sans que son propriétaire la voie se créer.

Le geste, une seule fois, sur n'importe quel ordinateur — **Windows compris,
aucun Mac n'est nécessaire** : Expo parle à Apple depuis ses propres machines.

```sh
npx eas-cli login
npx eas-cli credentials --platform ios
```

**J'avais écrit la liste des « une seule fois » sans ce point.** Elle allait du
compte Apple jusqu'aux secrets GitHub, et s'arrêtait juste avant la seule
chose qui bloquait vraiment. Une liste de préparatifs incomplète est pire
qu'une absence de liste : on la déroule, on la croit finie, et on découvre le
trou au premier essai.

**Le travail le dit maintenant lui-même.** Il relit sa propre sortie, et quand
il y trouve cette panne-là, il écrit dans son résumé — en français — ce qui
manque et la commande qui le règle. Éprouvé dans les trois sens : une
compilation réussie n'écrit rien, une panne de réseau n'écrit rien non plus
(pas de faux diagnostic), et la panne de signature sort le mode d'emploi
même quand elle se cache derrière une sortie qui se termine bien.

### La clé se pose à DEUX endroits, et le second se voit

Sur `expo.dev` → l'organisation → **Android & iOS credentials**, quatre
sections. Trois se remplissent toutes seules, une se remplit à la main :

```
Apple Distribution Certificates   ← Expo le crée, ne rien téléverser
Apple Push Keys                   ← Expo la crée, ne rien téléverser
App Store Connect API Keys        ← C'EST ICI qu'on met quelque chose
Apple Teams                       ← se remplit dès que la clé est là
```

**La clé d'API est le passeport d'Expo pour parler à Apple.** Tant qu'elle
n'est nulle part, Expo ne peut ni créer ni vérifier une signature : il voit
qu'il n'en a pas, il ne peut pas en demander une, il s'arrête. C'est
exactement le mur des deux premiers lancements.

Elle se donne de deux façons, et **ce n'est pas l'une OU l'autre** :

| où | portée | ce que ça sert |
|---|---|---|
| les variables du workflow | ce travail-là | la compilation et le dépôt |
| le compte Expo (cette page) | tout le compte | les signatures, partout |

Les variables suffisent en théorie. Poser aussi la clé sur le compte coûte
deux minutes, se voit sur une page, et **se vérifie d'un coup d'œil** — au
lieu de se déduire d'un journal de compilation. Une configuration qu'on peut
REGARDER vaut mieux qu'une configuration dont on suppose l'effet.

Le bouton est *« Add an App Store Connect API key »* : il demande l'ID de la
clé, l'ID de l'émetteur et le fichier `.p8` — les trois choses déjà rangées
dans les secrets GitHub. **Aucun terminal.**

Une fois la clé posée, la section « Apple Teams » cesse d'être vide : c'est
le signe qu'Expo a réussi à se présenter chez Apple. Les deux premières
sections, elles, restent vides jusqu'à la première compilation qui aboutit —
**c'est Expo qui fabrique le certificat, on ne le téléverse pas.**

### Un certificat expire, et il expirera un mauvais jour

La compilation reçoit maintenant, elle aussi, la clé d'Apple et l'identité de
l'équipe (`EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`,
`EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_TEAM_TYPE`). Elle ne les avait pas : seule
l'étape de dépôt les portait.

Un certificat de distribution **dure un an**. Un profil se périme dès qu'on
touche aux capacités de l'application. Sans ces variables, Expo constate
l'avarie et s'arrête net, faute de pouvoir se présenter à Apple ; avec elles,
il répare et continue. Elles n'inventent pas la première signature — elles
entretiennent celle qui existe.

L'identifiant d'équipe est une **variable**, pas un secret : il se lit dans
n'importe quelle application publiée sur l'App Store. Le ranger parmi les
secrets ne protégerait rien et ferait croire qu'il protège quelque chose.

**Les deux onglets sont sur la même page, et cela s'est payé.** Au deuxième
lancement, les deux valeurs étaient vides :

```
EXPO_ASC_API_KEY_PATH: ./app-store-connect.p8
EXPO_ASC_KEY_ID: ***
EXPO_ASC_ISSUER_ID: ***
EXPO_APPLE_TEAM_ID:            ← vide
EXPO_APPLE_TEAM_TYPE:          ← vide
```

Le travail s'est arrêté sur la même erreur que la veille, et **l'essai a passé
pour un verdict alors qu'il n'avait rien essayé** : Expo n'avait toujours aucun
moyen de se présenter à Apple. Une variable rangée dans le mauvais onglet vaut
`""` sans que rien ne le dise, et l'échec sort une étape plus loin, sur un
message qui ne parle pas d'elle.

Deux corrections, dans cet ordre d'importance :

**Le travail REGARDE l'identité d'équipe avant de compiler**, et l'écrit —
`Identité d'équipe Apple : A1B2C3D4E5 (INDIVIDUAL)` — ou avertit qu'elle
manque, en disant où la poser. C'est le même principe que la clé `.p8` relue
avant la compilation : *découvrir au bout de vingt minutes que ça ne pouvait
pas marcher, c'est vingt minutes pour rien.* La clé avait ce garde-fou ;
l'identité d'équipe, ajoutée plus tard, ne l'avait pas.

**Les deux onglets sont acceptés** (`vars.X || secrets.X`). Ranger un
non-secret parmi les secrets n'est pas une faute qui mérite un échec — c'est
une faute de rangement. Et le type d'équipe vaut `INDIVIDUAL` par défaut,
puisque c'est le compte sous lequel TOTEM publie.

### Deux pièges rencontrés en câblant tout cela

**Le bloc `infoPlist` est recopié MOT POUR MOT dans l'application.** La
convention de commentaires du dépôt (`"//quelquechose": "…"`) ne vaut qu'au
niveau d'Expo, qui ignore ce qu'il ne connaît pas. Écrite dans `infoPlist`,
elle est ressortie telle quelle dans le `Info.plist` du paquet — de la prose
française embarquée dans l'application installée. Les commentaires restent un
cran au-dessus.

**Le numéro de compilation ne s'écrit pas dans `app.json`.** Il y valait
`"1"`, et il serait resté à `"1"` à chaque envoi — Apple refuse un numéro déjà
vu. C'est exactement le piège que le `versionCode` d'Android avait déjà : avec
`appVersionSource: "remote"`, le numéro est tenu par le serveur d'Expo, et une
valeur écrite ici est ignorée à la compilation tout en restant visible dans le
paquet. Deux vérités pour un seul numéro.

---

## 8. Obtenir le paquet, sans ouvrir un terminal

`eas build` doit tourner quelque part, avec le compte Expo du propriétaire.
Plutôt que d'installer Node et les outils Android sur une machine, c'est
**GitHub qui compile** : `.github/workflows/application-android.yml`.

### Une seule fois

Le projet appartient à l'**organisation** `bonzinilabss-team`, pas à un
compte personnel. Le jeton doit donc appartenir à l'organisation lui aussi —
c'est un **robot**, pas une personne.

1. **expo.dev** → l'organisation → *Settings* → *Access tokens* →
   **Add robot**.
   - Nom : `github-totem` (celui qui compile — un robot par usage).
   - Rôle : **Developer**. C'est le plus petit rôle qui sache « make new
     builds, release updates, and manage credentials » ; Owner et Admin
     donneraient en plus le droit de supprimer le compte, ce qu'un atelier
     de compilation n'a aucune raison de pouvoir faire.
2. Sur le robot créé → **Create token** → copier la chaîne.
   **Expo ne la remontre jamais.**
3. **GitHub** → le dépôt → *Settings* → *Secrets and variables* → *Actions*
   → *New repository secret*. Nom : `EXPO_TOKEN`. Valeur : le jeton.

Le jeton vit dans les secrets du dépôt : ni dans le code, ni dans le journal
de compilation — GitHub le masque.

> **Pourquoi un robot plutôt qu'un jeton personnel.** Un jeton personnel agit
> *au nom du propriétaire*, partout, sans limite. Un robot ne sait faire que
> ce que son rôle autorise, et se révoque sans toucher au compte de personne.
> C'est ce qu'Expo recommande pour l'intégration continue.
>
> C'est aussi pour cela qu'`app.json` porte `owner: "bonzinilabss-team"` :
> sans cette ligne, Expo attribuerait le projet au compte qui lance la
> commande — donc au robot — et le projet sortirait de l'organisation.

### Chaque fois

Onglet **Actions** → **Application Android** → *Run workflow* → choisir le
profil. Une vingtaine de minutes plus tard, le lien de téléchargement
s'affiche au bas de la page, et Expo l'envoie aussi par courriel.

> **`eas.json` n'accepte aucun commentaire.** Contrairement à `app.json`, qui
> laisse passer les clés inconnues, `eas.json` est validé strictement contre
> son schéma : une clé `"//"` ajoutée pour s'expliquer fait échouer la
> compilation en deux secondes, avec « `"build.apercu.//" is not allowed` ».
> Les explications des profils vivent donc ici, pas dans le fichier.

### Les trois profils

| Profil | Ce qu'il fabrique | Qui peut l'installer |
|---|---|---|
| `apercu` | un **APK**, à installer d'un lien ou d'un code à scanner | vous seul — ni magasin, ni compte Google |
| `essai` | un **AAB** pour la piste d'essai interne | jusqu'à 100 invités, en quelques minutes, **sans examen** |
| `production` | un **AAB** public | tout le monde, après l'examen de Google |

`apercu` est le chemin le plus court pour tenir l'application dans la main :
il ne demande rien à Google.

L'atelier vérifie les types et les règles partagées **avant** de compiler :
une compilation dure vingt minutes, autant ne pas la lancer sur du code qui
ne tient pas debout.

## 9. L'ordre des choses

1. `noyau/` — déplacer le partagé, le site continue de compiler.
2. `mobile/` — l'ossature Expo, la charte, l'icône, les deux langues.
3. Le jeton dans `middleware.ts` et la route `/api/donnees`.
4. Les écrans, dans l'ordre de leur utilité : les caisses, les SMS, le
   guichet et son pavé secret, les reçus.
5. La sonnerie.
6. La fiche Play, puis la production.

Le pavé du code secret se porte en dernier des écrans, et se relit à deux fois.
C'est le seul endroit de l'application où un chiffre qui déplace de l'argent
passe entre les doigts du propriétaire : il ne s'affiche pas, ne se journalise
pas, ne survit pas à l'envoi — exactement comme sur la plateforme et dans
Telegram.
