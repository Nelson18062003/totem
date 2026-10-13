# Brancher TOTEM sur XAFe Exchange

> Résultat : chaque encaissement reçu sur une carte déclarée est aussi
> **déposé chez XAFe Exchange**, qui crédite le client qui l'a déclaré — ou le
> retient : personne n'est crédité au hasard. Bonzini continue de recevoir
> tout ce qu'il recevait.
>
> **Facultatif.** Sans la section `[xafe]`, TOTEM se comporte exactement
> comme avant, à l'octet près.

---

## Ce que XAFe est, et ce qu'il n'est pas

Le **Raspberry Pi reste la source de vérité**. XAFe reçoit une copie de ce
qu'il a vu — et seulement une partie : XAFe est un **tiers**. Un SMS
appartient au propriétaire ; seuls les **SMS d'argent entrant** lui sont
envoyés. Jamais un code de confirmation, une publicité, un solde, une
sortie, ni un SMS que le lecteur ne comprend pas. Le tri se fait sur le Pi,
avant toute requête ; ces lignes-là sont closes « sans objet » dans le journal.

XAFe **ne décide pas** : il dit, ligne par ligne, ce qu'il a fait de chaque
encaissement — crédité (avec sa référence `XAFe-DP-…`), retenu (en attendant
que le client déclare l'ID de la transaction), ignoré, ou refusé (avec le
motif). Cette réponse est gardée dans le journal du Pi, SMS par SMS : c'est
la preuve, et c'est avec elle qu'on enquête.

Chaque appel est **signé** avec la clé de ce boîtier (trois en-têtes, HMAC).
XAFe ne voit que ce que ce boîtier dit ; le boîtier ne voit que ce qui le
concerne. La signature vaut cinq minutes : le robot signe avec l'heure que
XAFe lui donne, pas avec celle du Pi (qui a des heures de retard après une
coupure de courant).

---

## Ce qu'il faut de l'équipe XAFe

- l'**identifiant du boîtier** chez XAFe (`terminaux.id`, par exemple
  `akwa-1`) — à recopier à l'identique ;
- la **clé** de ce boîtier (`terminaux.cle`). Secrète : qui la lit peut faire
  créditer des comptes ;
- l'**URL** du projet Supabase de XAFe (sans chemin) ;
- si leur passerelle exige la clé publique `anon` avant la porte (réglage
  `verify_jwt`), cette clé — sinon rien.
- pour chaque carte du boîtier, le **numéro du float** tel qu'il est inscrit
  chez XAFe (`floats.numero`) : c'est par lui que XAFe reconnaît la carte.

## Configurer le Pi

Mettre le robot à jour d'abord (`sudo bash maj.sh`, pas `git pull`), puis :

```
sudo nano /boot/firmware/totem.conf
```

Ajouter la section (le modèle exact est dans `config.example.conf` ; `maj.sh`
ne touche pas à la configuration, la section s'ajoute à la main) :

```ini
[xafe]
url = https://xxxxxxxxxxxx.supabase.co
cle = la-cle-de-ce-boitier
terminal = akwa-1
anon =
transferts = non
```

Puis `sudo systemctl restart totem`. Au démarrage, TOTEM affiche
`XAFe : https://… (terminal « akwa-1 »)`. Dans Telegram, `/statut` ajoute une
ligne :

```
🔁 XAFe à jour
🔁 XAFe · 3 en attente              ← réseau coupé ou carte sans numéro
🔁 XAFe injoignable · 3 en attente  ← rien n'est perdu, la file se vide au retour
```

## Déclarer le numéro de chaque carte

XAFe reconnaît un float par son **numéro**, pas par l'ICCID. Une carte dont
le numéro n'est pas déclaré (Telegram → `/reglages` → identité de la carte,
ou la section `[numeros]`) voit ses encaissements **attendre** : rien ne part,
le journal le dit une fois (« la carte … n'a pas de numéro déclaré »), et tout
part dès que le numéro est inscrit. Le robot ne devine jamais : un
encaissement rattaché au mauvais float créditerait le mauvais compte.

Le numéro déclaré doit être **celui que XAFe a inscrit** pour ce float. À la
mise en service, carte par carte, avec l'équipe XAFe.

## Ce qui ne part PAS chez XAFe

- **L'historique d'avant l'activation.** À la première mise à jour du robot,
  tous les SMS déjà présents sont clos « avant XAFe » : des mois
  d'encaissements ne partent pas chez un tiers parce qu'on a mis le robot à
  jour. Ce qui arrive ensuite part. Pour rouvrir une période, quelqu'un qui
  sait lance `journal.remettre_sms_xafe(depuis_id=…)` : la porte XAFe rend la
  même réponse à la même ligne, rien n'est crédité deux fois.
- Les codes, les publicités, les soldes, les sorties d'argent, les SMS
  incompris — « sans objet », sans requête.
- Les **transferts** XAFe (de l'argent à composer) : ils ne sont pas même
  relevés tant que `transferts = non`. Voir la question du code secret.

---

## Questions raisonnables

**« Et si la même ligne est envoyée deux fois ? »**
La porte reconnaît le couple (boîtier, n° de ligne du journal) et rend la
MÊME réponse, marquée `deja`. Une reprise après coupure est sans risque.

**« Le PIN part-il chez XAFe ? »**
Non. Il n'est enregistré nulle part. Et les transferts XAFe — qui exigeraient
que le robot le compose seul — ne sont pas relevés tant que le propriétaire
n'a pas tranché cette question (`transferts = non`).

**« Que se passe-t-il si XAFe tombe ? »**
Rien de visible. Bonzini continue d'être servi — les deux destinations ont
chacune leur file et leur fil, aucune n'attend l'autre. La file XAFe
s'allonge, `/statut` le dit, et elle se vide au retour.

**« L'horloge du Pi est fausse après une coupure »**
La porte refuse une signature de plus de cinq minutes d'écart. Le robot
apprend l'heure de XAFe sur la première réponse (même un refus) et rejoue
aussitôt avec elle. Si « XAFe injoignable » persiste malgré tout, le journal
dit « XAFe refuse la signature du boîtier : clé fausse, ou horloge décalée ».

**« Puis-je arrêter ? »**
Videz `url` et `cle`, relancez : plus rien ne part chez XAFe, rien n'est perdu.

**« Et si un encaissement n'est pas crédité ? »**
Il est **retenu** chez XAFe jusqu'à ce que le client déclare l'ID de sa
transaction. Le journal du Pi porte, pour chaque SMS, « credite XAFe-DP-… »,
« retenue n », « ignore », « refuse <motif> » ou « sans objet » (colonne
`xafe_reponse`) : c'est là qu'on lit ce qui s'est passé.
