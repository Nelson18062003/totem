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

Vérification : menu **Table Editor** → vous devez voir `terminaux`, `cartes`,
`comptes`, `paiements`, `evenements`, `commandes`.

> **Vous aviez déjà exécuté ce script ?** Refaites l'opération telle quelle.
> `create table if not exists` ne touche pas une table existante : le fichier
> contient donc un bloc de mise à niveau qui ajoute la table `cartes`, les
> colonnes du cloisonnement par SIM, et remplace la clé des comptes (le libellé
> devient l'ICCID). Rien n'est perdu, et relancer une troisième fois ne fait
> toujours rien.

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
découpés en colonnes : montant, tiers, référence, solde — et **`carte`**,
l'ICCID de la puce qui a encaissé.

Puis `cartes` : chaque SIM déjà passée dans le boîtier y a sa ligne, avec sa
première et sa dernière apparition. C'est ce qui permettra à l'application web
de montrer l'historique d'une carte retirée, et de dire depuis quand elle l'est.

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

---

## Relier l'application web à la base

L'application web (`web/`) lit la même base que le robot alimente. Elle a
besoin de deux variables d'environnement, **côté serveur uniquement** :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | l'adresse du projet, `https://xxxxxxxxxxxx.supabase.co` |
| `SUPABASE_CLE` | la clé de service (Settings → API → `service_role`) |

- **Sur Vercel** : Settings → Environment Variables, ajouter les deux, puis
  redéployer.
- **En local** : créer `web/.env.local` avec ces deux lignes, puis
  `npm run dev`.

Sans elles, l'application l'affiche clairement (« Non relié ») et ne montre
**aucune donnée** — jamais de chiffres inventés.

Pourquoi la clé de service, alors qu'elle ne doit « jamais quitter le Pi » ?
Parce que les règles de la base refusent toute lecture sans session, et que
l'écran de connexion (Supabase Auth) n'existe pas encore. La clé ne sert
qu'entre le serveur de l'application et Supabase : elle n'est **jamais**
envoyée au navigateur (pas de préfixe `NEXT_PUBLIC_`). Dès que la connexion
par mot de passe sera en place, on la remplacera par la clé publique et une
session — et la clé de service retournera vivre uniquement sur le Pi.
