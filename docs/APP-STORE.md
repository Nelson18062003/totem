# Publier TOTEM sur l'App Store — pour tout le monde

> **TOTEM est une application grand public.** C'est la décision du
> propriétaire. N'importe qui la trouve sur l'App Store, la télécharge, crée
> son compte dans l'application, et atteint ses comptes Mobile Money d'où
> qu'il soit. Ce n'est ni un outil privé pour une boutique, ni une
> application financière, ni une distribution réservée.

Il n'y a donc **ni formulaire « app non répertoriée », ni lien caché** : la
fiche est publique, l'application apparaît dans les recherches.

## Ce qui est déjà prêt dans le dépôt

| Quoi | Où |
|---|---|
| Les textes de la fiche, en français et en anglais | `mobile/store.config.js` |
| Le nom sur l'App Store : « TOTEM by Bonzinilabs » (« TOTEM » seul est pris) | `mobile/store.config.js` |
| Les captures iPhone (1290 × 2796) et iPad (2048 × 2732) | `mobile/store/apple/screenshot/` |
| La classification d'âge (4+) | `mobile/store.config.js` |
| La réponse à Apple et la note pour l'examinateur, en anglais | `docs/APPLE-REPONSE-2.1.md` (lue par `mobile/store.config.js`) |
| Le script de la vidéo demandée par Apple | `docs/APPLE-REPONSE-2.1.md` |
| Le compte de l'examinateur (vitrine de démonstration) | `web/lib/demonstration.ts` |
| La politique de confidentialité et la page de suppression | `https://totemlabs.app/confidentialite`, `https://totemlabs.app/suppression` |
| Le bouton qui envoie la fiche chez Apple | GitHub → Actions → **« Fiche App Store »** |

Les captures sont faites sur le faux nuage, jamais sur de vraies données : un
montant réel ou un nom de client n'a rien à faire sur une fiche publique.

## Ce qu'Apple vérifie, et ce que l'application fait

| Ce qu'Apple exige | Ce que fait TOTEM |
|---|---|
| Un compte se crée dans l'application | « Créer un compte » sur l'écran de connexion : prénom, nom, adresse, adresse e-mail, téléphone, mot de passe. Le compte s'ouvre tout de suite. |
| Un compte créé dans l'application se **supprime** dans l'application (règle 5.1.1 v) | **Réglages → Supprimer mon compte**, confirmé par le mot de passe. Aussi sur `https://totemlabs.app/suppression`. |
| L'examinateur peut tout essayer | La vitrine : deux cartes inventées, opérations jouées pour de faux. |
| On ne demande que ce qui sert | L'adresse sert à envoyer ou reprendre la puce ou le boîtier, le téléphone à joindre la personne : la politique de confidentialité le dit, champ par champ. |

## Ce que vous faites, dans l'ordre

### 1. Mettre la plateforme à niveau — AVANT tout le reste

L'examinateur va créer un compte. Si la plateforme en ligne ne sait pas le
faire, il voit une erreur, et l'application est refusée.

1. **Supabase → SQL Editor** : coller et exécuter
   `migrations/20261004_inscription_publique.sql`. Elle se vérifie elle-même
   à la fin. Sans elle, toute inscription échoue.
2. **Déployer la plateforme** (Vercel) avec la version qui porte
   l'inscription publique et la suppression.
3. Vérifier, depuis un navigateur : `https://totemlabs.app/inscription`
   crée bien un compte, et `https://totemlabs.app/suppression` le supprime.
4. **Le courriel de contact** : poser la variable `CONTACT_COURRIEL` sur
   Vercel, puis redéployer. La page d'assistance de la fiche est
   `https://totemlabs.app/confidentialite` ; Apple veut y trouver un moyen de
   vous joindre, et la page n'affiche une adresse que si cette variable
   existe.

### 2. La nouvelle application

L'application qui part chez Apple doit porter « Créer un compte » sur
l'écran de connexion, et « Supprimer mon compte » dans les Réglages. Si le
paquet déposé dans App Store Connect est plus ancien, il faut d'abord
compiler la nouvelle : **GitHub → Actions → « Application iPhone »** (profil
`production`). Le paquet arrive dans App Store Connect, rubrique **Build**.

