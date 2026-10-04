# Publier sur Google Play

> Ce qu'il faut remplir, et ce qu'il faut y écrire. Les réponses sont
> déduites de ce que l'application fait **réellement** — pas de ce qu'une
> application de ce genre fait d'habitude.
>
> **TOTEM est une application grand public** (décision du propriétaire) :
> n'importe qui la télécharge, crée son compte dans l'application, et
> atteint ses comptes Mobile Money d'où qu'il soit. Les réponses ci-dessous
> sont celles d'une application ouverte à tous — la même chose que ce qui
> est dit à Apple (`docs/APP-STORE.md`, `docs/APPLE-REPONSE-2.1.md`).

---

## Avant tout : la politique de confidentialité

Google Play **refuse** une application sans politique de confidentialité à
une adresse publique, et la vérifie contre le formulaire *Sécurité des
données*.

Elle est en ligne : **https://totemlabs.app/confidentialite**

Elle s'ouvre sans compte — un examinateur y arrive depuis un lien collé dans
un formulaire, et une page derrière le verrou ferait refuser l'application
sans plus d'explication. Le script du verrou vérifie qu'elle reste ouverte.
Elle nomme tout ce qui est collecté, champ par champ, et pourquoi.

> ⚠️ **Une chose à régler avant de coller ce lien.** Le courriel de contact
> vient de la variable d'environnement `CONTACT_COURRIEL` sur Vercel. Tant
> qu'elle n'est pas posée, les deux pages n'affichent AUCUNE adresse : elles
> renvoient vers l'adresse du développeur de la fiche du magasin. C'est
> volontaire — une adresse par défaut inventée promettrait une boîte qui
> n'existe pas. Posez la vôtre, puis redéployez.

---

## La suppression du compte

Google exige, pour une application où l'on crée un compte, **deux** chemins :
la suppression **dans l'application**, et une **adresse web** où l'on peut la
demander sans l'application.

- **Dans l'application** : **Réglages → Supprimer mon compte**, confirmé par
  le mot de passe. Le compte est supprimé aussitôt.
- **Sur le web** : **https://totemlabs.app/suppression** — c'est l'adresse à
  coller dans *URL de suppression des données*.

Google refuse le lien s'il manque l'une de ces trois choses. La page les
porte toutes les trois :

1. **Nommer l'application ou l'éditeur** de la fiche — elle nomme TOTEM,
   Bonzinilabs et le nom de paquet `com.bonzinilabs.totem` ;
2. **Décrire la marche à suivre** — dans l'application, par le formulaire
   de la page (adresse e-mail et mot de passe), ou par courriel si l'on ne
   peut plus se connecter ;
3. **Dire ce qui est effacé et ce qui est gardé**, avec les délais — le
   compte (nom, adresse, e-mail, téléphone, empreinte du mot de passe), les
   attributions de cartes, les jetons de notification et les sessions
   partent aussitôt ; les messages d'une carte suivent la carte, et
   s'effacent sur demande quand elle est retirée, sous 30 jours.

Elle est ouverte sans compte, comme la politique.

Le compte du propriétaire de la plateforme et la vitrine de démonstration
ne se suppriment pas par ce chemin — la page le dit.

---

## Informations de connexion (App access)

Tout est derrière une connexion : l'examinateur a besoin d'un compte qui
marche. Il pourrait en créer un lui-même, mais un compte neuf n'a pas
encore de carte : il ne verrait que « Ajouter ma carte ». **Donnez-lui la
vitrine de démonstration**, la même qu'à Apple.

Dans la Play Console, choisir « Toutes les fonctionnalités nécessitent un
accès spécial » (ou « Certaines fonctionnalités… ») et remplir :

| Champ | Valeur |
|---|---|
| Nom des identifiants | `Compte de démonstration` |
| Nom d'utilisateur | `examen@totemlabs.app` |
| Mot de passe | `TOTEM-Examen-2026` |
| Instructions | « Anyone can create an account in the app ("Create an account"); a new account shows "Add my card" until a SIM card is assigned to it. This demo account shows two invented SIM cards. Deposit / Withdrawal / Transfer are simulated end to end: enter any number and amount, then any 4-digit PIN; nothing reaches any network. To test account deletion (Settings > Delete my account), create your own account: the demo account cannot be deleted. » |

Ne donnez **jamais** un vrai compte avec une vraie carte : l'examinateur
pourrait y lancer un vrai transfert.

---

## Sécurité des données (Data safety)

Il doit correspondre **au mot près** à la politique de confidentialité. Une
contradiction entre les deux est un motif de refus, et elle se voit.

