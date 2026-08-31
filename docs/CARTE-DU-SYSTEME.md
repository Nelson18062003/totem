# La carte du système — ce qu'il y a à défendre

*Établie le 31 août 2026, mise à jour au tour 1. À relire à chaque tour
d'audit : une carte périmée fait chercher au mauvais endroit.*

Ce document ne décrit pas ce que TOTEM fait pour le propriétaire — c'est le
`README`. Il décrit **par où l'on entre**, **ce qu'on y trouve**, et **ce qui
tient la porte**.

## 1. Les trois maisons

```
  [Téléphone du propriétaire]        [Navigateur]
   application Expo/React Native      pages Next.js
        │ jeton « Authorization »          │ cookie httpOnly
        └──────────────┬───────────────────┘
                       ▼
        ┌──────────────────────────────────┐
        │  LA PLATEFORME  (Next.js, Vercel)│
        │  middleware.ts = LE SEUL VERROU  │
        │  clé de service Supabase ici     │
        └──────────────┬───────────────────┘
                       │ HTTPS + clé de SERVICE (contourne toute RLS)
                       ▼
        ┌──────────────────────────────────┐
        │  SUPABASE  (Postgres + Storage)  │
        │  302 paiements · 203 reçus       │
        │  2 comptes · 2 appareils         │
        └──────────────▲───────────────────┘
                       │ clé de service (fichier totem.conf)
        ┌──────────────┴───────────────────┐
        │  LE ROBOT  (Raspberry Pi, Douala)│
        │  modems + SIM · Telegram sortant │
        └──────────────────────────────────┘
```

Trois codes séparés, une seule base :

| Maison | Où | Langage | Ce qu'elle détient |
|---|---|---|---|
| La plateforme | `web/` | TypeScript, Next.js 16 (App Router) | `SESSION_SECRET`, `SUPABASE_CLE` (service), `TOTEM_MOT_DE_PASSE` |
| Le téléphone | `mobile/` | TypeScript, Expo/React Native | un jeton de session, dans le coffre du système |
| Le robot | `totem/` | Python | le PIN (jamais écrit), la clé de service, le jeton Telegram |
| Le noyau partagé | `web/noyau/` | TypeScript | rien — des règles, copiées dans les deux paquets |

## 2. Les frontières de confiance

**F1 — Internet → la plateforme.** La seule surface vraiment exposée.
Tout passe par `web/middleware.ts`.

**F2 — La plateforme → Supabase.** Franchie avec la **clé de service**, qui
**contourne toutes les règles de la base** (`web/lib/serveur.ts:25-26`). Donc :
*aucune* protection ne vient de la base. Toute l'autorisation est du code
TypeScript. C'est le fait le plus important de cette carte.

**F3 — Le robot → Supabase.** Même clé de service, depuis `totem.conf`
(ignoré par git). Hors du périmètre web, mais un Pi compromis écrit ce qu'il
veut dans le grand livre.

**F4 — La plateforme → Expo.** Une seule sortie, vers une adresse fixe
(`web/lib/pousser.ts:82`). Pas de récupération d'URL fournie par l'utilisateur :
**aucune surface SSRF applicative**.

## 3. Ce qui tient la porte

**Deux lignes**, depuis le tour 1 — il n'y en avait qu'une.

### La première : le verrou du bord (`web/middleware.ts`)

1. **Sans `SESSION_SECRET`** : en développement, tout est ouvert (voulu). **En
   production, plus rien ne passe** — les écrans ouverts exceptés, pour que la
   plateforme puisse dire qu'elle n'est pas configurée.
2. Une liste `OUVERT` : `/connexion`, `/inscription`, `/confidentialite`,
   `/suppression`, `/api/connexion`, `/api/deconnexion`, `/api/inscription`,
   `/api/session`, `/api/plateforme`.
3. Trois **liens signés** de dix minutes (HMAC sur genre + identifiant +
   échéance) : reçu PDF, coordonnées PDF, bilan CSV.
4. Sinon : un **jeton de session** — cookie `httpOnly` (navigateur) ou en-tête
   `Authorization: Bearer` (téléphone). Le même jeton, la même signature.

Le jeton (`web/lib/session.ts`) : `sujet.échéance.HMAC-SHA256`, **un mois**,
sans état côté serveur. Les sujets : `c:<id>`, `secours`, et les anciens
`proprietaire` / `telephone`.

Le verrou du bord est rapide et ne réveille pas la base. C'est sa force. Mais
il ne regarde QUE la signature : il ne peut pas savoir qu'un compte a été
fermé depuis. D'où la seconde ligne.

### La seconde : le garde (`web/lib/garde.ts`)

Appelé en tête de **toute** porte fermée — 24 en tout, routes et écrans
compris. Il refait la vérification de signature, puis **relit l'état du compte
en base** (cache de dix secondes, sursis de cinq minutes si la base se tait).
C'est lui qui fait qu'un jeton se reprend.

Trois formes, selon la porte :
`exigerSession` · `exigerProprietaire` · `exigerSessionOuLien` (les documents,
qui acceptent aussi leur lien signé) · `exigerEcran` (les pages, qui
renvoient vers la connexion au lieu de rendre un JSON).