### 3. Le compte de l'examinateur : rien à faire

La plateforme porte une **vitrine de démonstration**. Ses identifiants sont
écrits dans la fiche, et Apple les donne à son examinateur :

| | |
|---|---|
| Adresse e-mail | `examen@totemlabs.app` |
| Mot de passe | `TOTEM-Examen-2026` |

Ils sont publics, et c'est voulu : la vitrine ne montre que des données
**inventées** (deux cartes « démo », des SMS « DÉMO »), ne touche à
**aucune** vraie carte, et ses opérations se jouent **pour de faux** —
numéro, montant, message de confirmation, code secret, « opération
réussie », sans réseau et sans un franc. Elle ne se supprime pas : elle sert
à tous les examinateurs. Pour essayer la suppression, l'examinateur crée son
propre compte — la note le lui dit.

`web/scripts/verifier-la-demonstration.mjs` le vérifie contre un vrai
serveur, à chaque fois.

**La vitrine reste ouverte** tant que l'application est sur l'App Store :
Apple revient à chaque version, et peut rouvrir l'application à tout moment.
(`DEMONSTRATION` = `non` la ferme ; ne la fermez que si vous retirez
l'application.)

### 4. Qui Apple appelle s'il a une question : déjà fait

Apple exige un contact. Il est écrit dans la fiche (`mobile/store.config.js`,
bloc `CONTACT`). Si l'on pose un jour des variables GitHub
(`APPLE_CONTACT_PRENOM`, `…_NOM`, `…_COURRIEL`, `…_TELEPHONE`, onglet
« Variables »), elles passent devant.

### 5. Renvoyer la fiche

**GitHub → Actions → « Fiche App Store » → Run workflow.**

Elle emporte les nouveaux textes (application grand public) et la nouvelle
note pour l'examinateur. S'il manque quelque chose, le travail s'arrête
**avant** d'envoyer et dit quoi. Quand la ligne est verte, la fiche est à
jour dans App Store Connect.

### 6. Filmer la vidéo

Sur un vrai iPhone, avec la nouvelle application et la plateforme à niveau.
Le script, pas à pas, est dans `docs/APPLE-REPONSE-2.1.md` : créer un
compte de test, montrer « Ajouter ma carte », se connecter à la vitrine pour
jouer une opération, puis supprimer le compte de test dans l'application.

### 7. La confidentialité de l'app (réservé au titulaire du compte)

**App Store Connect → TOTEM → Confidentialité de l'app.** L'ancienne
réponse ne déclarait que l'adresse e-mail : avec l'inscription publique,
c'est faux. Elle doit correspondre **au mot près** à la politique de
confidentialité (`web/noyau/textes/confidentialite.ts`).

« Collectez-vous des données à partir de cette app ? » → **Oui**. Puis, pour
chaque type ci-dessous : finalité **Fonctionnalité de l'app**, **liée à
l'identité de l'utilisateur**, **non utilisée pour le suivi**.

| Catégorie d'Apple | Type | Ce que c'est chez TOTEM |
|---|---|---|
| Coordonnées | **Nom** | prénom et nom, donnés à l'inscription |
| Coordonnées | **Adresse e-mail** | l'identifiant de connexion |
| Coordonnées | **Numéro de téléphone** | pour joindre la personne au sujet de sa carte |
| Coordonnées | **Adresse physique** | pour envoyer ou reprendre la puce ou le boîtier |
| Contenu utilisateur | **E-mails ou SMS** | les SMS reçus par les cartes de la personne, affichés en entier |
| Contenu utilisateur | **Autre contenu utilisateur** | les bénéficiaires enregistrés (noms et numéros), les demandes envoyées (codes USSD, numéros, montants tapés) |
| Informations financières | **Autres informations financières** | les soldes et montants que portent ces SMS |
| Identifiants | **Identifiant de l'appareil** | le jeton de notification du téléphone, pour le faire sonner |

Tout le reste — position, contacts, historique de navigation, recherches,
achats, diagnostics, données d'usage, santé — **Non**. Aucun outil de mesure
d'audience, de publicité ni de suivi n'est installé.

Les SMS et les soldes passent par le boîtier, pas par le téléphone. Mais ils
sont rangés sur la plateforme au nom de la personne, et l'application les
lui montre : les déclarer est exact, les taire serait faux.

**Telegram n'est pas un oubli.** Chaque boîtier envoie une copie des SMS
qu'il reçoit (codes à usage unique compris) et des reçus PDF dans la
discussion Telegram privée de qui le fait fonctionner — l'équipe TOTEM pour
une puce confiée à TOTEM. Telegram travaille pour le compte de TOTEM (pas
pour son propre usage) : ce n'est pas du « suivi », mais il est NOMMÉ dans
la politique de confidentialité (`tiers`) et dans la note à l'examinateur
(section 4). Les types déclarés ci-dessus le couvrent déjà (« E-mails ou
SMS », « Autres informations financières »).

### 8. Prix et disponibilité

**Gratuit**, et **tous les pays**. Rien dans l'application ne dépend du pays
— c'est d'ailleurs l'idée : atteindre ses comptes d'où qu'on soit.

### 9. Répondre à Apple, puis soumettre à nouveau

1. **App Store Connect → Vérification de l'app** → ouvrir la soumission en
   attente (« Guideline 2.1 – Information Needed »).
2. **Version** : vérifier que la rubrique **Build** porte le paquet de
   l'étape 2 (le nouveau). Sinon, le choisir.
3. **« Répondre »** dans le fil de l'examen : coller le texte anglais de
   `docs/APPLE-REPONSE-2.1.md` (ce qui est entre les ```), et **joindre la
   vidéo**.
4. **« Soumettre à nouveau »** (*Resubmit to App Review*).

Ne remplissez **aucun** formulaire « unlisted app » : TOTEM est public.

### 10. Après l'accord d'Apple

La sortie n'est pas automatique (`automaticRelease: false`) : c'est vous qui
cliquez sur **« Publier cette version »**, le jour choisi. Ensuite
l'application se trouve sur l'App Store sous « TOTEM by Bonzinilabs ».

Les corrections continuent d'arriver par **« Mise à jour »**, sans repasser
par Apple, tant qu'aucune pièce du moteur ne change. Une nouvelle version du
moteur repasse par **« Application iPhone »** (profil `production`) puis par
une soumission.

## Refaire les captures

```sh
node web/scripts/faux-nuage.mjs &
cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
  SESSION_SECRET=essai npx next start -p 3180 &
cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3180 EXPO_PUBLIC_APERCU=1 \
  npx expo export --clear --platform web --output-dir /tmp/apercu
node scripts/captures-boutique.mjs /tmp/apercu store/apple/screenshot/fr-FR/APP_IPHONE_67 iphone fr
node scripts/captures-boutique.mjs /tmp/apercu store/apple/screenshot/en-US/APP_IPHONE_67 iphone en
node scripts/captures-boutique.mjs /tmp/apercu store/apple/screenshot/fr-FR/APP_IPAD_PRO_3GEN_129 ipad fr
node scripts/captures-boutique.mjs /tmp/apercu store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129 ipad en
```

L'iPad n'est pas facultatif : l'application s'y installe, et Apple refuse
la soumission tant que la série du 13 pouces manque.

`--clear` n'est pas un détail : sans lui, l'export peut garder l'adresse
d'un export précédent, et l'application s'arrête sur l'écran de connexion.

Le script **refuse de photographier** le bandeau « Pas de réseau ». Il l'a
fait sur la première série, et c'était un vrai défaut de l'application : en
la rouvrant sur « Opérations », elle se contentait des chiffres de la veille,
ne redemandait rien et annonçait une panne qui n'existait pas. Corrigé dans
`mobile/src/donnees.tsx` : des chiffres relus du téléphone ne couvrent aucun
besoin, ils tiennent l'écran en attendant la réponse.
