# TOTEM — ce qui peut mal tourner

> Ce document n'est pas rassurant, et c'est volontaire. Une machine qui tient
> de l'argent à 5 000 km mérite qu'on écrive noir sur blanc ses points de
> rupture. Chaque ligne dit : le risque, ce qui est **déjà** en place, et ce
> qui reste à faire.
>
> Légende : ✅ traité · 🟡 atténué, perfectible · 🔴 non traité

---

## 1. Perdre de l'argent ou une information d'argent

### ✅ Un SMS d'encaissement perdu parce que la mémoire était pleine
La mémoire SMS d'une **carte SIM** ne contient qu'une vingtaine de messages.
Une fois pleine, le réseau ne peut plus rien déposer : les paiements suivants
n'arrivent **jamais**, sans le moindre signe.

*En place* : le robot stocke désormais dans la mémoire du **modem** (des
centaines de messages) et retombe sur la SIM seulement si le modem refuse.
Il surveille le taux de remplissage toutes les 5 minutes et alerte à 80 %.

### ✅ Un SMS perdu à cause d'une coupure au mauvais moment
L'ancienne version lisait les SMS non lus, **les effaçait du modem**, puis les
enregistrait. Une coupure de courant entre les deux effaçait un encaissement
pour toujours.

*En place* : l'ordre est inversé — lecture, écriture au journal, envoi
Telegram, **puis seulement** effacement. Une coupure au milieu fait relire le
message au redémarrage. Un garde-fou anti-doublon (même expéditeur, même
texte, moins de 15 min) évite de l'annoncer deux fois.

### ✅ Un montant mal lu, donc un rapport faux
La reconnaissance ne couvrait que « reçu … FCFA ». Les opérateurs écrivent
aussi « crédité de 25.000 F CFA », « 25000 XAF », sans cédille, avec des
points ou des espaces.

*En place* : reconnaissance élargie, et les **sorties** (envoi, retrait,
paiement, débit) sont désormais comptées à part. Le bilan affiche entrées,
sorties et solde du jour.

### 🟡 Un SMS long coupé en morceaux
Au-delà de ~160 caractères, le réseau découpe un SMS en plusieurs parties.
En mode texte, le modem les livre comme des messages séparés : un relevé long
arrive en deux bouts.

*État* : les SMS Mobile Money tiennent en un seul message, donc l'impact réel
est faible. Le recollage propre demande le **mode PDU** (`AT+CMGF=0`) et la
lecture des en-têtes de concaténation. À faire si des messages tronqués
apparaissent.

### 🔴 Le robot ne voit que ce que l'opérateur envoie
Si l'opérateur n'envoie pas de SMS pour une opération, elle n'existe pas pour
TOTEM. Il n'y a pas d'API Mobile Money derrière : c'est de la lecture de SMS.
Le journal est un **reflet**, jamais la source de vérité comptable.

---

## 2. Le robot devient muet ou injoignable

### ✅ Le modem absent au démarrage
Si le câble USB du HAT a bougé, l'ancien code plantait à l'ouverture du port.
systemd relançait en boucle, et **personne n'était prévenu** — le robot était
mort en silence.

*En place* : Telegram est monté **avant** le modem. Si le port est
injoignable, vous recevez un message avec le port, l'erreur et la marche à
suivre ; le robot réessaie toutes les 30 s et annonce son retour.

### ✅ Deux robots sur le même jeton
Lancer le service alors qu'une session tourne déjà en SSH : les deux
interrogent Telegram, **chacun coupe l'autre**, et vos commandes se perdent au
hasard sans aucune erreur visible.

*En place* : l'erreur 409 est détectée, nommée, et vous recevez la commande
exacte pour arrêter l'instance en trop.

### ✅ Une rafale de SMS qui fait bloquer le bot
Telegram tolère environ **un message par seconde et par conversation**,
30 par seconde au total. Dix encaissements d'affilée dépassaient la limite :
Telegram répondait 429 et bloquait le robot des dizaines de secondes.

*En place* : les envois sont espacés automatiquement, et le délai imposé par
Telegram est respecté quand il arrive quand même.

### ✅ Un message refusé pour cause de mise en forme
Un SMS contenant des caractères inattendus pouvait casser le balisage : Telegram
répondait 400 et **le message était perdu**.

*En place* : en cas de refus, le message est renvoyé aussitôt sans mise en
forme. Mieux vaut un texte sans gras qu'un encaissement jamais annoncé.

### ✅ Plus d'Internet à Douala
Sans réseau, le robot ne pouvait rien envoyer, et **les alertes émises pendant
la coupure étaient perdues** — or c'est justement pendant une coupure que les
paiements continuent d'arriver.

