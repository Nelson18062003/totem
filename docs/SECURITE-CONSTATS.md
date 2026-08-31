# Le registre des constats de sécurité

*Tour 0 — 31 août 2026. Ouvert : 9. Corrigé : 0.*

**Comment lire.** `CONFIRMÉ` = prouvé, avec le fichier et la ligne, ou une
requête jouée contre la base. `THÉORIQUE` = raisonné, pas encore éprouvé — et
tant que ce n'est pas éprouvé, ça ne compte pas. La gravité dit ce qu'un
attaquant obtient, pas à quel point c'est agaçant.

| # | Gravité | Sujet | État | Statut |
|---|---|---|---|---|
| SEC-01 | **P1** | Une session ne se révoque jamais | CONFIRMÉ | ouvert |
| SEC-02 | **P1** | Toute l'autorisation tient à un seul fichier | CONFIRMÉ | ouvert |
| SEC-03 | **P1** | Les règles de la base ouvrent le grand livre | CONFIRMÉ | ouvert |
| SEC-04 | P2 | Le frein se contourne avec un en-tête | THÉORIQUE | ouvert |
| SEC-05 | P2 | Aucun en-tête de sécurité | CONFIRMÉ | ouvert |
| SEC-06 | P2 | Un invité peut reclasser un paiement | CONFIRMÉ | ouvert |
| SEC-07 | P3 | Un nom de fichier non échappé | CONFIRMÉ | ouvert |
| SEC-08 | P3 | Le courriel entre dans les journaux | CONFIRMÉ | ouvert |
| SEC-09 | P3 | Dépendances à mettre à jour | CONFIRMÉ | ouvert |
| SEC-10 | — | `rls_auto_enable` : fausse alerte | CONFIRMÉ | classé |

---

## SEC-01 · P1 · Une session ne se révoque jamais

**ASVS** V3.3.1, V3.3.2 (fin de session) · **API Top 10** API1, API5 ·
**CWE-613** (expiration de session insuffisante) · **Confiance : HAUTE**

**Ce qui se passe.** Le verrou ne regarde que la signature et l'échéance du
jeton (`web/middleware.ts:96` → `web/lib/session.ts:61-88`). Il ne consulte
jamais la base. Or le jeton vit **un mois** (`session.ts:27`).

Fermer un compte (`web/app/api/comptes/route.ts:71`) ou le supprimer
(ligne 72) ne change donc **rien** pour qui est déjà entré : le jeton reste
signé, reste valable, et continue d'ouvrir.

**Ce que ça donne.** Un invité qu'on vient de mettre dehors garde, jusqu'à
trente jours :

- `GET /api/donnees` — les 302 paiements, tous les soldes, toutes les cartes ;
- `GET /api/bilan?jours=90` — le même historique en CSV, à télécharger ;
- `GET /api/recu/<n>` — les 203 reçus PDF ;
- toutes les pages de la plateforme.

Aucune de ces portes ne redemande qui parle. `/api/donnees` appelle bien
`compteConnecte` (ligne 59) — mais seulement pour afficher un courriel, jamais
pour décider.

**L'autre moitié du problème.** Il n'y a pas de « me déconnecter partout ». Un
téléphone volé, un jeton copié : le propriétaire n'a aucun geste. Changer son
mot de passe n'y fait rien non plus.

**La racine.** Un jeton sans état ne peut pas être repris. Il faut un point
où la révocation s'exprime.

**Ce que je propose (GELÉ — c'est de l'authentification, j'attends l'accord).**
Un seul garde partagé, appelé par toute route non ouverte, qui refait la
vérification *et* relit l'état du compte en base. Le verrou du bord reste le
premier filtre rapide ; il cesse d'être le seul juge. Coût : une lecture par
requête, à mettre en cache quelques secondes.

**Comment on saura que c'est réparé.** Un essai qui : ouvre une session
d'invité, la vérifie bonne, ferme le compte, rejoue **le même jeton** sur
`/api/donnees`, `/api/bilan` et `/api/recu/<n>`, et exige un 401 sur les trois.
À ajouter à `scripts/verifier-les-comptes.mjs`.

---

