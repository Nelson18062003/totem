# 🗿 TOTEM

**Le totem reste au pays ; à travers lui, vous agissez à distance.**

TOTEM héberge vos SIM Mobile Money (MTN MoMo, Orange Money…) sur un
Raspberry Pi 4 + modem SIM7600G-H resté au bureau (Douala) ; vous pilotez tout
depuis **Telegram**, de n'importe où dans le monde : codes USSD interactifs
(`*126#`, `#150#`), réception des SMS de paiement en temps réel, rapports
quotidiens, chien de garde automatique.

## Architecture

```
[Propriétaire, partout dans le monde]
        │ Telegram
        ▼
[api.telegram.org] ◄── connexion sortante uniquement (rien d'exposé)
        ▲
[Raspberry Pi à Douala] ──USB─┬─ [modem + SIM MTN]    ──radio── [MTN]
                              └─ [modem + SIM Orange] ──radio── [Orange]
```

- **Aucun port ouvert** : le Pi ne fait que des connexions sortantes
  (Telegram + Tailscale pour la maintenance SSH). Compatible Starlink (CGNAT).
- **Rien ne se tape dans la conversation** : le code PIN, mais aussi les
  montants et les numéros de bénéficiaire, se composent sur des pavés de
  boutons. Un appui n'est pas un message — il ne laisse donc aucune trace
  dans l'historique Telegram. Le journal ne garde du PIN que `****`.
- **Seules les conversations déclarées sont écoutées** ; tout autre expéditeur
  est ignoré en silence.

## L'expérience Telegram

