# TOTEM — Guide d'installation pas à pas

> Objectif : partir des cartons (Raspberry Pi 4, HAT SIM7600G-H (B), alimentation,
> carte SD) et arriver à un robot qui vous parle sur Telegram. Durée : ~2 h.
> Aucune ligne de code à écrire.

## Étape 0 — Préparer les comptes (20 min, sur votre PC)

1. **Le bot Telegram** : dans Telegram, cherchez **@BotFather** → envoyez `/newbot`
   → donnez un nom (« VOG MoMo ») puis un identifiant (ex. `vog_momo_bot`).
   BotFather répond avec une **clé secrète** (`7381029:AAH8f...`). Copiez-la.
   *Ne la partagez jamais : c'est la carte d'identité du robot.*
2. **Votre identité Telegram** : cherchez **@userinfobot**, envoyez n'importe quoi,
   il répond votre **ID** (ex. `123456789`). Copiez-le. Le robot n'obéira qu'à cet ID.
3. **Tailscale** (accès à distance) : créez un compte gratuit sur tailscale.com
   (connexion Google), et installez l'appli Tailscale sur votre PC et votre téléphone.

## Étape 1 — Montage (1 h, niveau Lego)

1. Collez les 3 radiateurs sur les puces du Pi (la grosse au centre d'abord).
2. Vissez les **2 antennes** sur le HAT : la LTE sur « MAIN », la GPS sur « GNSS »
   (la GPS est facultative, mais autant la mettre).
3. Glissez la SIM de test dans la fente du HAT (coin coupé selon le dessin gravé).
   **Le code PIN de la SIM doit être désactivé** (faites-le d'abord dans un téléphone :
   Paramètres → Sécurité → Verrouillage de la SIM → désactiver).
4. Reliez le HAT au Pi avec le **câble USB fourni** (micro-USB côté HAT, USB-A côté Pi).
5. Ne branchez pas encore l'alimentation.

## Étape 2 — Flasher la carte SD (20 min, sur votre PC)

1. Téléchargez **Raspberry Pi Imager** (raspberrypi.com/software) et lancez-le.
2. Choisissez : appareil « Raspberry Pi 4 » → système « Raspberry Pi OS **Lite** (64-bit) »
   → votre carte SD.
3. Dans les **réglages avancés** (roue dentée / « Modifier réglages ») :
   - Nom d'hôte : `totem`
   - Utilisateur : `nelson` + un mot de passe solide (notez-le)
   - Wi-Fi : le SSID et le mot de passe de VOTRE box (pour la phase de test)
   - **Cochez « Activer SSH »** (onglet Services)
4. Écrivez. À la fin, la carte contient le système, pré-connecté à votre Wi-Fi.

## Étape 3 — Installer le robot (30 min)

1. Carte SD dans le Pi → branchez l'alimentation. Attendez 2 minutes (1er démarrage).
2. Sur votre PC, ouvrez un terminal (Windows : PowerShell) :
   ```
   ssh nelson@totem.local
   ```
   (Si « introuvable » : votre box affiche l'adresse IP du Pi, utilisez
   `ssh nelson@ADRESSE_IP`.)
3. Récupérez le logiciel puis lancez l'installation. Le repo étant **privé**,
   créez d'abord un jeton d'accès en lecture (une fois pour toutes) :
   github.com → votre avatar → *Settings* → *Developer settings* →
   *Fine-grained tokens* → *Generate new token* → nom `totem-pi`,
   accès au seul repo `totem`, permission **Contents : Read-only** → copiez le jeton.
   ```
   git clone --depth 1 https://VOTRE_JETON@github.com/Nelson18062003/totem.git
   cd totem
   sudo bash install.sh
   ```
4. Répondez aux questions : collez la **clé BotFather**, puis votre **ID Telegram**,
   puis autorisez **Tailscale** en ouvrant le lien affiché.
5. Trente secondes plus tard, votre téléphone vibre :
   **« ✅ TOTEM en ligne… »**. Le robot est vivant.

## Étape 4 — Tester (voir `TESTS-FRANCE.md`)

Déroulez la check-list complète avec la SIM française avant tout envoi au Cameroun.

## Étape 4 bis — Confort et travail en équipe (facultatif, 15 min)

Le robot fonctionne déjà en tête-à-tête. Si vous voulez les **raccourcis**
(le solde en un bouton), le **groupe d'équipe** avec des rôles, ou les **sujets**
(un fil pour les encaissements, un pour les alertes), tout se règle dans
`totem.conf` : voir [`GUIDE-TELEGRAM.md`](GUIDE-TELEGRAM.md).

Après modification : `sudo systemctl restart totem`.

## Étape 5 — Cloner la carte de secours

Sur votre PC, avec Raspberry Pi Imager ou Win32DiskImager :
lisez la carte configurée → image `.img` → écrivez l'image sur la 2ᵉ carte.
La jumelle part dans le colis pour Douala.

## Dépannage rapide

| Symptôme | Remède |
|---|---|
| Pas de message Telegram au démarrage | `sudo journalctl -u totem -n 50` et lisez l'erreur (souvent : clé/ID mal collés dans la config) |
| « Aucune SIM détectée » | SIM mal insérée, ou PIN SIM pas désactivé |
| Pas de réponse USSD | Signal faible (`/statut`) → déplacez l'antenne près d'une fenêtre |
| Le port modem n'est pas ttyUSB2 | `ls /dev/ttyUSB*` puis ajustez `port =` dans la config |
| Modifier la config sans SSH | Éteignez, mettez la carte SD dans le PC : le fichier `totem.conf` est visible à la racine, modifiable avec le Bloc-notes |