## SEC-02 · P1 · Toute l'autorisation tient à un seul fichier

**ASVS** V4.1.1, V1.4.1 · **API Top 10** API5 · **CWE-306** ·
**Confiance : HAUTE**

**Ce qui se passe.** `web/middleware.ts` est la seule chose qui protège les
données. Aucune route ne revérifie qu'une session existe. `/api/bilan`,
`/api/donnees`, `/api/actualite`, `/api/recu/…` n'ont pas une ligne
d'authentification : elles servent tout ce qu'on leur demande, et comptent sur
le fait que personne n'arrive jusqu'à elles.

Deux façons dont ça casse :

1. **`SESSION_SECRET` absent = maison ouverte, en silence**
   (`middleware.ts:47`). C'est délibéré pour le développement local. Mais
   c'est aussi ce qui se passe si la variable disparaît d'un réglage Vercel :
   la plateforme sert alors 302 paiements et 203 reçus à qui passe, sans une
   ligne de journal, sans rien à l'écran qui le dise.

2. **Un défaut du cadre.** L'avis
   [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
   (CVE-2026-64642, CVSS 8.3) décrit un contournement de middleware dans
   Next.js. Sa recommandation, mot pour mot : *« enforce authorization through
   server-side data operations rather than relying exclusively on
   middleware »*. C'est exactement ce que cette plateforme ne fait pas.

**Sur ce défaut-là, précisément.** `web/package.json` fixe `next@16.2.10` ; la
plage touchée est `>= 16.0.0, < 16.2.11`. **Mais les conditions ne sont pas
réunies ici** : il faut une seule locale dans `config.i18n.locales`, et
`web/next.config.ts` est vide — il n'y a pas de bloc `i18n` du tout. **Ce
défaut n'est donc pas exploitable sur TOTEM.** Ce qui reste vrai, c'est la
leçon : il n'y a pas de deuxième ligne. (La mise à jour, elle, est en SEC-09.)

**Ce que je propose (GELÉ).** Deux gestes :
- le garde partagé de SEC-01, qui règle les deux d'un coup ;
- **refuser de démarrer** en production sans `SESSION_SECRET`, au lieu de
  s'ouvrir. Le développement local garde son passe-droit ; la production, non.

**Comment on saura.** Un essai qui appelle `/api/bilan` et `/api/donnees` avec
un middleware neutralisé, et exige un 401 quand même.

---

## SEC-03 · P1 · Les règles de la base ouvrent le grand livre

**ASVS** V4.2.1 · **API Top 10** API1, API3 · **CWE-1230** ·
**Confiance : HAUTE sur la forme, MOYENNE sur l'exploitation**

**Ce qui se passe.** Joué en lecture seule contre le projet en service
(`hzixkjoybstkgfbhvyun`, `pg_policies`) :

| Table | Règle | Rôle | Condition |
|---|---|---|---|
| `paiements` | lecture connectee | `authenticated` | `true` |
| `comptes` | lecture connectee | `authenticated` | `true` |
| `recus` | lecture connectee | `authenticated` | `true` |
| `cartes`, `terminaux`, `evenements`, `raccourcis` | idem | `authenticated` | `true` |
| `commandes` | lecture connectee | `authenticated` | `true` |
| `commandes` | demander une commande | `authenticated` | **INSERT**, `with check true` |
| `storage.objects` | recus lecture connectee | `authenticated` | `bucket_id = 'recus'` |

`using (true)` veut dire : **tout compte connecté à la base lit tout**.

**Pourquoi c'est là.** `sql/schema.sql:398` dit « L'application web lit avec la
clé publique ». **Ce n'est plus vrai.** `web/lib/serveur.ts:25-26,37` lit avec
la **clé de service**, qui contourne toutes ces règles. Ces politiques ne
protègent donc rien du tout — elles ne font qu'attendre.

**Ce que ça donne.** La clé « anon » de Supabase est publique **par
construction** : elle est sans danger *parce que* les règles de la base
protègent les données. Ici elles ne les protègent pas. Quiconque a cette clé
et peut créer un compte Supabase Auth devient `authenticated`, et lit alors
les 302 paiements, tous les soldes, les 203 reçus — et **dépose des commandes**,
c'est-à-dire fait composer un code sur une vraie SIM.

**Ce qui retient aujourd'hui.** `auth.users` contient **0 ligne** : personne
n'a jamais endossé ce rôle. Et la clé anon n'est ni dans le dépôt, ni dans le
paquet du téléphone, ni dans le code du navigateur (vérifié).

**Ce qui reste à vérifier [À VÉRIFIER].** L'inscription est-elle ouverte sur le
projet ? Tableau de bord Supabase → Authentication → Providers. Si elle est
ouverte (le défaut), la seule chose qui protège 302 paiements est le secret
d'une clé conçue pour être publique.

**Ce que je propose (GELÉ — c'est la base de données).** **Supprimer ces
politiques.** L'application n'utilise pas Supabase Auth ; elles ne servent à
rien. RLS reste active, sans aucune politique — exactement la posture déjà
choisie, et expliquée, pour `utilisateurs` et `appareils`
(`sql/schema.sql:424-429`). Et corriger le commentaire de `schema.sql`, qui
décrit une architecture abandonnée.

**Comment on saura.** Rejouer `pg_policies` : plus une seule ligne
`authenticated` sur `public` ni sur le compartiment `recus`. Puis la batterie
complète, pour prouver que la plateforme (clé de service) n'a rien perdu.

---

## SEC-04 · P2 · Le frein se contourne avec un en-tête

**ASVS** V2.2.1 · **API Top 10** API4 · **CWE-307** ·
**Confiance : MOYENNE — THÉORIQUE**

**Ce qui se passe.** `web/lib/frein.ts:46` :

```ts
return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "global";
```

C'est la valeur **la plus à gauche** de `X-Forwarded-For` — celle que le client
écrit lui-même. Un attaquant qui change cet en-tête à chaque essai obtient un
seau neuf à chaque fois : le frein ne freine plus rien, et les deux portes de
mot de passe (`/api/connexion`, `/api/session`) s'essaient à pleine cadence.

**La deuxième moitié.** Le seau vit dans la mémoire d'une instance
(`frein.ts:13`) — le fichier le dit lui-même. Sur Vercel, chaque instance
froide repart à zéro. Même sans tricher sur l'en-tête, le frein est mou.

Ce qui limite les dégâts : PBKDF2 à 210 000 tours coûte cher au serveur comme
à l'attaquant, et douze caractères minimum font un grand espace à parcourir.
Ça ralentit ; ça n'arrête pas.

**Ce que je propose (à confirmer avant de toucher).** Prendre un en-tête
attesté par la plateforme (`x-vercel-forwarded-for`, `x-real-ip`) plutôt que
celui du client ; et garder un compteur global, non indexé sur une valeur
fournie par le visiteur, comme filet.

**Comment on saura.** Un harnais qui envoie 200 essais avec 200 valeurs
`X-Forwarded-For` différentes et exige que le frein morde quand même. **À
écrire et à jouer avant toute correction** — pour l'instant ce constat est
raisonné, pas prouvé.

---

## SEC-05 · P2 · Aucun en-tête de sécurité

**ASVS** V14.4 · **CWE-693** · **Confiance : HAUTE**

`web/next.config.ts` tient en trois lignes et ne déclare aucun en-tête.
Manquent : `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, `X-Frame-Options` / `frame-ancestors`,
`Referrer-Policy`, `Permissions-Policy`.

Ce que ça coûte concrètement : la plateforme peut être mise dans un cadre
invisible chez quelqu'un d'autre (détournement de clic sur des boutons qui
font bouger de l'argent), et le moindre défaut d'échappement n'a aucun filet.

C'est le seul constat que je peux corriger **sans rien changer au
comportement**. Je le propose en premier au tour 1.

---

## SEC-06 · P2 · Un invité peut reclasser un paiement

**ASVS** V4.1.3 (moindre privilège) · **API Top 10** API5 (BFLA) ·
**CWE-862** · **Confiance : HAUTE**

Le principe est écrit dans le dépôt : « Un invité voit les écrans. Il ne touche
pas aux cartes » (`web/app/api/commande/route.ts:25`). `/api/commande` et
`/api/essai-notification` le font respecter par `estProprietaire`.

**Deux portes l'oublient :**

- `web/app/api/nature/route.ts` — aucun contrôle. Un invité reclasse
  n'importe quel paiement. Ce n'est pas cosmétique : la nature **déclenche
  l'établissement du reçu**. Un invité peut donc faire fabriquer, ou faire
  refaire, des reçus sur des opérations réelles.
- `web/app/api/lu/route.ts` — aucun contrôle. Un invité marque les SMS lus, et
  fait disparaître la pastille qui prévient le propriétaire.

Ni l'un ni l'autre ne vérifie non plus **quel** paiement est visé : n'importe
quel identifiant entier passe.

**Ce que je propose (GELÉ — c'est de l'autorisation).** Le même
`estProprietaire` que les deux autres routes, avec la même clause « sans
`SESSION_SECRET`, on ne fait pas semblant ».

**Comment on saura.** Un essai qui, avec une session d'invité, appelle
`/api/nature` et `/api/lu` et exige un 403 ; puis les mêmes appels en
propriétaire, et exige que ça marche.

---

## SEC-07 · P3 · Un nom de fichier non échappé

**CWE-116** · **Confiance : HAUTE**

`web/app/api/recu/[numero]/route.ts:23` :

```ts
"content-disposition": `inline; filename="${numero}.pdf"`,
```

`numero` arrive brut du chemin. La route sœur `/lien` valide pourtant
(`/^[\w.-]{1,64}$/`, ligne 28), et `chargerRecu` nettoie la valeur **qu'elle
interroge** (`serveur.ts:339`) — mais l'en-tête, lui, reçoit l'original. Un
guillemet dans le numéro déforme l'en-tête.

Portée réelle : petite. La porte est derrière le verrou, le chemin par lien
signé n'accepte que `[\w.-]{1,64}` (`middleware.ts:69`), et un retour à la
ligne ferait échouer la construction de la réponse. C'est de l'hygiène — mais
la validation existe déjà à côté, et son absence ici est un oubli.

**Correction (sûre).** La même validation qu'à la ligne 28 de la route sœur.

---

## SEC-08 · P3 · Le courriel entre dans les journaux

**ASVS** V7.1.1 · **CWE-532** · **Confiance : HAUTE**

`web/lib/serveur.ts:41` :

```ts
console.error(`Supabase : ${chemin} → ${r.status}`);
```

Sur le chemin de connexion, `chemin` porte le courriel
(`utilisateurs?courriel=eq.…`, ligne 613). Dès que Supabase répond une erreur,
le courriel du compte part dans les journaux Vercel — que la plateforme n'a
aucune raison de garder.

**Correction (sûre).** Journaliser la table et le code, jamais la requête
filtrée.

---

## SEC-09 · P3 · Dépendances à mettre à jour

**API Top 10** API8 · **Confiance : HAUTE** (`npm audit`, 31 août 2026)

**`web/`**
- `next@16.2.10` → **`16.2.11`**. Cinq avis, dont
  [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
  (CVE-2026-64642, CVSS 8.3, contournement de middleware). **Les conditions ne
  sont pas réunies ici** — pas de bloc `i18n` dans `next.config.ts` — donc pas
  exploitable sur TOTEM ; voir SEC-02. Les avis « Server Actions » ne
  s'appliquent pas non plus : le dépôt n'en contient aucune. La mise à jour
  reste due, elle est mineure.
- `nanoid < 3.3.18` — [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
  CWE-835. Indirecte, chaîne de compilation. `npm audit fix`.

**`mobile/`** — 11 avis modérés, tous dans l'outillage de compilation d'Expo
(`@expo/config`, `@expo/config-plugins`). Rien dans ce qui entre dans le
paquet installé. À traiter avec la prochaine montée d'Expo, pas en urgence.

**Correction (sûre, mais à vérifier).** La montée de `next` demande la batterie
complète — c'est le cadre lui-même. Rien ne s'annonce sans l'avoir jouée.

---

## SEC-10 · Classé · `rls_auto_enable` : fausse alerte

Le conseiller Supabase signale (WARN, deux fois) que
`public.rls_auto_enable()` est `SECURITY DEFINER` et joignable par `anon` et
`authenticated` via `/rest/v1/rpc/…`.

**Vérifié, et c'est faux.** `pg_get_functiondef` montre une fonction qui
`RETURNS event_trigger` : PostgREST ne sait pas l'appeler, et son corps ne fait
qu'activer RLS sur les tables nouvellement créées — un filet, pas une porte.
Elle est posée par la plateforme Supabase, pas par ce dépôt. Elle a aussi
`SET search_path TO 'pg_catalog'`, ce qui ferme le détournement habituel des
fonctions `SECURITY DEFINER`.

Classé sans suite. Noté ici pour qu'on ne le rejuge pas à chaque tour.

---

## Ce qui a été regardé et n'a rien donné

Ce n'est pas du remplissage : ces contrôles n'ont pas à être refaits au
prochain tour.

- **Mots de passe** — PBKDF2-SHA256, 210 000 tours, sel de 16 octets, nombre de
  tours inscrit dans l'empreinte et réhaché à la connexion suivante
  (`lib/motdepasse.ts`). Douze caractères minimum, sans règle de composition.
  Conforme à l'OWASP et au NIST.
- **Découverte des comptes** — une empreinte leurre fait tourner PBKDF2 même
  quand le courriel est inconnu (`porte.ts:47`) ; l'inscription refuse *avant*
  de regarder si le courriel existe (`porte.ts:175`). Correctement traité.
- **Comparaisons à temps constant** — `egaliteConstante` empreinte d'abord en
  SHA-256, si bien que la durée ne trahit ni le contenu **ni la longueur**
  (`session.ts:111`).
- **Forme canonique du jeton** — le réencodage en base64url est comparé au
  jeton reçu (`session.ts:79`), ce qui ferme la malléabilité du dernier
  caractère. Trouvé par le harnais du dépôt, pas par moi.
- **Liens signés** — la signature couvre le genre, l'identifiant *et*
  l'échéance ; l'identifiant est validé avant signature comme avant
  vérification, donc aucun « : » ne déplace les frontières du corps signé
  (`lien-signe.ts:47`). Dix minutes.
- **Injection PostgREST** — les identifiants sont filtrés avant de partir
  (`serveur.ts:329,339`) ou encodés (`serveur.ts:613,707`), et les entiers
  passent par `Number.isInteger`. Rien trouvé.
- **Formules dans le CSV** — les cellules commençant par `= + - @` sont
  préfixées d'une apostrophe (`bilan/route.ts:31`). Correctement traité.
- **Injection de commandes AT** — guillemets, retours à la ligne et caractères
  de contrôle retirés des réponses USSD (`commande/route.ts:60`), et le robot
  revérifie de son côté.
- **Secrets dans le dépôt** — rien, historique compris ; deux secrets
  d'essai clairement nommés dans `web/scripts/`. Aucun secret derrière un
  préfixe `NEXT_PUBLIC_` ou `EXPO_PUBLIC_`.
- **Le coffre du téléphone** — Keystore/Keychain, avec un refus franc plutôt
  qu'un repli sur `localStorage` hors développement (`mobile/src/api/coffre.ts`).
- **L'adresse du téléphone** — `https` exigé, sauf boucle locale
  (`mobile/src/api/guichet.ts:76`).
- **SSRF** — une seule sortie, vers une adresse fixe (`lib/pousser.ts:82`).
- **Cookies** — `httpOnly`, `secure`, `sameSite: lax`, `path: /`. `lax` suffit :
  toutes les écritures sont des `POST` en `application/json`, qu'un formulaire
  d'un autre site ne sait pas fabriquer.

## Ce qui n'a pas encore été regardé

- TLS et en-têtes en service (`testssl.sh`, `curl -I` sur le domaine réel) —
  il faut l'adresse de production.
- DNS : CAA, SPF/DKIM/DMARC, sous-domaines pendants.
- Le côté Python (`totem/`) : le robot, Telegram, le PIN, les codes USSD.
- Le mode de reprise des SMS et le canal `commandes`, du côté du Pi.
- Semgrep / CodeQL — pas encore joués.