### Collecte et partage

| Question | Réponse | Pourquoi |
|---|---|---|
| L'app collecte-t-elle des données ? | **Oui** | Voir la liste ci-dessous. |
| Les données sont-elles chiffrées en transit ? | **Oui** | Tout passe en HTTPS ; l'application refuse une adresse en `http` (sauf la machine locale). |
| Peut-on demander la suppression ? | **Oui** | Dans l'application, et `https://totemlabs.app/suppression`. |
| Les comptes sont-ils créés dans l'application ? | **Oui** | « Créer un compte », sur l'écran de connexion. |
| Peut-on se connecter avec un compte créé hors de l'application ? | **Oui** | La page web `https://totemlabs.app/inscription` crée le même compte. |

**« Partagé » veut dire, chez Google, transmis à un tiers pour son propre
usage.** Les hébergeurs (Vercel, Supabase) et les services de notification
(Expo, Google FCM) travaillent pour le compte de TOTEM : ce n'est pas un
partage au sens du formulaire. Il en va de même de **Telegram**, par lequel
chaque boîtier envoie une copie des SMS et des reçus dans la discussion
privée de qui le fait fonctionner : un prestataire, nommé dans la politique
de confidentialité. Rien n'est vendu, ni cédé à qui que ce soit.

### Les types de données à déclarer

Pour chacun : **collecté**, **non partagé**, **non traité de manière
éphémère** (sauf le jeton, voir plus bas), finalité **Fonctionnalité de
l'application** (et **Gestion du compte** pour les coordonnées).

| Catégorie Google | Type | Obligatoire ? | Ce que c'est chez TOTEM |
|---|---|---|---|
| Informations personnelles | **Nom** | Obligatoire | prénom et nom, donnés à l'inscription |
| Informations personnelles | **Adresse e-mail** | Obligatoire | l'identifiant de connexion |
| Informations personnelles | **Adresse** | Obligatoire | pour envoyer ou reprendre la puce ou le boîtier |
| Informations personnelles | **Numéro de téléphone** | Obligatoire | pour joindre la personne au sujet de sa carte |
| Messages | **SMS ou MMS** | Obligatoire | les SMS reçus par les cartes de la personne, dans leur boîtier |
| Informations financières | **Autres informations financières** | Obligatoire | les soldes et montants que portent ces SMS |
| Activité dans l'application | **Autre contenu généré par l'utilisateur** | Facultatif | les bénéficiaires enregistrés (noms et numéros) |
| Identifiants de l'appareil | **Identifiants de l'appareil ou autres** | Facultatif | le jeton de notification ; refuser les notifications n'empêche rien d'autre |

**Les SMS sont lus par le modem du boîtier, pas par le téléphone.**
L'application ne demande aucune autorisation SMS (`app.json` : liste vide).
On les déclare quand même : ils sont rangés sur la plateforme au nom de la
personne, et l'application les lui montre. Les taire serait faux.

### Ce qu'il faut répondre NON

Cocher « au cas où » n'est pas prudent : c'est déclarer faux.

- ❌ Position — l'application n'y touche pas
- ❌ Photos, vidéos, fichiers, contacts, calendrier, micro, appareil photo
- ❌ Historique de navigation, recherches, applications installées
- ❌ Rapports de plantage, diagnostics, données de performance — aucun
  outil de ce genre n'est installé
- ❌ Publicité, mesure d'audience, suivi — rien de tout cela

---

## Fonctionnalités financières (Financial features)

TOTEM n'est **pas** une application financière : il ne détient aucun argent,
n'en fait transiter aucun, n'est ni banque ni portefeuille. Il est l'écran
d'un boîtier qui porte les cartes SIM de la personne. Mais il affiche des
soldes Mobile Money : Google pose la question, on y répond.

| Question | Réponse |
|---|---|
| L'app propose-t-elle des prêts personnels ? | **Non** |
| Est-ce une app bancaire ? | **Non** |
| Gestion de portefeuille / cryptomonnaies ? | **Non** |
| Paiements ou virements ? | **À trancher avec le propriétaire — et ne pas répondre « Non » sans réfléchir.** La description annonce « dépôt, retrait, transfert » : répondre « Non » contredirait la fiche que l'examinateur a sous les yeux. Ce qui est vrai : TOTEM ne propose aucun service de paiement à lui ; il permet au titulaire de lancer, sur SON compte Mobile Money, les opérations du menu USSD de son opérateur, que l'opérateur autorise avec le code du titulaire. Si le formulaire offre une rubrique « transferts d'argent » ou « autre », la cocher avec cette phrase dans la case d'explication est plus juste qu'un « Non ». |
| Assurances, placements, jeux d'argent ? | **Non** |

