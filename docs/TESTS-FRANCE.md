# Check-list des tests en France (avant envoi à Douala)

> Règle d'or : **si ces tests passent chez vous, ça marchera à Douala** —
> le logiciel est identique, seule la SIM change. Cochez chaque case.

Matériel : le robot monté + une SIM française prépayée (PIN désactivé, un peu
de crédit et de data).

## A. Démarrage
- [ ] Au branchement, le robot envoie « ✅ … en ligne. SIM détectée » sur Telegram (≈2 min)
- [ ] `/statut` répond : opérateur français affiché, signal ≥ 12/31

## B. USSD interactif (le cœur du projet)
- [ ] Envoyez un code USSD de votre opérateur (ex. Lycamobile `*131#`,
      Lebara `*144#`, Free `#123#`) → la réponse s'affiche dans Telegram
- [ ] Si le code ouvre un menu : répondez un chiffre → le sous-menu arrive
- [ ] `/annuler` ferme proprement une session en cours

## C. SMS
- [ ] Envoyez un SMS vers la SIM de test depuis votre téléphone →
      il apparaît dans Telegram en ≤ 15 s (« 📥 SMS de … »)
- [ ] `/sms` liste bien ce SMS
- [ ] `/rapport` répond (0 encaissement, normal : pas de SMS MoMo en France)

## D. Robustesse (les pannes de Douala, simulées à Lille)
- [ ] **Coupure de courant** : débranchez 10 s, rebranchez → le robot revient
      seul et renvoie « ✅ en ligne » (≈2 min), sans aucune intervention
- [ ] **Modem muet** : `/redemarrer_modem` → « ✅ Modem redémarré »
- [ ] **Accès à distance** : depuis votre téléphone en 4G (Wi-Fi coupé),
      l'appli Tailscale montre `totem` en ligne, et le bot répond

## E. Sécurité
- [ ] Depuis le Telegram d'une AUTRE personne, envoyez un message au bot →
      le robot **ignore** totalement (c'est le filtre par chat_id)
- [ ] Pendant une saisie de PIN simulée (menu contenant « PIN »), le message
      est bien effacé du chat après envoi

## F. Avant l'emballage
- [ ] Cloner la carte SD sur la carte de secours
- [ ] `sudo shutdown now`, retirer la SIM de test française
- [ ] Glisser dans le colis : le robot, l'alim (embout EURO monté), le câble
      Ethernet, la carte SD de secours, la fiche `FICHE-DOUALA.md` imprimée

> Astuce : testez aussi 24 h en continu (robot branché, quelques SMS dans la
> journée). C'est le meilleur détecteur de problèmes de stabilité.
