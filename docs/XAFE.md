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
🔁 XAFe · 3 en attente              ← réseau coupé, carte sans numéro, ou carte pas encore identifiée (le journal dit laquelle)
🔁 XAFe injoignable · 3 en attente  ← rien n'est perdu, la file se vide au retour
🔁 XAFe refuse la signature · 3 en attente  ← clé fausse, identifiant du boîtier inconnu, ou horloge décalée (le journal le dit)
🔁 XAFe moteur en panne · 3 en attente      ← XAFe a répondu « erreur » : on réessaie
🔁 XAFe refuse le lot · 3 en attente        ← un défaut de NOTRE côté (lot mal formé) : à remonter, rien n'est perdu
🔁 XAFe : file illisible (défaut de notre côté) · 3 en attente  ← la file n'avance plus : à remonter, le tour est perdu, rien d'autre
🔁 XAFe : le robot ne sait pas dire le float d'une carte (défaut de notre côté) · 3 en attente  ← un défaut du robot, pas un numéro à déclarer
```

Les trois dernières lignes désignent un défaut de notre côté, pas une
manœuvre à faire sur le Pi : les remonter telles quelles.

Le **journal du Pi** — celui que Bonzini relit et montre dans « Ce qui s'est
passé » — porte une ligne par encaissement déposé (« XAFe : SMS 12 crédité
(XAFe-DP-000418) ») et une par refus. Jamais un montant, un nom ni un
numéro : seulement le numéro de la ligne du journal et la référence XAFe.
Sur une caisse active, c'est quarante lignes de plus par jour chez Bonzini ;
sans section `[xafe]`, aucune.

## Déclarer le numéro de chaque carte

XAFe reconnaît un float par son **numéro**, pas par l'ICCID. Une carte dont
le numéro n'est pas déclaré (Telegram → `/reglages` → identité de la carte,
ou la section `[numeros]`) voit ses encaissements **attendre** : rien ne part,
le journal le dit une fois (« la carte … n'a pas de numéro déclaré »), et tout
part dès que le numéro est inscrit. Le robot ne devine jamais : un
encaissement rattaché au mauvais float créditerait le mauvais compte.

**Les siens seulement.** Les autres cartes du boîtier ne l'attendent pas :
la file XAFe écarte les cartes sans numéro et lit au-delà. Et ce qui n'est
pas un encaissement — publicité, code, solde — se clôt « sans objet » quelle
que soit la carte, déclarée ou non.

Une carte d'un **autre réseau** (Camtel, Nexttel, une puce étrangère) n'a pas
de float XAFe, et n'en aura jamais : ses encaissements sont clos « sans float
XAFe », sans requête, et le journal le dit une fois. Rien n'attend.

**« Jamais » ne se décide que sur une carte identifiée.** Le réseau d'une
carte se lit dans son IMSI, et le modem le lit mal au démarrage de temps en
temps : la carte s'affiche alors « SIM inconnue » (ou du nom du réseau
visité) jusqu'au redémarrage du boîtier. Une telle carte n'est pas « d'un
autre réseau » : elle n'est **pas encore identifiée**, et ses encaissements
**attendent** — le journal le dit une fois (« le robot ne l'a pas encore
identifiée (le modem n'a pas lu son IMSI) — redémarrez le boîtier »), et ils
partent au redémarrage, avec le float de leur carte. La première version du
robot les clôturait « sans float XAFe », pour toujours.

Même règle pour un SMS entré **avant que le modem n'ait lu la puce** (ligne
sans ICCID) : il ne peut être rattaché à aucun float, il attend, écarté de
la file (il ne retient pas les autres), avec un avis qui dit quoi faire —
redémarrer le boîtier pour que les suivants portent leur carte ; pour
celui-là, quelqu'un qui sait pose l'ICCID sur la ligne, et il part au tour
même. Tant qu'il attend, `/statut` le compte « en attente » : c'est voulu,
une ligne qui attend une main se voit.

Un numéro déclaré **mal formé** (8 ou 10 chiffres : une faute de frappe) n'est
pas « pas de numéro » : le journal dit « son numéro déclaré est mal formé
(10 chiffres au lieu de 9) — corrigez-le », et la ligne attend la
correction. L'indicatif « 237 » devant les neuf chiffres est admis.

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
- Les encaissements d'une **carte d'un autre réseau** (son IMSI nomme autre
  chose que MTN ou Orange Cameroun) — « sans float XAFe », sans requête. Pas
  ceux d'une carte que le robot n'a pas encore identifiée : eux attendent.
- Les **transferts** XAFe (de l'argent à composer) : ils ne sont pas même
  relevés tant que `transferts = non` — et cette version du robot ne les
  relève pas davantage avec `oui` : la valeur est lue et rangée, rien ne la
  consulte encore. Voir la question du code secret.

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
aussitôt avec elle. Si « XAFe refuse la signature » persiste malgré tout, le
journal dit « XAFe refuse la signature du boîtier : clé fausse, identifiant
du boîtier inconnu de XAFe, ou horloge décalée ». XAFe répond le MÊME refus
dans les trois cas : vérifier aussi `[xafe] terminal` — sans lui, le robot
prend le nom de `[cloud]` (« douala »), qui n'est pas celui que XAFe connaît.

**« Un SMS d'argent dont aucun numéro n'est le nôtre »** — à trancher par le
propriétaire. Un SMS à deux parties (« Transfert de 5 000 FCFA de A vers B »)
dont ni A ni B n'est un numéro déclaré du boîtier : le lecteur ne sait pas
dire si c'est une entrée ou une sortie. Aujourd'hui la ligne est close
« sans objet », sans requête — si c'était une entrée, XAFe ne la verra qu'après
un `remettre_sms_xafe(depuis_id=…)` à la main. L'autre choix — la laisser en
file — remplirait la file sans fin tant que le numéro déclaré est faux. Le
test `test_un_sens_inconnu_faute_de_numero_est_clos_sans_objet` fige le
choix du jour ; il n'est pas tranché.

**« Puis-je arrêter ? »**
Videz `url` et `cle`, relancez : plus rien ne part chez XAFe, rien n'est perdu.

**« Et si un encaissement n'est pas crédité ? »**
Il est **retenu** chez XAFe jusqu'à ce que le client déclare l'ID de sa
transaction. Le journal du Pi porte, pour chaque SMS, « credite XAFe-DP-… »,
« retenue n <motif> », « ignore », « refuse <motif> », « sans objet » ou
« sans float XAFe » (colonne `xafe_reponse`) : c'est là qu'on lit ce qui
s'est passé. Une ligne encore à 0 (`envoye_xafe`) attend — un numéro, une
identification, une main — et le journal des événements dit laquelle.

**« Rouvrir une période, c'est déverser des mois chez un tiers »** — oui :
`remettre_sms_xafe()` sans argument rouvre TOUT, l'historique « avant XAFe »
compris. Toujours borner : `remettre_sms_xafe(depuis_id=…)` pour une
période, `remettre_sms_xafe(iccid=…)` pour une carte.
