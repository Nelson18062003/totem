# Réponse à Apple — « Guideline 2.1 — Information Needed »

Apple a mis en attente la version 1.1.0 : le compte développeur est neuf, et
l'examinateur demande plus d'informations. Ce n'est pas un refus du contenu.

**La première réponse préparée ici était fausse, et elle aurait fait refuser
l'application.** Elle présentait TOTEM comme un « outil privé » réservé à une
boutique, à son propriétaire et à ses vendeurs, et demandait une distribution
non répertoriée. Or Apple rappelait lui-même la règle 3.2 : une application
faite pour UNE entreprise n'a pas sa place sur l'App Store public. Et surtout,
ce n'est pas ce qu'est TOTEM. **La décision du propriétaire : TOTEM est une
application GRAND PUBLIC.** N'importe qui la télécharge, crée son compte dans
l'application, et atteint ses comptes Mobile Money d'où qu'il soit.

## Ce qu'il faut envoyer

App Store Connect → **Vérification de l'app** → la soumission →
**« Répondre à l'équipe de vérification des apps »** :

1. **Le texte anglais ci-dessous**, copié tel quel (tout ce qui est entre
   les deux lignes de trois accents graves, sans elles).
2. **La vidéo** filmée sur un vrai iPhone (script plus bas), jointe à la
   réponse.

Puis **« Soumettre à nouveau »** (voir `docs/APP-STORE.md`, étape par étape).

Le même texte part aussi dans la case « Notes » de la fiche : il est lu ici
par `mobile/store.config.js`, et envoyé par le bouton « Fiche App Store ». Il
n'est écrit qu'une fois, ici.

## Avant de filmer : trois vérifications

1. **La plateforme en ligne a bien la nouvelle version** — celle qui accepte
   les inscriptions et la suppression (`/api/inscription`,
   `/api/moi/suppression`), avec la migration
   `migrations/20261004_inscription_publique.sql` collée dans Supabase. Sans
   elle, l'inscription échoue, et la vidéo montrerait une erreur.
2. **L'iPhone a la nouvelle application** — celle qui porte « Créer un
   compte » sur l'écran de connexion. Si l'écran de connexion n'a pas ce
   bouton, l'iPhone a l'ancienne : il faut d'abord la nouvelle compilation
   (et c'est elle qui doit être choisie dans la soumission).
3. **La vitrine est ouverte** : la variable `DEMONSTRATION` n'est pas à
   `non` sur la plateforme.

Prévoir une adresse e-mail de test qui n'a encore aucun compte TOTEM (par
exemple une adresse à vous, avec `+test` : `nom+test1@gmail.com`).

## La vidéo (3 à 4 minutes, sans couper)

Apple veut une vidéo sur un **vrai iPhone**, qui **commence au lancement**
de l'application, et qui montre l'inscription, la connexion, le parcours
habituel et **la suppression du compte**.

Centre de contrôle → bouton d'enregistrement d'écran. Puis, d'une traite :

1. **L'écran d'accueil de l'iPhone**, puis toucher l'icône TOTEM. La vidéo
   doit commencer ICI, avant l'ouverture.
2. **Créer un compte.** Sur l'écran de connexion, toucher « Créer un
   compte ». Remplir les six champs : prénom, nom, adresse, adresse e-mail
   de test, téléphone, mot de passe (12 caractères au moins). Toucher
   « Créer mon compte ».
3. **Le compte est ouvert tout de suite** : on arrive sur l'accueil,
   « Bonjour, » suivi du prénom tapé, et la fiche **« Ajouter ma carte »**,
   avec le **code de compte**. La laisser à
   l'écran trois ou quatre secondes : les deux façons (envoyer sa puce à
   TOTEM, brancher son propre boîtier), l'aide pour ouvrir un compte chez
   l'opérateur.
4. Toucher l'onglet **Opérations**, puis **Comptes** : chacun montre
   « Ajouter ma carte ». C'est ce que voit un compte qui n'a pas encore de
   carte.
5. **Réglages** → **Se déconnecter**.
6. **Se connecter à la vitrine** : `examen@totemlabs.app` /
   `TOTEM-Examen-2026`.