Les menus MoMo arrivent en **boutons cliquables** (fini le « 5 » puis « 1 » à
l'aveugle), la session USSD tient sur **une seule carte qui se met à jour**, le
**code PIN se compose sur un pavé sécurisé**, et une opération courante tient en
**un seul bouton** (raccourcis appris).

Les saisies libres — montant, numéro du bénéficiaire — passent elles aussi par
un pavé de boutons. Un message tapé au clavier resterait dans la conversation ;
l'effacer après coup ne répare rien, il a existé et transité. Un chiffre
composé sur des boutons n'est jamais un message : il ne vit que dans la carte
de session, qui se réécrit en place. Le clavier reste possible quand la réponse
demande des lettres — le message est alors effacé aussitôt.

Le robot sait aussi travailler dans un **groupe d'équipe**, avec des **rôles**
(qui pilote / qui observe) et un **fil par nature d'information** si le groupe
utilise les sujets.

→ Tout est détaillé dans [`docs/GUIDE-TELEGRAM.md`](docs/GUIDE-TELEGRAM.md).

## Multi-comptes

Un modem = une SIM = un opérateur. Les modules « double SIM » du marché sont à
**veille simple** (une seule carte enregistrée à la fois) : un SMS arrivé sur la
carte inactive serait perdu. TOTEM utilise donc **un modem par opérateur**, tous
à l'écoute en permanence.

Les modems sont **détectés automatiquement** (`detect.py`) : on interroge chaque
port série, on regroupe par IMEI, on retient le port AT de chaque appareil.
L'ordre de branchement n'a aucune importance ; brancher un second modem suffit
à faire apparaître un second compte au redémarrage.

## Une carte SIM = un compte

Un compte n'est pas « MTN » : c'est **cette puce-là**. Le berceau du HAT
n'accueille qu'une carte à la fois, et rien n'empêche de l'échanger — y compris
contre une autre SIM du même opérateur. Ce sont alors deux caisses, deux
soldes, deux historiques.

Ce qui les sépare est l'**ICCID**, le numéro de série gravé sur la puce, unique
au monde. Trois numéros cohabitent, et les confondre coûte cher :

| Numéro | Ce qu'il identifie | Change quand… |
|---|---|---|
| **IMEI** | le modem | on change de modem |
| **ICCID** | la carte SIM | on change de carte |
| **IMSI** | l'abonné (5 premiers chiffres = pays + opérateur) | on change de carte |

Le nom du compte (« MTN ·8901 ») tire l'opérateur de l'IMSI et le suffixe de
l'ICCID. **Jamais du réseau capté** : en itinérance, celui-ci désigne
l'opérateur du pays visité — une SIM MTN Cameroun essayée en France répond
« Orange F ». Le compte s'appellerait « Orange » pendant les essais, puis
« MTN » à Douala : deux comptes en base pour une seule carte, et l'historique
coupé en deux le jour même de la mise en production. Le réseau visité reste
affiché, mais comme une mention : `MTN ·8901 (itinérance sur Orange F)`.

Conséquences concrètes :

- échanger une puce est **annoncé sur Telegram** dans la minute, avec ce qui
  sort et ce qui entre ;
- `/rapport`, `/sms` et `/export` ne couvrent que les **cartes en place** : les
  recettes d'une puce retirée ne viennent pas gonfler le total ;
- retirer une carte ne perd rien — `/sims` liste toutes les puces connues, et
  la remettre fait ressortir son journal intact.

## Vos propres boutons, appris sur le terrain

Les codes USSD n'ont rien d'universel : le solde est `*126#` puis `5` puis `1`
chez l'un, `#148*5#` chez l'autre. TOTEM ne les devine pas — deviner des
chiffres qui déplacent de l'argent serait irresponsable. **Il les apprend.**

Faites l'opération une fois, normalement. À la fin, un bouton
**💾 En faire un bouton** apparaît : donnez-lui un nom, c'est terminé. Vous ne
retaperez plus jamais le chemin dans les menus.

Deux garde-fous, qui décident de ce qui entre dans un raccourci :

- **le code secret n'y entre jamais** — un bouton qui rejouerait le PIN serait
  un transfert en un clic ;
- **les données de l'opération non plus** (montant, bénéficiaire) : rejouer le
  montant d'hier serait au mieux faux. Le bouton mène jusqu'à la question,
  vous répondez.

Pour les opérateurs déjà relevés sur le terrain, `/raccourcis` propose de
poser les boutons d'un coup — aujourd'hui Orange Cameroun (`#148*5#` pour le
solde, `#148*4#` pour un transfert…). Ces codes ne sont **pas devinés** : ils
ont été composés sur un vrai téléphone. Et les proposer est sans danger, car
chacun n'est qu'une **porte d'entrée** : aucun ne conclut une opération seul,
tous redemandent ensuite un montant, un numéro ou le code secret. Un code
erroné échoue donc sans qu'un franc ait bougé — et se corrige en refaisant
l'opération une fois.

Les boutons sont rangés **par opérateur**, pas par carte : les codes
appartiennent au réseau. Changer une SIM MTN pour une autre SIM MTN ne fait
rien disparaître ; passer à une puce Orange fait apparaître les boutons Orange
et masque ceux de MTN, tout seul.

| Commande Telegram | Effet |
|---|---|
| `*126#` | Ouvre le menu sur le **compte courant** |
| `mtn *126#` | Vise un compte sans changer le compte courant |
| `/comptes` | Liste les comptes et rappelle comment basculer |
| `/sims` | Toutes les cartes connues, celle en place marquée ▶️ |
| `/raccourcis` | Vos boutons : les voir, en supprimer |
| `/mtn`, `/orange`, `/1`, `/2` | Change de compte courant |

Chaque compte a sa propre session USSD et son propre chien de garde : un modem
qui plante n'interrompt pas l'autre.

## Le reçu PDF

Quand un SMS d'opération arrive, TOTEM prévient tout de suite, puis **joint un
reçu PDF une dizaine de secondes après**. Un document propre, présentable à un
client, qui reprend ce que dit le SMS — jamais autre chose.

Trois règles gouvernent son existence :

- **Un reçu ne s'établit que sur un fait acquis.** Un transfert réussi, un
  solde relevé. Un transfert échoué, une publicité, un message incompris n'en
  produisent aucun. En cas de doute, pas de reçu : le SMS reste lisible en
  clair, comme avant. Un reçu faux vaut moins que pas de reçu.
- **Le solde ne vient pas d'un SMS.** L'opérateur l'affiche dans la session
  USSD. C'est donc la réponse qui clôt le parcours qui déclenche le reçu — pas
  les menus qui y mènent, ni les questions qu'ils posent.
- **Un code à usage unique n'en produit jamais**, et n'est même pas conservé
  en clair : il est masqué avant le journal, la sauvegarde et Telegram.
- **Le sens n'est pas deviné.** Orange écrit « Transfert de 656483918 PRIX
  MONO SARL vers 696103864 WONDER PHONE » : il nomme les deux parties sans
  dire laquelle est la nôtre. Déclarez le numéro de vos puces dans la section
  `[numeros]` de `totem.conf` et le reçu dira « Montant reçu » ou « Montant
  envoyé » à bon escient. Sans cette déclaration il dit « Montant net », qui
  est vrai dans les deux sens.

Rien ne s'accumule sur la carte SD : le PDF est fabriqué en mémoire, envoyé,
puis déposé dans le stockage Supabase. Il se refabrique à l'identique depuis
son SMS, qui reste au journal — c'est aussi ce qui garantit qu'un même message
relu après un redémarrage ne produit pas un second document.

Le PDF est fabriqué **en Python seul**, sans navigateur : deux pages coûtaient
2,5 s et quelques centaines de mégaoctets à Chromium, contre une dizaine de
millisecondes ici. Sur un Pi 4 qui interroge deux modems en même temps, la
différence n'est pas cosmétique.

## Modes d'exécution

| Commande | Usage |
|---|---|
| `python3 -m totem` | Production (détection automatique des modems + Telegram) |
| `python3 -m totem --modems` | Diagnostic : liste les modems détectés, puis quitte |
| `python3 -m totem --simulation` | Faux modems MTN + Orange, vrai Telegram (sans matériel) |
| `python3 -m totem --console` | Faux modems + chat dans le terminal (essai local) |
| `python3 -m totem --demo` | Scénario automatique complet (vérification en 5 s) |
| `python3 -m totem --stk` | La SIM porte-t-elle une applet Mobile Money ? |
| `python3 -m totem --version` | Quelle version tourne réellement sur ce Pi |

PIN de simulation : `1234`. Le simulateur imite les menus MoMo et Orange Money
(solde, transfert) et génère des SMS de paiement réalistes sur les deux réseaux.

## Contenu

```
totem/            le programme (Python 3, seule dépendance réelle : pyserial)
  app.py          orchestrateur : commandes, boutons, sessions USSD, pavé PIN,
                  raccourcis, multi-comptes, SMS, rapports, watchdog
  compte.py       un compte = un modem + une SIM + sa session USSD
  carte.py        identité d'une SIM : ICCID, IMSI, opérateur, itinérance
  codes.py        codes USSD relevés sur le terrain, proposés en un bouton
  detect.py       détection des modems (regroupement par IMEI)
  modem.py        modem réel SIM7600 (AT : +CUSD interactif, +CMGL, UCS2…)
  simulator.py    faux modems MTN et Orange pour tests sans matériel
  pdu.py          décodage PDU : les SMS longs cessent d'être tronqués
  stk.py          sonde SIM Toolkit : ce que la carte propose vraiment
  version.py      la version réellement en service sur ce terminal
  telegram.py     client API Telegram (claviers, édition, fichiers, groupe, rôles)
  console.py      transports de test (console, scénario)
  entrant.py      message entrant commun à tous les transports (frappe ou clic)
  mise_en_forme.py  échappement et balisage HTML des messages
  storage.py      journal SQLite (SMS, USSD, événements, rapport 24 h, export CSV)
  analyse_sms.py  lecture des SMS : montant, tiers, référence, solde
  declencheur.py  ce qui donne droit à un reçu — et ce qui n'y donne jamais
  recu.py         le reçu PDF : la maquette de recus/, transcrite en Python
  pdf.py          fabrique de PDF : polices TrueType embarquées, tracés
  logo.py         « La Tresse » posée sur un PDF, lue dans brand/generer.py
  polices/        DM Sans, embarquée dans chaque reçu (le Pi est parfois seul)
  sante.py        santé du Pi : tension, température, disque, sauvegardes
  nuage.py        pont vers Supabase (hors-ligne d'abord, file d'attente)
  config.py       chargement totem.conf
brand/            la marque : « La Tresse », verrouillages, icônes, motif,
                  et les scripts qui régénèrent le tout
                  (charte : docs/IDENTITE.md)
recus/            les reçus PDF : la maquette de référence et ses aperçus.
                  La génération est branchée — voir totem/recu.py
sql/schema.sql    structure de la base Supabase, à coller dans son éditeur SQL
tests/            batterie de tests (python3 -m unittest discover -s tests)
CLAUDE.md         consignes de travail : vérifier main avant toute PR, français
install.sh        installation en une commande sur Raspberry Pi OS
outils/           partage-wifi.ps1 : allume le partage Wi-Fi du PC Windows,
                  puis attend le Pi et affiche son adresse (phase de test)
systemd/          service (démarrage auto + relance)
config.example.conf
docs/
  GUIDE-INSTALLATION.md   pas-à-pas complet (comptes, flashage, install, dépannage)
  GUIDE-TELEGRAM.md       l'expérience Telegram : boutons, pavé PIN, groupe, sujets
  MEMENTO.md              les commandes du quotidien (allumer, éteindre, diagnostic)
  MISE-EN-LIGNE.md        déployer l’application web sur Vercel
  CLOUD.md                brancher le terminal sur Supabase (facultatif)
  TESTS-FRANCE.md         check-list avant envoi au Cameroun
  FICHE-DOUALA.md         fiche imprimable : les 4 gestes de la personne sur place
  USSD-OU-STK.md          pourquoi l'USSD, et ce que changerait une API opérateur
  LIMITES-ET-RISQUES.md   ce que le système ne sait pas faire, et ce qui peut casser
  IDENTITE.md             la charte visuelle : symbole, couleurs, usages
web/              l'application web (Next.js) — maquette sur données de démo
```

## Suite prévue (phases suivantes)

1. **App web** (cloud, même stack que `apps/web`) : tableau de bord, boutons
   d'action qui pilotent le robot, historique/export — le journal SQLite est
   déjà la source de données.
2. **Pont vogtravel.com** : rapprochement automatique des SMS « Vous avez reçu… »
   avec les réservations → billets marqués payés sans intervention.
