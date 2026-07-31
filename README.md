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
[Raspberry Pi à Douala : robot Python] ──USB── [SIM7600G-H + SIM MTN] ──radio── [MTN]
```

- **Aucun port ouvert** : le Pi ne fait que des connexions sortantes
  (Telegram + Tailscale pour la maintenance SSH). Compatible Starlink (CGNAT).
- **Le PIN MoMo n'est jamais stocké** : composé sur un pavé de boutons, il
  n'existe même pas comme message Telegram ; le journal ne garde que `****`.
- **Seules les conversations déclarées sont écoutées** ; tout autre expéditeur
  est ignoré en silence.

## Plusieurs opérateurs, plusieurs SIM

Rien n'est écrit en dur pour MTN : **MTN, Orange ou tout autre réseau** est
décrit dans `totem.conf`, et le robot choisit le bon profil (code de menu,
raccourcis) d'après ce que le modem voit réellement dans la carte présente.

Chaque SIM est identifiée par son **ICCID** — le numéro gravé sur la puce — et
possède **son propre journal** : deux cartes du même opérateur ne mélangent
jamais leurs SMS ni leurs rapports. Changez la carte dans le HAT : le robot le
détecte seul, vous prévient et bascule.

## L'expérience Telegram

Les menus arrivent en **boutons cliquables** (fini le « 5 » puis « 1 » à
l'aveugle), la session USSD tient sur **une seule carte qui se met à jour**, le
**code secret se compose sur un pavé sécurisé**, et une opération courante tient
en **un seul bouton** (raccourcis configurables par opérateur). Le robot sait
aussi travailler dans un **groupe d'équipe**, avec des **rôles** (qui pilote /
qui observe) et un **fil par nature d'information** si le groupe utilise les
sujets.

→ Tout est détaillé dans [`docs/GUIDE-TELEGRAM.md`](docs/GUIDE-TELEGRAM.md).

## Modes d'exécution

| Commande | Usage |
|---|---|
| `python3 -m totem` | Production (Pi + SIM7600 + Telegram) |
| `python3 -m totem --simulation` | Faux modem MTN + vrai Telegram (test sans matériel) |
| `python3 -m totem --console` | Faux modem + chat dans le terminal (essai local) |
| `python3 -m totem --demo` | Scénario automatique complet (vérification en 5 s) |

Ajoutez `--orange` à `--console` ou `--demo` pour simuler une SIM Orange au lieu
d'une SIM MTN : codes et menus différents, de quoi vérifier l'affichage des deux
opérateurs sans démonter le HAT.

Code de simulation : `1234`. Le simulateur imite les menus Mobile Money (solde,
transfert) et génère des SMS de paiement réalistes.

## Contenu

```
totem/            le programme (Python 3, seule dépendance réelle : pyserial)
  app.py          orchestrateur : commandes, boutons, sessions USSD, pavé PIN,
                  raccourcis, SMS, rapports, watchdog
  modem.py        modem réel SIM7600 (AT : +CUSD interactif, +CMGL, UCS2…)
  simulator.py    faux modem MTN MoMo pour tests sans matériel
  telegram.py     client API Telegram (claviers, édition, fichiers, groupe, rôles)
  courrier.py     acheminement fiable des annonces (survit aux coupures réseau)
  console.py      transports de test (console, scénario)
  entrant.py      message entrant commun à tous les transports (frappe ou clic)
  mise_en_forme.py  échappement et balisage HTML des messages
  storage.py      journal SQLite par SIM (SMS, USSD, courrier en attente,
                  rapport 24 h, export CSV, sauvegarde)
  config.py       chargement totem.conf
install.sh        installation en une commande sur Raspberry Pi OS
systemd/          service (démarrage auto + relance)
config.example.conf
docs/
  GUIDE-INSTALLATION.md   pas-à-pas complet (comptes, flashage, install, dépannage)
  GUIDE-TELEGRAM.md       l'expérience Telegram : boutons, pavé PIN, groupe, sujets
  LIMITES-ET-RISQUES.md   ce qui peut mal tourner : traité, atténué, ou pas encore
  TESTS-FRANCE.md         check-list avant envoi au Cameroun
  FICHE-DOUALA.md         fiche imprimable : les 4 gestes de la personne sur place
```

## Points de rupture connus

Une machine qui tient de l'argent à 5 000 km mérite une liste honnête de ses
faiblesses : mémoire SMS saturée, coupure entre lecture et enregistrement,
codage des menus opérateur, jeton Telegram compromis, sauvegarde absente…

→ [`docs/LIMITES-ET-RISQUES.md`](docs/LIMITES-ET-RISQUES.md) dit pour chacun ce
qui est traité, ce qui est atténué et ce qui reste ouvert.

## Suite prévue (phases suivantes)

1. **App web** (cloud, même stack que `apps/web`) : tableau de bord, boutons
   d'action qui pilotent le robot, historique/export — le journal SQLite est
   déjà la source de données.
2. **Pont vogtravel.com** : rapprochement automatique des SMS « Vous avez reçu… »
   avec les réservations → billets marqués payés sans intervention.
