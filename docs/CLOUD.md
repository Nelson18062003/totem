# Brancher TOTEM sur Supabase

> Résultat : l'historique de vos paiements vit aussi dans le cloud. Il survit
> à la mort d'une carte mémoire, et l'application web pourra l'afficher depuis
> n'importe où — même terminal éteint.
>
> **Facultatif.** Sans cette configuration, TOTEM fonctionne exactement comme
> avant, entièrement hors ligne.

---

## Ce que le cloud est, et ce qu'il n'est pas

Le **Raspberry Pi reste la source de vérité**. Il écrit dans le cloud une
copie de ce qu'il a vu, quand il a du réseau. Le cloud sert à consulter et à
survivre à une panne matérielle — **pas à décider**.

Conséquence utile : une coupure d'internet à Douala ne fait rien perdre. Les
paiements continuent d'arriver et de s'empiler dans le journal local ; la file
se vide toute seule au retour du réseau.

---

## 1. Créer le projet (5 minutes)

1. **supabase.com** → *Start your project* → connexion avec Google.
2. *New project* :
   - Nom : `totem`
   - **Database Password** : générez-en un et notez-le (irrécupérable ensuite)
   - **Region** : **West EU (Ireland)** — la plus proche du Cameroun
   - Plan : **Free** (largement suffisant : des années de SMS tiennent dans les
     500 Mo offerts)
3. Attendez ~2 minutes que le projet se crée.

## 2. Créer les tables

1. Menu de gauche → **SQL Editor** → *New query*.
2. Ouvrez le fichier [`sql/schema.sql`](../sql/schema.sql) de ce dépôt, copiez
   **tout** son contenu, collez-le dans l'éditeur.
3. **Run**. Le script est rejouable : le relancer plus tard ne casse rien.

Vérification : menu **Table Editor** → vous devez voir `terminaux`, `comptes`,
`paiements`, `evenements`, `commandes`.

## 3. Récupérer les deux valeurs

Menu **Project Settings** (roue dentée) → **API** :

| Valeur | Où | Sensibilité |
|---|---|---|
| **Project URL** | en haut | publique |
| **`service_role`** (secret) | section *Project API keys* | 🔴 **SECRÈTE** |

> ⚠️ La clé `service_role` **contourne toutes les règles d'accès**. Elle ne
> doit jamais quitter le fichier de configuration du Pi : ni dans une
> conversation, ni dans un dépôt, ni dans une capture d'écran.
>
> La clé `anon` (publique), elle, servira plus tard à l'application web. Celle-là
> est faite pour être exposée.

## 4. Configurer le Pi

```
ssh totem@totem.local
sudo nano /boot/firmware/totem.conf
```

Remplissez la section `[cloud]` :

```ini
[cloud]
url = https://xxxxxxxxxxxx.supabase.co
cle = eyJhbGciOi…            ← la clé service_role
terminal = douala
```

Puis relancez :

```
sudo systemctl restart totem
```

Au démarrage, TOTEM affiche la ligne `cloud : https://…` et commence à
transmettre. Dans Telegram, `/statut` indique désormais l'état :

```
☁️ cloud à jour
☁️ cloud · 42 en attente        ← réseau coupé, rien n'est perdu
☁️ cloud injoignable · 42 ligne(s) en attente
```

## 5. Vérifier

Supabase → **Table Editor** → `paiements`. Vos SMS doivent apparaître,
découpés en colonnes : montant, tiers, référence, solde.

---

## Questions raisonnables

**« Et si j'envoie deux fois la même chose ? »**
Impossible. Chaque ligne porte son identifiant dans le journal local ; la base
refuse les doublons. Une reprise après coupure est donc sans risque.

**« Le PIN part-il dans le cloud ? »**
Non. Il n'est enregistré nulle part, pas même localement — seules des étoiles
figurent dans le journal.

**« Que se passe-t-il si Supabase tombe ? »**
Rien de visible. Le robot continue, les notifications Telegram arrivent, la
file s'allonge. Elle se vide au retour du service.

**« Puis-je arrêter le cloud ? »**
Videz les lignes `url` et `cle`, relancez : TOTEM redevient entièrement hors
ligne, sans rien perdre.