---

## La fiche du magasin

Les descriptions sont **les mêmes** que sur l'App Store : elles vivent dans
`mobile/store.config.js` (`descriptionFr`, `descriptionEn`) — les copier de
là, pas d'ici, pour qu'elles ne divergent pas.

> **Trois règles de cadrage, et elles comptent toutes les trois.**
>
> 1. **Pour tout le monde.** TOTEM s'adresse à quiconque a un compte Mobile
>    Money — pas à « une boutique », pas à « ses vendeurs », pas aux
>    « agents ». Une fiche qui décrit une seule entreprise se fait renvoyer
>    vers une distribution privée.
> 2. **On ne suit pas l'argent.** TOTEM n'en déplace pas et n'en détient
>    pas : il rend atteignables des comptes qui sont déjà ceux de la
>    personne. Dire « suivre l'argent » ferait poser des questions de
>    service financier auxquelles la réponse est non.
> 3. **On ne nomme aucun pays.** Le Mobile Money, le réseau qui tombe et
>    la vie loin de chez soi ne sont pas une particularité d'un seul pays.
>    On cite les opérateurs à titre d'exemple, jamais comme une liste
>    fermée.

### Nom (30 caractères max)

```
TOTEM by Bonzinilabs
```

*(20 caractères — le même nom que sur l'App Store.)*

### Description courte (80 caractères max)

**Anglais**
```
Your Mobile Money accounts, from anywhere in the world.
```
*(55 caractères)*

**Français**
```
Vos comptes Mobile Money, d'où que vous soyez dans le monde.
```
*(60 caractères)*

### Description complète (4000 caractères max)

Celle de `mobile/store.config.js`, en anglais et en français (un peu plus
de 2 000 caractères chacune).

---

## Les images

**Tout est fabriqué et rangé dans `boutique/`.** Il n'y a plus qu'à
téléverser.

| Élément | Fichier | Taille |
|---|---|---|
| Icône | `brand/png/totem-icone-app.png` | 1024 × 1024 |
| Image de présentation | `boutique/presentation-1024x500.png` | 1024 × 500 |
| Captures téléphone | `boutique/captures/1-caisses.png` … `4-cartes.png` | 1080 × 1920 |

Les captures se refabriquent d'une commande, jamais à la main :

```sh
node web/scripts/faux-nuage.mjs &
cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
  SESSION_SECRET=essai npx next start -p 3180 &
cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3180 EXPO_PUBLIC_APERCU=1 \
  npx expo export --platform web --output-dir /tmp/apercu
node scripts/captures-boutique.mjs /tmp/apercu
```

**Avec le faux nuage, jamais avec de vraies données.** Une capture part sur
une fiche publique, visible de la terre entière et archivée par des gens
qu'on ne connaît pas. Un montant réel, un nom de client, un numéro de
téléphone n'ont rien à y faire — et une fois publiés, ils ne se reprennent
pas. Le script s'arrête d'ailleurs s'il retombe sur l'écran de connexion :
une capture de l'écran de connexion sur une fiche de magasin serait ridicule.

L'image de présentation **sera rognée** par Google selon les emplacements :
la marque et la phrase tiennent donc dans le tiers central, et les bords ne
portent que le motif.

## Le numéro de version, et le piège qui attendait

Le Play Store refuse un paquet dont le `versionCode` a **déjà servi**, sur
n'importe quelle piste. Le message est sec — « Version code 1 has already
been used » — et ne dit pas où le corriger.

`eas.json` porte `appVersionSource: "remote"` : le compteur vit chez EAS, et
il ne monte QUE pour les profils marqués `autoIncrement`. Le profil `essai`
ne l'était pas. La première mise en ligne serait passée ; la deuxième aurait
été refusée, sans qu'on sache pourquoi.

Les deux profils qui vont au magasin — `essai` et `production` — l'ont
maintenant, et partagent le même compteur : un paquet d'essai ne peut donc
pas entrer en collision avec un paquet public.

`apercu` ne l'a pas, et n'en a pas besoin : c'est un APK qu'on s'installe
soi-même, il ne passe jamais par le magasin.

> `eas.json` **refuse les commentaires**. C'est pour cela que cette
> explication est ici et pas dans le fichier — une compilation entière a
> déjà échoué sur une clé `"//"` ajoutée par habitude.

---

## Classification du contenu

Questionnaire à remplir. Toutes les réponses sont **Non** : pas de violence,
pas de contenu sexuel, pas de jeu d'argent, pas de substances, pas de
contenu généré par les utilisateurs, pas de partage de position.

Catégorie : **Outils** — la même que la catégorie principale de l'App Store
(« Utilitaires », `mobile/store.config.js`). TOTEM est l'écran d'un boîtier
qui porte des cartes SIM, pas un service financier ; « Finance » reste en
catégorie SECONDAIRE chez Apple parce que l'application montre des soldes
et lance les opérations de l'opérateur. Choix à confirmer par le
propriétaire.

---

## Le paquet part tout seul au magasin

Télécharger l'AAB depuis GitHub, ouvrir la Play Console, le glisser dans une
boîte, recommencer à la version suivante : c'est le genre de geste qu'on
répète cent fois avant de se demander pourquoi. Il n'y a pas de raison.

`eas submit` dépose le paquet lui-même, à la fin de la compilation. Il faut
lui donner une autorisation, **une seule fois**.

### Ce qu'il faut faire, une fois

1. **Play Console → Configuration → Accès à l'API.** Associer un projet
   Google Cloud (il en propose un, ou en crée un).
2. Sur la même page, **créer un compte de service**. Le lien mène à Google
   Cloud ; on lui donne un nom (« depot-totem » fait l'affaire) et on
   revient.
3. De retour dans la Play Console, **accorder l'accès** à ce compte de
   service sur l'application TOTEM, avec le droit **« Gérer les versions »**.
   Rien de plus : il n'a pas à lire les finances ni à répondre aux avis.
4. **Google Cloud → ce compte de service → Clés → Ajouter une clé → JSON.**
   Un fichier se télécharge.
5. **GitHub → Settings → Secrets and variables → Actions → New repository
   secret.** Nom : `GOOGLE_PLAY_CLE`. Valeur : le contenu **entier** du
   fichier JSON, accolades comprises.

Ensuite, plus rien. On lance la compilation, et la version apparaît d'elle-même
dans la Play Console.

### Où atterrit le paquet

C'est `mobile/eas.json` qui le décide, et la différence compte :

| Profil | Piste | En arrivant |
|---|---|---|
| `essai` | essai interne | **disponible aussitôt** pour les testeurs de la liste |
| `production` | publique | **brouillon** — personne ne le reçoit sans un clic |

Une production qui se déploierait toute seule enverrait du code neuf sur des
téléphones en service, à la seconde où la compilation finit. Le brouillon
laisse la dernière décision à quelqu'un.

### Cette clé publie à la place du propriétaire

Qui la tient peut envoyer n'importe quel paquet sous le nom de TOTEM. Elle ne
vit donc que dans les secrets de GitHub, elle n'entre jamais dans le dépôt
(`mobile/.gitignore`), et le robot l'efface à la fin du travail — même quand
la compilation a échoué, surtout dans ce cas.

Le robot la relit avant de compiler : une clé tronquée au copier-coller
arrête tout de suite, au lieu de donner une erreur illisible vingt minutes
plus tard.

Sans le secret, rien ne casse : le paquet se compile et le résumé donne le
lien pour le déposer à la main, comme avant.

---

## L'ordre des choses

1. Mettre la plateforme à niveau : migration
   `migrations/20261004_inscription_publique.sql` dans Supabase, puis
   déploiement (voir `docs/APP-STORE.md`, étape 1).
2. Poser `CONTACT_COURRIEL` sur Vercel, redéployer, vérifier les DEUX pages
   (`/confidentialite` et `/suppression`) : l'adresse doit s'y afficher.
3. Créer l'application dans la Play Console (nom « TOTEM by Bonzinilabs »,
   langue par défaut anglais, **application**, **gratuite**).
4. Coller le lien de la politique de confidentialité.
5. *Accès à l'application* : la vitrine de démonstration (ci-dessus).
6. *Sécurité des données* — les réponses sont ci-dessus.
7. *Fonctionnalités financières*.
8. La classification du contenu.
9. Fiche du magasin : descriptions, icône, captures.
10. Poser `GOOGLE_PLAY_CLE` (voir ci-dessus), puis compiler un paquet
    `essai` (AAB) : il part seul sur la **piste d'essai interne**.
11. L'installer soi-même : créer un compte, voir « Ajouter ma carte », le
    supprimer. Puis l'utiliser quelques jours avec une vraie carte.
12. Puis la production, **dans tous les pays**.

Le compte d'organisation BONZINILABS est **dispensé** de la règle des 12
testeurs pendant 14 jours, qui s'applique aux comptes personnels.
