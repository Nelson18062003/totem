# Check-list des tests en France (avant envoi à Douala)

> Règle d'or : **si ces tests passent chez vous, ça marchera à Douala** —
> le logiciel est identique, seule la SIM change. Cochez chaque case.

Matériel : le robot monté + une SIM française prépayée (PIN désactivé, un peu
de crédit et de data).

## A. Démarrage
- [ ] Au branchement, le robot annonce « ✅ … en ligne — N compte(s) » sur Telegram (≈2 min)
- [ ] `/statut` répond : opérateur affiché, signal ≥ 12/31
- [ ] `python3 -m totem --modems` liste bien chaque modem branché

## A bis. Second modem (quand il arrive)
- [ ] Brancher le second modem sur le **hub USB alimenté**, puis redémarrer TOTEM
- [ ] Le démarrage annonce **2 comptes**, chacun avec son opérateur
- [ ] `/comptes` affiche les deux, avec des boutons de bascule
- [ ] Un SMS reçu sur chaque SIM arrive bien, étiqueté du bon opérateur

## B. USSD interactif (le cœur du projet)
- [ ] Envoyez un code USSD de votre opérateur (ex. Lycamobile `*131#`,
      Lebara `*144#`, Free `#123#`) → la réponse s'affiche dans Telegram
- [ ] Si le code ouvre un menu numéroté : les **boutons** apparaissent, et un
      appui fait avancer la session **dans la même carte** (pas de nouveau message)
- [ ] Répondre par un message (au lieu du bouton) marche aussi
- [ ] Une question libre (« entrez un numéro ») affiche bien
      « ✍️ Répondez par un message »
- [ ] `/annuler` ferme proprement une session en cours
- [ ] Laissez une session ouverte 3 min sans répondre → le robot annonce
      « ⌛ Session USSD expirée »

## C. SMS
- [ ] Envoyez un SMS vers la SIM de test depuis votre téléphone →
      il apparaît dans Telegram en ≤ 15 s (« 📥 SMS de … »)
- [ ] `/sms` liste bien ce SMS
- [ ] `/rapport` répond (0 encaissement, normal : pas de SMS MoMo en France)
- [ ] `/export` envoie un fichier CSV qui s'ouvre dans Excel, accents corrects

## C bis. Confort Telegram
- [ ] Le bouton *Menu* de l'application Telegram liste bien les commandes
- [ ] `/menu` affiche l'écran d'accueil, et chaque bouton fait ce qu'il annonce
- [ ] Si un raccourci est configuré : un seul appui déroule toute la séquence

## D. Robustesse (les pannes de Douala, simulées à Lille)
- [ ] **Coupure de courant** : débranchez 10 s, rebranchez → le robot revient
      seul et renvoie « ✅ en ligne » (≈2 min), sans aucune intervention
- [ ] **Modem muet** : `/redemarrer_modem` → « ✅ Modem redémarré »
- [ ] **Accès à distance** : depuis votre téléphone en 4G (Wi-Fi coupé),
      l'appli Tailscale montre `totem` en ligne, et le bot répond

## D bis. Redémarrage (à faire absolument)
- [ ] Coupez le robot, envoyez-lui 3 messages (dont un code USSD), rallumez →
      il revient en ligne **sans exécuter** ces messages en retard

## E. Sécurité
- [ ] Depuis le Telegram d'une AUTRE personne, envoyez un message au bot →
      le robot **ignore** totalement (filtre par conversation)
- [ ] Pendant une saisie de PIN, le **pavé de boutons** s'affiche et seuls des
      `•` apparaissent : aucun chiffre ne devient un message du chat
- [ ] Si vous tapez le PIN à la main malgré tout, le message est effacé du chat
- [ ] Si un groupe est configuré : depuis un compte **non** listé dans `admins`,
      un code USSD est refusé (« 🔒 ») alors que `/rapport` fonctionne

## F. Avant l'emballage
- [ ] Cloner la carte SD sur la carte de secours
- [ ] `sudo shutdown now`, retirer la SIM de test française
- [ ] Glisser dans le colis : le robot, l'alim (embout EURO monté), le câble
      Ethernet, la carte SD de secours, la fiche `FICHE-DOUALA.md` imprimée

> Astuce : testez aussi 24 h en continu (robot branché, quelques SMS dans la
> journée). C'est le meilleur détecteur de problèmes de stabilité.