*En place* : encaissements, alertes et bilans passent par une file d'attente
écrite sur disque. Un envoi qui échoue est mis de côté et repart seul au
retour du réseau, dans l'ordre d'origine. Un message impossible à envoyer est
abandonné au bout de nombreuses tentatives pour ne pas bloquer la file.

### 🔴 Panne de courant prolongée / carte SD morte
Le Pi ne redémarre pas tout seul sans électricité, et une carte SD finit par
s'user. La carte de secours et la fiche imprimée sont la réponse actuelle —
elle est humaine, pas automatique.

---

## 3. Sécurité

### ✅ Le code secret
Composé sur un pavé de boutons : il n'existe jamais comme message Telegram.
Journalisé en `****`. Saisie au clavier toujours possible, message effacé.

### ✅ Qui peut agir
Seules les conversations déclarées sont écoutées ; seuls les `admins`
pilotent la SIM ; toute tentative refusée est journalisée.

### ✅ Une sortie importante sans garde-fou
Qui tient votre téléphone déverrouillé tenait le robot.

*En place* : au-delà d'un montant que vous fixez (`seuil_confirmation`), le
pavé du code secret ne s'affiche qu'après une carte de confirmation rappelant
le montant et le bénéficiaire. Tant qu'elle n'est pas validée, le code
n'existe nulle part — et le taper à la main ne contourne rien.

### 🟡 Le jeton du bot est la clé du royaume
Qui obtient le fichier `totem.conf` obtient le contrôle du robot. Le fichier
vit sur la partition de démarrage, lisible dès qu'on a la carte SD en main.

*À faire* : droits restreints sur le fichier, et surtout **révoquer le jeton
auprès de @BotFather** au moindre doute (`/revoke`).

