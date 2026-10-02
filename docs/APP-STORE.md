# Publier TOTEM sur l'App Store, en application non répertoriée

> **Non répertoriée** : l'application est sur l'App Store, s'installe et se
> met à jour comme n'importe quelle autre — sans TestFlight —, mais elle
> n'apparaît dans aucune recherche ni aucun classement. On l'installe par un
> lien direct, celui qu'on donne à ses vendeurs.

Apple examine une application non répertoriée **exactement** comme une
application publique. Il faut donc une fiche complète, des captures, et un
compte qui permet à son examinateur d'entrer.

## Ce qui est déjà prêt dans le dépôt

| Quoi | Où |
|---|---|
| Les textes de la fiche, en français et en anglais | `mobile/store.config.js` |
| Huit captures au format exigé (1290 × 2796) | `mobile/store/apple/screenshot/` |
| La classification d'âge (4+) | `mobile/store.config.js` |
| La note pour l'examinateur, en anglais | `mobile/store.config.js` |
| Le bouton qui envoie tout chez Apple | GitHub → Actions → **« Fiche App Store »** |

Les captures sont faites sur le faux nuage, jamais sur de vraies données : un
montant réel ou un nom de client n'a rien à faire sur une fiche publique.

## Ce que vous faites, dans l'ordre

### 1. Un compte pour l'examinateur d'Apple

Sur le site : **Console → Les gens → Créer un compte**. Par exemple :

- Prénom « Examen », nom « Apple », un courriel à vous, un mot de passe long.
- **Confiez-lui UNE carte**, sinon il verra une application vide.

⚠️ Une carte confiée est une carte qu'il **peut** manier. La note de la fiche
lui demande de ne lancer aucune opération d'argent, mais confiez de
préférence une carte qui porte peu. Supprimez le compte quand l'examen est
fini.

### 2. Ranger ces informations dans GitHub

**GitHub → Settings → Secrets and variables → Actions.**

Onglet **« Secrets »** (ce qui ne doit jamais se lire) :

| Nom | Valeur |
|---|---|
| `APPLE_EXAMEN_COURRIEL` | le courriel du compte d'examen |
| `APPLE_EXAMEN_MOTDEPASSE` | son mot de passe |

Onglet **« Variables »** (qui Apple appelle s'il a une question) :

| Nom | Valeur |
|---|---|
| `APPLE_CONTACT_PRENOM` | votre prénom |
| `APPLE_CONTACT_NOM` | votre nom |
| `APPLE_CONTACT_COURRIEL` | votre courriel |
| `APPLE_CONTACT_TELEPHONE` | votre numéro, avec l'indicatif (`+237…`) |
| `APPLE_COPYRIGHT` | facultatif : « 2026 Votre nom » |

### 3. Envoyer la fiche

**GitHub → Actions → « Fiche App Store » → Run workflow.**

S'il manque quelque chose, le travail s'arrête **avant** d'envoyer et dit
quoi. Quand la ligne est verte, la fiche est dans App Store Connect.

### 4. Ce qu'Apple réserve au titulaire du compte

Ces gestes ne se font pas par programme : Apple les garde pour la personne
qui détient le compte.

1. **App Store Connect → TOTEM → Confidentialité de l'app**, répondre :

   | Question | Réponse |
   |---|---|
   | Collectez-vous des données ? | **Oui** |
   | Coordonnées → **Adresse e-mail** | Oui · *Fonctionnalité de l'app* · liée à l'identité · **pas** de suivi |
   | Informations financières → **Autres informations financières** | Oui · *Fonctionnalité de l'app* · liée à l'identité · **pas** de suivi |
   | Tout le reste (position, contacts, historique, diagnostics…) | **Non** |

   Les SMS et les soldes viennent du terminal du propriétaire, vers **sa**
   plateforme. Les déclarer est exact ; les taire serait faux.

2. **Prix et disponibilité** : gratuit, et les pays où vous voulez
   l'installer.

   La fiche donne `https://totemlabs.app/confidentialite` comme page
   d'assistance : Apple veut y trouver un moyen de vous joindre. Elle
   n'affiche votre courriel que si la plateforme porte la variable
   `CONTACT_COURRIEL` (voir `docs/PLAY-STORE.md`). Vérifiez-le avant de
   soumettre.

3. **La version 1.1.0**, rubrique **Build** : choisir le paquet déjà déposé
   (celui de TestFlight).

4. **Le formulaire « app non répertoriée »**, envoyé par le titulaire du compte :
   **https://developer.apple.com/contact/request/unlisted-app/**
   Ce qu'on y écrit : *« TOTEM is a private management app for the owner of
   Mobile Money SIM cards and the sellers he entrusts cards to. It is not
   meant for the general public. »*

5. **« Soumettre pour examen »**.

### 5. Après l'accord d'Apple

L'application se télécharge par le lien
**https://apps.apple.com/app/id6809711396**. C'est ce lien qu'on envoie aux
vendeurs. TestFlight n'est plus nécessaire.

Les corrections continuent d'arriver par **« Mise à jour »**, sans repasser
par Apple, tant qu'aucune pièce du moteur ne change. Une nouvelle version du
moteur repasse par **« Application iPhone »** (profil `production`) puis par
**« Soumettre pour examen »**.

## Refaire les captures

```sh
node web/scripts/faux-nuage.mjs &
cd web && SUPABASE_URL=http://127.0.0.1:4999 SUPABASE_CLE=x \
  SESSION_SECRET=essai npx next start -p 3180 &
cd mobile && EXPO_PUBLIC_ADRESSE=http://127.0.0.1:3180 EXPO_PUBLIC_APERCU=1 \
  npx expo export --clear --platform web --output-dir /tmp/apercu
node scripts/captures-boutique.mjs /tmp/apercu store/apple/screenshot/fr-FR/APP_IPHONE_67 iphone fr
node scripts/captures-boutique.mjs /tmp/apercu store/apple/screenshot/en-US/APP_IPHONE_67 iphone en
```

`--clear` n'est pas un détail : sans lui, l'export peut garder l'adresse
d'un export précédent, et l'application s'arrête sur l'écran de connexion.

Le script **refuse de photographier** le bandeau « Pas de réseau ». Il l'a
fait sur la première série, et c'était un vrai défaut de l'application : en
la rouvrant sur « Opérations », elle se contentait des chiffres de la veille,
ne redemandait rien et annonçait une panne qui n'existait pas. Corrigé dans
`mobile/src/donnees.tsx` : des chiffres relus du téléphone ne couvrent aucun
besoin, ils tiennent l'écran en attendant la réponse.
