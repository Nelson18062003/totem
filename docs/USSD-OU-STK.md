# Faut-il continuer à deviner ? USSD, SIM Toolkit, et les API

> Question posée : « Est-ce qu'il n'y a pas une manière plus sophistiquée
> qu'aller deviner ? On interrogerait l'opérateur, et selon l'information dont
> il a besoin, on s'adapte. »
>
> Réponse courte : **oui, cette manière existe, elle s'appelle le SIM
> Toolkit.** Elle est plus lourde à construire, et elle ne remplace pas
> l'USSD partout. Ce document expose les trois voies possibles, leur coût et
> ce qu'elles apportent réellement.

---

## 1. Pourquoi l'USSD oblige à deviner

L'USSD est un canal de **texte brut**. Quand Orange répond, le modem reçoit :

```
+CUSD: 1,"Entrez le montant (FCFA) :",15
```

Trois informations, pas une de plus :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `1` | l'état | « la session continue, j'attends une réponse » |
| `"…"` | le texte | ce que l'opérateur veut afficher |
| `15` | le codage | dans quel alphabet le texte est écrit |

**Ce que le protocole ne dit nulle part :**

- s'il attend un montant, un numéro, une référence ou un code secret ;
- si la saisie doit être masquée ;
- si elle doit être numérique ou alphabétique ;
- combien de caractères sont attendus.

Un montant et un code PIN arrivent **exactement sous la même forme**. La seule
information disponible est la phrase française que l'opérateur a écrite. D'où
la lecture du vocabulaire — et d'où sa fragilité : « Confirmez par votre code
Orange Money » n'emploie pas les mêmes mots que « Entrez votre code secret ».

C'est une limite du protocole, pas un défaut de notre code. Aucun programme au
monde ne peut faire mieux **avec l'USSD seul**.

---

## 2. Voie A — le SIM Toolkit : l'opérateur déclare ce qu'il attend

### Le principe

Le SIM Toolkit (STK) est un petit programme qui vit **dans la carte SIM
elle-même**. C'est lui qui affiche « MTN MoMo » dans le menu de ton téléphone,
sans que tu composes le moindre code.

Au lieu d'envoyer du texte, la SIM envoie des **commandes structurées** —
appelées *commandes proactives*. Les deux qui nous intéressent :

**`SELECT ITEM`** — un menu, mais sous forme de vraie liste :

```
Titre : "Orange Money"
Items :
  identifiant 1 → "Modifier code secret"
  identifiant 2 → "Solde de compte"
  identifiant 3 → "Dernieres transactions"
```

Plus rien à découper : la liste **est** une liste. On fabrique les boutons
directement, sans jamais se demander si `1:` est un séparateur.

**`GET INPUT`** — une demande de saisie, **avec son type** :

```
Texte    : "Entrez votre code secret"
Longueur : 4 à 8 caractères
Drapeaux : chiffres uniquement
           ne pas révéler la saisie   ← LE point qui change tout
```

Ce dernier drapeau est exactement ce qui manque à l'USSD. **L'opérateur dit
lui-même que la saisie est secrète.** Plus rien à deviner : quand il est
présent → pavé masqué ; absent → saisie normale. Le montant et le code
deviennent deux choses distinctes, déclarées comme telles.

### Est-ce que notre matériel sait le faire ?

Oui. Le SIM7600 expose le SIM Toolkit par commandes AT :

| Commande | Rôle |
|---|---|
| `AT+STK` | activer le SIM Toolkit |
| `AT+STSM` | lire le menu principal de la SIM |
| `AT+STGI` | récupérer la commande en cours (menu, saisie, texte) |
| `AT+STGR` | répondre (choisir un item, envoyer une saisie) |
| `AT+STKFMT` | choisir entre format lisible et format brut |

C'est documenté dans le manuel AT officiel SIMCom du SIM7500/SIM7600.

### Ce que ça coûterait

| Point | Évaluation |
|---|---|
| Fiabilité de la saisie du code | ⭐⭐⭐⭐⭐ plus aucune devinette |
| Fiabilité des menus | ⭐⭐⭐⭐⭐ liste native |
| Travail à faire | important : machine à états, décodage des structures, gestion des délais |
| Dépendance au firmware | forte — les commandes `AT+STK*` varient d'une version à l'autre |
| Testable sans matériel ? | difficilement : il faut une vraie SIM avec applet Mobile Money |
| Risque | moyen à élevé : si l'applet n'est pas sur la SIM, rien ne fonctionne |

**Le point de vigilance :** toutes les SIM n'embarquent pas l'applet Mobile
Money, et son contenu diffère d'un pays et d'une offre à l'autre. Il faut
vérifier sur **tes** cartes avant d'investir.

**Comment le vérifier en cinq minutes**, sans écrire une ligne de code :
insère la SIM dans un téléphone basique, et regarde si un menu « MTN MoMo » ou
« Orange Money » apparaît dans les menus du téléphone (souvent sous
« Services », « Applications SIM » ou « Boîte à outils SIM »).

- **Le menu apparaît** → l'applet est là, le SIM Toolkit est jouable.
- **Rien** → l'USSD est la seule voie sur cette SIM, et ce document s'arrête là.

---

## 3. Voie B — les API Mobile Money : ne plus toucher au réseau du tout

MTN et Orange publient de véritables interfaces de programmation :

