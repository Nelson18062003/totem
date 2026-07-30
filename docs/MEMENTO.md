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

Aujourd'hui (lancement à la main) :

```
cd ~/totem
python3 -m totem
```

**Pour l'arrêter** : `Ctrl + C`.

Autres modes utiles :

```
python3 -m totem --modems       # quels modems sont détectés ?
python3 -m totem --demo         # démonstration, sans matériel
python3 -m totem --simulation   # faux modems, vrai Telegram
```

> À partir de la phase 7, TOTEM démarrera **tout seul** avec le Pi. Les
> commandes deviendront :
> ```
> sudo systemctl status totem     # est-ce qu'il tourne ?
> sudo systemctl restart totem    # le relancer
> sudo systemctl stop totem       # l'arrêter
> journalctl -u totem -f          # voir ce qu'il fait, en direct
> ```

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
| TOTEM ne répond plus sur Telegram | `Ctrl + C` puis `python3 -m totem` |
| Le modem ne répond plus | Dans Telegram : `/redemarrer` |
| Le Pi ne répond plus du tout | Débranchez, attendez 10 s, rebranchez *(seul cas où c'est permis)* |
| Le mot de passe est refusé | Vérifiez que Verr. Maj est désactivé |
| « command not found » | Vérifiez que vous êtes bien dans le dossier : `cd ~/totem` |

---

## 10. À Douala, plus tard

La personne sur place n'aura **que deux gestes** possibles :

1. **Redémarrer** : débrancher la prise, compter jusqu'à dix, rebrancher.
2. **Changer la carte mémoire** : Pi débranché, pousser la carte pour l'éjecter,
   insérer celle de secours jusqu'au clic, rebrancher.

Tout le reste se fera à distance, par vous.
