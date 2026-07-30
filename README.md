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
- **Le PIN MoMo n'est jamais stocké** : tapé à chaque transaction dans le chat,
  puis effacé du chat et journalisé en `****`.
- **Seul le chat_id du propriétaire est écouté** ; tout autre expéditeur est ignoré.

## Modes d'exécution

| Commande | Usage |
|---|---|
| `python3 -m totem` | Production (Pi + SIM7600 + Telegram) |
| `python3 -m totem --simulation` | Faux modem MTN + vrai Telegram (test sans matériel) |
| `python3 -m totem --console` | Faux modem + chat dans le terminal (essai local) |
| `python3 -m totem --demo` | Scénario automatique complet (vérification en 5 s) |

PIN de simulation : `1234`. Le simulateur imite le menu MoMo (solde, transfert)
et génère des SMS de paiement réalistes.

## Contenu

```
totem/            le programme (Python 3, seule dépendance réelle : pyserial)
  app.py          orchestrateur : commandes, sessions USSD, SMS, rapports, watchdog
  modem.py        modem réel SIM7600 (AT : +CUSD interactif, +CMGL, UCS2…)
  simulator.py    faux modem MTN MoMo pour tests sans matériel
  telegram.py     client API Telegram (longue interrogation, filtrage chat_id)
  console.py      transports de test (console, scénario)
  storage.py      journal SQLite (SMS, USSD, événements, rapport 24 h)
  config.py       chargement totem.conf
install.sh        installation en une commande sur Raspberry Pi OS
systemd/          service (démarrage auto + relance)
config.example.conf
docs/
  GUIDE-INSTALLATION.md   pas-à-pas complet (comptes, flashage, install, dépannage)
  TESTS-FRANCE.md         check-list avant envoi au Cameroun
  FICHE-DOUALA.md         fiche imprimable : les 4 gestes de la personne sur place
```

## Suite prévue (phases suivantes)

1. **App web** (cloud, même stack que `apps/web`) : tableau de bord, boutons
   d'action qui pilotent le robot, historique/export — le journal SQLite est
   déjà la source de données.
2. **Pont vogtravel.com** : rapprochement automatique des SMS « Vous avez reçu… »
   avec les réservations → billets marqués payés sans intervention.
