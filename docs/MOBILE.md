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
idée, pour une raison qui tranche : le robot est le SEUL à savoir ce qu'il
n'a **pas** compris. `analyse_sms.py` rend `None` dans le doute, et cette
ignorance-là est la matière première d'une notification honnête. Une fonction
du nuage ne verrait que la ligne écrite en base, sans savoir ce qui a été
perdu en chemin. Deux avantages en prime : le robot a déjà sa file d'attente
(une coupure Internet ne perd rien), et c'est une pièce mobile de moins.

Les fichiers : `totem/notification.py` compose le texte, `totem/nuage.py`
(`appareils()`) va lire à qui, `totem/app.py` (`_faire_sonner`) déclenche —
dans un fil à part, pour qu'un guichet lent ne retarde jamais la lecture du
SMS suivant.

### Trois règles, non négociables

- **Le code secret n'apparaît jamais** dans une notification. Ni en clair, ni
  masqué, ni « en attente de code ». Une notification s'affiche sur un écran
  verrouillé, dans un taxi. Un SMS reconnu comme portant un code sort d'ici
  en « Un code de MTN », sans un chiffre.
- **Un montant douteux ne s'annonce pas comme un montant.** Sans montant lu,
  la notification dit « montant non lu ». Sans sens établi (Orange nomme les
  deux parties sans dire laquelle est la nôtre), elle dit « Mouvement de… »
  sans signe : « reçu » sur un envoi serait un mensonge, et l'inverse aussi.
- **Le téléphone ne remplace pas le journal.** Une notification peut se
  perdre — réseau, batterie, système. La liste des SMS reste la vérité.

Ces trois règles sont gardées par `tests/test_notification.py`.

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

La table s'installe avec `migrations/20260829_appareils.sql`.

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

## 7. L'iPhone

L'inscription au programme Apple prend **deux à quatre semaines** pour une
organisation : Apple vérifie le numéro D-U-N-S, puis que la personne inscrite
engage juridiquement l'entreprise. Huit à dix jours d'attente sont donc
**encore dans la fenêtre annoncée** — désagréable, pas anormal.

Ce qui bloque le plus souvent, dans l'ordre :

1. **Le nom ou l'adresse ne correspondent pas au dossier D&B**, au caractère
   près. Apple ne peut alors pas relier les deux dossiers et le nôtre attend.
2. **Le téléphone ne répond pas.** Apple appelle le numéro déclaré chez D&B
   pour vérifier l'autorité de signature. Aux heures américaines. Un appel
   manqué, et le dossier dort sans que personne ne prévienne.

Ce qu'il y a à faire, dans cet ordre : vérifier le dossier D&B ; s'assurer que
le numéro est joignable ; puis relancer le support Apple avec le numéro
d'inscription, **en demandant un rappel téléphonique** plutôt qu'en remplissant
le formulaire.

**L'iPhone n'est pas sur le chemin critique.** On construit l'application
maintenant ; le jour où le compte s'ouvre, l'iPhone sort du même code, sans
projet supplémentaire.

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
