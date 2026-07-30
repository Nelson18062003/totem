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
- **Le PIN MoMo n'est jamais stocké** : composé sur un pavé de boutons, il
  n'existe même pas comme message Telegram ; le journal ne garde que `****`.
- **Seules les conversations déclarées sont écoutées** ; tout autre expéditeur
  est ignoré en silence.

## L'expérience Telegram

Les menus MoMo arrivent en **boutons cliquables** (fini le « 5 » puis « 1 » à
l'aveugle), la session USSD tient sur **une seule carte qui se met à jour**, le
**code PIN se compose sur un pavé sécurisé**, et une opération courante tient en
**un seul bouton** (raccourcis configurables). Le robot sait aussi travailler
dans un **groupe d'équipe**, avec des **rôles** (qui pilote / qui observe) et un
**fil par nature d'information** si le groupe utilise les sujets.

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

| Commande Telegram | Effet |
|---|---|
| `*126#` | Ouvre le menu sur le **compte courant** |
| `mtn *126#` | Vise un compte sans changer le compte courant |
| `/comptes` | Liste les comptes et rappelle comment basculer |
| `/mtn`, `/orange`, `/1`, `/2` | Change de compte courant |

Chaque compte a sa propre session USSD et son propre chien de garde : un modem
qui plante n'interrompt pas l'autre.

## Modes d'exécution

| Commande | Usage |
|---|---|
| `python3 -m totem` | Production (détection automatique des modems + Telegram) |
| `python3 -m totem --modems` | Diagnostic : liste les modems détectés, puis quitte |
| `python3 -m totem --simulation` | Faux modems MTN + Orange, vrai Telegram (sans matériel) |
| `python3 -m totem --console` | Faux modems + chat dans le terminal (essai local) |
| `python3 -m totem --demo` | Scénario automatique complet (vérification en 5 s) |

PIN de simulation : `1234`. Le simulateur imite les menus MoMo et Orange Money
(solde, transfert) et génère des SMS de paiement réalistes sur les deux réseaux.

## Contenu

```
totem/            le programme (Python 3, seule dépendance réelle : pyserial)
  app.py          orchestrateur : commandes, boutons, sessions USSD, pavé PIN,
                  raccourcis, multi-comptes, SMS, rapports, watchdog
  compte.py       un compte = un modem + une SIM + sa session USSD
  detect.py       détection automatique des modems (regroupement par IMEI)
  modem.py        modem réel SIM7600 (AT : +CUSD interactif, +CMGL, UCS2…)
  simulator.py    faux modems MTN et Orange pour tests sans matériel
  telegram.py     client API Telegram (claviers, édition, fichiers, groupe, rôles)
  console.py      transports de test (console, scénario)
  entrant.py      message entrant commun à tous les transports (frappe ou clic)
  mise_en_forme.py  échappement et balisage HTML des messages
  storage.py      journal SQLite (SMS, USSD, événements, rapport 24 h, export CSV)
  config.py       chargement totem.conf
install.sh        installation en une commande sur Raspberry Pi OS
systemd/          service (démarrage auto + relance)
config.example.conf
docs/
  GUIDE-INSTALLATION.md   pas-à-pas complet (comptes, flashage, install, dépannage)
  GUIDE-TELEGRAM.md       l'expérience Telegram : boutons, pavé PIN, groupe, sujets
  MEMENTO.md              les commandes du quotidien (allumer, éteindre, diagnostic)
  MISE-EN-LIGNE.md        déployer l'application web sur Vercel
  TESTS-FRANCE.md         check-list avant envoi au Cameroun
  FICHE-DOUALA.md         fiche imprimable : les 4 gestes de la personne sur place
web/              l'application web (Next.js) — maquette sur données de démo
```

## Suite prévue (phases suivantes)

1. **App web** (cloud, même stack que `apps/web`) : tableau de bord, boutons
   d'action qui pilotent le robot, historique/export — le journal SQLite est
   déjà la source de données.
2. **Pont vogtravel.com** : rapprochement automatique des SMS « Vous avez reçu… »
   avec les réservations → billets marqués payés sans intervention.
