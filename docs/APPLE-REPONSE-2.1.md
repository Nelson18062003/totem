# Réponse à Apple — « Guideline 2.1 — Information Needed »

Apple a mis en attente la première soumission (3 octobre 2026) : le compte
développeur est neuf, il demande plus d'informations. Ce n'est pas un refus
du contenu de l'application.

**Ce qu'il faut envoyer** (App Store Connect → Vérification de l'app → la
soumission → « Répondre à l'équipe de vérification des apps ») :

1. **Le texte ci-dessous**, copié tel quel.
2. **Une vidéo** filmée sur un vrai iPhone (voir plus bas), jointe à la
   réponse.

Puis **« Soumettre à nouveau »**. Le même texte est déjà dans la note de la
fiche (`mobile/store.config.js`), envoyée par le bouton « Fiche App Store ».

## La vidéo (2 à 3 minutes, enregistrement d'écran de l'iPhone)

Centre de contrôle → bouton d'enregistrement d'écran. Puis, sans couper :

1. Ouvrir TOTEM depuis l'écran d'accueil (la vidéo doit COMMENCER là).
2. Se connecter avec `examen@totemlabs.app` / `TOTEM-Examen-2026`.
3. Accueil : la carte et son solde, puis « Tout voir » : les SMS.
4. Ouvrir un SMS, puis revenir.
5. Bouton **Dépôt** sous la carte → numéro `670000011` → montant `5000`
   → Confirmer → le message de l'opérateur s'affiche → taper un code (par
   exemple `1234`) → « Operation reussie (DEMONSTRATION…) ».
6. Réglages → se déconnecter.

## Le texte à envoyer

```
1. SCREEN RECORDING
A recording made on a physical iPhone running the latest iOS is attached to
our reply in App Review. It starts from the Home Screen, signs in with the demonstration account, shows
the cards and balances, the operator SMS inbox, and runs a full simulated
deposit up to the operator's confirmation and the PIN step.
Account registration: there is no public sign-up in the app. Accounts are
created only by the owner of the SIM cards, for the sellers they entrust a
card to (Settings > Accounts). Account deletion: the owner can delete any
account from the same screen, and any user can request deletion of their
account and data at https://totemlabs.app/suppression. There is no
user-generated content shared between users, and no paid content.

2. PURPOSE AND AUDIENCE
TOTEM is a private management interface for a business that runs Mobile
Money service points (mobile-money agents). The business keeps its own
Mobile Money SIM cards in a terminal (a Raspberry Pi with a GSM modem) at its
premises. Without TOTEM, staff must stand next to each SIM and type USSD
codes (*126#, then menus) on a small phone screen. TOTEM lets the owner and
the sellers they designate see each card's balance, read the operator's SMS
receipts, and run the same USSD operations from their own iPhone, with a
receipt for each customer. The audience is the owner and their own staff
only; it is not meant for the general public, and we have requested unlisted
distribution for it.

3. HOW TO ACCESS THE MAIN FEATURES
Sign in with the demonstration account:
  examen@totemlabs.app / TOTEM-Examen-2026
It shows invented data only (two demo SIM cards, balances, operator SMS).
- Home: card, balance, latest SMS. "See all": full SMS inbox.
- Deposit / Withdrawal / Transfer: the buttons under the card on Home, or
  the Operations tab. In the demonstration
  account these are SIMULATED end to end: enter any number (e.g. 670000011)
  and amount (e.g. 5000), confirm, read the operator's confirmation screen,
  type any 4-digit PIN. Nothing is sent to any network and no money moves.
- Accounts tab: each card, its balance and counters.

4. EXTERNAL SERVICES
- The business's own TOTEM platform (https://totemlabs.app), hosted on a
  cloud provider, with a managed PostgreSQL database. It relays requests
  between the app and the business's terminal.
- The business's own terminal and SIM cards, which talk to the mobile
  operators (MTN, Orange) exactly as a phone does, over USSD and SMS.
- Expo / Apple Push Notification service, to notify the owner when an
  operator SMS arrives.
No payment processor, no third-party authentication, no AI service, no
advertising or analytics SDK.

5. REGIONAL DIFFERENCES
None. The app is identical in every region and language (English, French).
What it shows depends only on the SIM cards the business owns.

6. REGULATED INDUSTRY
TOTEM is not a payment service, wallet or bank: it holds no funds and no
money passes through it or through us. Every operation is performed by the
SIM card's owner, on their own Mobile Money account, through the operator's
own USSD menu, exactly as if they typed the code on that phone; the
operator authenticates it with the owner's PIN, which TOTEM never stores.
The mobile-money service itself is provided and licensed by the operators
(MTN Mobile Money, Orange Money), under the agent agreements the business
already holds with them.
```