**Ce qui empêche d'en oublier une.** Le garde se pose porte par porte : rien
n'obligerait la route de demain à y penser. `scripts/verifier-le-verrou.mjs`
lit donc la liste `OUVERT` du middleware, parcourt tous les `route.ts` et
`page.tsx`, et **échoue** si l'un d'eux n'appelle aucun garde.

### Les niveaux

Deux seulement : **entrer** (tout compte approuvé) et **administrer**
(`proprietaire`, ou la clé de secours). Il n'y a pas de cloisonnement par
locataire : tout compte approuvé voit tout l'argent. C'est assumé — une seule
caisse, un seul propriétaire.

## 4. La surface d'attaque, porte par porte

Légende : **O** = ouverte · **S** = session requise · **P** = propriétaire ·
**L** = lien signé accepté

| Porte | Verrou | Écrit ? | Ce qui sort |
|---|---|---|---|
| `POST /api/connexion` | O | non | pose le cookie |
| `POST /api/session` | O | non | rend le jeton en clair |
| `POST /api/inscription` | O | **oui** | crée le 1ᵉʳ compte, puis fermée |
| `GET /api/plateforme` | O | non | trois booléens |
| `POST /api/deconnexion` | O | non | efface le cookie |
| `GET /api/donnees` | S | non | **tout** : paiements, soldes, cartes, reçus |
| `GET /api/bilan` | S + L | non | **tout l'historique en CSV** |
| `GET /api/actualite` | S | non | deux compteurs |
| `GET /api/recu/[n]` | S + L | non | le PDF du reçu |
| `GET /api/recu/[n]/fiche` | S | non | une date |
| `GET /api/recu/[n]/lien` | S | non | fabrique un lien signé |
| `GET /api/coordonnees/[i]` | S + L | non | le PDF « RIB » |
| `GET /api/coordonnees/[i]/lien` | S | non | fabrique un lien signé |
| `POST /api/lu` | **P** | **oui** | marque un SMS lu |
| `POST /api/nature` | **P** | **oui** | **reclasse un paiement** |
| `POST /api/appareil` | S | **oui** | inscrit un téléphone aux notifications |
| `POST /api/commande` | **P** | **oui** | **compose sur une vraie SIM** |
| `POST /api/essai-notification` | **P** | oui | fait sonner les téléphones |
| `GET /api/comptes` | **P** | non | la liste des comptes |
| `POST /api/comptes` | **P** | **oui** | crée / approuve / ferme / supprime |
| `GET /api/commande/[id]` | S | non | l'état d'une demande |

Toutes ces portes appellent un garde depuis le tour 1. `/api/lu` et
`/api/nature` étaient les deux seules écritures qu'un **invité** pouvait
faire ; elles sont passées en **P** (voir SEC-06).

Les six pages qui affichent des chiffres — accueil, actions, analyse, cartes,
encaissements, réglages, ussd — sont gardées de la même façon, et la coquille
(`layout.tsx`) ne charge plus l'état du terminal pour qui n'est pas connecté :
elle enveloppe aussi l'écran de connexion.

## 5. Ce qui vaut de l'argent

- `paiements` (302 lignes) — chaque SMS de l'opérateur : montant, tiers,
  numéro, référence, solde après. **Le grand livre.**
- `comptes` — le solde en cours de chaque SIM.
- `recus` (203) + le compartiment de stockage `recus` — les PDF.
- `utilisateurs` (2) — courriels et empreintes PBKDF2.
- `appareils` (2) — les jetons de notification Expo.
- `commandes` — le canal qui fait composer un code USSD sur une vraie carte.
  **C'est le seul endroit d'où de l'argent peut bouger.**

## 6. Ce qui n'existe pas ici

À écrire noir sur blanc, pour ne pas chercher des vulnérabilités qui n'ont pas
de support :

- **Pas de Server Actions** (aucun `"use server"`) — toute une famille d'avis
  Next.js ne s'applique pas.
- **Pas de SQL écrit à la main** — tout passe par PostgREST, avec des
  identifiants filtrés avant de partir (`serveur.ts:329,339`).
- **Pas de téléversement de fichier** par l'utilisateur.
- **Pas de Supabase Auth** — `auth.users` est vide. Voir SEC-03 : les règles
  de la base sont donc écrites pour un rôle que personne n'endosse.
- **Pas de récupération d'URL fournie par l'utilisateur** — pas de SSRF.
- **Pas de HTML injecté** — React échappe, aucun `dangerouslySetInnerHTML`.

## 7. Où l'on essaie pour de vrai

Il n'y a **pas d'environnement de préproduction**. Les essais actifs se font
donc contre les harnais locaux du dépôt, qui lancent un vrai serveur et
refusent de démarrer si leur port est déjà pris :

```sh
cd web && node scripts/verifier-le-verrou.mjs      # port 3120
cd web && node scripts/verifier-les-comptes.mjs
```

**Rien d'actif ne se lance contre Vercel ni contre le Supabase en service.**
Sur ceux-là : lecture seule (conseiller de sécurité, `pg_policies`, en-têtes,
TLS, DNS).