- **MTN MoMo API** (`momodeveloper.mtn.com`) — Collections (encaisser),
  Disbursements (payer), Remittances.
- **Orange Developer** — Orange Money Web Payment et API de paiement.

Là, plus de menus, plus de codes, plus de SMS à interpréter : on demande
« encaisse 25 000 FCFA auprès de ce numéro », et on reçoit une réponse
structurée avec un identifiant de transaction et un statut.

| Point | Évaluation |
|---|---|
| Fiabilité | ⭐⭐⭐⭐⭐ c'est fait pour ça |
| Traçabilité comptable | ⭐⭐⭐⭐⭐ chaque opération a un identifiant officiel |
| Plus besoin de SIM ni de Raspberry Pi | ✅ |
| Obstacle | **contractuel, pas technique** : il faut un compte marchand, un dossier d'entreprise, une validation par l'opérateur, et parfois des frais |
| Disponibilité | variable selon les pays et les offres |

C'est la destination naturelle d'une activité qui grandit. Ce n'est pas une
question de code : c'est une démarche commerciale auprès de MTN et d'Orange.

---

## 4. Voie C — le scénario déclaré : deviner moins, sans tout reconstruire

Une voie intermédiaire, peu coûteuse, qui supprime la devinette **là où elle
est dangereuse** : sur le chemin de l'argent qui sort.

Au lieu de laisser le robot interpréter chaque écran, on **décrit à l'avance**
la séquence d'un transfert, une fois pour toutes :

```ini
[scenario.orange.transfert]
1 = menu      ; choisir « Transfert d'argent »
2 = numero    ; saisie libre : le bénéficiaire
3 = montant   ; saisie libre : la somme
4 = code      ; saisie MASQUÉE, quoi qu'affiche l'opérateur
```

Le robot suit alors ce plan au lieu de lire le vocabulaire. À l'étape 4, il
masque **parce que le scénario le dit**, même si Orange change sa formulation
du jour au lendemain.

| Point | Évaluation |
|---|---|
| Fiabilité sur le chemin de l'argent | ⭐⭐⭐⭐ |
| Travail à faire | modéré — c'est une extension des raccourcis existants |
| Testable sans matériel | ✅ entièrement |
| Limite | il faut décrire chaque parcours, et le refaire si l'opérateur réorganise son menu |

---

## 5. Ce qui est en place aujourd'hui

En attendant, deux garde-fous, dans l'esprit du moindre risque :

**Le vocabulaire reconnu est volontairement large** — `pin`, `code`, `mdp`,
`secret`, `confidentiel`, `mot de passe`, `password`. Se tromper n'a pas le
même coût dans les deux sens :

| Erreur | Conséquence |
|---|---|
| Masquer une saisie qui n'était pas secrète | aucune |
| Laisser passer un code en clair | **il s'écrit dans la conversation** |

On masque donc au moindre doute.

**Une porte de sortie permanente.** Sur *toute* saisie libre, un bouton
**🔐 Saisir en masqué** ouvre le pavé sécurisé :

```
🗿 Session USSD · Orange
┌────────────────────────────────┐
│ Entrez le montant (FCFA) :     │
└────────────────────────────────┘
✍️ Répondez par un message (numéro, montant…).
[🔐 Saisir en masqué]
[❌ Annuler]
```

Même si la détection échoue sur une formulation jamais vue, **tu n'as jamais à
taper un code en clair** : un doigt suffit à le dire au robot.

---

## 6. Recommandation

| Priorité | Action | Pourquoi |
|---|---|---|
| **1. Tout de suite** | Vérifier si l'applet Mobile Money est présente sur tes SIM (test du téléphone basique, 5 min) | Ça décide de tout le reste, et ça ne coûte rien |
| **2. Court terme** | Voie C — le scénario déclaré pour le transfert | Supprime la devinette là où elle est dangereuse, testable sans matériel |
| **3. Si l'applet existe** | Voie A — SIM Toolkit, sur **un** parcours d'abord (le solde) | Permet de mesurer la vraie difficulté avant de tout réécrire |
| **4. Quand l'activité le justifie** | Voie B — API Mobile Money | La bonne solution à terme, mais c'est un dossier commercial avant d'être du code |

**Ce qu'il ne faut pas faire :** réécrire tout le robot en SIM Toolkit d'un
bloc, sans avoir vérifié que l'applet est présente sur les cartes et sans avoir
mesuré le comportement réel du firmware SIM7600. Le risque est de perdre un
outil qui fonctionne pour un autre qui ne démarre pas.

---

## Sources

- [SIM Application Toolkit — vue d'ensemble](https://en.wikipedia.org/wiki/SIM_Application_Toolkit)
- [ETSI TS 102 223 — Card Application Toolkit (commandes proactives, `GET INPUT`, `SELECT ITEM`)](https://www.etsi.org/deliver/etsi_ts/102200_102299/102223/12.02.00_60/ts_102223v120200p.pdf)
- [3GPP TS 31.111 — USIM Application Toolkit](https://www.tech-invite.com/3m31/tinv-3gpp-31-111.html)
- [Manuel AT SIM7500/SIM7600 — commandes `AT+STK`, `AT+STGI`, `AT+STGR`](https://files.waveshare.com/upload/5/54/SIM7500_SIM7600_Series_AT_Command_Manual_V1.08.pdf)
- [USSD — vue d'ensemble du protocole](https://en.wikipedia.org/wiki/Unstructured_Supplementary_Service_Data)