### 🟡 Telegram voit tout ce qui transite
Les conversations avec un bot ne sont **pas** chiffrées de bout en bout. Les
montants et les menus passent par les serveurs de Telegram. C'est un choix
assumé (rien d'autre n'offre cette simplicité d'usage), mais il faut le savoir.

### 🟡 Un téléphone volé et déverrouillé
Celui qui a votre Telegram a le robot. La confirmation au-delà d'un montant
(ci-dessus) est le premier garde-fou ; elle ralentit un voleur pressé, elle
n'arrête pas quelqu'un de déterminé qui connaît votre code Mobile Money.

---

## 4. USSD et opérateurs

### ✅ Un menu illisible
Le réseau code sa réponse en **GSM 7 bits packé** ou en **UCS2**, et l'annonce
dans un champ (le DCS) que l'ancien code capturait puis jetait. Lu de travers,
un menu sort en idéogrammes ou en chiffres hexadécimaux.

*En place* : décodage des deux alphabets, arbitrage par plausibilité, et le
DCS ne sert que de départage — certains firmwares annoncent un codage et en
renvoient un autre.

### ✅ Le pavé du code secret au mauvais moment
Un menu qui *parle* du code secret n'en demande pas un. Un menu numéroté est
une navigation, jamais une saisie.

### 🟡 Les menus varient d'un opérateur et d'une offre à l'autre
La numérotation (`1.`, `1)`, `1-`, `01 :`) est gérée. Mais un opérateur qui
présenterait ses options autrement (tout sur une ligne, listes à puces) ne
serait pas découpé en boutons.

*État* : rien n'est perdu — toute ligne non reconnue reste affichée en texte,
et vous répondez par un message. Le pire cas est un retour à l'ancien confort.

### 🟡 Les raccourcis sont des suites de touches à l'aveugle
Si l'opérateur change l'ordre de son menu, `*126#, 5, 1` ne mène plus au
solde — il mène ailleurs. Le déroulé s'arrête devant toute demande de code
secret, donc **aucun raccourci ne peut à lui seul faire sortir de l'argent**,
mais il peut afficher autre chose que prévu.

*À faire* : vérifier que le menu attendu correspond avant d'enchaîner.

### ✅ Une navigation lente
Le code s'infligeait à lui-même plusieurs secondes d'attente par écran, en
plus de la latence du réseau :

| Ce qui coûtait du temps | Avant | Après |
|---|---|---|
| Ouvrir un menu, puis chaque touche | 1 200 ms **par étape** | ~0 ms |
| Lire signal + opérateur + SIM (accueil, `/statut`) | 900 ms | ~0 ms |
| Vérifier la SIM, **toutes les 60 s**, modem bloqué pendant ce temps | 5 600 ms | ~0 ms |

*Causes* : une pause fixe de 1,2 s après chaque réponse USSD « pour laisser
arriver la fin du message » ; une pause fixe de 0,3 s avant de lire chaque
réponse AT ; et surtout trois commandes d'ICCID essayées à chaque
vérification, dont une à laquelle beaucoup de firmwares ne répondent
**rien** — soit 5,6 s de modem gelé chaque minute.

*En place* : la fin d'une réponse USSD est détectée au lieu d'être attendue
(le sursis de 1,2 s ne sert plus que si le message arrive vraiment en
morceaux) ; la lecture du port démarre immédiatement ; les états lus souvent
sont mémorisés quelques secondes ; la commande d'ICCID qui marche est retenue ;
et la vérification de SIM ne s'exécute plus pendant une session USSD.

Reste la latence du réseau de l'opérateur, sur laquelle personne n'a la main.
Elle est désormais **rendue visible** : une carte « ⏳ Composition de *126#… »
part immédiatement, puis se transforme en menu. L'attente ne change pas, mais
l'écran ne reste plus figé sans explication.

### ✅ Une réponse AT coupée par le mot « OK »
La fin d'une commande AT était repérée sur la présence des lettres « OK »
n'importe où dans la réponse. Un SMS contenant « Transaction OK » interrompait
la lecture au milieu, tronquant le message.

*En place* : la fin est repérée sur une ligne `OK` / `ERROR` entière.

### 🔴 Une session USSD est fragile par nature
Le réseau peut fermer une session sans prévenir, et le délai de réponse
dépasse parfois 30 s en zone chargée. Le robot annonce l'échec, mais ne peut
pas reprendre au milieu.

---

## 5. Multi-SIM et multi-modem

### ✅ Deux cartes ne mélangent plus leurs journaux
Chaque écriture porte l'ICCID de la carte. Changement de carte détecté en
moins d'une minute.

### 🟡 L'ICCID peut ne pas se lire
Trois commandes AT sont essayées (`+CICCID`, `+CCID`, `+ICCID`) car les
firmwares diffèrent. Si aucune ne répond, l'identifiant est vide : tout
retombe dans un journal commun, comme avant. À vérifier au premier essai
avec `/diagnostic`.

### 🔴 Un seul modem à la fois
Deux SIM actives en même temps demandent deux HAT, donc deux ports série et
deux boucles de surveillance. La base est prête (un journal par carte), mais
le programme ne pilote aujourd'hui **qu'un seul modem**.

---

## 6. Exploitation

### ✅ Le bilan quotidien manqué
Le créneau était comparé à la minute exacte. Un redémarrage du modem à ce
moment-là faisait sauter le bilan de la journée entière.

*En place* : le bilan part dès que l'heure est **passée**, une seule fois par
jour.

### ✅ Voir l'état sans SSH
`/diagnostic` : durée de fonctionnement, mémoire SMS, ICCID, IMSI, numéro,
signal, réseau, espace disque et température du Pi.

### 🟡 L'heure du Pi
Le bilan suit l'heure locale de la machine. Un Pi mal réglé envoie le rapport
au mauvais moment. À vérifier avec `timedatectl` (fuseau `Africa/Douala`).

### ✅ Pas de sauvegarde hors du Pi
Le journal SQLite ne vivait que sur la carte SD. Une carte morte effaçait tout
l'historique des encaissements.

*En place* : `/sauvegarde` envoie une copie complète du journal dans Telegram,
automatiquement chaque jour après le bilan. Telegram conserve le fichier
indéfiniment : aucun serveur à louer, aucun identifiant de plus à gérer. Pour
restaurer, il suffit de remplacer `journal.db` par le fichier téléchargé.

*Reste* : la sauvegarde vit dans la même conversation Telegram que le reste.
Un compte Telegram perdu emporte les deux. Une copie occasionnelle vers un
disque à vous reste la ceinture de sécurité.

---

## Ce que je construirais ensuite, dans cet ordre

1. **Mini App Telegram** — l'app web `web/` servie dans Telegram : tableaux,
   filtres, historique par carte. C'est le pas au-delà des boutons.
2. **Vérification du menu attendu avant d'enchaîner un raccourci** — pour
   qu'un opérateur qui réorganise son menu ne mène pas ailleurs en silence.
3. **Mode PDU pour les SMS longs** — le jour où un message arrive tronqué.
4. **Second modem** — quand le deuxième HAT arrivera. La base est prête.
5. **Copie de sauvegarde ailleurs que dans Telegram** — pour ne pas dépendre
   d'un seul compte.