7. **Accueil** : les deux cartes de démonstration, le solde. Toucher
   « Tout voir » : la boîte des SMS. Ouvrir un SMS, puis revenir.
8. **Une opération jouée pour de faux** : sous la carte, **Dépôt** →
   numéro `670000011` → montant `5000` → **Confirmer** → le message de
   l'opérateur s'affiche en entier → taper un code au hasard (`1234`) →
   « Operation reussie (DEMONSTRATION : aucun argent n'a bouge) ».
9. **Réglages** → **Se déconnecter**.
10. **Se reconnecter avec le compte de test** (l'adresse e-mail et le mot
    de passe de l'étape 2).
11. **Réglages** → **Supprimer mon compte** : lire la fiche à l'écran
    (ce qui s'efface, « votre argent n'est pas touché »), taper le mot de
    passe, toucher **« Supprimer mon compte pour de bon »**. L'application
    revient à l'écran de connexion.
12. **Prouver que c'est fait** : retaper l'adresse et le mot de passe du
    compte de test, toucher « Se connecter » : la connexion est refusée.
13. Arrêter l'enregistrement.

À ne pas faire : supprimer la vitrine (elle refuse, et c'est voulu : elle
sert à tous les examinateurs), filmer avec une vraie carte ou de vrais
numéros de clients — la vidéo part chez Apple.

## Le texte à envoyer

```
1. SCREEN RECORDING
A screen recording made on a physical iPhone is attached to our reply. It
starts from the Home Screen and shows, without cuts: creating a new account
in the app, the "Add my card" screen that a new account sees,
signing out, signing in with the demo account, the cards and the operator
SMS inbox, a full simulated deposit up to the PIN step, then signing back in
to the new account, deleting it in the app (Settings > Delete my account),
and the sign-in being refused afterwards.

2. PURPOSE AND AUDIENCE
TOTEM is a general-audience app. Anyone can download it and create an
account in the app. It lets people reach their own Mobile Money accounts
(the mobile-operator accounts tied to a SIM card, such as MTN Mobile Money
or Orange Money) from wherever they are, including abroad, where that SIM
card has no network or is not in their phone.
How it works: the user's SIM card sits in a TOTEM box, a small device with
a mobile modem, connected to the Internet. The app is the remote screen of
that device, the way a smart-home app is the screen of a connected device.
From the app, the user sees each card's balance, reads the operator's SMS in
full, runs the operator's own USSD operations (balance, deposit, withdrawal,
transfer), and keeps a PDF receipt.
How a card is linked to an account: a new account is active at once and
shows an "Add my card" screen with two ways: send the SIM card to TOTEM,
which places it in a TOTEM box, or plug in one's own TOTEM box at home.
TOTEM can also help the user open a Mobile Money account with an operator.
The same screen shows the user's account code, which they send with their
SIM card; TOTEM assigns the card to the account that bears that code (never
on the strength of an email address alone). An account only ever sees the
cards assigned to it.

3. HOW TO ACCESS THE FEATURES
Sign-up: "Create an account" on the sign-in screen (first name, last name,
address, email, phone number, password of at least 12 characters). The
account opens at once and, until a card is assigned, shows "Add my card".
Demo account, with two invented SIM cards:
  examen@totemlabs.app / TOTEM-Examen-2026
- Home: the cards, the balance, the latest SMS. "See all": the SMS inbox.
- Deposit / Withdrawal / Transfer: the buttons under the card on Home, or
  the Operations tab. In the demo account they are SIMULATED end to end:
  enter any number (e.g. 670000011) and amount (e.g. 5000), confirm, read
  the operator's message, type any 4-digit PIN. Nothing reaches any network
  and no money moves.
- Receipts: a PDF receipt is produced by the TOTEM box from a real operator
  SMS. The demo account has no box, so its receipt button answers that no
  receipt is made in the demo; on a real account the receipt opens as a PDF
  ready to share.
- Account deletion: Settings > Delete my account, confirmed with the
  password; the account is deleted at once. Also possible on the web at
  https://totemlabs.app/suppression. The demo account is shared and
  cannot be deleted: please create an account to test deletion.

4. EXTERNAL SERVICES
- The TOTEM platform (https://totemlabs.app), hosted on Vercel, with a
  managed PostgreSQL database at Supabase.
- TOTEM boxes, which talk to the mobile operators exactly as a phone does,
  over USSD and SMS.
- Expo and Apple Push Notification service, to notify the user when an
  operator SMS arrives. Expo also delivers the app's over-the-air updates.
- Telegram: each TOTEM box reports to whoever runs it (the TOTEM team, or
  the user for their own box) in a private Telegram chat, with a copy of the
  operator SMS it receives and of the PDF receipts. This is disclosed in our
  privacy policy. Passwords and Mobile Money PINs are never sent there.
No payment processor, no third-party sign-in, no AI service, no advertising,
analytics or tracking SDK.

5. REGIONAL DIFFERENCES
None. The app is the same in every region, in English and French.

6. REGULATED INDUSTRY
TOTEM is not a bank, a wallet or a payment service: it holds no funds, and
no money passes through it or through us. Each operation is made by the
card's holder, on their own Mobile Money account, through the operator's own
USSD menu, exactly as if they typed the code on their own phone. The
operator authenticates it with the holder's PIN: it is typed in the app,
relayed to the box only for the time needed to dial it, erased as soon as
the request closes, and never shown, logged or kept. The Mobile Money
service itself is provided and licensed by the operators.
```

## Pourquoi chaque phrase est vraie

Une réponse à Apple se vérifie : l'examinateur a la vidéo, la vitrine et le
paquet. Chaque phrase ci-dessus correspond à du code, et rien d'autre.

| Ce qu'on dit | Où c'est vrai |
|---|---|
| Inscription dans l'app, six champs, mot de passe de 12 caractères au moins | `mobile/src/inscription.tsx`, `web/lib/porte.ts` (`inscrire`), `web/app/api/inscription/route.ts` |
| Le compte s'ouvre tout de suite | `inscrire` crée un compte « invite » approuvé, et rend un jeton ; `verifier-les-comptes` l'éprouve |
| « Ajouter ma carte », les deux façons, l'aide chez l'opérateur | `mobile/src/ajouter-ma-carte.tsx`, textes `ajouterCarte…` dans `web/noyau/textes/accueil.ts` |
| Un compte ne voit que ses cartes | la portée par carte (`web/lib/portee.ts`), éprouvée par `verifier-les-cartes` |
| Suppression dans l'app, au mot de passe, immédiate | `mobile/src/supprimer-mon-compte.tsx`, `web/app/api/moi/suppression/route.ts` |
| La vitrine ne se supprime pas, et le dit | 403 avec `vitrineNeSeSupprimePas` (`web/noyau/textes/api.ts`) |
| Suppression aussi sur le web | `web/app/suppression/` (page et formulaire) |
| Vitrine : deux cartes inventées, opérations jouées pour de faux | `web/lib/demonstration.ts`, éprouvée par `verifier-la-demonstration` |
| Telegram : copie des SMS et des reçus vers la discussion privée de qui tient le boîtier | `totem/__main__.py` (`TransportTelegram`, exigé en mode réel), `totem/app.py` (`envoyer_fichier`) ; nommé dans `web/noyau/textes/confidentialite.ts` (`tiers`) |
| La puce s'attribue d'après le code de compte, pas d'après l'adresse | `web/lib/code-de-compte.ts`, refus 409 dans `web/app/api/comptes/route.ts` ; éprouvé par `verifier-les-comptes` |
| La vitrine n'établit pas de reçu, et le dit | `recuPasEnDemonstration` (`web/noyau/textes/api.ts`), `web/app/api/commande/route.ts` |
| Vercel, Supabase, Expo, APNs, Telegram ; rien d'autre | `web/package.json` (Next seul), `mobile/package.json` (Expo seul), `web/lib/pousser.ts` (`exp.host`), `app.json` (`updates.url` sur `u.expo.dev`) ; la politique de confidentialité nomme les mêmes |
| Le code secret relayé, puis effacé à la clôture | règle `commandes_code_efface` de la base (`sql/schema.sql`) : une demande close perd son code dans la même écriture |
