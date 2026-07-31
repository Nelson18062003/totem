# Check-list des tests en France (avant envoi à Douala)

> Règle d'or : **si ces tests passent chez vous, ça marchera à Douala** —
> le logiciel est identique, seule la SIM change. Cochez chaque case.

Matériel : le robot monté + une SIM (PIN désactivé, un peu de crédit et de
data). Deux options, aussi valables l'une que l'autre :

- **une SIM française prépayée** — pour éprouver la mécanique sans toucher au
  compte de production ;
- **la vraie SIM MTN Cameroun**, qui fonctionne ici **en itinérance** : MTN
  n'ayant pas d'antennes en France, la carte emprunte celles d'un opérateur
  français. Plus proche du réel, mais les SMS de paiement qui arrivent pendant
  l'essai sont de vrais encaissements.

## A. Démarrage
- [ ] Au branchement, le robot annonce « ✅ … en ligne — N compte(s) » sur Telegram (≈2 min)
- [ ] `/statut` répond : opérateur affiché, signal ≥ 12/31
- [ ] `python3 -m totem --modems` liste bien chaque modem branché
- [ ] **Le compte porte le nom de l'opérateur de la CARTE, pas du réseau capté.**
      Avec une SIM MTN essayée en France, on doit lire
      `MTN ·xxxx (itinérance sur Orange F)` — et surtout pas `Orange`. Le nom
      vient de l'IMSI, gravé sur la puce : c'est ce qui garantit que
      l'historique ne se coupe pas en deux le jour où le boîtier arrive à
      Douala et retrouve son réseau d'origine.
- [ ] `--modems` affiche l'**ICCID complet** : comparez-le au numéro imprimé
      sur la puce. S'il manque, le cloisonnement par carte ne peut pas
      fonctionner

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
- [ ] **Réactivité** : dès l'envoi du code, la carte affiche « ⏳ Composition
      de … » sans délai perceptible ; le menu la remplace à l'arrivée
- [ ] Enchaînez 4 ou 5 options d'affilée → chaque écran suit le rythme du
      réseau, sans seconde d'attente supplémentaire entre les étapes
- [ ] Laissez une session ouverte 3 min sans répondre → le robot annonce
      « ⌛ Session USSD expirée »

## C. SMS
- [ ] Envoyez un SMS vers la SIM de test depuis votre téléphone →
      il apparaît dans Telegram en ≤ 15 s (« 📥 SMS de … »)
