# Mémento TOTEM — les commandes du quotidien

> À imprimer ou garder ouvert. Tout se tape depuis **PowerShell** sur le PC,
> ou directement dans le Pi une fois connecté.

---

## 1. La règle d'or

**On n'arrache JAMAIS le câble d'alimentation d'un Pi allumé.**

Le Pi écrit en permanence sur sa carte mémoire. Couper le courant en pleine
écriture corrompt la carte — c'est la première cause de « mon Pi ne démarre
plus ». Il faut **toujours** l'éteindre par la commande, attendre, puis
débrancher.

---

## 2. Allumer

Il n'y a **pas de bouton**. On branche l'alimentation, c'est tout.

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| LED rouge fixe | Le courant arrive |
| LED verte qui clignote | Il démarre, il lit la carte mémoire |
| LED verte qui se calme | Démarrage terminé, il est prêt |

Comptez **2 à 3 minutes** avant de pouvoir vous connecter.

---

## 3. Éteindre proprement

Depuis le Pi (une fois connecté) :

```
sudo poweroff
```

Puis : la connexion se coupe (normal), **attendez 20 secondes** que la LED verte
s'arrête complètement, **et seulement là** débranchez l'alimentation.

---

## 4. Redémarrer

```
sudo reboot
```

Le Pi redémarre seul. Reconnectez-vous après ~2 minutes.

---

## 5. Se connecter au Pi

*(Pendant la phase de test : rallumez d'abord le partage Wi-Fi du PC.)*

```
ssh totem@totem.local
```

- Le mot de passe **ne s'affiche pas** pendant la frappe : c'est normal, tapez
  à l'aveugle puis Entrée.
- Si `totem.local` ne répond pas, cherchez son adresse :
  ```
  2..40 | % { ping -n 1 -w 200 192.168.137.$_ | Out-Null }; arp -a | findstr 192.168.137
  ```
  puis `ssh totem@192.168.137.xxx`

**Pour sortir du Pi** (sans l'éteindre) : `exit` — ou les touches `Ctrl + D`.

---

## 6. Savoir s'il est allumé, sans le toucher

Depuis le PC :

```
ping totem.local
```

- Des réponses → il est allumé et joignable.
- « Impossible de joindre » → éteint, ou pas sur le même réseau.

---

## 7. Lancer et arrêter TOTEM

Une fois `install.sh` passé, **TOTEM démarre tout seul avec le Pi** et se
relance seul s'il plante. Vous n'avez normalement rien à lancer.

```
sudo systemctl status totem     # est-ce qu'il tourne ?
sudo systemctl restart totem    # le relancer
sudo systemctl stop totem       # l'arrêter (il reprendra au prochain démarrage)
sudo journalctl -u totem -f     # voir ce qu'il fait, en direct (Ctrl+C pour sortir)
```

### Mettre à jour le robot

⚠️ **`git pull` ne suffit pas.** Le service ne lit pas `~/totem` mais
`/opt/totem`. Sans la deuxième commande, le Pi continue d'exécuter l'ancien
code, et rien ne le signale.

```
cd ~/totem && git pull
sudo bash install.sh            # recopie le programme dans /opt/totem et relance
```

**Vérifiez ensuite que la mise à jour a bien pris.** Le robot annonce sa
version au démarrage, et `/diagnostic` la rappelle :

```
Version : a1b2c3d 2026-07-31
```

Comparez avec le dernier commit du dépôt :

```
cd ~/totem && git log -1 --format="%h %cd" --date=short
```

Les deux doivent être identiques. S'ils diffèrent, `install.sh` n'a pas été
relancé — c'est la cause numéro un des « le correctif ne marche pas ».

### Quand un menu s'affiche mal

Composez le code USSD, puis envoyez **`/brut`**. Le robot montre la réponse
de l'opérateur telle qu'elle est arrivée — fins de ligne et espaces compris —
avec le nombre d'options qu'il a reconnues et s'il a cru voir une demande de
code. Une capture d'écran ne montre pas ces détails, et c'est pourtant là que
se cachent ces défauts. Transmettez ce message tel quel.

Modes utiles, à lancer à la main (arrêtez le service d'abord pour éviter que
deux robots se disputent les modems) :

⚠️ **Une option inconnue est ignorée en silence** : le robot démarre alors
normalement au lieu de faire le diagnostic. Si `--stk` ne dit rien sur le
SIM Toolkit et que vous voyez « Détection des modems… », c'est que le Pi
n'a pas encore la version qui connaît cette option — relancez
`sudo bash install.sh`.

```
python3 -m totem --modems       # quels modems sont détectés ?
python3 -m totem --stk          # la SIM porte-t-elle une applet Mobile Money ?
python3 -m totem --demo         # démonstration, sans matériel
python3 -m totem --simulation   # faux modems, vrai Telegram
```

### Ce que le robot surveille tout seul

Il vous prévient sur Telegram, sans que vous demandiez rien :

| Situation | Message |
|---|---|
| Redémarrage après coupure de courant | « ⚡ Redémarrage après coupure ou plantage » |
| Alimentation qui faiblit | « ⚠️ Le Pi est en sous-tension » — **à traiter vite**, risque pour la carte mémoire |
| Surchauffe | « ⚠️ Température élevée » |
| Carte mémoire qui se remplit | « ⚠️ Carte mémoire pleine à N % » |
| Modem muet | Il le redémarre seul et vous le dit |

Chaque alerte n'arrive **qu'une fois**, et le retour à la normale est signalé.

---

## 8. Vérifier que tout va bien

```
ls /dev/ttyUSB*          # les modems branchés (5 ports par modem)
uptime                   # depuis combien de temps il tourne
df -h /                  # place restante sur la carte mémoire
free -h                  # mémoire utilisée
vcgencmd measure_temp    # température (normal : 40-65 °C)
hostname -I              # son adresse sur le réseau
```

---

## 9. En cas de blocage

| Situation | Que faire |
|---|---|
| TOTEM ne répond plus sur Telegram | `sudo systemctl restart totem` |
| Comprendre pourquoi il a planté | `sudo journalctl -u totem -n 50` |
| Le modem ne répond plus | Dans Telegram : `/redemarrer` |
| Un modem manque | `python3 -m totem --modems` ; si deux modems et un seul vu → hub USB **alimenté** |
| Le Pi ne répond plus du tout | Débranchez, attendez 10 s, rebranchez *(seul cas où c'est permis)* |
| Le mot de passe est refusé | Vérifiez que Verr. Maj est désactivé |
| « command not found » | Vérifiez que vous êtes bien dans le dossier : `cd ~/totem` |

### Les trois filets de sécurité

1. **Le robot se relance** s'il plante (systemd, toutes les 10 s, sans jamais renoncer).
2. **Le Pi se relance** si le système entier se fige (chien de garde matériel).
3. **Le journal est sauvegardé** chaque soir dans `sauvegardes/`, 7 jours gardés.

---

## 10. À Douala, plus tard

La personne sur place n'aura **que deux gestes** possibles :

1. **Redémarrer** : débrancher la prise, compter jusqu'à dix, rebrancher.
2. **Changer la carte mémoire** : Pi débranché, pousser la carte pour l'éjecter,
   insérer celle de secours jusqu'au clic, rebrancher.

Tout le reste se fera à distance, par vous.