- [ ] `/sms` liste bien ce SMS
- [ ] `/rapport` répond (0 encaissement, normal : pas de SMS MoMo en France)
- [ ] `/export` envoie un fichier CSV qui s'ouvre dans Excel, accents corrects
- [ ] Tous les SMS déclenchent la même notification (aucun n'arrive en silence)

## C bis. Confort Telegram
- [ ] Le bouton *Menu* de l'application Telegram liste bien les commandes
- [ ] `/menu` affiche l'écran d'accueil, et chaque bouton fait ce qu'il annonce
- [ ] Si un raccourci est configuré : un seul appui déroule toute la séquence
- [ ] Aucun cadre gris à chasse fixe n'apparaît : le texte est lisible d'un coup
- [ ] Les options du menu ne sont PAS écrites en texte au-dessus des boutons

## C ter. Deux opérateurs, deux SIM (le vrai test)
- [ ] Avec la SIM MTN : l'accueil affiche « 📱 Menu MTN … » et l'appui ouvre `*126#`
- [ ] Remplacez par la SIM Orange, attendez une minute → le robot annonce
      **« 💳 Nouvelle carte SIM détectée »** avec le bon opérateur
- [ ] L'accueil propose maintenant le menu Orange, et le raccourci Solde
      déroule la séquence Orange (pas celle de MTN)
- [ ] `/sms` et `/rapport` ne montrent QUE les SMS de la carte en place
- [ ] Remettez la SIM MTN : son journal ressort intact
- [ ] `/sims` liste les deux cartes, la carte en place marquée ▶️

### Deux SIM du MÊME opérateur (le piège)
C'est le cas qu'un nom d'opérateur seul ne sait pas distinguer, et celui où une
erreur ne se voit pas : les chiffres s'additionnent en silence et ne
correspondent plus à aucun solde réel.

- [ ] Notez le solde affiché, puis remplacez la SIM MTN par une **autre** SIM MTN
- [ ] Le robot annonce bien un changement de carte, avec **deux suffixes
      différents** (« MTN ·0011 » retirée, « MTN ·0099 » en place)
- [ ] `/rapport` repart à zéro : les encaissements de la première puce ne sont
      **pas** comptés sur la seconde
- [ ] `/sims` affiche les deux lignes MTN, chacune avec son propre total
- [ ] Remettez la première : son total réapparaît, inchangé
- [ ] Dans un menu qui *parle* du code secret sans le demander (ex. Orange
      « Gerer mon code secret »), le pavé PIN ne s'ouvre **pas** : des boutons

## C quater. Vos propres boutons (à faire une fois par opérateur)
- [ ] Consultez votre solde en passant par le menu, jusqu'au bout
- [ ] À la fin, le bouton **💾 En faire un bouton** apparaît → appuyez
- [ ] Nommez-le « Solde » → il apparaît sur l'écran d'accueil
- [ ] Appuyez dessus : le parcours se déroule seul, le pavé du code s'ouvre
- [ ] **Vérifiez que le parcours affiché ne contient PAS votre code** —
      `/raccourcis` montre les étapes en clair, il ne doit y avoir que le
      code composé et les chiffres du menu
- [ ] Faites de même pour un dépôt et un retrait
- [ ] Lancez un transfert, allez jusqu'à la question du bénéficiaire, puis
      enregistrez → le bouton doit s'arrêter **à la question**, sans rejouer
      ni le numéro ni le montant
- [ ] Changez pour la carte de l'autre opérateur → les boutons changent tout
      seuls, ceux du premier réseau ne s'affichent plus

## D. Robustesse (les pannes de Douala, simulées à Lille)
- [ ] **Coupure de courant** : débranchez 10 s, rebranchez → le robot revient
      seul et renvoie « ✅ en ligne » (≈2 min), sans aucune intervention
- [ ] **Modem muet** : `/redemarrer_modem` → « ✅ Modem redémarré »
- [ ] **Accès à distance** : depuis votre téléphone en 4G (Wi-Fi coupé),
      l'appli Tailscale montre `totem` en ligne, et le bot répond

## D bis. Redémarrage et pannes silencieuses (à faire absolument)
- [ ] Coupez le robot, envoyez-lui 3 messages (dont un code USSD), rallumez →
      il revient en ligne **sans exécuter** ces messages en retard
- [ ] **Débranchez le câble USB du HAT**, puis lancez le robot → vous recevez
      « ⛔ Modem injoignable » sur Telegram (et non un silence)
- [ ] Rebranchez → « ✅ Modem retrouvé » arrive sans intervention
- [ ] Lancez une 2ᵉ instance (`python3 -m totem` pendant que le service tourne)
      → alerte « deux robots utilisent le même jeton ». Arrêtez-la ensuite.
- [ ] `/diagnostic` répond : durée de marche, mémoire SMS, ICCID, IMSI,
      disque, température. **Vérifiez que l'ICCID s'affiche** (sinon le
      cloisonnement par SIM ne peut pas fonctionner)
- [ ] Envoyez 5 SMS coup sur coup à la SIM → les 5 arrivent tous dans Telegram
      (aucun perdu par excès de débit)
- [ ] **Coupez Internet sur le Pi** (débranchez l'Ethernet / le Wi-Fi), envoyez
      un SMS à la SIM → rien n'arrive, c'est normal. Rebranchez : le SMS
      **arrive tout seul** quelques secondes plus tard
- [ ] Coupez Internet, envoyez 3 SMS, rebranchez → les 3 arrivent **dans
      l'ordre** où ils ont été reçus

## D ter. Sauvegarde et garde-fou financier
- [ ] `/sauvegarde` envoie un fichier `journal-AAAA-MM-JJ.db` dans la
      conversation. Téléchargez-le et gardez-le : c'est votre filet de sécurité
- [ ] Réglez `seuil_confirmation` bas (ex. 1000), lancez un transfert d'un
      montant supérieur → une carte **⚠️ Confirmation demandée** s'affiche avec
      le montant et le bénéficiaire, **avant** le pavé du code
- [ ] Essayez de taper le code à la main à ce moment-là → refusé, la
      confirmation reste affichée
- [ ] Appuyez sur **✅ Confirmer** → le pavé apparaît, le transfert aboutit
- [ ] Refaites un transfert d'un montant **inférieur** au seuil → aucune
      confirmation, le pavé s'affiche directement

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
